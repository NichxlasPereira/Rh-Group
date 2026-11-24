import { prisma } from "./prisma";
import { SlackError, slackApi, slackConfig, slackEscape } from "./slack";
import { Employee } from "./attendance";
import { Birthday, monthDayOf } from "./birthdays";
import { EVENT_LABEL, addDays, daysBetween, toEventInfo } from "./calendar";
import { CalendarItem, itemsBetween, upcoming } from "./calendarItems";

/**
 * Avisos do calendário do RH no Slack, por mensagem direta do app RHGroup às
 * pessoas escolhidas: resumo da semana (segunda, a partir das 9h) e lembrete
 * alguns dias antes de feriados, recessos e eventos, além do aviso no dia dos
 * eventos cadastrados. Roda junto com os lembretes do kit (de hora em hora).
 */

export interface CalendarSlackSettings {
  recipients: { id: string; name: string }[];
  /** Lembrete tantos dias antes (0 = sem lembrete antecipado). */
  daysBefore: number;
  /** Resumo da semana toda segunda. */
  weekly: boolean;
  /** Aviso no dia dos eventos cadastrados. */
  sameDay: boolean;
  /** Resumo inclui aniversários, tempo de casa, entradas, saídas e contratos. */
  people: boolean;
}

export interface CalendarSlackStatus {
  lastSentAt: string | null;
  lastError: string | null;
}

const SETTINGS_KEY = "calendario_slack";
const STATUS_KEY = "calendario_slack_status";
export const DAYS_BEFORE_OPTIONS = [0, 1, 2, 3, 5, 7, 15];
const SEND_FROM_HOUR = 9;
const SEND_UNTIL_HOUR = 19;

export const DEFAULT_SETTINGS: CalendarSlackSettings = {
  recipients: [],
  daysBefore: 3,
  weekly: true,
  sameDay: true,
  people: true,
};

export async function loadSettings(): Promise<CalendarSlackSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: SETTINGS_KEY } });
  if (!row) return DEFAULT_SETTINGS;
  try {
    return parseSettings(JSON.parse(row.value)) ?? DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Valida o que veio da tela; null se estiver errado. */
export function parseSettings(body: unknown): CalendarSlackSettings | null {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!Array.isArray(b.recipients)) return null;
  const recipients: CalendarSlackSettings["recipients"] = [];
  for (const r of b.recipients.slice(0, 20)) {
    const id = typeof r?.id === "string" ? r.id.trim() : "";
    const name = typeof r?.name === "string" ? r.name.trim().slice(0, 80) : "";
    if (/^[UW][A-Z0-9]{6,}$/.test(id) && !recipients.some((x) => x.id === id))
      recipients.push({ id, name: name || id });
  }
  const daysBefore = Number(b.daysBefore);
  return {
    recipients,
    daysBefore: DAYS_BEFORE_OPTIONS.includes(daysBefore) ? daysBefore : DEFAULT_SETTINGS.daysBefore,
    weekly: b.weekly !== false,
    sameDay: b.sameDay !== false,
    people: b.people !== false,
  };
}

export async function saveSettings(s: CalendarSlackSettings): Promise<void> {
  const value = JSON.stringify(s);
  await prisma.appSetting.upsert({
    where: { key: SETTINGS_KEY },
    create: { key: SETTINGS_KEY, value },
    update: { value },
  });
}

export async function loadStatus(): Promise<CalendarSlackStatus> {
  const row = await prisma.appSetting.findUnique({ where: { key: STATUS_KEY } });
  try {
    const v = row ? JSON.parse(row.value) : {};
    return { lastSentAt: v.lastSentAt ?? null, lastError: v.lastError ?? null };
  } catch {
    return { lastSentAt: null, lastError: null };
  }
}

async function saveStatus(s: CalendarSlackStatus): Promise<void> {
  const value = JSON.stringify(s);
  await prisma.appSetting.upsert({ where: { key: STATUS_KEY }, create: { key: STATUS_KEY, value }, update: { value } });
}

