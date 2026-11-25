"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "../Modal";
import { Button } from "../Button";
import { EmptyState, Field, inputClass } from "./formControls";
import {
  IconCake,
  IconCalendar,
  IconCalendarX,
  IconCheckCircle,
  IconChevronRight,
  IconClipboardCheck,
  IconDoorEnter,
  IconDoorExit,
  IconFileWarning,
  IconFlag,
  IconHourglass,
  IconKey,
  IconParty,
  IconRibbon,
  IconSchool,
  IconSun,
  IconMedical,
  IconMegaphone,
  IconTrash,
  IconTrendDown,
  IconTrendUp,
  IconUserMinus,
  IconUserPlus,
  IconUsers,
  IconUserX,
} from "../icons";
import { AttendanceTabKey } from "./AttendanceFilters";
import {
  Employee,
  OCCURRENCE_LABEL,
  Occurrence,
  OccurrenceType,
  currentMonthKey,
  monthTotals,
  occurrencePeriodLabel,
} from "@/lib/attendance";
import { AdmissionInfo, admissionProgress, fieldsProgress } from "@/lib/admission";
import { Birthday, isBirthdayOn } from "@/lib/birthdays";
import { Provider, contractStatus } from "@/lib/providers";
import type { ExitKitView } from "@/lib/startKit";
import { MuralNoticeInfo, NOTICE_BODY_MAX, NOTICE_TITLE_MAX } from "@/lib/mural";
import { CalendarEventInfo, EVENT_TONE, EventType, eventSpans } from "@/lib/calendar";
import { campaignColor } from "@/lib/campaigns";
import { itemsBetween, upcoming } from "@/lib/calendarItems";
import { redirectIfSessionExpired } from "@/lib/sessionClient";

// ---------------------------------------------------------------- datas

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** "AAAA-MM-DD" do dia no calendário local. */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Datas sem hora vêm do servidor como meia-noite UTC: o dia é a parte "AAAA-MM-DD". */
function isoDay(value: string | null | undefined): string | null {
  return value ? value.slice(0, 10) : null;
}

/** Dias inteiros de hoje até a data (negativo = já passou). */
function daysUntil(day: string, today: string): number {
  return Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
}

