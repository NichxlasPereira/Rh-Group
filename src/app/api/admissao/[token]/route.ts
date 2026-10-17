import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { admissionByToken } from "@/lib/admissionServer";

const LINK_INVALID = "Este link de onboarding não é válido ou expirou. Fale com o RH da CFFGROUP.";

/** Portal do candidato: só o que ele precisa ver — nada de dados internos do RH. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admission = await admissionByToken(token);
  if (!admission) return NextResponse.json({ error: LINK_INVALID }, { status: 404 });

  // Empresa em que a pessoa vai trabalhar: aparece no topo do portal.
  const company = admission.contractingCompanyId
    ? await prisma.contractingCompany.findUnique({ where: { id: admission.contractingCompanyId }, select: { name: true } })
    : null;

  return NextResponse.json({
    companyName: company?.name ?? null,
    candidateName: admission.candidateName,
    role: admission.role,
    startDate: admission.startDate,
    tokenExpiresAt: admission.tokenExpiresAt,
    fields: admission.fields.map((f) => ({
      id: f.id,
      label: f.label,
      type: f.type,
      required: f.required,
      value: f.value,
    })),
    documents: admission.documents.map((d) => ({
      id: d.id,
      kind: d.kind,
      name: d.name,
      description: d.description,
      required: d.required,
      status: d.status,
      reviewNote: d.status === "recusado" ? d.reviewNote : null,
      files: d.files.map((f) => ({ id: f.id, fileName: f.fileName, size: f.size })),
    })),
  });
}
