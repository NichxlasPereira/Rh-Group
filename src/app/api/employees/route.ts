import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { validateEmployeeInput } from "@/lib/attendanceValidation";
import { checkManager, resolveEmployeeArea } from "@/lib/companyAreas";
import { PERSONAL_OMIT } from "@/lib/employeeRecordServer";

export async function GET() {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  // Dados pessoais ficam fora da lista: só a ficha os mostra (mascarados).
  const employees = await prisma.employee.findMany({
    omit: PERSONAL_OMIT,
    orderBy: [{ name: "asc" }],
  });
  return NextResponse.json(employees);
}

export async function POST(request: NextRequest) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => null);
  const result = validateEmployeeInput(body);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const area = await resolveEmployeeArea(prisma, result.data.department, result.data);
  if ("error" in area) return NextResponse.json({ error: area.error }, { status: 400 });
  if (result.data.managerId) {
    const managerError = await checkManager(prisma, null, result.data.managerId);
    if (managerError) return NextResponse.json({ error: managerError }, { status: 400 });
  }

  const employee = await prisma.employee.create({ data: { ...result.data, ...area }, omit: PERSONAL_OMIT });
  return NextResponse.json(employee, { status: 201 });
}
