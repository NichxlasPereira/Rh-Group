import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { validateEmployeeInput } from "@/lib/attendanceValidation";
import { resolveEmployeeArea } from "@/lib/companyAreas";

export async function GET() {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const employees = await prisma.employee.findMany({
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

  const employee = await prisma.employee.create({ data: { ...result.data, ...area } });
  return NextResponse.json(employee, { status: 201 });
}
