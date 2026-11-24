/**
 * Itens do calendário do RH num intervalo de dias: feriados, eventos cadastrados e
 * datas das pessoas (aniversário, tempo de casa, entrada, saída, fim de contrato).
 */
import { Employee } from "./attendance";
import { Birthday, isBirthdayOn } from "./birthdays";
import {
  CalendarEventInfo,
  EventType,
  addDays,
  appliesTo,
  daysBetween,
  eventSpans,
  holidaysBetween,
} from "./calendar";

export type ItemKind = EventType | "aniversario" | "tempo_casa" | "entrada" | "saida" | "contrato";

export interface CalendarItem {
  key: string;
  /** "AAAA-MM-DD". */
  day: string;
  kind: ItemKind;
  /** Cor: tipo do evento, ou "pessoas" para as datas da equipe. */
  tone: EventType | "pessoas";
  title: string;
  detail: string;
  time?: string | null;
  /** Evento cadastrado (pode editar). */
  eventId?: string;
  /** Primeiro e último dia do evento (eventos de vários dias). */
  span?: { start: string; end: string };
  employeeId?: string;
}

export interface CalendarSource {
  events: CalendarEventInfo[];
  employees: Employee[];
  birthdays: Birthday[];
  /** Último dia de quem está saindo (pedidos de offboarding). */
  exits?: { id: string; startDate: string | null; employee: { id: string; name: string; department: string | null } }[];
  /** Empresa escolhida ("" = todas). */
  department?: string;
  /** Inclui as datas das pessoas (padrão: sim). */
  people?: boolean;
}

function shortDate(day: string): string {
  return `${day.slice(8, 10)}/${day.slice(5, 7)}`;
}

function dayRange(from: string, to: string): string[] {
  const n = daysBetween(from, to);
  return Array.from({ length: n + 1 }, (_, i) => addDays(from, i));
}

export function itemsBetween(from: string, to: string, src: CalendarSource): CalendarItem[] {
  const department = src.department ?? "";
  const items: CalendarItem[] = [];

  for (const h of holidaysBetween(from, to)) {
    items.push({ key: `feriado-${h.day}-${h.title}`, day: h.day, kind: h.type, tone: h.type, title: h.title, detail: h.scope });
  }

  for (const e of src.events) {
    if (!appliesTo(e, department)) continue;
    for (const span of eventSpans(e, from, to)) {
      const multi = span.end !== span.start;
      const where = e.departments.length ? e.departments.join(", ") : "Todas as empresas";
      for (const day of dayRange(span.start > from ? span.start : from, span.end < to ? span.end : to)) {
        items.push({
          key: `evento-${e.id}-${day}`,
          day,
          kind: e.type,
          tone: e.type,
          title: e.title,
          detail: [multi ? `${shortDate(span.start)} a ${shortDate(span.end)}` : null, where].filter(Boolean).join(" · "),
          time: e.time,
          eventId: e.id,
          span,
        });
      }
    }
  }

  if (src.people === false) return items;

  const days = dayRange(from, to);
  const people = src.employees.filter((e) => e.active && (!department || e.department === department));
  const byId = new Map(people.map((e) => [e.id, e]));
  const who = (e: Employee) => [e.department, e.role].filter(Boolean).join(" · ") || "Colaborador";

  for (const b of src.birthdays) {
    const e = byId.get(b.employeeId);
    if (!e) continue;
    for (const day of days) {
      const [y, m, d] = day.split("-").map(Number);
      if (isBirthdayOn(b, new Date(y, m - 1, d))) {
        items.push({ key: `aniv-${e.id}-${day}`, day, kind: "aniversario", tone: "pessoas", title: `Aniversário · ${e.name}`, detail: who(e), employeeId: e.id });
      }
    }
  }

  for (const e of people) {
    const start = e.startDate?.slice(0, 10);
    if (start) {
      if (start >= from && start <= to) {
        items.push({ key: `entrada-${e.id}`, day: start, kind: "entrada", tone: "pessoas", title: `Primeiro dia · ${e.name}`, detail: who(e), employeeId: e.id });
      }
      // Tempo de casa: mesmo dia e mês da entrada, a partir de 1 ano.
      for (const day of days) {
        const years = Number(day.slice(0, 4)) - Number(start.slice(0, 4));
        if (years >= 1 && day.slice(5) === start.slice(5)) {
          items.push({
            key: `casa-${e.id}-${day}`,
            day,
            kind: "tempo_casa",
            tone: "pessoas",
            title: `${years} ${years === 1 ? "ano" : "anos"} de casa · ${e.name}`,
            detail: who(e),
            employeeId: e.id,
          });
        }
      }
    }
    const end = e.contractEnd?.slice(0, 10);
    if (end && end >= from && end <= to) {
      items.push({
        key: `contrato-${e.id}`,
        day: end,
        kind: "contrato",
        tone: "pessoas",
        title: `Fim de contrato · ${e.name}`,
        detail: [e.contractType, e.department].filter(Boolean).join(" · ") || "Colaborador",
        employeeId: e.id,
      });
    }
  }

  for (const k of src.exits ?? []) {
    const last = k.startDate?.slice(0, 10);
    if (!last || last < from || last > to) continue;
    if (department && k.employee.department !== department) continue;
    items.push({
      key: `saida-${k.id}`,
      day: last,
      kind: "saida",
      tone: "pessoas",
      title: `Último dia · ${k.employee.name}`,
      detail: k.employee.department || "Colaborador",
      employeeId: k.employee.id,
    });
  }

  return items;
}

/** Próximo feriado e próximo recesso (até um ano à frente), para a contagem regressiva. */
export function upcoming(today: string, events: CalendarEventInfo[]) {
  const until = addDays(today, 365);
  const items = itemsBetween(today, until, { events, employees: [], birthdays: [], people: false });
  const first = (kind: ItemKind) => {
    const list = items.filter((i) => i.kind === kind).sort((a, b) => a.day.localeCompare(b.day));
    if (!list.length) return null;
    const it = list[0];
    // Recesso de vários dias que já começou: está em andamento.
    const ongoing = !!it.span && it.span.start < today;
    return { title: it.title, day: it.day, days: daysBetween(today, it.day), ongoing, end: it.span?.end ?? it.day };
  };
  return { holiday: first("feriado"), recess: first("recesso") };
}
