import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { createStartKit, postStartKit, startKitsFor } from "@/lib/startKit";

type Params = { params: Promise<{ id: string }> };

/** Kit de início do colaborador (para a ficha). */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  return NextResponse.json(await startKitsFor((await params).id));
}

/**
 * { action: "criar" } — monta e manda o kit (para quem entrou antes ou sem onboarding digital);
 * { action: "reenviar", requestId } — manda de novo no Slack um pedido que não chegou.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  if (!(await prisma.employee.findUnique({ where: { id }, select: { id: true } }))) {
    return NextResponse.json({ error: "Colaborador não encontrado." }, { status: 404 });
  }
  const body = await request.json().catch(() => null);
  if (body?.action === "reenviar" && typeof body.requestId === "string") {
    const req = await prisma.startKitRequest.findFirst({ where: { id: body.requestId, employeeId: id }, select: { id: true } });
    if (!req) return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });
    await postStartKit(req.id);
  } else {
    await createStartKit(id, { createdBy: auth.user.name });
  }
  return NextResponse.json(await startKitsFor(id));
}
