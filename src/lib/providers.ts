/**
 * Prestadores de serviço: PJs com contrato temporário, fora do quadro de
 * colaboradores. Regras usadas pela tela e pela API (sem acesso ao banco aqui).
 */

export type Billing = "mensal" | "por_entrega" | "unico";

export const BILLING_LABEL: Record<Billing, string> = {
  mensal: "Mensal",
  por_entrega: "Por entrega",
  unico: "Valor único",
};

export const BILLINGS = Object.keys(BILLING_LABEL) as Billing[];

/** Contrato que vence em até tantos dias aparece em destaque. */
export const EXPIRING_DAYS = 30;

export interface ProviderDocument {
  id: string;
  name: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedBy: string | null;
  createdAt: string;
}

export interface ProviderInvoice {
  id: string;
  month: string;
  number: string | null;
  amountCents: number | null;
  issueDate: string | null;
  fileName: string | null;
  size: number | null;
  notes: string | null;
  uploadedBy: string | null;
  createdAt: string;
}

/** O que a lista mostra — sem dados pessoais. */
export interface Provider {
  id: string;
  name: string;
  department: string | null;
  role: string | null;
  area: string | null;
  registration: string | null;
  corporateEmail: string | null;
  contractStart: string | null;
  contractEnd: string | null;
  amountCents: number | null;
  billing: Billing;
  active: boolean;
  createdAt: string;
  /** Meses ("AAAA-MM") com nota fiscal registrada. */
  invoiceMonths: string[];
  documentCount: number;
}

