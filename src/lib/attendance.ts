// "atraso" existiu até 30/09/2026 e foi retirado do sistema. Registros antigos
// desse tipo continuam no banco, mas a API não os lista nem aceita novos.
export type OccurrenceType = "falta" | "atestado" | "folga";

export const OCCURRENCE_TYPES: OccurrenceType[] = ["falta", "atestado", "folga"];

export const OCCURRENCE_LABEL: Record<OccurrenceType, string> = {
  falta: "Falta",
  atestado: "Atestado",
  folga: "Folga",
};

/** Tipos que cobrem um período (data inicial e final). */
export function isMultiDay(type: OccurrenceType): boolean {
  return type === "atestado" || type === "folga";
}

export interface Employee {
  id: string;
  name: string;
  department: string | null;
  role: string | null;
  active: boolean;
  folgaAllowance: number;
  startDate: string | null;
  contractType: string | null;
  contractEnd: string | null;
  areaId: string | null;
  areaLead: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Área de uma empresa (setor) no organograma. */
export interface CompanyArea {
  id: string;
  companyId: string;
  name: string;
}

export interface Attachment {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export const MAX_ATTACHMENT_MB = 10;
export const ATTACHMENT_ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

export interface Occurrence {
  id: string;
  employeeId: string | null;
  employeeName: string;
  employeeDepartment: string | null;
  type: OccurrenceType;
  date: string;
  endDate: string;
  justified: boolean;
  approvedBy: string | null;
  notes: string | null;
  attachments: Attachment[];
  createdAt: string;
  updatedAt: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Dias corridos cobertos pela ocorrência (inclusivo). Falta conta 1. */
export function occurrenceDays(o: Pick<Occurrence, "date" | "endDate">): number {
  const start = new Date(o.date).getTime();
  const end = new Date(o.endDate).getTime();
  return Math.max(1, Math.round((end - start) / DAY_MS) + 1);
}

/** "YYYY-MM" em UTC — as datas são gravadas como meia-noite UTC. */
export function monthKey(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

const MONTH_NAMES = [
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

export function monthKeyLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return `${MONTH_NAMES[month - 1]} de ${year}`;
}

/** Dias de `o` que caem dentro do mês `key` — um atestado pode atravessar meses. */
export function daysInMonth(o: Pick<Occurrence, "date" | "endDate">, key: string): number {
  const [year, month] = key.split("-").map(Number);
  const monthStart = Date.UTC(year, month - 1, 1);
  const monthEnd = Date.UTC(year, month, 0);
  const start = Math.max(new Date(o.date).getTime(), monthStart);
  const end = Math.min(new Date(o.endDate).getTime(), monthEnd);
  if (end < start) return 0;
  return Math.round((end - start) / DAY_MS) + 1;
}

export function overlapsMonth(o: Pick<Occurrence, "date" | "endDate">, key: string): boolean {
  return daysInMonth(o, key) > 0;
}

export interface EmployeeSummary {
  key: string;
  employeeId: string | null;
  name: string;
  department: string | null;
  faltas: number;
  faltasInjustificadas: number;
  atestados: number;
  diasAtestado: number;
  folgas: number;
  diasFolga: number;
}

/** Totais por colaborador. Com `month`, considera só o que cai naquele mês. */
export function summarizeByEmployee(occurrences: Occurrence[], month?: string): EmployeeSummary[] {
  const map = new Map<string, EmployeeSummary>();

  for (const o of occurrences) {
    if (month && !overlapsMonth(o, month)) continue;
    const key = o.employeeId ?? `__deleted__:${o.employeeName}`;
    let s = map.get(key);
    if (!s) {
      s = {
        key,
        employeeId: o.employeeId,
        name: o.employeeName,
        department: o.employeeDepartment,
        faltas: 0,
        faltasInjustificadas: 0,
        atestados: 0,
        diasAtestado: 0,
        folgas: 0,
        diasFolga: 0,
      };
      map.set(key, s);
    }
    if (o.type === "falta") {
      s.faltas += 1;
      if (!o.justified) s.faltasInjustificadas += 1;
    } else if (o.type === "atestado") {
      s.atestados += 1;
      s.diasAtestado += month ? daysInMonth(o, month) : occurrenceDays(o);
    } else {
      s.folgas += 1;
      s.diasFolga += month ? daysInMonth(o, month) : occurrenceDays(o);
    }
  }

  return Array.from(map.values());
}

export type MonthTotals = Omit<EmployeeSummary, "key" | "employeeId" | "name" | "department">;

export function emptyTotals(): MonthTotals {
  return {
    faltas: 0,
    faltasInjustificadas: 0,
    atestados: 0,
    diasAtestado: 0,
    folgas: 0,
    diasFolga: 0,
  };
}

export function addTotals(totals: MonthTotals, s: MonthTotals): void {
  totals.faltas += s.faltas;
  totals.faltasInjustificadas += s.faltasInjustificadas;
  totals.atestados += s.atestados;
  totals.diasAtestado += s.diasAtestado;
  totals.folgas += s.folgas;
  totals.diasFolga += s.diasFolga;
}

export function monthTotals(occurrences: Occurrence[], month: string): MonthTotals {
  const totals = emptyTotals();
  for (const s of summarizeByEmployee(occurrences, month)) addTotals(totals, s);
  return totals;
}

/**
 * Dias de folga já lançados para o colaborador, em qualquer período.
 * `excludeId` ignora uma ocorrência (a que está sendo editada).
 */
export function folgaDaysUsed(
  occurrences: Pick<Occurrence, "id" | "employeeId" | "type" | "date" | "endDate">[],
  employeeId: string,
  excludeId?: string
): number {
  let used = 0;
  for (const o of occurrences) {
    if (o.type === "folga" && o.employeeId === employeeId && o.id !== excludeId) used += occurrenceDays(o);
  }
  return used;
}

export function pluralDias(n: number): string {
  return `${n} ${Math.abs(n) === 1 ? "dia" : "dias"}`;
}

/** Meses (YYYY-MM) com alguma ocorrência, mais o mês atual, do mais recente ao mais antigo. */
export function availableMonths(occurrences: Occurrence[]): string[] {
  const set = new Set<string>([currentMonthKey()]);
  for (const o of occurrences) {
    const start = new Date(o.date);
    const end = new Date(o.endDate);
    const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    while (cursor.getTime() <= end.getTime()) {
      set.add(monthKey(cursor));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  }
  return Array.from(set).sort().reverse();
}
