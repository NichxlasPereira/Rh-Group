import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { removeAttachmentFiles, saveAttachment } from "@/lib/attachmentStorage";

/** Documento na ficha do prestador (contrato assinado, cartão CNPJ...). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  if (!(await prisma.serviceProvider.findUnique({ where: { id }, select: { id: true } }))) {
    return NextResponse.json({ error: "Prestador não encontrado." }, { status: 404 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const rawName = form?.get("name");
  const name = typeof rawName === "string" ? rawName.trim().replace(/\s+/g, " ").slice(0, 80) : "";
  if (!name) return NextResponse.json({ error: "Informe qual é o documento." }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "Selecione um arquivo." }, { status: 400 });

  const saved = await saveAttachment(file, "prestadores");
  if ("error" in saved) return NextResponse.json({ error: saved.error }, { status: 400 });
  try {
    const doc = await prisma.serviceProviderDocument.create({
      data: {
        providerId: id,
        name,
        fileName: file.name.slice(0, 200) || name,
        mimeType: saved.mimeType,
        size: saved.size,
        storedName: saved.storedName,
        uploadedBy: auth.user.name,
      },
      select: { id: true },
    });
    return NextResponse.json(doc, { status: 201 });
  } catch (err) {
    await removeAttachmentFiles([saved.storedName], "prestadores");
    throw err;
  }
}
