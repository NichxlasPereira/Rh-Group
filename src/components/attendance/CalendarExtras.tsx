"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Modal } from "../Modal";
import { Button } from "../Button";
import { inputClass } from "./formControls";
import { IconCheckCircle, IconParty, IconRibbon, IconX } from "../icons";
import { CalendarEventInfo, EVENT_TONE } from "@/lib/calendar";
import { MONTH_NAMES } from "@/lib/birthdays";
import { alreadyAdded, campaignColor, suggestionsFor } from "@/lib/campaigns";
import { redirectIfSessionExpired } from "@/lib/sessionClient";

function shortDate(day: string): string {
  return `${day.slice(8, 10)}/${day.slice(5, 7)}`;
}

/** Bolinha com a cor da campanha (Outubro Rosa, Novembro Azul…). */
export function CampaignDot({ title, className = "h-2.5 w-2.5" }: { title: string; className?: string }) {
  const color = campaignColor(title);
  if (!color) return null;
  return <span aria-hidden="true" className={`shrink-0 rounded-full ${className}`} style={{ background: color }} />;
}

// ---------------------------------------------------------------- sugestões

/**
 * Campanhas e datas sugeridas: meses de conscientização (Janeiro Branco,
 * Outubro Rosa…) e datas comemorativas, adicionadas com um clique.
 */
