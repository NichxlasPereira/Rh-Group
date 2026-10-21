import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { readAttachment, removeAttachmentFiles } from "@/lib/attachmentStorage";

/** RH abre um documento enviado direto na ficha. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const doc = await prisma.employeeDocument.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });

  const data = await readAttachment(doc.storedName, "colaboradores");
  if (!data) return NextResponse.json({ error: "O arquivo não foi encontrado no servidor." }, { status: 404 });

  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Length": String(data.byteLength),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const doc = await prisma.employeeDocument.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });

  await prisma.employeeDocument.delete({ where: { id } });
  await removeAttachmentFiles([doc.storedName], "colaboradores");
  return NextResponse.json({ ok: true });
}
