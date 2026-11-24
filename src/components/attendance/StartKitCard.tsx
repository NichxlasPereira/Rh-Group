"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import type { StartKitView } from "@/lib/startKit";
import { formatDateBR } from "@/lib/format";

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

const TEXT = {
  inicio: {
    title: "Kit de início",
    intro:
      "Ferramentas, acessos e equipamentos para o primeiro dia. Cada responsável recebe os seus itens no Slack quando o onboarding é concluído; para quem entrou antes, monte aqui.",
    create: "Montar e enviar kit",
    created: "Kit de início enviado no Slack.",
    updated: "Kit atualizado e enviado no Slack.",
    date: "Início em",
    empty: "Nenhum item valia para esta pessoa. Cadastre itens no botão Onboarding, na aba Onboarding.",
  },
  saida: {
    title: "Offboarding",
    intro:
      "Desativar acessos e recolher equipamentos. Cada responsável recebe os seus pedidos no Slack ao desligar; para quem foi desligado antes, monte aqui.",
    create: "Montar e enviar offboarding",
    created: "Offboarding enviado no Slack.",
    updated: "Offboarding atualizado e enviado no Slack.",
    date: "Último dia",
    empty: "Nenhum pedido de saída valia para esta pessoa. Cadastre itens no botão Offboarding, na aba Offboarding.",
  },
};

/**
 * Kit de início (ou offboarding) na ficha: o que foi pedido, quem cuida e o
 * que já está pronto — o mesmo que aparece no Slack. O offboarding só aparece
 * para quem foi desligado.
 */
export function StartKitCard({ employeeId, kind = "inicio", active = true }: { employeeId: string; kind?: "inicio" | "saida"; active?: boolean }) {
  const txt = TEXT[kind];
  const [kits, setKits] = useState<StartKitView[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setKits(await call(`/api/employees/${employeeId}/kit`));
    } catch (err) {
      errorToast(err);
    }
  }, [employeeId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function post(body: Record<string, unknown>, done: string) {
    setBusy(true);
    try {
      const next: StartKitView[] = await call(`/api/employees/${employeeId}/kit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, kind }),
      });
      setKits(next);
      const mine = next.find((k) => k.kind === kind);
      if (mine?.slackError) toast.error(mine.slackError, { duration: 8000 });
      else toast.success(done);
    } catch (err) {
      errorToast(err);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(taskId: string, done: boolean) {
    try {
      await call(`/api/employees/kit-tarefas/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done }),
      });
      await load();
    } catch (err) {
      errorToast(err);
    }
  }

  const kit = kits?.find((k) => k.kind === kind) ?? null;
  const doneCount = kit?.tasks.filter((t) => t.doneAt).length ?? 0;

  // Offboarding: só para quem foi desligado (ou já tem pedido de saída).
  if (kind === "saida" && kits !== null && !kit && active) return null;

  return (
    <section aria-label={txt.title} className="flex flex-col gap-3.5 rounded-[16px] neon-cinza border bg-surface p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-[17px] font-semibold uppercase tracking-[0.06em] text-ink">{txt.title}</h2>
        {kit && kit.tasks.length > 0 && (
          <span
            className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ${
              doneCount === kit.tasks.length ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"
            }`}
          >
            {doneCount}/{kit.tasks.length} prontos
          </span>
        )}
      </div>

      {kits === null ? (
        <p className="text-sm text-muted">Carregando…</p>
      ) : !kit ? (
        <>
          <p className="text-sm text-muted">{txt.intro}</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => post({ action: "criar" }, txt.created)}
            className="h-10 rounded-[10px] border border-border-strong text-[13px] font-bold text-ink transition hover:bg-surface-2 disabled:opacity-50"
          >
            {busy ? "Enviando…" : txt.create}
          </button>
        </>
      ) : (
        <>
          <p className="text-xs text-muted">
            {kit.startDate ? `${txt.date} ${formatDateBR(kit.startDate)} · ` : ""}
            {kit.sentCount > 0
              ? `enviado no Slack para ${kit.sentCount} ${kit.sentCount === 1 ? "pessoa" : "pessoas"}`
              : "não enviado no Slack"}
            {kit.reminderSentAt ? " · lembrete enviado" : ""}
          </p>
          {kit.slackError && <p className="rounded-[10px] bg-warn-soft px-3 py-2 text-xs text-warn">{kit.slackError}</p>}
          {kit.tasks.length === 0 ? (
            <p className="text-sm text-muted">{txt.empty}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {kit.tasks.map((t) => (
                <li key={t.id} className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={!!t.doneAt}
                    onChange={(e) => toggle(t.id, e.target.checked)}
                    aria-label={`${t.name} pronto`}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
                  />
                  <span className="min-w-0 text-[13px]">
                    <span className={`font-semibold ${t.doneAt ? "text-muted line-through" : "text-ink"}`}>{t.name}</span>
                    <span className="text-muted">
                      {" "}
                      · {t.responsible}
                      {t.recipient ? ` · ${t.recipient}` : ""}
                    </span>
                    {!t.doneAt && !t.sent && <span className="block text-xs text-warn">não chegou no Slack</span>}
                    {t.doneAt && (
                      <span className="block text-xs text-muted">
                        pronto {t.doneBy ? `por ${t.doneBy} ` : ""}
                        {t.doneVia === "slack" ? "no Slack" : "no RHGroup"} em {formatDateBR(t.doneAt)}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => post({ action: "atualizar" }, txt.updated)}
            title="Acrescenta os itens que passaram a valer (empresa, área ou configuração do kit), completa quem recebe e manda no Slack o que faltar. O que já está pronto não muda."
            className="h-9 rounded-[10px] border border-border-strong text-[12.5px] font-bold text-ink transition hover:bg-surface-2 disabled:opacity-50"
          >
            {busy ? "Atualizando…" : "Atualizar com a configuração atual"}
          </button>
        </>
      )}
    </section>
  );
}
