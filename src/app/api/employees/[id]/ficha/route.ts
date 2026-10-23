import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import {
  DISPLAYABLE_IMAGE,
  EMPLOYEE_DOCUMENT_SELECT,
  SENSITIVE_TYPES,
  isPhotoDocument,
  maskFieldValue,
} from "@/lib/employeeProfile";
import { RECORD_FIELDS, RECORD_KEYS } from "@/lib/employeeRecord";

/**
 * Ficha do colaborador: cadastro, dados do onboarding digital (se ele passou
 * por um), documentos e foto. Dados pessoais vêm mascarados; com ?completo=1
 * vêm inteiros e o acesso fica registrado com o nome de quem pediu (LGPD).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const employee = await prisma.employee.findUnique({ where: { id } });
  if (!employee) return NextResponse.json({ error: "Colaborador não encontrado." }, { status: 404 });

  const full = request.nextUrl.searchParams.get("completo") === "1";
  const admission = await prisma.admission.findFirst({
    where: { employeeId: id },
    orderBy: { updatedAt: "desc" },
    include: {
      fields: { orderBy: { sortOrder: "asc" } },
      documents: {
        orderBy: { sortOrder: "asc" },
        include: { files: { orderBy: { createdAt: "asc" }, select: { id: true, fileName: true, mimeType: true, size: true, createdAt: true } } },
      },
      contractingCompany: { select: { name: true } },
    },
  });

  if (full) {
    await prisma.employeeDataView.create({ data: { employeeId: id, viewedBy: auth.user.name } });
  }
  const views = await prisma.employeeDataView.findMany({
    where: { employeeId: id },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { viewedBy: true, createdAt: true },
  });

  const documents = await prisma.employeeDocument.findMany({
    where: { employeeId: id },
    orderBy: { createdAt: "desc" },
    select: EMPLOYEE_DOCUMENT_SELECT,
  });

  // Foto para crachá: a última imagem enviada no documento da foto.
  const photoDoc = admission?.documents.find((d) => isPhotoDocument(d.name));
  const photo = photoDoc?.files.filter((f) => DISPLAYABLE_IMAGE.test(f.mimeType)).at(-1);

  // Ficha cadastral: o que o RH preencheu ou importou; vazio, cai no que veio do onboarding.
  const onboarding = (key?: string) => (key ? (admission?.fields.find((f) => f.key === key)?.value ?? null) : null);
  const record = RECORD_FIELDS.map((f) => {
    const own = employee[f.key];
    const ownValue = own instanceof Date ? own.toISOString().slice(0, 10) : own;
    const fromOnboarding = onboarding(f.onboarding);
    const value = ownValue || fromOnboarding || null;
    return {
      key: f.key,
      label: f.label,
      type: f.type,
      sensitive: SENSITIVE_TYPES.has(f.type),
      source: ownValue ? "ficha" : fromOnboarding ? "onboarding" : null,
      value: full ? value : maskFieldValue(f.type, value),
    };
  });
  const publicEmployee = Object.fromEntries(Object.entries(employee).filter(([k]) => !(RECORD_KEYS as string[]).includes(k)));

  return NextResponse.json({
    employee: publicEmployee,
    record,
    recordMasked: !full,
    views,
    documents,
    admission: admission && {
      id: admission.id,
      status: admission.status,
      startDate: admission.startDate,
      createdAt: admission.createdAt,
      submittedAt: admission.submittedAt,
      companyName: admission.contractingCompany?.name ?? null,
      photoFileId: photo?.id ?? null,
      masked: !full,
      fields: admission.fields
        .filter((f) => f.key !== "nome")
        .map((f) => ({
          key: f.key,
          label: f.label,
          type: f.type,
          sensitive: SENSITIVE_TYPES.has(f.type),
          value: full ? f.value : maskFieldValue(f.type, f.value),
        })),
      documents: admission.documents.map((d) => ({
        id: d.id,
        kind: d.kind,
        name: d.name,
        status: d.status,
        reviewedAt: d.reviewedAt,
        reviewedBy: d.reviewedBy,
        files: d.files,
      })),
    },
  });
}
