/**
 * Calendário do RH: feriados (calculados, sem banco), eventos cadastrados pelo RH
 * (recessos, comemorações, campanhas, treinamentos) e o tempo de casa.
 * Datas sem hora são sempre "AAAA-MM-DD" (no banco, meia-noite UTC).
 */

export type EventType = "feriado" | "recesso" | "comemoracao" | "campanha" | "treinamento";

export const EVENT_TYPES: EventType[] = ["feriado", "recesso", "comemoracao", "campanha", "treinamento"];

export const EVENT_LABEL: Record<EventType, string> = {
  feriado: "Feriado",
  recesso: "Recesso / ponto facultativo",
  comemoracao: "Comemoração / confraternização",
  campanha: "Campanha",
  treinamento: "Treinamento / integração",
};

/** Nome curto (filtros e legenda). */
export const EVENT_SHORT: Record<EventType, string> = {
  feriado: "Feriados",
  recesso: "Recessos",
  comemoracao: "Comemorações",
  campanha: "Campanhas",
  treinamento: "Treinamentos",
};

/** Cor de cada tipo (fundo suave + texto). */
export const EVENT_TONE: Record<EventType | "pessoas", string> = {
  feriado: "bg-critical-soft text-critical",
  recesso: "bg-warn-soft text-warn",
  comemoracao: "bg-ok-soft text-ok",
  campanha: "tone-campanha",
  treinamento: "tone-treinamento",
  pessoas: "bg-surface-2 text-muted",
};

export interface CalendarEventInfo {
  id: string;
  title: string;
  type: EventType;
  /** "AAAA-MM-DD". */
  startDate: string;
  /** "AAAA-MM-DD", inclusivo (igual ao início num evento de um dia). */
  endDate: string;
  /** Horário livre ("9h", "14:00 às 16:00"), ou null. */
  time: string | null;
  /** Empresas (setores) a que vale; vazio = todas. */
  departments: string[];
  /** Repete todo ano no mesmo dia e mês. */
  yearly: boolean;
  notes: string | null;
  createdBy: string | null;
}

// ---------------------------------------------------------------- datas

const DAY_MS = 24 * 60 * 60 * 1000;

export function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** "AAAA-MM-DD" do dia no calendário local. */
export function localDay(d: Date): string {
  return ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
function easter(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(year, month, day);
}

export interface Holiday {
  day: string;
  title: string;
  /** Feriado de verdade ou ponto facultativo (Carnaval). */
  type: "feriado" | "recesso";
  scope: "Nacional" | "Estadual (SP)" | "Municipal (São Paulo)" | "Ponto facultativo";
}

/** Feriados do ano: nacionais, estadual de SP e municipais da cidade de São Paulo. */
export function holidaysOf(year: number): Holiday[] {
  const p = easter(year);
  const fixed: [number, number, string, Holiday["scope"]][] = [
    [1, 1, "Confraternização Universal", "Nacional"],
    [1, 25, "Aniversário de São Paulo", "Municipal (São Paulo)"],
    [4, 21, "Tiradentes", "Nacional"],
    [5, 1, "Dia do Trabalho", "Nacional"],
    [7, 9, "Revolução Constitucionalista", "Estadual (SP)"],
    [9, 7, "Independência do Brasil", "Nacional"],
    [10, 12, "Nossa Senhora Aparecida", "Nacional"],
    [11, 2, "Finados", "Nacional"],
    [11, 15, "Proclamação da República", "Nacional"],
    [11, 20, "Dia da Consciência Negra", "Nacional"],
    [12, 25, "Natal", "Nacional"],
  ];
  const list: Holiday[] = fixed.map(([m, d, title, scope]) => ({ day: ymd(year, m, d), title, type: "feriado", scope }));
  list.push(
    { day: addDays(p, -48), title: "Carnaval", type: "recesso", scope: "Ponto facultativo" },
    { day: addDays(p, -47), title: "Carnaval", type: "recesso", scope: "Ponto facultativo" },
    { day: addDays(p, -2), title: "Sexta-feira Santa", type: "feriado", scope: "Nacional" },
    { day: addDays(p, 60), title: "Corpus Christi", type: "feriado", scope: "Municipal (São Paulo)" }
  );
  return list.sort((a, b) => a.day.localeCompare(b.day));
}

/** Feriados entre duas datas (inclusivo). */
export function holidaysBetween(from: string, to: string): Holiday[] {
  const out: Holiday[] = [];
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
    out.push(...holidaysOf(y).filter((h) => h.day >= from && h.day <= to));
  }
  return out;
}

/**
 * Ocorrências de um evento entre duas datas: { start, end } de cada vez que ele
 * acontece (eventos anuais se repetem no mesmo dia e mês de cada ano).
 */
