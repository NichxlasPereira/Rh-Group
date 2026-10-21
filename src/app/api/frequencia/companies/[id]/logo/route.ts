import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { readAttachment, removeAttachmentFiles, saveAttachment } from "@/lib/attachmentStorage";
import { DISPLAYABLE_IMAGE } from "@/lib/employeeProfile";

/** Logo da empresa (organograma). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const company = await prisma.contractingCompany.findUnique({ where: { id }, select: { logoFile: true, logoMime: true } });
  const data = company?.logoFile ? await readAttachment(company.logoFile, "empresas") : null;
  if (!company?.logoFile || !company.logoMime || !data) {
    return NextResponse.json({ error: "Sem logo." }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": company.logoMime,
      "Content-Length": String(data.byteLength),
      "X-Content-Type-Options": "nosniff",
      // O endereço muda a cada troca (?v=), então pode ficar no cache do navegador.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}

/** Envia ou troca o logo. Todo o RH pode (é só a aparência do organograma). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const company = await prisma.contractingCompany.findUnique({ where: { id }, select: { logoFile: true } });
  if (!company) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Selecione o arquivo do logo." }, { status: 400 });

  const saved = await saveAttachment(file, "empresas");
  if ("error" in saved) return NextResponse.json({ error: saved.error }, { status: 400 });
  if (!DISPLAYABLE_IMAGE.test(saved.mimeType)) {
    await removeAttachmentFiles([saved.storedName], "empresas");
    return NextResponse.json({ error: "Envie o logo em PNG, JPG ou WEBP." }, { status: 400 });
  }

  const updated = await prisma.contractingCompany.update({
    where: { id },
    data: { logoFile: saved.storedName, logoMime: saved.mimeType, logoUpdatedAt: new Date() },
  });
  if (company.logoFile) await removeAttachmentFiles([company.logoFile], "empresas");
  return NextResponse.json(updated);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const company = await prisma.contractingCompany.findUnique({ where: { id }, select: { logoFile: true } });
  if (!company) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });

  const updated = await prisma.contractingCompany.update({
    where: { id },
    data: { logoFile: null, logoMime: null, logoUpdatedAt: null },
  });
  if (company.logoFile) await removeAttachmentFiles([company.logoFile], "empresas");
  return NextResponse.json(updated);
}
