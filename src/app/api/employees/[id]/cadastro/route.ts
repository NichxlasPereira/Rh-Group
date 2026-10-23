import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { PERSONAL_OMIT, parseRecordInput } from "@/lib/employeeRecordServer";

/** RH atualiza a ficha cadastral (dados pessoais, registro, função, Pix...). */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;

  if (!(await prisma.employee.findUnique({ where: { id }, select: { id: true } }))) {
    return NextResponse.json({ error: "Colaborador não encontrado." }, { status: 404 });
  }
  const parsed = parseRecordInput(await request.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const employee = await prisma.employee.update({ where: { id }, data: parsed.data, omit: PERSONAL_OMIT });
  return NextResponse.json(employee);
}