/** Ficha completa (só ao abrir um prestador). */
export interface ProviderDetail extends Provider {
  birthDate: string | null;
  rg: string | null;
  cpf: string | null;
  taxId: string | null;
  phone: string | null;
  emergencyContact: string | null;
  personalEmail: string | null;
  address: string | null;
  cep: string | null;
  pixKey: string | null;
  notes: string | null;
  documents: ProviderDocument[];
  invoices: ProviderInvoice[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Hoje às 00:00 UTC (as datas do contrato são guardadas assim). */
export function todayUTC(now = new Date()): number {
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
}

export type ContractStatus =
  | { kind: "encerrado" } // desativado pelo RH
  | { kind: "a_iniciar"; days: number }
  | { kind: "sem_termino" }
  | { kind: "vigente"; days: number }
  | { kind: "vencendo"; days: number }
  | { kind: "vencido"; days: number };

export function contractStatus(p: Pick<Provider, "active" | "contractStart" | "contractEnd">, now = new Date()): ContractStatus {
  if (!p.active) return { kind: "encerrado" };
  const today = todayUTC(now);
  const start = p.contractStart ? new Date(p.contractStart).getTime() : null;
  const end = p.contractEnd ? new Date(p.contractEnd).getTime() : null;
  if (end !== null && end < today) return { kind: "vencido", days: Math.round((today - end) / DAY_MS) };
  if (start !== null && start > today) return { kind: "a_iniciar", days: Math.round((start - today) / DAY_MS) };
  if (end === null) return { kind: "sem_termino" };
  const days = Math.round((end - today) / DAY_MS);
  return days <= EXPIRING_DAYS ? { kind: "vencendo", days } : { kind: "vigente", days };
}

export function contractStatusLabel(s: ContractStatus): string {
  switch (s.kind) {
    case "encerrado":
      return "Encerrado";
    case "a_iniciar":
      return s.days === 1 ? "Começa amanhã" : `Começa em ${s.days} dias`;
    case "sem_termino":
      return "Sem data de término";
    case "vigente":
      return "Vigente";
    case "vencendo":
      return s.days === 0 ? "Vence hoje" : s.days === 1 ? "Vence amanhã" : `Vence em ${s.days} dias`;
    case "vencido":
      return s.days === 1 ? "Venceu ontem" : `Venceu há ${s.days} dias`;
  }
}

/** O contrato cobre algum dia do mês "AAAA-MM"? (sem data = sem limite daquele lado) */
export function contractCoversMonth(p: Pick<Provider, "contractStart" | "contractEnd">, month: string): boolean {
  const [y, m] = month.split("-").map(Number);
  const first = Date.UTC(y, m - 1, 1);
  const last = Date.UTC(y, m, 0);
  const startOk = !p.contractStart || new Date(p.contractStart).getTime() <= last;
  const endOk = !p.contractEnd || new Date(p.contractEnd).getTime() >= first;
  return startOk && endOk;
}

/** Nota do mês pendente: ativo, cobrança mensal, contrato cobre o mês e nenhuma nota registrada. */
export function invoicePending(
  p: Pick<Provider, "active" | "billing" | "contractStart" | "contractEnd" | "invoiceMonths">,
  month: string
): boolean {
  return p.active && p.billing === "mensal" && contractCoversMonth(p, month) && !p.invoiceMonths.includes(month);
}

/** Precisa de atenção: contrato vencendo ou vencido (e ainda ativo). */
export function needsAttention(p: Pick<Provider, "active" | "contractStart" | "contractEnd">, now = new Date()): boolean {
  const k = contractStatus(p, now).kind;
  return k === "vencendo" || k === "vencido";
}

export function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

/** "1.234,56" / "1234.56" / "R$ 1.234" → centavos; null se vazio; NaN se inválido. */
export function parseMoneyToCents(value: string): number | null {
  const t = value.replace(/[R$\s]/g, "");
  if (!t) return null;
  const normalized = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return NaN;
  return Math.round(Number(normalized) * 100);
}

const digitsOf = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

export function formatCnpj(value: string | null): string | null {
  const d = digitsOf(value);
  return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : value;
}

export function formatCpf(value: string | null): string | null {
  const d = digitsOf(value);
  return d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") : value;
}

/** "17/04/1949", "1/12/2026" ou "2026-12-01" → "AAAA-MM-DD"; "" se vazio; null se inválido. */
export function parseDateInput(value: string): string | null {
  const t = value.trim();
  if (!t) return "";
  let y: number, m: number, d: number;
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (br) [d, m, y] = [Number(br[1]), Number(br[2]), Number(br[3])];
  else if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- validação

export interface ProviderInput {
  name: string;
  birthDate: Date | null;
  rg: string | null;
  cpf: string | null;
  taxId: string | null;
  phone: string | null;
  emergencyContact: string | null;
  personalEmail: string | null;
  corporateEmail: string | null;
  address: string | null;
  cep: string | null;
  registration: string | null;
  department: string | null;
  role: string | null;
  area: string | null;
  contractStart: Date | null;
  contractEnd: Date | null;
  amountCents: number | null;
  billing: Billing;
  pixKey: string | null;
  notes: string | null;
  active: boolean;
}

export const PROVIDER_FIELD_LABEL: Record<string, string> = {
  birthDate: "data de nascimento",
  contractStart: "data de contratação",
  contractEnd: "término do contrato",
};

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim().slice(0, max);
  return t || null;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateProviderInput(body: unknown): { data: ProviderInput } | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = text(b.name, 120);
  if (!name) return { error: "Informe o nome do prestador." };

  const dates: Record<"birthDate" | "contractStart" | "contractEnd", Date | null> = { birthDate: null, contractStart: null, contractEnd: null };
  for (const key of ["birthDate", "contractStart", "contractEnd"] as const) {
    const raw = typeof b[key] === "string" ? (b[key] as string) : "";
    const parsed = parseDateInput(raw);
    if (parsed === null) return { error: `Data inválida em ${PROVIDER_FIELD_LABEL[key]}. Use dd/mm/aaaa.` };
    dates[key] = parsed ? new Date(`${parsed}T00:00:00.000Z`) : null;
  }
  if (dates.contractStart && dates.contractEnd && dates.contractEnd < dates.contractStart) {
    return { error: "O término do contrato não pode ser antes da contratação." };
  }

  const cpfRaw = text(b.cpf, 20);
  if (cpfRaw && digitsOf(cpfRaw).length !== 11) return { error: "CPF inválido (11 dígitos)." };
  const taxIdRaw = text(b.taxId, 30);
  if (taxIdRaw && digitsOf(taxIdRaw).length !== 14) return { error: "CNPJ inválido (14 dígitos)." };

  const personalEmail = text(b.personalEmail, 120);
  const corporateEmail = text(b.corporateEmail, 120);
  if (personalEmail && !EMAIL.test(personalEmail)) return { error: "E-mail pessoal inválido." };
  if (corporateEmail && !EMAIL.test(corporateEmail)) return { error: "E-mail corporativo inválido." };

  let amountCents: number | null = null;
  if (typeof b.amount === "string" && b.amount.trim()) {
    const parsed = parseMoneyToCents(b.amount);
    if (parsed === null || Number.isNaN(parsed)) return { error: "Valor inválido. Use, por exemplo, 3.500,00." };
    amountCents = parsed;
  }

  return {
    data: {
      name,
      birthDate: dates.birthDate,
      rg: text(b.rg, 30),
      cpf: cpfRaw ? formatCpf(cpfRaw) : null,
      taxId: taxIdRaw ? formatCnpj(taxIdRaw) : null,
      phone: text(b.phone, 40),
      emergencyContact: text(b.emergencyContact, 160),
      personalEmail,
      corporateEmail,
      address: text(b.address, 240),
      cep: text(b.cep, 12),
      registration: text(b.registration, 40),
      department: text(b.department, 80),
      role: text(b.role, 80),
      area: text(b.area, 80),
      contractStart: dates.contractStart,
      contractEnd: dates.contractEnd,
      amountCents,
      billing: BILLINGS.includes(b.billing as Billing) ? (b.billing as Billing) : "mensal",
      pixKey: text(b.pixKey, 120),
      notes: typeof b.notes === "string" ? b.notes.trim().slice(0, 1000) || null : null,
      active: b.active === undefined ? true : b.active === true,
    },
  };
}

/** Mês "AAAA-MM" válido. */
export function isMonthKey(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

// ---------------------------------------------------------------- importação

/** Colunas da planilha de prestadores (como o RH já usa) → campo do cadastro. */
const IMPORT_COLUMNS: Record<string, keyof ProviderInput | "amount"> = {
  "nome": "name",
  "data nascimento": "birthDate",
  "data de nascimento": "birthDate",
  "rg": "rg",
  "cpf": "cpf",
  "cnpj": "taxId",
  "telefone": "phone",
  "contato emergencia": "emergencyContact",
  "contato de emergencia": "emergencyContact",
  "email pessoal": "personalEmail",
  "e-mail pessoal": "personalEmail",
  "email corporativo": "corporateEmail",
  "e-mail corporativo": "corporateEmail",
  "endereco": "address",
  "cep": "cep",
  "registro colaborador": "registration",
  "registro": "registration",
  "empresa": "department",
  "funcao": "role",
  "data de contratacao": "contractStart",
  "contratacao": "contractStart",
  "termino do contrato": "contractEnd",
  "termino": "contractEnd",
  "departamento": "area",
  "dados bancarios (chaves pix)": "pixKey",
  "dados bancarios": "pixKey",
  "chave pix": "pixKey",
  "valor": "amount",
};

const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Lê a planilha colada (Excel/Google: colunas separadas por TAB) ou CSV com ";".
 * Devolve um objeto por linha, com os campos que o formulário entende.
 */
export function parseProviderSheet(raw: string): { rows: Record<string, string>[]; unknownColumns: string[] } {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], unknownColumns: [] };
  const sep = lines[0].includes("\t") ? "\t" : ";";
  const header = lines[0].split(sep).map((h) => fold(h));
  const fields = header.map((h) => IMPORT_COLUMNS[h] ?? null);
  const unknownColumns = lines[0]
    .split(sep)
    .map((h, i) => (fields[i] || !h.trim() ? null : h.trim()))
    .filter((h): h is string => !!h);
  const rows = lines.slice(1).map((line) => {
    const cells = line.split(sep);
    const row: Record<string, string> = {};
    fields.forEach((f, i) => {
      const v = (cells[i] ?? "").trim();
      if (f && v && !row[f]) row[f] = v;
    });
    return row;
  });
  return { rows: rows.filter((r) => r.name), unknownColumns };
}