// ---------------------------------------------------------------- datas em São Paulo

/** Dia ("AAAA-MM-DD"), hora e dia da semana (0 = domingo) no horário de São Paulo. */
export function saoPauloNow(d = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value])
  );
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  return { day, hour: Number(parts.hour), weekday: new Date(`${day}T12:00:00Z`).getUTCDay() };
}

const WEEKDAY = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function br(day: string): string {
  return `${day.slice(8, 10)}/${day.slice(5, 7)}`;
}

function brWeek(day: string): string {
  return `${WEEKDAY[new Date(`${day}T12:00:00Z`).getUTCDay()]} ${br(day)}`;
}

// ---------------------------------------------------------------- dados

async function loadSource(people: boolean) {
  const events = (await prisma.calendarEvent.findMany()).map(toEventInfo);
  if (!people) return { events, employees: [] as Employee[], birthdays: [] as Birthday[], exits: [] };
  const [rows, onboarding, exitRows] = await Promise.all([
    prisma.employee.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        department: true,
        role: true,
        active: true,
        startDate: true,
        contractType: true,
        contractEnd: true,
        birthDate: true,
      },
    }),
    prisma.admissionField.findMany({
      where: { key: "nascimento", value: { not: null }, admission: { employeeId: { not: null } } },
      orderBy: { admission: { updatedAt: "asc" } },
      select: { value: true, admission: { select: { employeeId: true } } },
    }),
    prisma.startKitRequest.findMany({
      where: { kind: "saida", startDate: { not: null } },
      select: { id: true, startDate: true, employee: { select: { id: true, name: true, department: true } } },
    }),
  ]);
  const fromOnboarding = new Map<string, string>();
  for (const f of onboarding)
    if (f.admission.employeeId && f.value) fromOnboarding.set(f.admission.employeeId, f.value);
  const employees = rows.map(
    (e) =>
      ({
        id: e.id,
        name: e.name,
        department: e.department,
        role: e.role,
        active: e.active,
        startDate: e.startDate?.toISOString() ?? null,
        contractType: e.contractType,
        contractEnd: e.contractEnd?.toISOString() ?? null,
      }) as Employee
  );
  const birthdays: Birthday[] = [];
  for (const e of rows) {
    const date = monthDayOf(e.birthDate?.toISOString() ?? fromOnboarding.get(e.id));
    if (date) birthdays.push({ employeeId: e.id, ...date, photo: null });
  }
  const exits = exitRows.map((k) => ({
    id: k.id,
    startDate: k.startDate?.toISOString() ?? null,
    employee: k.employee,
  }));
  return { events, employees, birthdays, exits };
}

/** Uma linha por item; eventos de vários dias aparecem uma vez, com o período. */
function uniqueItems(items: CalendarItem[]): CalendarItem[] {
  const seen = new Set<string>();
  const out: CalendarItem[] = [];
  for (const it of [...items].sort((a, b) => a.day.localeCompare(b.day))) {
    const id = it.eventId ? `${it.eventId}:${it.span?.start}` : it.key;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(it);
  }
  return out;
}

const EMOJI: Record<string, string> = {
  feriado: ":round_pushpin:",
  recesso: ":sunny:",
  comemoracao: ":tada:",
  campanha: ":ribbon:",
  treinamento: ":mortar_board:",
  aniversario: ":birthday:",
  tempo_casa: ":medal:",
  entrada: ":wave:",
  saida: ":door:",
  contrato: ":page_facing_up:",
};

