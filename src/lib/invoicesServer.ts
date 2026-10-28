import { NextResponse } from "next/server";
import { readAttachment } from "./attachmentStorage";
import { InvoiceStatus, ServiceInvoice } from "./invoices";

export const INVOICE_FILES_SELECT = {
  files: {
    select: { id: true, fileName: true, mimeType: true, size: true },
    orderBy: { createdAt: "asc" as const },
  },
};

type InvoiceRecord = {
  id: string;
  employeeId: string;
  competence: string;
  number: string | null;
  amountCents: number | null;
  notes: string | null;
  status: string;
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  files: { id: string; fileName: string; mimeType: string; size: number }[];
};

export function toInvoice(r: InvoiceRecord): ServiceInvoice {
  return {
    id: r.id,
    employeeId: r.employeeId,
    competence: r.competence,
    number: r.number,
    amountCents: r.amountCents,
    notes: r.notes,
    status: r.status as InvoiceStatus,
    reviewNote: r.reviewNote,
    reviewedBy: r.reviewedBy,
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    files: r.files,
  };
}

/** Devolve o arquivo da nota. O XML vai sempre como download, nunca aberto no navegador. */
export async function invoiceFileResponse(file: { storedName: string; mimeType: string; fileName: string }) {
  const data = await readAttachment(file.storedName, "notas");
  if (!data) return NextResponse.json({ error: "O arquivo não foi encontrado." }, { status: 404 });
  const xml = file.mimeType === "application/xml";
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": xml ? "application/octet-stream" : file.mimeType,
      "Content-Length": String(data.byteLength),
      "Content-Disposition": `${xml ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
      "Cache-Control": "private, no-store",
    },
  });
}
