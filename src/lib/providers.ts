/**
 * Prestadores de serviço: PJs com contrato temporário, fora do quadro de
 * colaboradores. Regras usadas pela tela e pela API (sem acesso ao banco aqui).
 */

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

/** Prestador na lista — o mesmo cadastro do colaborador mais o contrato. */
export interface Provider {
  id: string;
  name: string;
  department: string | null;
  role: string | null;
  area: string | null;
  contractStart: string | null;
  contractEnd: string | null;
  active: boolean;
  createdAt: string;
  documentCount: number;
}

/** Ficha (ao abrir um prestador): documentos. */
export interface ProviderDetail extends Provider {
  documents: ProviderDocument[];
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
      return "Sem validade definida";
    case "vigente":
      return "Vigente";
    case "vencendo":
      return s.days === 0 ? "Vence hoje" : s.days === 1 ? "Vence amanhã" : `Vence em ${s.days} dias`;
    case "vencido":
      return s.days === 1 ? "Venceu ontem" : `Venceu há ${s.days} dias`;
  }
}

/** Precisa de atenção: contrato vencendo ou vencido (e ainda ativo). */
export function needsAttention(p: Pick<Provider, "active" | "contractStart" | "contractEnd">, now = new Date()): boolean {
  const k = contractStatus(p, now).kind;
  return k === "vencendo" || k === "vencido";
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
  department: string | null;
  role: string | null;
  area: string | null;
  contractStart: Date | null;
  contractEnd: Date | null;
  active: boolean;
}

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim().slice(0, max);
  return t || null;
};

const DATE_LABEL = { contractStart: "início do contrato", contractEnd: "validade do contrato" } as const;

export function validateProviderInput(body: unknown): { data: ProviderInput } | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = text(b.name, 120);
  if (!name) return { error: "Informe o nome do prestador." };

  const dates: Record<"contractStart" | "contractEnd", Date | null> = { contractStart: null, contractEnd: null };
  for (const key of ["contractStart", "contractEnd"] as const) {
    const parsed = parseDateInput(typeof b[key] === "string" ? (b[key] as string) : "");
    if (parsed === null) return { error: `Data inválida em ${DATE_LABEL[key]}. Use dd/mm/aaaa.` };
    dates[key] = parsed ? new Date(`${parsed}T00:00:00.000Z`) : null;
  }
  if (dates.contractStart && dates.contractEnd && dates.contractEnd < dates.contractStart) {
    return { error: "A validade do contrato não pode ser antes do início." };
  }

  return {
    data: {
      name,
      department: text(b.department, 80),
      role: text(b.role, 80),
      area: text(b.area, 80),
      contractStart: dates.contractStart,
      contractEnd: dates.contractEnd,
      active: b.active === undefined ? true : b.active === true,
    },
  };
}

// ---------------------------------------------------------------- importação

/**
 * Colunas da planilha que entram no cadastro — as mesmas do colaborador mais o
 * contrato. Dados pessoais (CPF, RG, endereço, Pix…) ficam de fora de propósito.
 */
const IMPORT_COLUMNS: Record<string, keyof ProviderInput> = {
  "nome": "name",
  "empresa": "department",
  "setor": "department",
  "funcao": "role",
  "cargo": "role",
  "departamento": "area",
  "area": "area",
  "data de contratacao": "contractStart",
  "contratacao": "contractStart",
  "inicio do contrato": "contractStart",
  "inicio": "contractStart",
  "termino do contrato": "contractEnd",
  "termino": "contractEnd",
  "validade do contrato": "contractEnd",
  "validade": "contractEnd",
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
