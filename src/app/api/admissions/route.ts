import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { ADMISSION_INCLUDE, NDA_DOCUMENT, admissionLink, newAdmissionToken, publicAdmission } from "@/lib/admissionServer";
import { parseAdmissionFields, parseChecklist } from "@/lib/admissionValidation";
import { DEFAULT_CHECKLIST, DEFAULT_FIELDS } from "@/lib/admission";

export async function GET() {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;

  const admissions = await prisma.admission.findMany({
    orderBy: [{ createdAt: "desc" }],
    include: ADMISSION_INCLUDE,
  });
  return NextResponse.json(admissions.map(publicAdmission));
}

export async function POST(request: NextRequest) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;

  // Um clique basta: sem corpo, cria com os dados e documentos padrão e o
  // candidato preenche tudo pelo link. O RH ajusta depois, se quiser.
  const body = (await request.json().catch(() => null)) ?? {};
  const fields = parseAdmissionFields(body);
  if ("error" in fields) return NextResponse.json({ error: fields.error }, { status: 400 });
  const checklist = parseChecklist(body.documents ?? DEFAULT_CHECKLIST);
  if ("error" in checklist) return NextResponse.json({ error: checklist.error }, { status: 400 });

  // Empresa do acordo de confidencialidade: a escolhida pelo RH ("" = sem acordo);
  // se não vier, e só houver uma empresa cadastrada, ela já vira a contratante.
  let contractingCompanyId: string | null = null;
  if (typeof body.contractingCompanyId === "string") {
    contractingCompanyId = body.contractingCompanyId || null;
    if (contractingCompanyId && !(await prisma.contractingCompany.findUnique({ where: { id: contractingCompanyId } }))) {
      return NextResponse.json({ error: "Empresa contratante não encontrada." }, { status: 400 });
    }
  } else {
    const companies = await prisma.contractingCompany.findMany({ select: { id: true }, take: 2 });
    if (companies.length === 1) contractingCompanyId = companies[0].id;
  }

  const { token, tokenHash, tokenExpiresAt } = newAdmissionToken();
  const admission = await prisma.admission.create({
    data: {
      ...fields.data,
      contractingCompanyId,
      tokenHash,
      tokenExpiresAt,
      createdBy: auth.user.name,
      documents: {
        create: [
          ...checklist.data.map((item, index) => ({ ...item, sortOrder: index })),
          ...(contractingCompanyId ? [{ ...NDA_DOCUMENT, sortOrder: checklist.data.length }] : []),
        ],
      },
      fields: {
        create: DEFAULT_FIELDS.map((f, index) => ({ ...f, sortOrder: index })),
      },
    },
    include: ADMISSION_INCLUDE,
  });

  return NextResponse.json(
    { admission: publicAdmission(admission), link: admissionLink(request, token) },
    { status: 201 }
  );
}
