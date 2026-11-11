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

/**
 * Kit de início na ficha: o que foi pedido para o primeiro dia (ferramentas,
 * acessos, equipamentos), quem cuida e o que já está pronto — o mesmo que
 * aparece no Slack.
 */
export function StartKitCard({ employeeId }: { employeeId: string }) {
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
        body: JSON.stringify(body),
      });
      setKits(next);
      if (next[0]?.slackError) toast.error(next[0].slackError, { duration: 8000 });
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

  const kit = kits?.[0] ?? null;
  const doneCount = kit?.tasks.filter((t) => t.doneAt).length ?? 0;

  return (
    <section aria-label="Kit de início" className="flex flex-col gap-3.5 rounded-[16px] border border-border bg-surface p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-[17px] font-semibold uppercase tracking-[0.06em] text-ink">Kit de início</h2>
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
          <p className="text-sm text-muted">
            Ferramentas, acessos e equipamentos para o primeiro dia. Cada responsável recebe os seus itens no Slack quando o onboarding é concluído;
            para quem entrou antes, monte aqui.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => post({ action: "criar" }, "Kit de início enviado no Slack.")}
            className="h-10 rounded-[10px] border border-border-strong text-[13px] font-bold text-ink transition hover:bg-surface-2 disabled:opacity-50"
          >
            {busy ? "Enviando…" : "Montar e enviar kit"}
          </button>
        </>
      ) : (
        <>
          <p className="text-xs text-muted">
            {kit.startDate ? `Início em ${formatDateBR(kit.startDate)} · ` : ""}
            {kit.sentCount > 0
              ? `enviado no Slack para ${kit.sentCount} ${kit.sentCount === 1 ? "pessoa" : "pessoas"}`
              : "não enviado no Slack"}
            {kit.reminderSentAt ? " · lembrete enviado" : ""}
          </p>
          {kit.slackError && (
            <div className="flex flex-col gap-2 rounded-[10px] bg-warn-soft px-3 py-2 text-xs text-warn">
              <span>{kit.slackError}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => post({ action: "reenviar", requestId: kit.id }, "Kit de início enviado no Slack.")}
                className="self-start font-bold underline-offset-2 hover:underline disabled:opacity-50"
              >
                {busy ? "Enviando…" : "Enviar no Slack de novo"}
              </button>
            </div>
          )}
          {kit.tasks.length === 0 ? (
            <p className="text-sm text-muted">Nenhum item valia para esta pessoa. Cadastre itens em Onboarding › Kit de início.</p>
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
        </>
      )}
    </section>
  );
}