function line(it: CalendarItem, opts: { withDay?: boolean } = {}): string {
  const kind = it.tone === "pessoas" ? null : EVENT_LABEL[it.tone];
  const period = it.span && it.span.start !== it.span.end ? `${br(it.span.start)} a ${br(it.span.end)}` : null;
  const parts = [kind, period, it.time, it.span ? null : it.tone === "pessoas" ? it.detail : null].filter(Boolean);
  return `${EMOJI[it.kind] ?? "•"} ${opts.withDay ? `${brWeek(it.span?.start ?? it.day)} · ` : ""}*${slackEscape(it.title)}*${
    parts.length ? ` — ${slackEscape(parts.join(" · "))}` : ""
  }`;
}

function when(days: number): string {
  return days === 0 ? "hoje" : days === 1 ? "amanhã" : `em ${days} dias`;
}

interface Built {
  text: string;
  keys: string[];
}

/**
 * Monta a mensagem de hoje: resumo da semana (se for segunda ou prévia),
 * lembretes antecipados e eventos do dia ainda não avisados.
 */
async function build(
  today: string,
  weekday: number,
  settings: CalendarSlackSettings,
  opts: { preview?: boolean } = {}
): Promise<Built | null> {
  const src = await loadSource(settings.people);
  const sent = opts.preview
    ? new Set<string>()
    : new Set(
        (
          await prisma.calendarReminderLog.findMany({
            where: { sentAt: { gte: new Date(Date.now() - 400 * 86_400_000) } },
          })
        ).map((r) => r.key)
      );
  const keys: string[] = [];
  const blocks: string[] = [];

  // Resumo da semana: de segunda a domingo.
  const monday = addDays(today, -((weekday + 6) % 7));
  const weekKey = `semana:${monday}`;
  const sunday = addDays(monday, 6);
  // Com o resumo na mesma mensagem, o que já está nele não se repete abaixo.
  let weekShown = false;
  if (settings.weekly && (opts.preview || (weekday === 1 && !sent.has(weekKey)))) {
    weekShown = true;
    const all = uniqueItems(itemsBetween(monday, sunday, { ...src, people: settings.people }));
    // Campanha que já vinha de antes (o mês todo): uma linha no topo, não um item de segunda.
    const running = all.filter((it) => it.kind === "campanha" && it.span && it.span.start < monday);
    const week = all.filter((it) => !running.includes(it));
    const byDay = new Map<string, CalendarItem[]>();
    for (const it of week) {
      const day = it.span && it.span.start < monday ? monday : it.day;
      byDay.set(day, [...(byDay.get(day) ?? []), it]);
    }
    const lines: string[] = [];
    for (let d = monday; d <= sunday; d = addDays(d, 1)) {
      const list = byDay.get(d);
      if (!list) continue;
      lines.push(`*${brWeek(d)}*`, ...list.map((it) => line(it)));
    }
    const next = upcoming(today, src.events);
    const ahead = [
      next.holiday && next.holiday.day > sunday
        ? `:hourglass_flowing_sand: Próximo feriado: *${slackEscape(next.holiday.title)}* ${when(next.holiday.days)} (${brWeek(next.holiday.day)})`
        : null,
      next.recess && !next.recess.ongoing && next.recess.day > sunday
        ? `:hourglass_flowing_sand: Próximo recesso: *${slackEscape(next.recess.title)}* ${when(next.recess.days)} (${brWeek(next.recess.day)})`
        : null,
    ].filter(Boolean) as string[];
    blocks.push(
      [
        `:calendar: *Agenda do RH · semana de ${br(monday)} a ${br(sunday)}*`,
        ...running.map((it) => `:ribbon: Campanha em andamento: *${slackEscape(it.title)}* (até ${br(it.span!.end)})`),
        ...(lines.length ? lines : ["Nada marcado nesta semana."]),
        ...(ahead.length ? ["", ...ahead] : []),
      ].join("\n")
    );
    keys.push(weekKey);
  }

  // Lembrete antecipado: feriados, recessos e eventos que começam em 1..N dias.
  if (settings.daysBefore > 0) {
    const soon = uniqueItems(
      itemsBetween(addDays(today, 1), addDays(today, settings.daysBefore), { ...src, people: false })
    ).filter((it) => (it.span?.start ?? it.day) > today);
    const lines: string[] = [];
    for (const it of soon) {
      const start = it.span?.start ?? it.day;
      const key = `antes:${it.eventId ?? it.title}:${start}`;
      if (sent.has(key) && !opts.preview) continue;
      const days = daysBetween(today, start);
      keys.push(key);
      if (weekShown && start <= sunday) continue;
      lines.push(
        `${line(it, { withDay: true })} — ${it.span && it.span.start !== it.span.end ? "começa " : ""}${when(days)}`
      );
    }
    if (lines.length) blocks.push([":bell: *Chegando*", ...lines].join("\n"));
  }

  // No dia: eventos cadastrados que começam hoje (feriados já foram avisados antes).
  if (settings.sameDay) {
    const lines: string[] = [];
    for (const it of uniqueItems(itemsBetween(today, today, { ...src, people: false }))) {
      if (!it.eventId || it.kind === "campanha" || (it.span?.start ?? it.day) !== today) continue;
      const key = `hoje:${it.eventId}:${today}`;
      if (sent.has(key) && !opts.preview) continue;
      keys.push(key);
      if (!weekShown) lines.push(line(it));
    }
    if (lines.length) blocks.push([":round_pushpin: *Hoje*", ...lines].join("\n"));
  }

  if (!blocks.length) return keys.length ? { text: "", keys } : null;
  const text = (opts.preview ? ["_Prévia dos avisos do calendário do RH_", ...blocks] : blocks).join("\n\n");
  return { text, keys };
}

