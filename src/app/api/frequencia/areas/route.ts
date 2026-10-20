import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { areaNameTaken, parseAreaName } from "@/lib/companyAreas";

/** Áreas de cada empresa (organograma). Todo o RH vê e organiza. */
export async function GET() {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const areas = await prisma.companyArea.findMany({
    select: { id: true, companyId: true, name: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(areas);
}

export async function POST(request: NextRequest) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => null);
  const name = parseAreaName(body);
  if (typeof name !== "string") return NextResponse.json(name, { status: 400 });
  const companyId = typeof body?.companyId === "string" ? body.companyId : "";
  if (!companyId || !(await prisma.contractingCompany.findUnique({ where: { id: companyId } }))) {
    return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  }
  if (await areaNameTaken(prisma, companyId, name)) {
    return NextResponse.json({ error: "Essa empresa já tem uma área com esse nome." }, { status: 409 });
  }
  const area = await prisma.companyArea.create({
    data: { companyId, name },
    select: { id: true, companyId: true, name: true },
  });
  return NextResponse.json(area, { status: 201 });
}
