import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { slackConfig } from "@/lib/slack";
import { itemsFor, startKitForAdmission } from "@/lib/startKit";

type Params = { params: Promise<{ id: string }> };

function parseSkip(raw: string | null): string[] {
  try {
    const v = JSON.parse(raw ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Kit de início no onboarding. Antes de concluir: o que vai sair e para quem
 * (pela empresa e área do onboarding), com o que foi tirado desta contratação.
 * Depois: o kit enviado e o andamento de cada item.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const admission = await prisma.admission.findUnique({ where: { id: (await params).id } });
  if (!admission) return NextResponse.json({ error: "Onboarding não encontrado." }, { status: 404 });

  if (admission.status === "concluida") {
    return NextResponse.json({ stage: "enviado", kit: await startKitForAdmission(admission.id), employeeId: admission.employeeId });
  }

  const area = admission.areaId ? await prisma.companyArea.findUnique({ where: { id: admission.areaId }, select: { name: true } }) : null;
  const skip = new Set(parseSkip(admission.startKitSkip));
  const items = await itemsFor(admission.department, area?.name ?? null);
  return NextResponse.json({
    stage: "previa",
    slackReady: !!slackConfig(),
    department: admission.department,
    area: area?.name ?? null,
    items: items.map((i) => ({
      id: i.id,
      name: i.name,
      responsible: i.responsible,
      recipient: i.slackUserName,
      hasPerson: !!i.slackMention,
      included: !skip.has(i.id),
      scope: i.department ? `${i.department}${i.area ? ` › ${i.area}` : ""}` : "todas as empresas",
    })),
  });
}

/** Tira ou põe itens do kit só nesta contratação: { skip: ["idDoItem", …] }. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const id = (await params).id;
  const admission = await prisma.admission.findUnique({ where: { id }, select: { status: true } });
  if (!admission) return NextResponse.json({ error: "Onboarding não encontrado." }, { status: 404 });
  if (admission.status === "concluida") {
    return NextResponse.json({ error: "O kit já foi enviado. Ajuste pela ficha do colaborador." }, { status: 409 });
  }
  const body = await request.json().catch(() => null);
  const skip = Array.isArray(body?.skip) ? body.skip.filter((x: unknown): x is string => typeof x === "string").slice(0, 200) : [];
  await prisma.admission.update({ where: { id }, data: { startKitSkip: skip.length ? JSON.stringify(skip) : null } });
  return NextResponse.json({ ok: true });
}