async function deliver(recipients: CalendarSlackSettings["recipients"], text: string) {
  const errors: string[] = [];
  let ok = 0;
  for (const r of recipients) {
    try {
      await slackApi("chat.postMessage", { channel: r.id, text, unfurl_links: false, unfurl_media: false });
      ok++;
    } catch (err) {
      errors.push(`${r.name}: ${err instanceof SlackError ? err.message : "falha ao enviar."}`);
    }
  }
  return { ok, errors };
}

/** Rodada de hora em hora: manda o que tiver de hoje, uma vez só. */
export async function sendCalendarReminders(now = new Date()): Promise<number> {
  if (!slackConfig()) return 0;
  const settings = await loadSettings();
  if (!settings.recipients.length) return 0;
  const sp = saoPauloNow(now);
  if (sp.hour < SEND_FROM_HOUR || sp.hour > SEND_UNTIL_HOUR) return 0;
  const built = await build(sp.day, sp.weekday, settings);
  if (!built) return 0;
  if (!built.text) {
    // Só itens que já estavam no resumo: marca e não manda nada.
    for (const key of built.keys)
      await prisma.calendarReminderLog.upsert({ where: { key }, create: { key }, update: {} });
    return 0;
  }
  const { ok, errors } = await deliver(settings.recipients, built.text);
  // Marca como enviado se ao menos uma pessoa recebeu (as outras ficam no erro).
  if (ok > 0) {
    for (const key of built.keys) {
      await prisma.calendarReminderLog.upsert({ where: { key }, create: { key }, update: {} });
    }
  }
  const status = await loadStatus();
  await saveStatus({
    lastSentAt: ok > 0 ? now.toISOString() : status.lastSentAt,
    lastError: errors.length ? errors.join(" ") : null,
  });
  return ok;
}

/** Prévia: manda agora o resumo da semana e os lembretes, sem marcar nada. */
export async function sendCalendarPreview(settings: CalendarSlackSettings): Promise<{ ok: number; errors: string[] }> {
  const sp = saoPauloNow();
  const built = await build(sp.day, sp.weekday, { ...settings, weekly: true }, { preview: true });
  return deliver(
    settings.recipients,
    built?.text ?? "_Prévia dos avisos do calendário do RH_\n\nNada para avisar agora."
  );
}
