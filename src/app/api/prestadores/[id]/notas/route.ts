import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { removeAttachmentFiles, saveAttachment } from "@/lib/attachmentStorage";
import { isMonthKey, parseMoneyToCents } from "@/lib/providers";

/** Registra a nota fiscal de um mês (o arquivo da nota é opcional). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  if (!(await prisma.serviceProvider.findUnique({ where: { id }, select: { id: true } }))) {
    return NextResponse.json({ error: "Prestador não encontrado." }, { status: 404 });
  }

  const form = await request.formData().catch(() => null);
  const get = (k: string) => {
    const v = form?.get(k);
    return typeof v === "string" ? v.trim() : "";
  };
  const month = get("month");
  if (!isMonthKey(month)) return NextResponse.json({ error: "Informe o mês da nota." }, { status: 400 });
  const amount = get("amount");
  const amountCents = amount ? parseMoneyToCents(amount) : null;
  if (amountCents !== null && Number.isNaN(amountCents)) {
    return NextResponse.json({ error: "Valor inválido. Use, por exemplo, 3.500,00." }, { status: 400 });
  }
  const issue = get("issueDate");
  const issueDate = /^\d{4}-\d{2}-\d{2}$/.test(issue) ? new Date(`${issue}T00:00:00.000Z`) : null;
  const file = form?.get("file");

  let saved: { storedName: string; mimeType: string; size: number } | null = null;
  if (file instanceof File && file.size > 0) {
    const r = await saveAttachment(file, "prestadores");
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
    saved = r;
  }
  try {
    const invoice = await prisma.serviceProviderInvoice.create({
      data: {
        providerId: id,
        month,
        number: get("number").slice(0, 40) || null,
        amountCents,
        issueDate,
        notes: get("notes").slice(0, 500) || null,
        uploadedBy: auth.user.name,
        ...(saved && file instanceof File
          ? { fileName: file.name.slice(0, 200), mimeType: saved.mimeType, size: saved.size, storedName: saved.storedName }
          : {}),
      },
      select: { id: true },
    });
    return NextResponse.json(invoice, { status: 201 });
  } catch (err) {
    if (saved) await removeAttachmentFiles([saved.storedName], "prestadores");
    throw err;
  }
}
