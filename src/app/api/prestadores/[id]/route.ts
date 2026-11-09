import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { removeAttachmentFiles } from "@/lib/attachmentStorage";
import { validateProviderInput } from "@/lib/providers";
import { getProvider } from "@/lib/providersServer";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const provider = await getProvider((await params).id);
  if (!provider) return NextResponse.json({ error: "Prestador não encontrado." }, { status: 404 });
  return NextResponse.json(provider);
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const result = validateProviderInput(await request.json().catch(() => null));
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  const updated = await prisma.serviceProvider.updateMany({ where: { id }, data: result.data });
  if (!updated.count) return NextResponse.json({ error: "Prestador não encontrado." }, { status: 404 });
  return NextResponse.json(await getProvider(id));
}

/** Exclui o prestador com documentos e notas. Só administradores. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await requireFrequenciaUser({ admin: true });
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const [docs, invoices] = await Promise.all([
    prisma.serviceProviderDocument.findMany({ where: { providerId: id }, select: { storedName: true } }),
    prisma.serviceProviderInvoice.findMany({ where: { providerId: id }, select: { storedName: true } }),
  ]);
  const deleted = await prisma.serviceProvider.deleteMany({ where: { id } });
  if (!deleted.count) return NextResponse.json({ error: "Prestador não encontrado." }, { status: 404 });
  const files = [...docs.map((d) => d.storedName), ...invoices.map((i) => i.storedName)].filter((n): n is string => !!n);
  await removeAttachmentFiles(files, "prestadores");
  return NextResponse.json({ ok: true });
}
