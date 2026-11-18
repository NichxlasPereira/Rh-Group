"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Modal } from "../Modal";
import { IconSearch, IconUsers } from "../icons";
import { EmptyState, SkeletonRows } from "./formControls";
import { StartKitSettingsModal } from "../admission/StartKitSettingsModal";
import { formatDateBR } from "@/lib/format";
import type { Employee } from "@/lib/attendance";
import type { ExitKitView } from "@/lib/startKit";

type Filter = "andamento" | "concluidos" | "";

const pendingOf = (k: ExitKitView) => k.tasks.filter((t) => !t.doneAt).length;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

async function call(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  if (res.status === 401) {
    window.location.replace("/frequencia/entrar");
    throw new Error("Sessão expirada.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Não foi possível concluir.");
  return data;
}

const errorToast = (err: unknown) => toast.error(err instanceof Error ? err.message : "Erro inesperado.");

/**
 * Aba Offboarding: cada desligamento com o último dia e o andamento dos
 * pedidos de desativação e devolução enviados no Slack, e quem ainda tem
 * pedido pendente.
 */
export function OffboardingPanel({
  kits,
  employees,
  departments,
  isAdmin,
  search,
  pickSignal,
  onReload,
  onDeactivate,
  onOpenEmployee,
}: {
  kits: ExitKitView[] | null;
  /** Colaboradores (para escolher quem desligar). */
  employees: Employee[];
  departments: string[];
  isAdmin: boolean;
  search: string;
  /** Muda quando o RH clica em "Desligar colaborador" no topo. */
  pickSignal: number;
  onReload: () => Promise<void>;
  onDeactivate: (employee: Employee) => void;
  onOpenEmployee: (employeeId: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("andamento");
  const [openId, setOpenId] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pickQuery, setPickQuery] = useState("");
  // Sinal já atendido: ao voltar para a aba, a janela não reabre sozinha.
  const [pickOpenAt, setPickOpenAt] = useState(pickSignal);
  const picking = pickSignal > 0 && pickSignal !== pickOpenAt;

  const list = kits ?? [];
  const q = search.trim().toLocaleLowerCase("pt-BR");
  const matches = (k: ExitKitView) =>
    !q || [k.employee.name, k.employee.department, k.employee.role].some((v) => v?.toLocaleLowerCase("pt-BR").includes(q));
  const inProgress = list.filter((k) => pendingOf(k) > 0);
  const done = list.filter((k) => pendingOf(k) === 0);
  const visible = (filter === "andamento" ? inProgress : filter === "concluidos" ? done : list).filter(matches);

  // Quem ainda tem pedido pendente, em todos os offboardings em andamento.
  const byRecipient = (() => {
    const map = new Map<string, { name: string; count: number; people: Set<string> }>();
    for (const k of inProgress) {
      for (const t of k.tasks) {
        if (t.doneAt) continue;
        const name = t.recipient ?? `${t.responsible} (sem pessoa no Slack)`;
        const entry = map.get(name) ?? { name, count: 0, people: new Set<string>() };
        entry.count++;
        entry.people.add(k.employee.name);
        map.set(name, entry);
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "pt-BR"));
  })();

  const activeEmployees = (() => {
    const pq = pickQuery.trim().toLocaleLowerCase("pt-BR");
    return employees
      .filter((e) => e.active)
      .filter((e) => !pq || [e.name, e.department, e.role].some((v) => v?.toLocaleLowerCase("pt-BR").includes(pq)))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      .slice(0, 40);
  })();

  async function toggleTask(taskId: string, isDone: boolean) {
    try {
      await call(`/api/employees/kit-tarefas/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: isDone }),
      });
      await onReload();
    } catch (err) {
      errorToast(err);
    }
  }

  async function update(k: ExitKitView) {
    setBusyId(k.id);
    try {
      const kits: { kind: string; slackError: string | null }[] = await call(`/api/employees/${k.employee.id}/kit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "atualizar", kind: "saida" }),
      });
      await onReload();
      const mine = kits.find((x) => x.kind === "saida");
      if (mine?.slackError) toast.error(mine.slackError, { duration: 8000 });
      else toast.success("Offboarding atualizado e enviado no Slack.");
    } catch (err) {
      errorToast(err);
    } finally {
      setBusyId(null);
    }
  }

  const filters: { value: Filter; label: string; n: number }[] = [
    { value: "andamento", label: "Em andamento", n: inProgress.length },
    { value: "concluidos", label: "Concluídos", n: done.length },
    { value: "", label: "Todos", n: list.length },
  ];

  return (
    <div className="flex flex-wrap items-start gap-4">
      <section aria-label="Offboardings" className="min-w-0 flex-[999_1_640px] overflow-hidden rounded-[16px] border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por situação">
            {filters.map((f) => (
              <button
                key={f.value || "todos"}
                type="button"
                onClick={() => setFilter(f.value)}
                aria-pressed={filter === f.value}
                className={`rounded-full px-3 py-1.5 text-[12.5px] transition ${
                  filter === f.value ? "bg-ink font-bold text-bg" : "border border-border-strong font-semibold text-muted hover:text-ink"
                }`}
              >
                {f.label} · <span className="tabular-nums">{f.n}</span>
              </button>
            ))}
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setSettings(true)}
              className="text-xs font-semibold text-muted underline-offset-2 transition hover:text-ink hover:underline"
            >
              Pedidos de offboarding
            </button>
          )}
        </div>

        {kits === null ? (
          <SkeletonRows rows={4} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<IconUsers className="h-6 w-6" />}
            title={list.length === 0 ? "Nenhum offboarding ainda" : filter === "andamento" && !q ? "Nada pendente" : "Nenhum offboarding encontrado"}
            text={
              list.length === 0
                ? "Ao desligar um colaborador, os pedidos de desativação e devolução vão para os responsáveis no Slack e aparecem aqui."
                : filter === "andamento" && !q
                  ? "Todos os pedidos de saída estão prontos."
                  : "Troque o filtro ou a busca para ver os outros."
            }
          />
        ) : (
          <ul>
            {visible.map((k) => {
              const total = k.tasks.length;
              const ready = total - pendingOf(k);
              const expanded = openId === k.id;
              const complete = total > 0 && ready === total;
              return (
                <li key={k.id} className="border-b border-border last:border-0">
                  <button
                    type="button"
                    onClick={() => setOpenId(expanded ? null : k.id)}
                    aria-expanded={expanded}
                    className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2.5 px-4 py-3.5 text-left transition hover:bg-surface-2/50 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_7rem_auto]"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-extrabold text-accent-strong">
                        {initials(k.employee.name)}
                      </span>
                      <span className="flex min-w-0 flex-col leading-snug">
                        <span className="truncate font-bold text-ink">{k.employee.name}</span>
                        <span className="truncate text-xs text-muted">
                          {[k.employee.department, k.employee.role].filter(Boolean).join(" · ") || "Sem empresa"}
                        </span>
                      </span>
                    </span>
                    <span className="order-3 col-span-2 flex flex-col gap-1 text-[11.5px] text-muted sm:order-none sm:col-span-1">
                      <span className="flex items-center justify-between gap-2">
                        <span>Pedidos</span>
                        <span className="font-mono tabular-nums text-ink">
                          {ready}/{total}
                        </span>
                      </span>
                      <span className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <span
                          className={`block h-full rounded-full ${complete ? "bg-ok" : "bg-warn"}`}
                          style={{ width: `${total ? (ready / total) * 100 : 0}%` }}
                        />
                      </span>
                    </span>
                    <span className="hidden text-xs text-muted sm:block">
                      Último dia
                      <span className="block font-mono text-ink/80">{k.startDate ? formatDateBR(k.startDate) : "—"}</span>
                    </span>
                    <span
                      className={`order-2 inline-flex justify-self-end rounded-full px-2.5 py-1 text-xs font-bold sm:order-none ${
                        k.slackError && !complete ? "bg-critical-soft text-critical" : complete ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"
                      }`}
                    >
                      {complete ? "Concluído" : k.slackError ? "Com problema" : `${total - ready} pendente${total - ready === 1 ? "" : "s"}`}
                    </span>
                  </button>

                  {expanded && (
                    <div className="flex flex-col gap-3 border-t border-border bg-surface-2/30 px-4 py-4 sm:pl-[3.6rem]">
                      <p className="text-xs text-muted">
                        {k.startDate ? `Último dia ${formatDateBR(k.startDate)} · ` : ""}
                        enviado {k.createdBy ? `por ${k.createdBy} ` : ""}em {formatDateBR(k.createdAt)}
                        {k.sentCount > 0
                          ? ` · ${k.sentCount} ${k.sentCount === 1 ? "pessoa recebeu" : "pessoas receberam"} no Slack`
                          : " · nada chegou no Slack"}
                        {k.reminderSentAt ? " · lembrete enviado" : ""}
                      </p>
                      {k.slackError && <p className="rounded-[10px] bg-warn-soft px-3 py-2 text-xs text-warn">{k.slackError}</p>}
                      <ul className="flex flex-col gap-2">
                        {k.tasks.map((t) => (
                          <li key={t.id} className="flex items-start gap-2.5">
                            <input
                              type="checkbox"
                              checked={!!t.doneAt}
                              onChange={(e) => toggleTask(t.id, e.target.checked)}
                              aria-label={`${t.name} pronto`}
                              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
                            />
                            <span className="min-w-0 text-[13px]">
                              <span className={`font-semibold ${t.doneAt ? "text-muted line-through" : "text-ink"}`}>{t.name}</span>
                              <span className="text-muted"> · {t.recipient ?? t.responsible}</span>
                              {t.doneAt ? (
                                <span className="block text-xs text-muted">
                                  pronto {t.doneBy ? `por ${t.doneBy} ` : ""}
                                  {t.doneVia === "slack" ? "no Slack" : "no RHGroup"} em {formatDateBR(t.doneAt)}
                                </span>
                              ) : (
                                !t.sent && <span className="block text-xs text-warn">não chegou no Slack</span>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => onOpenEmployee(k.employee.id)}
                          className="rounded-[10px] border border-border-strong px-3 py-1.5 text-[12.5px] font-bold text-ink transition hover:bg-surface-2"
                        >
                          Abrir ficha
                        </button>
                        <button
                          type="button"
                          disabled={busyId === k.id}
                          onClick={() => update(k)}
                          title="Acrescenta os pedidos que passaram a valer, completa quem recebe e manda no Slack o que faltar. O que já está pronto não muda."
                          className="rounded-[10px] border border-border-strong px-3 py-1.5 text-[12.5px] font-bold text-ink transition hover:bg-surface-2 disabled:opacity-50"
                        >
                          {busyId === k.id ? "Atualizando…" : "Atualizar com a configuração atual"}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <aside className="flex min-w-[260px] flex-[1_1_280px] flex-col gap-4">
        <section aria-label="Pendências por responsável" className="flex flex-col gap-3 rounded-[16px] border border-border bg-surface p-4">
          <h3 className="font-display text-[15px] font-semibold text-ink">Pendências por responsável</h3>
          {kits === null ? (
            <p className="text-sm text-muted">Carregando…</p>
          ) : byRecipient.length === 0 ? (
            <p className="text-sm text-muted">Ninguém com pedido de saída pendente.</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {byRecipient.map((r) => (
                <li key={r.name} className="flex items-start justify-between gap-3 text-[13px]">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-ink">{r.name}</span>
                    <span className="block truncate text-xs text-muted">{[...r.people].join(", ")}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-warn-soft px-2 py-0.5 text-xs font-bold tabular-nums text-warn">{r.count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <p className="px-1 text-xs text-muted">
          Cada responsável recebe os pedidos dele no Slack ao desligar, com o botão Pronto. Quem ainda tiver pendência recebe um lembrete um dia
          depois.
        </p>
      </aside>

      <Modal
        open={picking}
        onClose={() => {
          setPickOpenAt(pickSignal);
          setPickQuery("");
        }}
        title="Desligar colaborador"
        maxWidthClassName="max-w-md"
      >
        <div className="flex flex-col gap-3 text-sm">
          <label className="flex h-10 items-center gap-2 rounded-[10px] border border-border bg-surface px-3 text-muted focus-within:border-accent">
            <IconSearch className="h-4 w-4 shrink-0" />
            <input
              type="search"
              autoFocus
              value={pickQuery}
              onChange={(e) => setPickQuery(e.target.value)}
              placeholder="Buscar colaborador ativo"
              aria-label="Buscar colaborador ativo"
              className="w-full bg-transparent text-[13px] text-ink placeholder:text-muted focus:outline-none"
            />
          </label>
          {activeEmployees.length === 0 ? (
            <p className="text-muted">Ninguém encontrado entre os ativos.</p>
          ) : (
            <ul className="flex max-h-[50vh] flex-col overflow-y-auto rounded-[12px] border border-border">
              {activeEmployees.map((e) => (
                <li key={e.id} className="border-b border-border last:border-0">
                  <button
                    type="button"
                    onClick={() => {
                      setPickOpenAt(pickSignal);
                      setPickQuery("");
                      onDeactivate(e);
                    }}
                    className="flex w-full flex-col items-start px-3.5 py-2.5 text-left transition hover:bg-surface-2"
                  >
                    <span className="font-semibold text-ink">{e.name}</span>
                    <span className="text-xs text-muted">{[e.department, e.role].filter(Boolean).join(" · ") || "Sem empresa"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>

      {isAdmin && (
        <StartKitSettingsModal
          open={settings}
          onClose={() => {
            setSettings(false);
            void onReload();
          }}
          departments={departments}
          initialList="saida"
        />
      )}
    </div>
  );
}
