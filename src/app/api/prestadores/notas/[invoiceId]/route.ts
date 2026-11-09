import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { readAttachment, removeAttachmentFiles } from "@/lib/attachmentStorage";

type Params = { params: Promise<{ invoiceId: string }> };

/** Abre o arquivo da nota fiscal. */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const inv = await prisma.serviceProviderInvoice.findUnique({ where: { id: (await params).invoiceId } });
  const data = inv?.storedName && (await readAttachment(inv.storedName, "prestadores"));
  if (!inv || !data || !inv.mimeType) return NextResponse.json({ error: "Arquivo da nota não encontrado." }, { status: 404 });
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": inv.mimeType,
      "Content-Length": String(data.byteLength),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(inv.fileName ?? "nota-fiscal")}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const id = (await params).invoiceId;
  const inv = await prisma.serviceProviderInvoice.findUnique({ where: { id } });
  if (!inv) return NextResponse.json({ error: "Nota não encontrada." }, { status: 404 });
  await prisma.serviceProviderInvoice.delete({ where: { id } });
  if (inv.storedName) await removeAttachmentFiles([inv.storedName], "prestadores");
  return NextResponse.json({ ok: true });
}
