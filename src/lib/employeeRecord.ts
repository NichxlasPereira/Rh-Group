/**
 * Ficha cadastral do colaborador: os campos, de onde vêm no onboarding e a
 * leitura da planilha que o RH cola ou envia para importar.
 */

export type RecordFieldKey =
  | "birthDate"
  | "rg"
  | "cpf"
  | "phone"
  | "emergencyContact"
  | "personalEmail"
  | "corporateEmail"
  | "address"
  | "cep"
  | "registration"
  | "jobFunction"
  | "pixKeys";

export interface RecordField {
  key: RecordFieldKey;
  label: string;
  /** Tipo usado para mascarar (o mesmo do onboarding). */
  type: "date" | "rg" | "cpf" | "tel" | "email" | "textarea" | "text";
  /** Campo do onboarding que preenche este quando a ficha está vazia. */
  onboarding?: string;
}

export const RECORD_FIELDS: RecordField[] = [
  { key: "registration", label: "Registro do colaborador", type: "text" },
  { key: "jobFunction", label: "Função", type: "text" },
  { key: "corporateEmail", label: "E-mail corporativo", type: "email" },
  { key: "birthDate", label: "Data de nascimento", type: "date", onboarding: "nascimento" },
  { key: "cpf", label: "CPF", type: "cpf", onboarding: "cpf" },
  { key: "rg", label: "RG", type: "rg", onboarding: "rg" },
  { key: "phone", label: "Telefone", type: "tel", onboarding: "telefone" },
  { key: "personalEmail", label: "E-mail pessoal", type: "email", onboarding: "email" },
  { key: "emergencyContact", label: "Contato de emergência", type: "textarea" },
  { key: "address", label: "Endereço", type: "textarea", onboarding: "endereco" },
  { key: "cep", label: "CEP", type: "text" },
  { key: "pixKeys", label: "Dados bancários (chaves Pix)", type: "textarea", onboarding: "pix" },
];

export const RECORD_KEYS = RECORD_FIELDS.map((f) => f.key);

/** Colunas que a importação entende, além dos campos da ficha. */
export type ImportColumn = RecordFieldKey | "name" | "company" | "role" | "startDate" | "area";

export const IMPORT_LABELS: Record<ImportColumn, string> = {
  name: "Nome",
  company: "Empresa",
  role: "Cargo",
  startDate: "Data de contratação",
  area: "Departamento",
  ...(Object.fromEntries(RECORD_FIELDS.map((f) => [f.key, f.label])) as Record<RecordFieldKey, string>),
};

/** Sem acentos, minúsculas, só letras e números: compara nomes e cabeçalhos. */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Nome comparável: sem acentos e com espaços simples. */
export function foldName(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const HEADER_ALIASES: [ImportColumn, string[]][] = [
  ["name", ["nome", "nomecompleto", "colaborador"]],
  ["birthDate", ["datanascimento", "datadenascimento", "nascimento"]],
  ["rg", ["rg"]],
  ["cpf", ["cpf"]],
  ["phone", ["telefone", "celular", "whatsapp", "telefonewhatsapp"]],
  ["emergencyContact", ["contatoemergencia", "contatodeemergencia", "emergencia"]],
  ["personalEmail", ["emailpessoal"]],
  ["corporateEmail", ["emailcorporativo"]],
  ["address", ["endereco", "enderecocompleto"]],
  ["cep", ["cep"]],
  ["registration", ["registrocolaborador", "registro", "matricula", "registrodocolaborador"]],
  ["company", ["empresa", "setor"]],
  ["role", ["cargo"]],
  ["jobFunction", ["funcao"]],
  ["startDate", ["datadecontratacao", "datacontratacao", "contratacao", "dataadmissao", "admissao", "dataentrada"]],
  ["area", ["departamento", "area"]],
];

/** Coluna da planilha → campo, ou null se a coluna não é reconhecida. */
export function columnFor(header: string): ImportColumn | null {
  const key = fold(header);
  if (!key) return null;
  if (key.startsWith("dadosbancarios") || key.includes("pix")) return "pixKeys";
  for (const [column, aliases] of HEADER_ALIASES) if (aliases.includes(key)) return column;
  return null;
}

/** Lê o texto colado da planilha (tabulação) ou um CSV (vírgula ou ponto e vírgula). */
export function parseTable(text: string): string[][] {
  const clean = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const firstLine = clean.split("\n", 1)[0] ?? "";
  const delimiter = firstLine.includes("\t")
    ? "\t"
    : (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0)
      ? ";"
      : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export type ImportRow = Partial<Record<ImportColumn, string>> & { line: number };

export type ImportAction = "atualizar" | "criar" | "sem_mudancas" | "nao_encontrado" | "ignorar";

/** Resultado de uma linha da importação (sem os valores: só os nomes dos campos). */
export interface ImportResult {
  line: number;
  name: string;
  employee: string | null;
  action: ImportAction;
  changes: string[];
  warnings: string[];
}

/** Tabela → linhas com os campos reconhecidos (e as colunas que ficaram de fora). */
export function rowsFromTable(table: string[][]): { rows: ImportRow[]; columns: ImportColumn[]; ignored: string[] } {
  const [header = [], ...body] = table;
  const columns = header.map(columnFor);
  const ignored = header.filter((h, i) => h.trim() && !columns[i]);
  const rows = body.map((cells, index) => {
    const row: ImportRow = { line: index + 2 };
    columns.forEach((column, i) => {
      const value = (cells[i] ?? "").trim();
      if (column && value) row[column] = value;
    });
    return row;
  });
  return { rows, columns: columns.filter((c): c is ImportColumn => !!c), ignored };
}

/** "31/12/1990", "31/12/90", "1990-12-31" ou número de série do Excel → "AAAA-MM-DD". */
export function parseDateCell(value: string): string | null {
  const v = value.trim();
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(v);
  if (m) {
    let year = Number(m[3]);
    if (m[3].length === 2) year += year > new Date().getFullYear() % 100 ? 1900 : 2000;
    return isoDate(year, Number(m[2]), Number(m[1]));
  }
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v);
  if (m) return isoDate(Number(m[1]), Number(m[2]), Number(m[3]));
  if (/^\d{5}$/.test(v)) {
    // Excel conta os dias a partir de 30/12/1899.
    const d = new Date(Date.UTC(1899, 11, 30) + Number(v) * 86_400_000);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

function isoDate(year: number, month: number, day: number): string | null {
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  if (year < 1900 || year > 2100) return null;
  return d.toISOString().slice(0, 10);
}
