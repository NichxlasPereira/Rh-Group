import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { validateEmployeeInput } from "@/lib/attendanceValidation";
import { resolveEmployeeArea } from "@/lib/companyAreas";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const result = validateEmployeeInput(body);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const existing = await prisma.employee.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Colaborador não encontrado." }, { status: 404 });
  }
  // Trocar de setor tira a pessoa de uma área da empresa anterior.
  const area = await resolveEmployeeArea(prisma, result.data.department, result.data, existing);
  if ("error" in area) return NextResponse.json({ error: area.error }, { status: 400 });

  // Mantém a cópia de nome/setor das ocorrências em dia com o cadastro.
  const employee = await prisma.$transaction(async (tx) => {
    const updated = await tx.employee.update({ where: { id }, data: { ...result.data, ...area } });
    await tx.attendanceOccurrence.updateMany({
      where: { employeeId: id },
      data: { employeeName: updated.name, employeeDepartment: updated.department },
    });
    return updated;
  });
  return NextResponse.json(employee);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const existing = await prisma.employee.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Colaborador não encontrado." }, { status: 404 });
  }

  await prisma.employee.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
