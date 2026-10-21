import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { removeAttachmentFiles, saveAttachment } from "@/lib/attachmentStorage";
import { EMPLOYEE_DOCUMENT_SELECT } from "@/lib/employeeProfile";

/** RH envia um documento direto na ficha (sem passar pelo onboarding). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;

  if (!(await prisma.employee.findUnique({ where: { id }, select: { id: true } }))) {
    return NextResponse.json({ error: "Colaborador não encontrado." }, { status: 404 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const rawName = form?.get("name");
  const name = typeof rawName === "string" ? rawName.trim().replace(/\s+/g, " ").slice(0, 80) : "";
  if (!name) return NextResponse.json({ error: "Informe qual é o documento." }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "Selecione um arquivo." }, { status: 400 });

  const saved = await saveAttachment(file, "colaboradores");
  if ("error" in saved) return NextResponse.json({ error: saved.error }, { status: 400 });

  try {
    const document = await prisma.employeeDocument.create({
      data: {
        employeeId: id,
        name,
        fileName: file.name.slice(0, 200) || name,
        mimeType: saved.mimeType,
        size: saved.size,
        storedName: saved.storedName,
        uploadedBy: auth.user.name,
      },
      select: EMPLOYEE_DOCUMENT_SELECT,
    });
    return NextResponse.json(document, { status: 201 });
  } catch (err) {
    // O colaborador pode ter sido excluído enquanto o arquivo subia.
    await removeAttachmentFiles([saved.storedName], "colaboradores");
    throw err;
  }
}
