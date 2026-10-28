import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalEmployee } from "@/lib/portalAccess";
import { removeAttachmentFiles, saveAttachment } from "@/lib/attachmentStorage";
import { MAX_INVOICE_FILES, isCompetence, parseAmountCents } from "@/lib/invoices";
import { INVOICE_FILES_SELECT, toInvoice } from "@/lib/invoicesServer";

/** Notas do próprio colaborador, da mais recente para a mais antiga. */
export async function GET() {
  const auth = await requirePortalEmployee();
  if ("response" in auth) return auth.response;
  const rows = await prisma.serviceInvoice.findMany({
    where: { employeeId: auth.employee.id },
    orderBy: [{ competence: "desc" }, { createdAt: "desc" }],
    include: INVOICE_FILES_SELECT,
  });
  return NextResponse.json(rows.map(toInvoice));
}

/** Envio de uma nota: competência, arquivos (PDF/XML) e, se quiser, número, valor e recado. */
export async function POST(request: NextRequest) {
  const auth = await requirePortalEmployee();
  if ("response" in auth) return auth.response;

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Envio inválido." }, { status: 400 });

  const competence = form.get("competence");
  if (!isCompetence(competence)) return NextResponse.json({ error: "Escolha o mês da nota." }, { status: 400 });

  const text = (key: string, max: number) => {
    const v = form.get(key);
    return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
  };
  const number = text("number", 40);
  const notes = text("notes", 1000);
  const rawAmount = text("amount", 30);
  const amountCents = rawAmount ? parseAmountCents(rawAmount) : null;
  if (rawAmount && amountCents === null) {
    return NextResponse.json({ error: "Valor inválido. Use, por exemplo, 6.500,00." }, { status: 400 });
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return NextResponse.json({ error: "Anexe o PDF ou o XML da nota." }, { status: 400 });
  if (files.length > MAX_INVOICE_FILES) {
    return NextResponse.json({ error: `Envie no máximo ${MAX_INVOICE_FILES} arquivos.` }, { status: 400 });
  }

  // Grava os arquivos primeiro; se algum falhar, apaga os que já foram.
  const saved: { fileName: string; mimeType: string; size: number; storedName: string }[] = [];
  for (const file of files) {
    const result = await saveAttachment(file, "notas", { allowXml: true });
    if ("error" in result) {
      await removeAttachmentFiles(saved.map((s) => s.storedName), "notas");
      return NextResponse.json({ error: `${file.name}: ${result.error}` }, { status: 400 });
    }
    saved.push({ fileName: file.name.slice(0, 200) || "nota", ...result });
  }

  const invoice = await prisma.serviceInvoice.create({
    data: {
      employeeId: auth.employee.id,
      competence,
      number,
      amountCents,
      notes,
      files: { create: saved },
    },
    include: INVOICE_FILES_SELECT,
  });
  return NextResponse.json(toInvoice(invoice), { status: 201 });
}
