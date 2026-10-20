import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { areaNameTaken, parseAreaName } from "@/lib/companyAreas";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const existing = await prisma.companyArea.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Área não encontrada." }, { status: 404 });
  const name = parseAreaName(await request.json().catch(() => null));
  if (typeof name !== "string") return NextResponse.json(name, { status: 400 });
  if (await areaNameTaken(prisma, existing.companyId, name, id)) {
    return NextResponse.json({ error: "Essa empresa já tem uma área com esse nome." }, { status: 409 });
  }
  const area = await prisma.companyArea.update({
    where: { id },
    data: { name },
    select: { id: true, companyId: true, name: true },
  });
  return NextResponse.json(area);
}

/** As pessoas da área ficam sem área (e deixam de ser responsáveis). */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  if (!(await prisma.companyArea.findUnique({ where: { id } }))) {
    return NextResponse.json({ error: "Área não encontrada." }, { status: 404 });
  }
  await prisma.$transaction([
    prisma.employee.updateMany({ where: { areaId: id }, data: { areaId: null, areaLead: false } }),
    prisma.companyArea.delete({ where: { id } }),
  ]);
  return NextResponse.json({ ok: true });
}
