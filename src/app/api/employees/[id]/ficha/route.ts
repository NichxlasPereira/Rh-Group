import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { DISPLAYABLE_IMAGE, EMPLOYEE_DOCUMENT_SELECT, SENSITIVE_TYPES, maskFieldValue } from "@/lib/employeeProfile";

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

  if (full && admission) {
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
  const photoDoc = admission?.documents.find((d) => /foto/i.test(d.name));
  const photo = photoDoc?.files.filter((f) => DISPLAYABLE_IMAGE.test(f.mimeType)).at(-1);

  return NextResponse.json({
    employee,
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