export function eventSpans(e: Pick<CalendarEventInfo, "startDate" | "endDate" | "yearly">, from: string, to: string) {
  const spans: { start: string; end: string }[] = [];
  const length = daysBetween(e.startDate, e.endDate);
  const years = e.yearly
    ? Array.from({ length: Number(to.slice(0, 4)) - Number(from.slice(0, 4)) + 2 }, (_, i) => Number(from.slice(0, 4)) - 1 + i)
    : [Number(e.startDate.slice(0, 4))];
  for (const y of years) {
    if (e.yearly && y < Number(e.startDate.slice(0, 4))) continue;
    const start = e.yearly ? `${y}${e.startDate.slice(4)}` : e.startDate;
    // 29/02 em ano que não é bissexto: comemora em 28/02.
    const valid = start.slice(5) !== "02-29" || new Date(Date.UTC(y, 1, 29)).getUTCMonth() === 1 ? start : `${y}-02-28`;
    const end = addDays(valid, length);
    if (end >= from && valid <= to) spans.push({ start: valid, end });
  }
  return spans;
}

/** O evento vale para a empresa escolhida (sem empresa = vale para todas). */
export function appliesTo(e: Pick<CalendarEventInfo, "departments">, department: string): boolean {
  return !department || e.departments.length === 0 || e.departments.includes(department);
}

// ---------------------------------------------------------------- validação

export const EVENT_TITLE_MAX = 80;
export const EVENT_NOTES_MAX = 400;
export const EVENT_TIME_MAX = 30;
const MAX_SPAN_DAYS = 366;

export type EventInput = {
  title: string;
  type: EventType;
  startDate: Date;
  endDate: Date;
  time: string | null;
  departments: string | null;
  yearly: boolean;
  notes: string | null;
};

function parseDay(value: unknown): Date | null {
  const s = typeof value === "string" ? value.trim() : "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === s ? d : null;
}

/** Valida o corpo do POST/PATCH. Devolve os dados prontos para o banco ou { error }. */
export function parseEvent(body: unknown): EventInput | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const title = typeof b.title === "string" ? b.title.trim().replace(/\s+/g, " ") : "";
  if (!title) return { error: "Escreva o nome do evento." };
  if (title.length > EVENT_TITLE_MAX) return { error: `O nome pode ter até ${EVENT_TITLE_MAX} caracteres.` };
  const type = EVENT_TYPES.includes(b.type as EventType) ? (b.type as EventType) : null;
  if (!type) return { error: "Escolha o tipo do evento." };
  const startDate = parseDay(b.startDate);
  if (!startDate) return { error: "Informe a data de início." };
  const endDate = b.endDate ? parseDay(b.endDate) : startDate;
  if (!endDate) return { error: "Data de término inválida." };
  if (endDate < startDate) return { error: "O término não pode ser antes do início." };
  if ((endDate.getTime() - startDate.getTime()) / DAY_MS > MAX_SPAN_DAYS) return { error: "O evento pode durar até um ano." };
  const time = typeof b.time === "string" ? b.time.trim() : "";
  if (time.length > EVENT_TIME_MAX) return { error: `O horário pode ter até ${EVENT_TIME_MAX} caracteres.` };
  const notes = typeof b.notes === "string" ? b.notes.trim() : "";
  if (notes.length > EVENT_NOTES_MAX) return { error: `A observação pode ter até ${EVENT_NOTES_MAX} caracteres.` };
  const departments = Array.isArray(b.departments)
    ? [...new Set(b.departments.filter((d): d is string => typeof d === "string" && !!d.trim()).map((d) => d.trim()))].slice(0, 30)
    : [];
  return {
    title,
    type,
    startDate,
    endDate,
    time: time || null,
    departments: departments.length ? JSON.stringify(departments) : null,
    yearly: b.yearly === true,
    notes: notes || null,
  };
}

export function toEventInfo(e: {
  id: string;
  title: string;
  type: string;
  startDate: Date;
  endDate: Date;
  time: string | null;
  departments: string | null;
  yearly: boolean;
  notes: string | null;
  createdBy: string | null;
}): CalendarEventInfo {
  let departments: string[] = [];
  try {
    const parsed = e.departments ? JSON.parse(e.departments) : [];
    if (Array.isArray(parsed)) departments = parsed.filter((d) => typeof d === "string");
  } catch {}
  return {
    id: e.id,
    title: e.title,
    type: EVENT_TYPES.includes(e.type as EventType) ? (e.type as EventType) : "comemoracao",
    startDate: e.startDate.toISOString().slice(0, 10),
    endDate: e.endDate.toISOString().slice(0, 10),
    time: e.time,
    departments,
    yearly: e.yearly,
    notes: e.notes,
    createdBy: e.createdBy,
  };
}
