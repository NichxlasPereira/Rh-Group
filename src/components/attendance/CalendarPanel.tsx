"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "../Modal";
import { Button } from "../Button";
import { EmptyState, Field, inputClass } from "./formControls";
import {
  IconCake,
  IconCalendar,
  IconChevronLeft,
  IconChevronRight,
  IconDoorEnter,
  IconDoorExit,
  IconEdit,
  IconFileWarning,
  IconFlag,
  IconHourglass,
  IconParty,
  IconPlus,
  IconRibbon,
  IconSchool,
  IconSun,
  IconTrash,
} from "../icons";
import { Employee } from "@/lib/attendance";
import { Birthday, MONTH_NAMES } from "@/lib/birthdays";
import {
  CalendarEventInfo,
  EVENT_LABEL,
  EVENT_NOTES_MAX,
  EVENT_SHORT,
  EVENT_TIME_MAX,
  EVENT_TITLE_MAX,
  EVENT_TONE,
  EVENT_TYPES,
  EventType,
  addDays,
  localDay,
  ymd,
} from "@/lib/calendar";
import { CalendarItem, ItemKind, itemsBetween, upcoming } from "@/lib/calendarItems";
import { redirectIfSessionExpired } from "@/lib/sessionClient";
import type { ExitKitView } from "@/lib/startKit";

type Icon = (props: { className?: string }) => React.ReactNode;

const KIND_ICON: Record<ItemKind, Icon> = {
  feriado: IconFlag,
  recesso: IconSun,
  comemoracao: IconParty,
  campanha: IconRibbon,
  treinamento: IconSchool,
  aniversario: IconCake,
  tempo_casa: IconParty,
  entrada: IconDoorEnter,
  saida: IconDoorExit,
  contrato: IconFileWarning,
};

type Filter = EventType | "pessoas";
const FILTERS: Filter[] = [...EVENT_TYPES, "pessoas"];
const FILTER_LABEL: Record<Filter, string> = { ...EVENT_SHORT, pessoas: "Pessoas" };
const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MAX_CHIPS = 3;

const cardClass = "overflow-hidden rounded-[14px] neon-cinza border bg-surface";

function shortDate(day: string): string {
  return `${day.slice(8, 10)}/${day.slice(5, 7)}`;
}

function longDate(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const s = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(y, m - 1, d));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Texto curto do dia na grade: nas datas das pessoas, só o primeiro nome. */
function chipLabel(it: CalendarItem): string {
  if (it.tone !== "pessoas") return it.title;
  const [what, name] = it.title.split(" · ");
  return name ? `${what} · ${name.split(" ")[0]}` : it.title;
}

interface CalendarPanelProps {
  events: CalendarEventInfo[] | null;
  employees: Employee[];
  birthdays: Birthday[];
  offboardings: ExitKitView[] | null;
  departments: string[];
  /** Muda a cada clique em "Novo evento" no cabeçalho. */
  createSignal: number;
  onChanged: () => void;
  onOpenEmployee: (employeeId: string) => void;
}