function previousMonthKey(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function shortDate(day: string): string {
  return `${day.slice(8, 10)}/${day.slice(5, 7)}`;
}

// ---------------------------------------------------------------- pendências

type Tone = "critical" | "warn" | "ok" | "neutral";

export interface MuralTask {
  key: string;
  icon: (props: { className?: string }) => React.ReactNode;
  title: string;
  detail: string;
  tag: string;
  tone: Tone;
  /** Quantas coisas a pendência junta (soma no total do cabeçalho). */
  count: number;
  tab: AttendanceTabKey;
}

export interface MuralData {
  employees: Employee[];
  admissions: AdmissionInfo[] | null;
  offboardings: ExitKitView[] | null;
  providers: Provider[] | null;
  isAdmin: boolean;
  pendingAccess: number;
}

const EMPLOYEE_CONTRACT_DAYS = 30;

/** O que pede ação do RH agora, do mais urgente ao menos. */
export function muralTasks(data: MuralData, now = new Date()): MuralTask[] {
  const today = dayKey(now);
  const tasks: MuralTask[] = [];

  const open = (data.admissions ?? []).filter((a) => a.status === "em_andamento");
  const toReview = open.filter((a) => admissionProgress(a.documents).inReview > 0);
  const docs = toReview.reduce((n, a) => n + admissionProgress(a.documents).inReview, 0);
  if (docs > 0) {
    tasks.push({
      key: "onboarding-docs",
      icon: IconUserPlus,
      title: "Analisar documentos do onboarding",
      detail: `${plural(docs, "documento", "documentos")} de ${plural(toReview.length, "candidato", "candidatos")}`,
      tag: "Urgente",
      tone: "critical",
      count: docs,
      tab: "admissoes",
    });
  }
  const ready = open.filter((a) => {
    const p = admissionProgress(a.documents);
    const f = fieldsProgress(a.fields);
    return p.approved >= p.required && f.filled >= f.required && !!a.candidateName;
  });
  if (ready.length > 0) {
    tasks.push({
      key: "onboarding-ready",
      icon: IconClipboardCheck,
      title: "Concluir admissões prontas",
      detail: `${plural(ready.length, "candidato", "candidatos")} com tudo aprovado`,
      tag: "Pronto",
      tone: "ok",
      count: ready.length,
      tab: "admissoes",
    });
  }

  const exits = (data.offboardings ?? []).filter((k) => k.tasks.some((t) => !t.doneAt));
  if (exits.length > 0) {
    const openRequests = exits.reduce((n, k) => n + k.tasks.filter((t) => !t.doneAt).length, 0);
    const days = exits
      .map((k) => isoDay(k.startDate))
      .filter((d): d is string => !!d)
      .map((d) => daysUntil(d, today))
      .sort((a, b) => a - b);
    const nearest = days[0];
    const late = nearest !== undefined && nearest < 0;
    tasks.push({
      key: "offboarding",
      icon: IconUserMinus,
      title: "Concluir pedidos de offboarding",
      detail: `${plural(openRequests, "pedido em aberto", "pedidos em aberto")} de ${plural(exits.length, "desligamento", "desligamentos")}`,
      tag: late ? "Atrasado" : nearest !== undefined && nearest <= 7 ? "Esta semana" : "Em aberto",
      tone: late ? "critical" : nearest !== undefined && nearest <= 7 ? "warn" : "neutral",
      count: exits.length,
      tab: "offboarding",
    });
  }

  const providers = (data.providers ?? []).map((p) => contractStatus(p, now));
  const expired = providers.filter((s) => s.kind === "vencido").length;
  const expiring = providers.filter((s) => s.kind === "vencendo").length;
  if (expired + expiring > 0) {
    tasks.push({
      key: "providers",
      icon: IconFileWarning,
      title: "Renovar contratos de prestadores",
      detail: [expired && `${plural(expired, "vencido", "vencidos")}`, expiring && `${expiring} vencendo em até 30 dias`]
        .filter(Boolean)
        .join(" · "),
      tag: expired ? "Vencido" : "30 dias",
      tone: expired ? "critical" : "warn",
      count: expired + expiring,
      tab: "prestadores",
    });
  }

  const contracts = data.employees.filter((e) => {
    const end = isoDay(e.contractEnd);
    if (!e.active || !end) return false;
    const d = daysUntil(end, today);
    return d >= 0 && d <= EMPLOYEE_CONTRACT_DAYS;
  });
  if (contracts.length > 0) {
    tasks.push({
      key: "contracts",
      icon: IconUsers,
      title: "Renovar contratos de colaboradores",
      detail: `${plural(contracts.length, "contrato vence", "contratos vencem")} em até ${EMPLOYEE_CONTRACT_DAYS} dias`,
      tag: "30 dias",
      tone: "warn",
      count: contracts.length,
      tab: "colaboradores",
    });
  }

  if (data.isAdmin && data.pendingAccess > 0) {
    tasks.push({
      key: "access",
      icon: IconKey,
      title: "Aprovar pedidos de acesso",
      detail: plural(data.pendingAccess, "pedido aguardando", "pedidos aguardando"),
      tag: "Novo",
      tone: "neutral",
      count: data.pendingAccess,
      tab: "acessos",
    });
  }

  const order: Record<Tone, number> = { critical: 0, warn: 1, ok: 2, neutral: 3 };
  return tasks.sort((a, b) => order[a.tone] - order[b.tone]);
}

const TONE_CLASS: Record<Tone, string> = {
  critical: "bg-critical-soft text-critical",
  warn: "bg-warn-soft text-warn",
  ok: "bg-ok-soft text-ok",
  neutral: "bg-surface-2 text-muted",
};

// ---------------------------------------------------------------- agenda

interface AgendaEvent {
  key: string;
  day: string;
  icon: (props: { className?: string }) => React.ReactNode;
  title: string;
  detail: string;
  tab: AttendanceTabKey;
  employeeId?: string;
  /** Cor do ícone (eventos do calendário). */
  tone?: string;
}

const EVENT_ICON: Record<EventType, (props: { className?: string }) => React.ReactNode> = {
  feriado: IconFlag,
  recesso: IconSun,
  comemoracao: IconParty,
  campanha: IconRibbon,
  treinamento: IconSchool,
};

const AGENDA_DAYS = 7;

function agendaEvents(
  data: MuralData & { birthdays: Birthday[]; events: CalendarEventInfo[] | null },
  now: Date
): { days: { key: string; date: Date }[]; events: AgendaEvent[] } {
  const days = Array.from({ length: AGENDA_DAYS }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    return { key: dayKey(date), date };
  });
  const inRange = new Set(days.map((d) => d.key));
  const events: AgendaEvent[] = [];
  const byId = new Map(data.employees.map((e) => [e.id, e]));
  const who = (e: Employee) => [e.department, e.role].filter(Boolean).join(" · ");

  for (const b of data.birthdays) {
    const e = byId.get(b.employeeId);
    if (!e?.active) continue;
    const day = days.find((d) => isBirthdayOn(b, d.date));
    if (day) {
      events.push({
        key: `aniv-${e.id}`,
        day: day.key,
        icon: IconCake,
        title: `Aniversário · ${e.name}`,
        detail: who(e) || "Colaborador",
        tab: "aniversariantes",
        employeeId: e.id,
      });
    }
  }
  for (const e of data.employees) {
    const start = isoDay(e.startDate);
    if (e.active && start && inRange.has(start)) {
      events.push({
        key: `inicio-${e.id}`,
        day: start,
        icon: IconDoorEnter,
        title: `Primeiro dia · ${e.name}`,
        detail: who(e) || "Colaborador",
        tab: "colaboradores",
        employeeId: e.id,
      });
    }
    const end = isoDay(e.contractEnd);
    if (e.active && end && inRange.has(end)) {
      events.push({
        key: `contrato-${e.id}`,
        day: end,
        icon: IconFileWarning,
        title: `Fim de contrato · ${e.name}`,
        detail: [e.contractType, e.department].filter(Boolean).join(" · ") || "Colaborador",
        tab: "colaboradores",
        employeeId: e.id,
      });
    }
  }
  const startedIds = new Set(events.filter((ev) => ev.key.startsWith("inicio-")).map((ev) => ev.employeeId));
  for (const a of data.admissions ?? []) {
    const start = isoDay(a.startDate);
    if (a.status !== "em_andamento" || !start || !inRange.has(start)) continue;
    if (a.employeeId && startedIds.has(a.employeeId)) continue;
    events.push({
      key: `admissao-${a.id}`,
      day: start,
      icon: IconDoorEnter,
      title: `Primeiro dia · ${a.candidateName ?? "candidato em admissão"}`,
      detail: [a.department, a.role].filter(Boolean).join(" · ") || "Onboarding em andamento",
      tab: "admissoes",
    });
  }
  for (const k of data.offboardings ?? []) {
    const last = isoDay(k.startDate);
    if (!last || !inRange.has(last)) continue;
    const pending = k.tasks.filter((t) => !t.doneAt).length;
    events.push({
      key: `saida-${k.id}`,
      day: last,
      icon: IconDoorExit,
      title: `Último dia · ${k.employee.name}`,
      detail: pending > 0 ? plural(pending, "pedido em aberto", "pedidos em aberto") : "Pedidos concluídos",
      tab: "offboarding",
    });
  }
  for (const p of data.providers ?? []) {
    const end = isoDay(p.contractEnd);
    if (!p.active || !end || !inRange.has(end)) continue;
    events.push({
      key: `prestador-${p.id}`,
      day: end,
      icon: IconFileWarning,
      title: `Fim de contrato · ${p.name}`,
      detail: ["Prestador", p.department].filter(Boolean).join(" · "),
      tab: "prestadores",
    });
  }
  // Calendário: feriados, eventos do RH (um evento de vários dias aparece uma vez) e tempo de casa.
  const seen = new Set<string>();
  for (const it of itemsBetween(days[0].key, days[days.length - 1].key, {
    events: data.events ?? [],
    employees: data.employees,
    birthdays: [],
  })) {
    if (it.kind !== "tempo_casa" && it.tone === "pessoas") continue;
    // Campanha que já começou fica na faixa "Campanha do mês", não na agenda.
    if (it.kind === "campanha" && it.span && it.span.start < days[0].key) continue;
    if (it.eventId) {
      if (seen.has(it.eventId)) continue;
      seen.add(it.eventId);
    }
    const isEvent = it.tone !== "pessoas";
    events.push({
      key: it.key,
      day: it.day,
      icon: isEvent ? EVENT_ICON[it.tone as EventType] : IconParty,
      title: it.title,
      detail: [it.time, it.detail].filter(Boolean).join(" · "),
      tab: isEvent ? "calendario" : "colaboradores",
      employeeId: it.employeeId,
      tone: isEvent ? EVENT_TONE[it.tone] : undefined,
    });
  }
  events.sort((a, b) => a.day.localeCompare(b.day) || a.title.localeCompare(b.title, "pt-BR"));
  return { days, events };
}