export function SuggestionsModal({
  open,
  onClose,
  events,
  year: initialYear,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  events: CalendarEventInfo[];
  year: number;
  onAdded: () => void;
}) {
  const [year, setYear] = useState(initialYear);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (open) setYear(initialYear);
  }, [open, initialYear]);

  const list = useMemo(
    () => suggestionsFor(year).map((s) => ({ ...s, added: alreadyAdded(s, events, year) })),
    [year, events]
  );
  const missing = list.filter((s) => !s.added);

  async function add(keys: string[], tag: string) {
    setBusy(tag);
    try {
      const res = await fetch("/api/frequencia/calendario/sugestoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, keys }),
      });
      if (redirectIfSessionExpired(res, "/frequencia/entrar", "/frequencia")) return;
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return void toast.error(data.error || "Não foi possível adicionar.");
      if (data.added > 1) toast.success(`${data.added} datas adicionadas ao calendário.`);
      else if (data.added === 1) toast.success("Adicionado ao calendário.");
      onAdded();
    } finally {
      setBusy(null);
    }
  }

  const thisYear = new Date().getFullYear();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Campanhas e datas sugeridas"
      maxWidthClassName="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>
            Fechar
          </Button>
          <Button
            type="button"
            disabled={!missing.length || !!busy}
            onClick={() =>
              void add(
                missing.map((s) => s.key),
                "todas"
              )
            }
          >
            {busy === "todas"
              ? "Adicionando…"
              : missing.length
                ? `Adicionar todas (${missing.length})`
                : "Todas adicionadas"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-md text-muted">
            Meses de conscientização e datas que costumam ter ação com a equipe. As campanhas do mês se repetem todo
            ano; dá para editar ou excluir depois.
          </p>
          <div
            role="tablist"
            aria-label="Ano"
            className="flex gap-1 rounded-[10px] border border-border bg-surface p-1"
          >
            {[thisYear, thisYear + 1].map((y) => (
              <button
                key={y}
                type="button"
                role="tab"
                aria-selected={year === y}
                onClick={() => setYear(y)}
                className={`rounded-[8px] px-3 py-1.5 text-xs font-bold tabular-nums transition ${
                  year === y ? "bg-ink text-bg" : "text-muted hover:text-ink"
                }`}
              >
                {y}
              </button>
            ))}
          </div>
        </div>

        <ul className="overflow-hidden rounded-[12px] neon-cinza border bg-surface">
          {list.map((s) => {
            const Ic = s.type === "campanha" ? IconRibbon : IconParty;
            const color = campaignColor(s.title);
            const month = MONTH_NAMES[Number(s.startDate.slice(5, 7)) - 1];
            return (
              <li key={s.key} className="flex items-center gap-3 border-t border-border px-4 py-2.5 first:border-t-0">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] ${color ? "bg-surface-2" : EVENT_TONE[s.type]}`}
                  style={color ? { color } : undefined}
                >
                  <Ic className="h-4 w-4" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-semibold text-ink">{s.title}</span>
                  <span className="truncate text-xs text-muted">
                    {s.type === "campanha" ? `Campanha · ${month} inteiro` : `Comemoração · ${shortDate(s.startDate)}`}
                    {s.notes ? ` · ${s.notes}` : ""}
                  </span>
                </span>
                {s.added ? (
                  <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-ok">
                    <IconCheckCircle className="h-4 w-4" />
                    No calendário
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => void add([s.key], s.key)}
                    className="shrink-0 rounded-[8px] border border-border px-2.5 py-1 text-xs font-semibold text-ink transition hover:bg-surface-2 disabled:opacity-50"
                  >
                    {busy === s.key ? "…" : "Adicionar"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- avisos no Slack

interface SlackSettings {
  recipients: { id: string; name: string }[];
  daysBefore: number;
  weekly: boolean;
  sameDay: boolean;
  people: boolean;
}

interface AvisosData {
  slack: { configured: boolean; ok: boolean; workspace?: string; error?: string };
  settings: SlackSettings;
  status: { lastSentAt: string | null; lastError: string | null };
  daysBeforeOptions: number[];
}

interface SlackPerson {
  id: string;
  name: string;
  title: string | null;
}

async function call(url: string, method = "GET", body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (redirectIfSessionExpired(res, "/frequencia/entrar", "/frequencia")) throw new Error("Sessão expirada.");
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Não foi possível concluir.");
  return data;
}

const errorToast = (err: unknown) => toast.error(err instanceof Error ? err.message : "Erro inesperado.");

/** Quem recebe os avisos do calendário no Slack e o que recebe (administradores). */
export function SlackRemindersModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [data, setData] = useState<AvisosData | null>(null);
  const [form, setForm] = useState<SlackSettings | null>(null);
  const [people, setPeople] = useState<SlackPerson[]>([]);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState<"salvar" | "previa" | null>(null);

  useEffect(() => {
    if (!open) return;
    setData(null);
    setForm(null);
    setPick("");
    call("/api/frequencia/calendario/avisos")
      .then((d: AvisosData) => {
        setData(d);
        setForm(d.settings);
        if (d.slack.ok) call("/api/frequencia/kit/pessoas").then(setPeople).catch(errorToast);
      })
      .catch(errorToast);
  }, [open]);

  const available = people.filter((p) => !form?.recipients.some((r) => r.id === p.id));

  async function save() {
    if (!form) return;
    setBusy("salvar");
    try {
      await call("/api/frequencia/calendario/avisos", "PUT", form);
      toast.success(form.recipients.length ? "Avisos salvos." : "Avisos desligados.");
      onClose();
    } catch (err) {
      errorToast(err);
    } finally {
      setBusy(null);
    }
  }

  async function preview() {
    if (!form) return;
    setBusy("previa");
    try {
      await call("/api/frequencia/calendario/avisos", "POST", form);
      toast.success("Prévia enviada no Slack.");
    } catch (err) {
      errorToast(err);
    } finally {
      setBusy(null);
    }
  }

  const check = (key: "weekly" | "sameDay" | "people", label: string, hint: string) =>
    form && (
      <label className="flex items-start gap-2.5">
        <input
          type="checkbox"
          checked={form[key]}
          onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
          className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
        />
        <span className="flex flex-col">
          <span className="font-medium text-ink">{label}</span>
          <span className="text-xs text-muted">{hint}</span>
        </span>
      </label>
    );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Avisos do calendário no Slack"
      maxWidthClassName="max-w-xl"
      footer={
        <>
          <Button
            variant="ghost"
            type="button"
            disabled={!data?.slack.ok || !form?.recipients.length || !!busy}
            onClick={() => void preview()}
          >
            {busy === "previa" ? "Enviando…" : "Enviar prévia"}
          </Button>
          <Button type="button" disabled={!form || !!busy} onClick={() => void save()}>
            {busy === "salvar" ? "Salvando…" : "Salvar"}
          </Button>
        </>
      }
    >
      {!data || !form ? (
        <p className="py-6 text-center text-sm text-muted">Conferindo o Slack…</p>
      ) : (
        <div className="flex flex-col gap-5 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="max-w-sm text-muted">
              O app RHGroup manda os avisos por <strong className="text-ink">mensagem direta</strong> para as pessoas
              escolhidas.
            </p>
            {data.slack.ok ? (
              <span className="rounded-full bg-ok-soft px-2.5 py-0.5 text-xs font-bold text-ok">
                Conectado{data.slack.workspace ? ` · ${data.slack.workspace}` : ""}
              </span>
            ) : (
              <span className="rounded-full bg-warn-soft px-2.5 py-0.5 text-xs font-bold text-warn">
                {data.slack.configured ? "Com problema" : "Não conectado"}
              </span>
            )}
          </div>
          {!data.slack.ok && (
            <p className="rounded-[10px] bg-warn-soft px-3 py-2 text-xs text-warn">
              {data.slack.error ?? "O Slack ainda não está conectado."} A conexão é a mesma do kit de início (Onboarding
              › Kit e offboarding).
            </p>
          )}
          {data.status.lastError && (
            <p className="rounded-[10px] bg-critical-soft px-3 py-2 text-xs text-critical">
              Último envio com problema: {data.status.lastError}
            </p>
          )}

          <section className="flex flex-col gap-2">
            <span className="font-medium text-ink">Quem recebe</span>
            {form.recipients.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {form.recipients.map((r) => (
                  <span
                    key={r.id}
                    className="flex items-center gap-1 rounded-full bg-surface-2 py-1 pl-3 pr-1 text-xs font-semibold text-ink"
                  >
                    {r.name}
                    <button
                      type="button"
                      aria-label={`Tirar ${r.name}`}
                      onClick={() => setForm({ ...form, recipients: form.recipients.filter((x) => x.id !== r.id) })}
                      className="rounded-full p-0.5 text-muted hover:bg-surface hover:text-critical"
                    >
                      <IconX className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <select
              value={pick}
              disabled={!data.slack.ok}
              onChange={(e) => {
                const person = people.find((p) => p.id === e.target.value);
                if (person)
                  setForm({ ...form, recipients: [...form.recipients, { id: person.id, name: person.name }] });
                setPick("");
              }}
              className={`${inputClass(false)} h-10 disabled:opacity-60`}
            >
              <option value="">{data.slack.ok ? "Adicionar pessoa do Slack…" : "Conecte o Slack para escolher"}</option>
              {available.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.title ? ` — ${p.title}` : ""}
                </option>
              ))}
            </select>
            {form.recipients.length === 0 && (
              <span className="text-xs text-muted">Sem ninguém escolhido, os avisos ficam desligados.</span>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <span className="font-medium text-ink">O que recebe</span>
            {check("weekly", "Resumo da semana", "Toda segunda, a partir das 9h: feriados, eventos e datas da semana.")}
            {form.weekly &&
              check(
                "people",
                "Incluir as datas das pessoas no resumo",
                "Aniversários, tempo de casa, primeiros e últimos dias e fins de contrato."
              )}
            <label className="flex flex-col gap-1.5">
              <span className="font-medium text-ink">Lembrete antes</span>
              <select
                value={form.daysBefore}
                onChange={(e) => setForm({ ...form, daysBefore: Number(e.target.value) })}
                className={`${inputClass(false)} h-10`}
              >
                {data.daysBeforeOptions.map((n) => (
                  <option key={n} value={n}>
                    {n === 0 ? "Sem lembrete antecipado" : n === 1 ? "1 dia antes" : `${n} dias antes`}
                  </option>
                ))}
              </select>
              <span className="text-xs text-muted">De feriados, recessos, comemorações, campanhas e treinamentos.</span>
            </label>
            {check(
              "sameDay",
              "Aviso no dia",
              "Na manhã de cada evento cadastrado (treinamento às 14h, confraternização…)."
            )}
          </section>

          {data.status.lastSentAt && (
            <p className="text-xs text-muted">
              Último aviso enviado em{" "}
              {new Intl.DateTimeFormat("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(data.status.lastSentAt))}
              .
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
