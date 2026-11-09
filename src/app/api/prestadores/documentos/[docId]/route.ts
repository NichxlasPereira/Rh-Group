import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { readAttachment, removeAttachmentFiles } from "@/lib/attachmentStorage";

type Params = { params: Promise<{ docId: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const doc = await prisma.serviceProviderDocument.findUnique({ where: { id: (await params).docId } });
  const data = doc && (await readAttachment(doc.storedName, "prestadores"));
  if (!doc || !data) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
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

export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const id = (await params).docId;
  const doc = await prisma.serviceProviderDocument.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
  await prisma.serviceProviderDocument.delete({ where: { id } });
  await removeAttachmentFiles([doc.storedName], "prestadores");
  return NextResponse.json({ ok: true });
}