// ---------------------------------------------------------------- painel

const OCCURRENCE_TONE: Record<OccurrenceType, string> = {
  falta: "bg-critical-soft text-critical",
  atestado: "bg-accent-soft text-accent-strong",
  folga: "bg-surface-2 text-muted",
  horas: "bg-warn-soft text-warn",
};

interface MuralPanelProps extends MuralData {
  loading: boolean;
  /** Eventos do calendário do RH (null enquanto carrega). */
  events: CalendarEventInfo[] | null;
  occurrences: Occurrence[];
  birthdays: Birthday[];
  /** Muda a cada clique em "Publicar recado" no cabeçalho. */
  publishSignal: number;
  onNavigate: (tab: AttendanceTabKey) => void;
  onOpenEmployee: (employeeId: string, tab: AttendanceTabKey) => void;
}

// overflow-hidden: o fundo das linhas (hover) não passa dos cantos arredondados.
const cardClass = "overflow-hidden rounded-[14px] neon-cinza border bg-surface";

export function MuralPanel(props: MuralPanelProps) {
  const { loading, employees, occurrences, admissions, onNavigate, onOpenEmployee } = props;
  const [now] = useState(() => new Date());
  const today = dayKey(now);

  const tasks = useMemo(() => muralTasks(props, now), [props, now]);
  const agenda = useMemo(() => agendaEvents(props, now), [props, now]);
  const next = useMemo(() => upcoming(today, props.events ?? []), [today, props.events]);
  // Campanhas em andamento hoje (Outubro Rosa, Novembro Azul…).
  const campaigns = useMemo(
    () =>
      (props.events ?? []).flatMap((e) =>
        e.type === "campanha" ? eventSpans(e, today, today).map((span) => ({ event: e, span })) : []
      ),
    [props.events, today]
  );

  // Indicadores do mês, comparados com o mês anterior.
  const stats = useMemo(() => {
    const month = currentMonthKey();
    const prev = previousMonthKey(month);
    const cur = monthTotals(occurrences, month);
    const last = monthTotals(occurrences, prev);
    const active = employees.filter((e) => e.active);
    // Entrou este mês: começou neste mês até hoje (quem ainda vai começar aparece na agenda).
    const joined = active.filter((e) => {
      const s = isoDay(e.startDate);
      return !!s && s.slice(0, 7) === month && s <= today;
    }).length;
    const open = (admissions ?? []).filter((a) => a.status === "em_andamento");
    const startingSoon = open.filter((a) => {
      const s = isoDay(a.startDate);
      return !!s && daysUntil(s, today) >= 0 && daysUntil(s, today) < AGENDA_DAYS;
    }).length;
    return { cur, last, active: active.length, joined, open: open.length, startingSoon };
  }, [occurrences, employees, admissions, today]);

  const recent = useMemo(
    () => [...occurrences].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 5),
    [occurrences]
  );

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Indicadores do mês" className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        <StatCard
          loading={loading}
          label="Colaboradores ativos"
          icon={IconUsers}
          value={stats.active}
          detail={stats.joined > 0 ? `${plural(stats.joined, "entrou", "entraram")} este mês` : "nenhuma entrada este mês"}
          tone={stats.joined > 0 ? "ok" : "neutral"}
          trend={stats.joined > 0 ? "up" : undefined}
        />
        <StatCard loading={loading} label="Faltas no mês" icon={IconUserX} {...compare(stats.cur.faltas, stats.last.faltas)} />
        <StatCard loading={loading} label="Atestados no mês" icon={IconMedical} {...compare(stats.cur.atestados, stats.last.atestados)} />
        <StatCard
          loading={loading}
          label="Onboardings"
          icon={IconUserPlus}
          value={stats.open}
          detail={
            stats.startingSoon > 0
              ? `${plural(stats.startingSoon, "começa", "começam")} nos próximos 7 dias`
              : "em andamento"
          }
          tone="neutral"
        />
      </section>

      {campaigns.length > 0 && (
        <CampaignBanner campaigns={campaigns} today={today} onOpen={() => onNavigate("calendario")} />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={cardClass}>
          <CardHeader
            icon={IconClipboardCheck}
            title="Precisa de você"
            aside={
              tasks.length > 0 ? (
                <span className="rounded-full bg-critical-soft px-2.5 py-0.5 font-mono text-xs font-bold tabular-nums text-critical">
                  {tasks.reduce((n, t) => n + t.count, 0)}
                </span>
              ) : null
            }
          />
          {loading && tasks.length === 0 ? (
            <ListSkeleton />
          ) : tasks.length === 0 ? (
            <EmptyState
              icon={<IconCheckCircle className="h-6 w-6" />}
              title="Tudo em dia"
              text="Nenhum documento para analisar, pedido em aberto ou contrato vencendo."
            />
          ) : (
            <ul className="flex flex-col">
              {tasks.map((t) => (
                <li key={t.key} className="border-t border-border first:border-t-0">
                  <button
                    type="button"
                    onClick={() => onNavigate(t.tab)}
                    className="group flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-2"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-surface-2 text-muted group-hover:bg-surface">
                      <t.icon className="h-[18px] w-[18px]" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-semibold text-ink">{t.title}</span>
                      <span className="truncate text-xs text-muted">{t.detail}</span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${TONE_CLASS[t.tone]}`}>{t.tag}</span>
                    <IconChevronRight className="h-4 w-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-ink" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={cardClass}>
          <CardHeader
            icon={IconCalendar}
            title="Agenda da semana"
            aside={
              <button
                type="button"
                onClick={() => onNavigate("calendario")}
                className="flex items-center gap-1 rounded-[8px] px-2 py-1 text-xs font-semibold text-muted transition hover:bg-surface-2 hover:text-ink"
              >
                Ver mês
                <IconChevronRight className="h-3.5 w-3.5" />
              </button>
            }
          />
          {(next.holiday || next.recess) && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-border bg-surface-2/40 px-4 py-2 text-xs text-muted">
              {next.holiday && (
                <span className="flex items-center gap-1.5">
                  <IconHourglass className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    <b className="font-semibold text-ink">{next.holiday.title}</b>{" "}
                    {next.holiday.days === 0 ? "é hoje" : next.holiday.days === 1 ? "é amanhã" : `em ${next.holiday.days} dias`}
                  </span>
                </span>
              )}
              {next.recess && (
                <span className="flex items-center gap-1.5">
                  <IconSun className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    <b className="font-semibold text-ink">{next.recess.title}</b>{" "}
                    {next.recess.ongoing
                      ? `até ${shortDate(next.recess.end)}`
                      : next.recess.days === 0
                        ? "começa hoje"
                        : next.recess.days === 1
                          ? "começa amanhã"
                          : `em ${next.recess.days} dias`}
                  </span>
                </span>
              )}
            </div>
          )}
          {loading && agenda.events.length === 0 ? (
            <ListSkeleton />
          ) : agenda.events.length === 0 ? (
            <EmptyState
              icon={<IconCalendar className="h-6 w-6" />}
              title="Semana tranquila"
              text="Nenhum feriado, evento, aniversário, entrada ou saída nos próximos 7 dias."
            />
          ) : (
            <ul className="flex flex-col">
              {agenda.events.map((ev, i) => {
                const date = agenda.days.find((d) => d.key === ev.day)!.date;
                const firstOfDay = i === 0 || agenda.events[i - 1].day !== ev.day;
                return (
                  <li key={ev.key} className="border-t border-border first:border-t-0">
                    <button
                      type="button"
                      onClick={() => (ev.employeeId ? onOpenEmployee(ev.employeeId, ev.tab) : onNavigate(ev.tab))}
                      className="group flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-surface-2"
                    >
                      <span className={`flex w-10 shrink-0 flex-col items-center leading-tight ${firstOfDay ? "" : "invisible"}`}>
                        <span className={`text-[11px] font-semibold ${ev.day === today ? "text-ink" : "text-muted"}`}>
                          {ev.day === today ? "hoje" : WEEKDAYS[date.getDay()]}
                        </span>
                        <span className="font-display text-lg font-bold tabular-nums text-ink">{date.getDate()}</span>
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-semibold text-ink">{ev.title}</span>
                        <span className="truncate text-xs text-muted">{ev.detail}</span>
                      </span>
                      {ev.tone ? (
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] ${ev.tone}`}>
                          <ev.icon className="h-4 w-4" />
                        </span>
                      ) : (
                        <ev.icon className="h-[18px] w-[18px] shrink-0 text-muted group-hover:text-ink" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <NoticesCard publishSignal={props.publishSignal} today={today} />

        <section className={cardClass}>
          <CardHeader
            icon={IconCalendarX}
            title="Últimas ocorrências"
            aside={
              <button
                type="button"
                onClick={() => onNavigate("ocorrencias")}
                className="flex items-center gap-1 rounded-[8px] px-2 py-1 text-xs font-semibold text-muted transition hover:bg-surface-2 hover:text-ink"
              >
                Ver todas
                <IconChevronRight className="h-3.5 w-3.5" />
              </button>
            }
          />
          {loading && recent.length === 0 ? (
            <ListSkeleton />
          ) : recent.length === 0 ? (
            <EmptyState
              icon={<IconCalendarX className="h-6 w-6" />}
              title="Nenhuma ocorrência registrada"
              text="Faltas, atestados, folgas e comprovantes de horas aparecem aqui assim que forem lançados."
            />
          ) : (
            <ul className="flex flex-col">
              {recent.map((o) => (
                <li key={o.id} className="border-t border-border first:border-t-0">
                  <button
                    type="button"
                    onClick={() => (o.employeeId ? onOpenEmployee(o.employeeId, "colaboradores") : onNavigate("ocorrencias"))}
                    className="group flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-surface-2"
                  >
                    <span className={`w-[76px] shrink-0 rounded-full px-2 py-0.5 text-center text-[11px] font-bold ${OCCURRENCE_TONE[o.type]}`}>
                      {OCCURRENCE_LABEL[o.type]}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-semibold text-ink">{o.employeeName}</span>
                      <span className="truncate text-xs text-muted">
                        {[o.employeeDepartment, occurrencePeriodLabel(o)].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted">
                      {isoDay(o.date) === today ? "hoje" : shortDate(isoDay(o.date)!)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/** Indicador que é melhor quando cai (faltas, atestados). */
/** Faixa da campanha do mês: a principal em destaque, as outras ao lado. */
function CampaignBanner({
  campaigns,
  today,
  onOpen,
}: {
  campaigns: { event: CalendarEventInfo; span: { start: string; end: string } }[];
  today: string;
  onOpen: () => void;
}) {
  const [{ event, span }, ...others] = campaigns;
  const accent = campaignColor(event.title) ?? "var(--cal-campanha)";
  const left = daysUntil(span.end, today);
  return (
    <section
      aria-label="Campanha do mês"
      className="relative overflow-hidden rounded-[14px] neon-cinza border bg-surface"
      style={{ backgroundImage: `linear-gradient(100deg, color-mix(in srgb, ${accent} 16%, transparent), transparent 55%)` }}
    >
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5" style={{ background: accent }} />
      <div className="flex flex-wrap items-center gap-4 py-4 pl-6 pr-4 sm:pr-5">
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px]"
          style={{ background: `color-mix(in srgb, ${accent} 20%, transparent)`, color: accent }}
        >
          <IconRibbon className="h-6 w-6" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
            Campanha do mês · {left === 0 ? "termina hoje" : `até ${shortDate(span.end)}`}
          </span>
          <span className="font-display text-[19px] font-semibold leading-tight text-ink">{event.title}</span>
          {event.notes && <span className="line-clamp-2 text-sm text-muted">{event.notes}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {others.map((o) => (
            <span
              key={o.event.id}
              className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-ink"
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full"
                style={{ background: campaignColor(o.event.title) ?? "var(--cal-campanha)" }}
              />
              {o.event.title}
            </span>
          ))}
          <button
            type="button"
            onClick={onOpen}
            className="flex items-center gap-1 rounded-[10px] px-3 py-2 text-xs font-semibold text-muted transition hover:bg-surface-2 hover:text-ink"
          >
            Ver no calendário
            <IconChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </section>
  );
}

function compare(current: number, previous: number) {
  const diff = current - previous;
  return {
    value: current,
    detail:
      diff === 0
        ? "igual ao mês passado"
        : `${Math.abs(diff)} a ${diff > 0 ? "mais" : "menos"} que o mês passado`,
    tone: (diff === 0 ? "neutral" : diff > 0 ? "warn" : "ok") as Tone,
    trend: (diff === 0 ? undefined : diff > 0 ? "up" : "down") as "up" | "down" | undefined,
  };
}

function StatCard({
  label,
  icon: Icon,
  value,
  detail,
  tone,
  trend,
  loading = false,
}: {
  label: string;
  icon: (props: { className?: string }) => React.ReactNode;
  /** Carregando: mostra um traço no lugar dos números (nada de "0" piscando). */
  loading?: boolean;
  value: number;
  detail: string;
  tone: Tone;
  trend?: "up" | "down";
}) {
  const color = tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : tone === "critical" ? "text-critical" : "text-muted";
  return (
    <div className={`flex flex-col gap-2.5 p-4 ${cardClass}`}>
      <span className="flex items-center justify-between gap-2 text-[12.5px] font-semibold text-muted">
        {label}
        <Icon className="h-4 w-4 shrink-0 text-muted" />
      </span>
      {loading ? (
        <>
          <span className="rh-skeleton block h-[30px] w-14 rounded-[8px]" />
          <span className="rh-skeleton block h-3 w-32 rounded-full" />
        </>
      ) : (
        <>
          <span className="font-display text-[30px] font-bold leading-none tabular-nums text-ink">{value}</span>
          <span className={`flex items-center gap-1 truncate text-xs ${color}`} title={detail}>
            {trend === "up" && <IconTrendUp className="h-3.5 w-3.5 shrink-0" />}
            {trend === "down" && <IconTrendDown className="h-3.5 w-3.5 shrink-0" />}
            {detail}
          </span>
        </>
      )}
    </div>
  );
}

function CardHeader({
  icon: Icon,
  title,
  aside,
}: {
  icon: (props: { className?: string }) => React.ReactNode;
  title: string;
  aside?: React.ReactNode;
}) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-surface-2 text-ink">
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <h2 className="font-display text-[16px] font-semibold text-ink">{title}</h2>
      </div>
      {aside}
    </header>
  );
}

function ListSkeleton() {
  return (
    <div role="status" aria-label="Carregando" className="flex flex-col">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3 border-t border-border px-4 py-3.5 first:border-t-0">
          <span className="rh-skeleton h-9 w-9 shrink-0 rounded-[10px]" />
          <span className="flex flex-1 flex-col gap-2">
            <span className="rh-skeleton h-3 rounded-full" style={{ width: `${60 - i * 12}%` }} />
            <span className="rh-skeleton h-2.5 rounded-full" style={{ width: `${36 - i * 6}%` }} />
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- recados

function NoticesCard({ publishSignal, today }: { publishSignal: number; today: string }) {
  const [notices, setNotices] = useState<MuralNoticeInfo[] | null>(null);
  const [composing, setComposing] = useState(false);
  const [removing, setRemoving] = useState<MuralNoticeInfo | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/frequencia/recados");
    if (redirectIfSessionExpired(res, "/frequencia/entrar", "/frequencia") || !res.ok) return;
    setNotices(await res.json());
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (publishSignal > 0) setComposing(true);
  }, [publishSignal]);

  async function remove(n: MuralNoticeInfo) {
    setError("");
    const res = await fetch(`/api/frequencia/recados/${n.id}`, { method: "DELETE" });
    if (redirectIfSessionExpired(res, "/frequencia/entrar", "/frequencia")) return;
    if (!res.ok && res.status !== 404) {
      setError("Não foi possível tirar o recado. Tente de novo.");
      return;
    }
    setRemoving(null);
    setNotices((list) => (list ?? []).filter((x) => x.id !== n.id));
  }

  return (
    <section className={cardClass}>
      <CardHeader
        icon={IconMegaphone}
        title="Recados do RH"
        aside={
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="flex items-center gap-1 rounded-[8px] px-2 py-1 text-xs font-semibold text-muted transition hover:bg-surface-2 hover:text-ink"
          >
            Publicar recado
          </button>
        }
      />
      {error && <p className="border-b border-border px-4 py-2 text-xs text-critical">{error}</p>}
      {notices === null ? (
        <ListSkeleton />
      ) : notices.length === 0 ? (
        <EmptyState
          icon={<IconMegaphone className="h-6 w-6" />}
          title="Nenhum recado no mural"
          text="Avise a equipe de RH sobre prazos e eventos: o recado fica aqui até a data que você escolher."
        />
      ) : (
        <ul className="flex flex-col">
          {notices.map((n) => (
            <li key={n.id} className="group flex items-start gap-3 border-t border-border px-4 py-3 first:border-t-0">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-surface-2 text-muted">
                <IconMegaphone className="h-4 w-4" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm font-semibold text-ink">{n.title}</span>
                {n.body && <span className="whitespace-pre-line text-[13px] text-muted">{n.body}</span>}
                <span className="text-[11.5px] text-muted">
                  {[
                    n.createdBy ? `Por ${n.createdBy}` : null,
                    n.until ? (n.until === today ? "último dia hoje" : `até ${shortDate(n.until)}`) : "sem data para sair",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              {removing?.id === n.id ? (
                <span className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void remove(n)}
                    className="rounded-[8px] bg-critical-soft px-2 py-1 text-xs font-semibold text-critical transition hover:brightness-110"
                  >
                    Tirar
                  </button>
                  <button
                    type="button"
                    onClick={() => setRemoving(null)}
                    className="rounded-[8px] px-2 py-1 text-xs font-semibold text-muted transition hover:bg-surface-2 hover:text-ink"
                  >
                    Manter
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setRemoving(n)}
                  aria-label={`Tirar o recado ${n.title}`}
                  title="Tirar do mural"
                  className="shrink-0 rounded-[8px] p-1.5 text-muted opacity-60 transition hover:bg-surface-2 hover:text-critical group-hover:opacity-100"
                >
                  <IconTrash className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <NoticeModal
        open={composing}
        today={today}
        onClose={() => setComposing(false)}
        onCreated={(n) => {
          setComposing(false);
          setNotices((list) => [n, ...(list ?? [])]);
        }}
      />
    </section>
  );
}

function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

function NoticeModal({
  open,
  today,
  onClose,
  onCreated,
}: {
  open: boolean;
  today: string;
  onClose: () => void;
  onCreated: (n: MuralNoticeInfo) => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [until, setUntil] = useState(() => addDays(today, 7));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setBody("");
    setUntil(addDays(today, 7));
    setError("");
  }, [open, today]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Escreva o título do recado.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/frequencia/recados", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, until }),
      });
      if (redirectIfSessionExpired(res, "/frequencia/entrar", "/frequencia")) return;
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Não foi possível publicar. Tente de novo.");
        return;
      }
      onCreated(data);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Publicar recado"
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="mural-recado" disabled={saving}>
            {saving ? "Publicando…" : "Publicar"}
          </Button>
        </>
      }
    >
      <form id="mural-recado" onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Título" error={error && !title.trim() ? error : undefined}>
          <input
            autoFocus
            value={title}
            maxLength={NOTICE_TITLE_MAX}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Fechamento da folha"
            className={inputClass(!!error && !title.trim())}
          />
        </Field>
        <Field label="Texto (opcional)" hint={`${body.length}/${NOTICE_BODY_MAX}`}>
          <textarea
            value={body}
            maxLength={NOTICE_BODY_MAX}
            rows={3}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Lancem faltas e atestados do mês até dia 25."
            className={inputClass(false)}
          />
        </Field>
        <Field label="Fica no mural até" hint="No dia seguinte o recado sai sozinho.">
          <input
            type="date"
            value={until}
            min={today}
            onChange={(e) => setUntil(e.target.value)}
            className={inputClass(false)}
          />
        </Field>
        {error && title.trim() && <p className="text-xs text-critical">{error}</p>}
      </form>
    </Modal>
  );
}
