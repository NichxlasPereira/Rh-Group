/**
 * Notas fiscais de serviço (colaboradores PJ): enviadas pelo portal do
 * colaborador e conferidas pelo RH.
 */

export type InvoiceStatus = "enviada" | "recebida" | "recusada";

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  enviada: "Aguardando RH",
  recebida: "Recebida",
  recusada: "Recusada",
};

export interface InvoiceFile {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
}

export interface ServiceInvoice {
  id: string;
  employeeId: string;
  competence: string;
  number: string | null;
  amountCents: number | null;
  notes: string | null;
  status: InvoiceStatus;
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  files: InvoiceFile[];
}

/** Nota como o RH vê: com o nome e o setor de quem enviou. */
export interface ServiceInvoiceRow extends ServiceInvoice {
  employeeName: string;
  employeeDepartment: string | null;
}

export const INVOICE_ACCEPT = "application/pdf,.xml,text/xml,application/xml,image/jpeg,image/png,image/webp,image/heic,.heic";
export const MAX_INVOICE_FILES = 4;

const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export function isCompetence(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** "2026-10" → "Outubro de 2026". */
export function competenceLabel(value: string): string {
  const [year, month] = value.split("-").map(Number);
  return `${MONTHS[month - 1]} de ${year}`;
}

/**
 * Mês sugerido: a nota do mês sai no fim dele ou no começo do seguinte. Até o
 * dia 15, sugere o mês anterior; depois, o atual.
 */
export function defaultCompetence(now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth() - (now.getDate() <= 15 ? 1 : 0), 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Os últimos `count` meses (o atual primeiro), para escolher a competência. */
export function recentCompetences(count = 6, now = new Date()): string[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}

/** "6.500,00", "6500" ou "6500.5" → centavos; null se vazio ou inválido. */
export function parseAmountCents(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  let v = value.trim().replace(/^R\$\s*/i, "");
  if (v.includes(",")) v = v.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return null;
  const cents = Math.round(Number(v) * 100);
  return cents > 0 && cents < 100_000_000_00 ? cents : null;
}

export function formatCents(cents: number | null): string {
  if (cents === null) return "—";
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