export function CalendarPanel({
  events,
  employees,
  birthdays,
  offboardings,
  departments,
  createSignal,
  onChanged,
  onOpenEmployee,
}: CalendarPanelProps) {
  const [today] = useState(() => localDay(new Date()));
  const [month, setMonth] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) }));
  const [selected, setSelected] = useState(today);
  const [department, setDepartment] = useState("");
  const [hidden, setHidden] = useState<Set<Filter>>(new Set());
  const [editing, setEditing] = useState<CalendarEventInfo | { new: true; day: string } | null>(null);
  const [removing, setRemoving] = useState<CalendarEventInfo | null>(null);

  useEffect(() => {
    if (createSignal > 0) setEditing({ new: true, day: selected });
    // Só reage ao clique no botão do cabeçalho.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createSignal]);

  // Grade do mês: de domingo antes do dia 1 até o sábado depois do último dia.
  const grid = useMemo(() => {
    const first = new Date(month.y, month.m - 1, 1);
    const start = addDays(ymd(month.y, month.m, 1), -first.getDay());
    const last = new Date(month.y, month.m, 0);
    const end = addDays(ymd(month.y, month.m, last.getDate()), 6 - last.getDay());
    const days: string[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
    return { start, end, days };
  }, [month]);

  const items = useMemo(() => {
    const list = itemsBetween(grid.start, grid.end, {
      events: events ?? [],
      employees,
      birthdays,
      exits: (offboardings ?? []).map((k) => ({ id: k.id, startDate: k.startDate, employee: k.employee })),
      department,
    }).filter((it) => !hidden.has(it.tone));
    const order: Record<string, number> = { feriado: 0, recesso: 1, comemoracao: 2, treinamento: 3, campanha: 4, pessoas: 5 };
    return list.sort((a, b) => order[a.tone] - order[b.tone] || a.title.localeCompare(b.title, "pt-BR"));
  }, [grid, events, employees, birthdays, offboardings, department, hidden]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    // Campanhas ficam na faixa de cima, não em cada dia da grade.
    for (const it of items) if (it.kind !== "campanha") map.set(it.day, [...(map.get(it.day) ?? []), it]);
    return map;
  }, [items]);

  const monthStart = ymd(month.y, month.m, 1);
  const monthEnd = ymd(month.y, month.m, new Date(month.y, month.m, 0).getDate());
  const campaigns = useMemo(() => {
    const seen = new Map<string, CalendarItem>();
    for (const it of items) {
      if (it.kind === "campanha" && it.eventId && it.day >= monthStart && it.day <= monthEnd && !seen.has(it.eventId)) {
        seen.set(it.eventId, it);
      }
    }
    return [...seen.values()];
  }, [items, monthStart, monthEnd]);

  const next = useMemo(() => upcoming(today, events ?? []), [today, events]);
  const dayItems = useMemo(() => items.filter((it) => it.day === selected), [items, selected]);
  const eventById = useMemo(() => new Map((events ?? []).map((e) => [e.id, e])), [events]);

  function goMonth(delta: number) {
    const d = new Date(month.y, month.m - 1 + delta, 1);
    setMonth({ y: d.getFullYear(), m: d.getMonth() + 1 });
    setSelected(ymd(d.getFullYear(), d.getMonth() + 1, 1));
  }

  function goToday() {
    setMonth({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) });
    setSelected(today);
  }

  function toggle(f: Filter) {
    setHidden((h) => {
      const next = new Set(h);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });
  }

  async function remove(e: CalendarEventInfo) {
    const res = await fetch(`/api/frequencia/calendario/${e.id}`, { method: "DELETE" });
    if (redirectIfSessionExpired(res, "/frequencia/entrar", "/frequencia")) return;
    setRemoving(null);
    onChanged();
  }

  const openItem = (it: CalendarItem) => {
    if (it.eventId && eventById.get(it.eventId)) setEditing(eventById.get(it.eventId)!);
    else if (it.employeeId) onOpenEmployee(it.employeeId);
    else setSelected(it.day);
  };

  return (
    <div className="flex flex-col gap-4">
      {(next.holiday || next.recess || campaigns.length > 0) && (
        <div className="grid gap-3 md:grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
          {campaigns.map((c) => (
            <button
              key={c.eventId}
              type="button"
              onClick={() => openItem(c)}
              className={`flex items-center gap-3 rounded-[14px] px-4 py-3 text-left transition hover:brightness-105 ${EVENT_TONE.campanha}`}
            >
              <IconRibbon className="h-5 w-5 shrink-0" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-bold">{c.title}</span>
                <span className="truncate text-xs opacity-80">
                  Campanha · {c.span ? `${shortDate(c.span.start)} a ${shortDate(c.span.end)}` : shortDate(c.day)}
                </span>
              </span>
            </button>
          ))}
          {next.holiday && (
            <div className={`flex items-center gap-3 px-4 py-3 ${cardClass}`}>
              <IconHourglass className="h-5 w-5 shrink-0 text-muted" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-bold text-ink">
                  {next.holiday.title}{" "}
                  {next.holiday.days === 0 ? "é hoje" : next.holiday.days === 1 ? "é amanhã" : `em ${next.holiday.days} dias`}
                </span>
                <span className="truncate text-xs text-muted">Próximo feriado · {longDate(next.holiday.day)}</span>
              </span>
            </div>
          )}
          {next.recess && (
            <div className={`flex items-center gap-3 px-4 py-3 ${cardClass}`}>
              <IconSun className="h-5 w-5 shrink-0 text-warn" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-bold text-ink">
                  {next.recess.title}{" "}
                  {next.recess.ongoing
                    ? `até ${shortDate(next.recess.end)}`
                    : next.recess.days === 0
                      ? "começa hoje"
                      : next.recess.days === 1
                        ? "começa amanhã"
                        : `em ${next.recess.days} dias`}
                </span>
                <span className="truncate text-xs text-muted">Próximo recesso ou ponto facultativo</span>
              </span>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className={cardClass}>
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center rounded-[10px] border border-border bg-surface-2 p-0.5">
                <button
                  type="button"
                  aria-label="Mês anterior"
                  onClick={() => goMonth(-1)}
                  className="flex h-8 w-8 items-center justify-center rounded-[8px] text-muted transition hover:bg-surface hover:text-ink"
                >
                  <IconChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Próximo mês"
                  onClick={() => goMonth(1)}
                  className="flex h-8 w-8 items-center justify-center rounded-[8px] text-muted transition hover:bg-surface hover:text-ink"
                >
                  <IconChevronRight className="h-4 w-4" />
                </button>
              </div>
              <h2 className="font-display text-[17px] font-semibold capitalize text-ink">
                {MONTH_NAMES[month.m - 1]} {month.y}
              </h2>
              {(month.y !== Number(today.slice(0, 4)) || month.m !== Number(today.slice(5, 7))) && (
                <button
                  type="button"
                  onClick={goToday}
                  className="h-8 rounded-[8px] px-2.5 text-xs font-semibold text-muted transition hover:bg-surface-2 hover:text-ink"
                >
                  Hoje
                </button>
              )}
            </div>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              aria-label="Empresa"
              className="h-9 rounded-[10px] border border-border bg-surface-2 px-3 text-[13px] text-ink focus:border-accent focus:outline-none"
            >
              <option value="">Todas as empresas</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </header>

          <div className="flex flex-wrap gap-1.5 border-b border-border px-4 py-2.5">
            {FILTERS.map((f) => {
              const on = !hidden.has(f);
              return (
                <button
                  key={f}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(f)}
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                    on ? EVENT_TONE[f] : "bg-transparent text-muted line-through opacity-60 hover:opacity-100"
                  }`}
                >
                  {FILTER_LABEL[f]}
                </button>
              );
            })}
          </div>

          <div className="p-2 sm:p-3">
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS.map((w) => (
                <span key={w} className="pb-1 text-center text-[11px] font-semibold text-muted">
                  {w}
                </span>
              ))}
              {grid.days.map((day) => {
                const list = byDay.get(day) ?? [];
                const outside = day < monthStart || day > monthEnd;
                const isToday = day === today;
                const isSelected = day === selected;
                const weekend = [0, 6].includes(new Date(`${day}T12:00:00`).getDay());
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setSelected(day)}
                    onDoubleClick={() => setEditing({ new: true, day })}
                    aria-label={`${longDate(day)}${list.length ? `, ${list.length} ${list.length === 1 ? "item" : "itens"}` : ""}`}
                    aria-pressed={isSelected}
                    className={`flex min-h-[64px] flex-col gap-1 rounded-[9px] border p-1.5 text-left transition sm:min-h-[92px] ${
                      isSelected ? "border-ink bg-surface-2" : "border-border hover:border-border-strong hover:bg-surface-2/60"
                    } ${outside ? "opacity-45" : ""} ${weekend && !isSelected ? "bg-surface-2/30" : ""}`}
                  >
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold tabular-nums ${
                        isToday ? "bg-ink text-bg" : "text-ink"
                      }`}
                    >
                      {Number(day.slice(8))}
                    </span>
                    <span className="hidden flex-col gap-0.5 sm:flex">
                      {list.slice(0, MAX_CHIPS).map((it) => (
                        <span key={it.key} className={`truncate rounded-[5px] px-1.5 py-px text-[10.5px] font-semibold ${EVENT_TONE[it.tone]}`}>
                          {chipLabel(it)}
                        </span>
                      ))}
                      {list.length > MAX_CHIPS && (
                        <span className="px-1 text-[10.5px] font-semibold text-muted">+{list.length - MAX_CHIPS}</span>
                      )}
                    </span>
                    {/* Celular: só pontinhos coloridos. */}
                    <span className="flex flex-wrap gap-0.5 sm:hidden">
                      {list.slice(0, 4).map((it) => (
                        <span key={it.key} className={`h-1.5 w-1.5 rounded-full ${EVENT_TONE[it.tone].split(" ")[0]}`} />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className={cardClass}>
          <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-surface-2 text-ink">
                <IconCalendar className="h-[18px] w-[18px]" />
              </span>
              <h2 className="truncate font-display text-[15px] font-semibold text-ink">{longDate(selected)}</h2>
            </div>
            <button
              type="button"
              onClick={() => setEditing({ new: true, day: selected })}
              aria-label="Novo evento neste dia"
              title="Novo evento neste dia"
              className="rounded-[8px] p-1.5 text-muted transition hover:bg-surface-2 hover:text-ink"
            >
              <IconPlus className="h-4 w-4" />
            </button>
          </header>
          {dayItems.length === 0 ? (
            <EmptyState
              icon={<IconCalendar className="h-6 w-6" />}
              title="Nada neste dia"
              text="Clique em + para marcar um feriado, recesso, comemoração, campanha ou treinamento."
            />
          ) : (
            <ul className="flex flex-col">
              {dayItems.map((it) => {
                const Ic = KIND_ICON[it.kind];
                const ev = it.eventId ? eventById.get(it.eventId) : undefined;
                return (
                  <li key={it.key} className="group flex items-start gap-3 border-t border-border px-4 py-3 first:border-t-0">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] ${EVENT_TONE[it.tone]}`}>
                      <Ic className="h-4 w-4" />
                    </span>
                    <button
                      type="button"
                      onClick={() => openItem(it)}
                      disabled={!ev && !it.employeeId}
                      className="flex min-w-0 flex-1 flex-col text-left disabled:cursor-default"
                    >
                      <span className="text-sm font-semibold text-ink">{it.title}</span>
                      <span className="text-xs text-muted">
                        {[it.tone === "pessoas" ? null : EVENT_LABEL[it.tone], it.time, it.detail].filter(Boolean).join(" · ")}
                      </span>
                      {ev?.notes && <span className="mt-1 whitespace-pre-line text-xs text-muted">{ev.notes}</span>}
                    </button>
                    {ev &&
                      (removing?.id === ev.id ? (
                        <span className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => void remove(ev)}
                            className="rounded-[8px] bg-critical-soft px-2 py-1 text-xs font-semibold text-critical"
                          >
                            Excluir
                          </button>
                          <button
                            type="button"
                            onClick={() => setRemoving(null)}
                            className="rounded-[8px] px-2 py-1 text-xs font-semibold text-muted hover:bg-surface-2"
                          >
                            Manter
                          </button>
                        </span>
                      ) : (
                        <span className="flex shrink-0 items-center opacity-60 transition group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() => setEditing(ev)}
                            aria-label={`Editar ${ev.title}`}
                            className="rounded-[8px] p-1.5 text-muted hover:bg-surface-2 hover:text-ink"
                          >
                            <IconEdit className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setRemoving(ev)}
                            aria-label={`Excluir ${ev.title}`}
                            className="rounded-[8px] p-1.5 text-muted hover:bg-surface-2 hover:text-critical"
                          >
                            <IconTrash className="h-4 w-4" />
                          </button>
                        </span>
                      ))}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <EventModal
        editing={editing}
        departments={departments}
        onClose={() => setEditing(null)}
        onSaved={(saved) => {
          setEditing(null);
          setSelected(saved.startDate);
          const [y, m] = saved.startDate.split("-").map(Number);
          setMonth({ y, m });
          onChanged();
        }}
      />
    </div>
  );
}

function EventModal({
  editing,
  departments,
  onClose,
  onSaved,
}: {
  editing: CalendarEventInfo | { new: true; day: string } | null;
  departments: string[];
  onClose: () => void;
  onSaved: (e: CalendarEventInfo) => void;
}) {
  const existing = editing && !("new" in editing) ? editing : null;
  const [title, setTitle] = useState("");
  const [type, setType] = useState<EventType>("comemoracao");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [time, setTime] = useState("");
  const [allCompanies, setAllCompanies] = useState(true);
  const [companies, setCompanies] = useState<string[]>([]);
  const [yearly, setYearly] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) return;
    const e = "new" in editing ? null : editing;
    setTitle(e?.title ?? "");
    setType(e?.type ?? "comemoracao");
    setStartDate(e?.startDate ?? (editing as { day: string }).day);
    setEndDate(e && e.endDate !== e.startDate ? e.endDate : "");
    setTime(e?.time ?? "");
    setAllCompanies(!e || e.departments.length === 0);
    setCompanies(e?.departments ?? []);
    setYearly(e?.yearly ?? false);
    setNotes(e?.notes ?? "");
    setError("");
  }, [editing]);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!title.trim()) return setError("Escreva o nome do evento.");
    if (!startDate) return setError("Informe a data de início.");
    if (endDate && endDate < startDate) return setError("O término não pode ser antes do início.");
    if (!allCompanies && companies.length === 0) return setError("Escolha ao menos uma empresa ou marque todas.");
    setSaving(true);
    setError("");
    try {
      const res = await fetch(existing ? `/api/frequencia/calendario/${existing.id}` : "/api/frequencia/calendario", {
        method: existing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          type,
          startDate,
          endDate: endDate || startDate,
          time,
          departments: allCompanies ? [] : companies,
          yearly,
          notes,
        }),
      });
      if (redirectIfSessionExpired(res, "/frequencia/entrar", "/frequencia")) return;
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data.error || "Não foi possível salvar. Tente de novo.");
      onSaved(data);
    } finally {
      setSaving(false);
    }
  }

  const selectClass = `${inputClass(false)} h-10`;

  return (
    <Modal
      open={!!editing}
      onClose={onClose}
      title={existing ? "Editar evento" : "Novo evento"}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="calendario-evento" disabled={saving}>
            {saving ? "Salvando…" : existing ? "Salvar" : "Criar evento"}
          </Button>
        </>
      }
    >
      <form id="calendario-evento" onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Nome">
          <input
            autoFocus
            value={title}
            maxLength={EVENT_TITLE_MAX}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Confraternização de fim de ano"
            className={inputClass(false)}
          />
        </Field>
        <Field label="Tipo">
          <select value={type} onChange={(e) => setType(e.target.value as EventType)} className={selectClass}>
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {EVENT_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Início">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass(false)} />
          </Field>
          <Field label="Término (opcional)" hint="Para eventos de vários dias.">
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={inputClass(false)}
            />
          </Field>
        </div>
        <Field label="Horário e local (opcional)">
          <input
            value={time}
            maxLength={EVENT_TIME_MAX}
            onChange={(e) => setTime(e.target.value)}
            placeholder="18h · terraço"
            className={inputClass(false)}
          />
        </Field>
        <div className="flex flex-col gap-2 text-sm">
          <span className="font-medium text-ink">Vale para</span>
          <label className="flex items-center gap-2 text-muted">
            <input type="checkbox" checked={allCompanies} onChange={(e) => setAllCompanies(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
            Todas as empresas
          </label>
          {!allCompanies && (
            <div className="flex flex-wrap gap-1.5">
              {departments.map((d) => {
                const on = companies.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setCompanies((list) => (on ? list.filter((x) => x !== d) : [...list, d]))}
                    className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                      on ? "border-ink bg-ink text-bg" : "border-border text-muted hover:text-ink"
                    }`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={yearly} onChange={(e) => setYearly(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
          Repetir todo ano
        </label>
        <Field label="Observação (opcional)" hint={`${notes.length}/${EVENT_NOTES_MAX}`}>
          <textarea
            value={notes}
            rows={2}
            maxLength={EVENT_NOTES_MAX}
            onChange={(e) => setNotes(e.target.value)}
            className={inputClass(false)}
          />
        </Field>
        {error && <p className="text-xs text-critical">{error}</p>}
      </form>
    </Modal>
  );
}
