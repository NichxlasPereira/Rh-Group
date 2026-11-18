import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { slackConfig } from "@/lib/slack";
import { createStartKit, itemsFor, startKitsFor } from "@/lib/startKit";

type Params = { params: Promise<{ id: string }> };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

async function employeeWithArea(id: string) {
  const employee = await prisma.employee.findUnique({
    where: { id },
    select: { id: true, name: true, active: true, department: true, areaId: true },
  });
  if (!employee) return null;
  const area = employee.areaId ? await prisma.companyArea.findUnique({ where: { id: employee.areaId }, select: { name: true } }) : null;
  return { ...employee, area: area?.name ?? null };
}

/**
 * Prévia do offboarding (janela "Desligar colaborador"): os pedidos de saída
 * que valem para a empresa e a área da pessoa e quem recebe cada um no Slack.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const employee = await employeeWithArea((await params).id);
  if (!employee) return NextResponse.json({ error: "Colaborador não encontrado." }, { status: 404 });

  const items = await itemsFor(employee.department, employee.area, "saida");
  return NextResponse.json({
    slackReady: !!slackConfig(),
    department: employee.department,
    area: employee.area,
    items: items.map((i) => ({
      id: i.id,
      name: i.name,
      responsible: i.responsible,
      recipient: i.slackUserName,
      hasPerson: !!i.slackMention,
      scope: i.department ? `${i.department}${i.area ? ` › ${i.area}` : ""}` : "todas as empresas",
    })),
  });
}

/**
 * Desliga o colaborador e manda o offboarding no Slack:
 * { lastDay: "AAAA-MM-DD", skip: ["idDoItem", …] }. Os itens em "skip" não vão
 * neste desligamento. Para quem já está desligado, só manda o offboarding.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const employee = await employeeWithArea((await params).id);
  if (!employee) return NextResponse.json({ error: "Colaborador não encontrado." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const lastDay = typeof body?.lastDay === "string" && DAY.test(body.lastDay) ? new Date(`${body.lastDay}T00:00:00.000Z`) : null;
  if (!lastDay || Number.isNaN(lastDay.getTime())) {
    return NextResponse.json({ error: "Informe o último dia do colaborador." }, { status: 400 });
  }
  const skip: string[] = Array.isArray(body?.skip) ? body.skip.filter((x: unknown): x is string => typeof x === "string") : [];

  if (employee.active) await prisma.employee.update({ where: { id: employee.id }, data: { active: false } });

  // Só abre o offboarding se algum item vale e ficou marcado.
  const items = await itemsFor(employee.department, employee.area, "saida");
  const chosen = items.filter((i) => !skip.includes(i.id));
  if (chosen.length > 0) {
    await createStartKit(employee.id, { kind: "saida", startDate: lastDay, createdBy: auth.user.name, skipItemIds: skip });
  }
  const exit = (await startKitsFor(employee.id)).find((k) => k.kind === "saida") ?? null;
  return NextResponse.json({ kit: chosen.length > 0 ? exit : null });
}
