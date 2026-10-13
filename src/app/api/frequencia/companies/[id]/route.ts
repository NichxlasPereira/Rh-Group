import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { parseCompany } from "@/lib/companyValidation";
import { syncNdaDocument } from "@/lib/admissionServer";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFrequenciaUser({ admin: true });
  if ("response" in auth) return auth.response;
  const { id } = await params;
  if (!(await prisma.contractingCompany.findUnique({ where: { id } }))) {
    return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  }
  const parsed = parseCompany(await request.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const company = await prisma.contractingCompany.update({ where: { id }, data: parsed.data });
  return NextResponse.json(company);
}

/** Onboardings que usavam a empresa ficam sem contratante (o RH escolhe outra). */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFrequenciaUser({ admin: true });
  if ("response" in auth) return auth.response;
  const { id } = await params;
  if (!(await prisma.contractingCompany.findUnique({ where: { id } }))) {
    return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  }
  await prisma.$transaction(async (tx) => {
    const admissions = await tx.admission.findMany({ where: { contractingCompanyId: id }, select: { id: true } });
    await tx.contractingCompany.delete({ where: { id } });
    // Sem contratante não há acordo: tira o item da lista (se ainda não foi enviado).
    for (const a of admissions) await syncNdaDocument(tx, a.id, false);
  });
  return NextResponse.json({ ok: true });
}
