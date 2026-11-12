"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import type { StartKitView } from "@/lib/startKit";
import { formatDateBR } from "@/lib/format";

interface PreviewItem {
  id: string;
  name: string;
  responsible: string;
  recipient: string | null;
  hasPerson: boolean;
  included: boolean;
  scope: string;
}

type KitState =
  | { stage: "previa"; slackReady: boolean; department: string | null; area: string | null; items: PreviewItem[] }
  | { stage: "enviado"; kit: StartKitView | null; employeeId: string | null };

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
 * Kit de início dentro do onboarding. Antes de concluir mostra o que vai sair
 * no Slack e para quem (pela empresa e área dos dados internos), e deixa tirar
 * itens só desta contratação. Depois de concluir, mostra o andamento.
 */
export function AdmissionKitCard({ admissionId, refreshKey }: { admissionId: string; refreshKey: string }) {
  const [state, setState] = useState<KitState | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setState(await call(`/api/admissions/${admissionId}/kit`));
    } catch (err) {
      errorToast(err);
    }
  }, [admissionId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function toggleItem(item: PreviewItem, included: boolean) {
    if (!state || state.stage !== "previa") return;
    const skip = state.items.filter((i) => (i.id === item.id ? !included : !i.included)).map((i) => i.id);
    setState({ ...state, items: state.items.map((i) => (i.id === item.id ? { ...i, included } : i)) });
    try {
      await call(`/api/admissions/${admissionId}/kit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skip }),
      });
    } catch (err) {
      errorToast(err);
      await load();
    }
  }

  async function toggleTask(taskId: string, done: boolean) {
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

  async function update(employeeId: string) {
    setBusy(true);
    try {
      const kits: StartKitView[] = await call(`/api/employees/${employeeId}/kit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "atualizar" }),
      });
      await load();
      if (kits[0]?.slackError) toast.error(kits[0].slackError, { duration: 8000 });
      else toast.success("Kit atualizado e enviado no Slack.");
    } catch (err) {
      errorToast(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Kit de início" className="flex flex-col gap-3 rounded-[14px] border border-border bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-lg font-semibold text-ink">Kit de início</h3>
        {state?.stage === "enviado" && state.kit && state.kit.tasks.length > 0 && (
          <KitProgress done={state.kit.tasks.filter((t) => t.doneAt).length} total={state.kit.tasks.length} />
        )}
      </div>

      {state === null ? (
        <p className="text-sm text-muted">Carregando…</p>
      ) : state.stage === "previa" ? (
        <Preview state={state} onToggle={toggleItem} />
      ) : !state.kit ? (
        <p className="text-sm text-muted">Este onboarding foi concluído sem kit de início.</p>
      ) : (
        <>
          <p className="text-xs text-muted">
            Enviado ao concluir
            {state.kit.startDate ? ` · início em ${formatDateBR(state.kit.startDate)}` : ""}
            {state.kit.sentCount > 0
              ? ` · ${state.kit.sentCount} ${state.kit.sentCount === 1 ? "pessoa recebeu" : "pessoas receberam"} no Slack`
              : " · nada chegou no Slack"}
          </p>
          {state.kit.slackError && <p className="rounded-[10px] bg-warn-soft px-3 py-2 text-xs text-warn">{state.kit.slackError}</p>}
          {state.kit.tasks.length > 0 && (
            <ul className="flex flex-col gap-2">
              {state.kit.tasks.map((t) => (
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
                    <span className="text-muted">
                      {" "}
                      · {t.recipient ?? t.responsible}
                    </span>
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
          )}
          {state.employeeId && (
            <button
              type="button"
              disabled={busy}
              onClick={() => update(state.employeeId!)}
              title="Acrescenta os itens que passaram a valer, completa quem recebe e manda no Slack o que faltar. O que já está pronto não muda."
              className="self-start rounded-[10px] border border-border-strong px-3 py-1.5 text-[12.5px] font-bold text-ink transition hover:bg-surface-2 disabled:opacity-50"
            >
              {busy ? "Atualizando…" : "Atualizar com a configuração atual"}
            </button>
          )}
        </>
      )}
    </section>
  );
}

function KitProgress({ done, total }: { done: number; total: number }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ${done === total ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"}`}>
      {done}/{total} prontos
    </span>
  );
}

function Preview({
  state,
  onToggle,
}: {
  state: Extract<KitState, { stage: "previa" }>;
  onToggle: (item: PreviewItem, included: boolean) => void;
}) {
  const included = state.items.filter((i) => i.included);
  const withoutPerson = included.filter((i) => !i.hasPerson);
  return (
    <>
      <p className="text-sm text-muted">
        Ao concluir, cada responsável recebe no Slack os itens dele.{" "}
        {state.department
          ? `Itens de ${state.department}${state.area ? ` › ${state.area}` : ""} e os que valem para todos.`
          : "Escolha o setor (empresa) e a área em Dados internos para ver os itens da empresa."}{" "}
        Desmarque o que não precisa nesta contratação.
      </p>
      {!state.slackReady && <p className="rounded-[10px] bg-warn-soft px-3 py-2 text-xs text-warn">O Slack não está conectado: o kit fica só no RHGroup.</p>}
      {state.items.length === 0 ? (
        <p className="rounded-[10px] bg-warn-soft px-3 py-2 text-xs text-warn">
          Nenhum item do kit vale para {state.department ? `${state.department}${state.area ? ` › ${state.area}` : ""}` : "quem está sem empresa"}. Cadastre
          itens em Onboarding › Kit de início (ou deixe os gerais em “Todas as empresas”).
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {state.items.map((i) => (
            <li key={i.id} className="flex items-start gap-2.5">
              <input
                type="checkbox"
                checked={i.included}
                onChange={(e) => onToggle(i, e.target.checked)}
                aria-label={`Enviar ${i.name}`}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
              />
              <span className="min-w-0 text-[13px]">
                <span className={`font-semibold ${i.included ? "text-ink" : "text-muted line-through"}`}>{i.name}</span>
                <span className="text-muted"> · {i.recipient ?? i.responsible}</span>
                <span className="block text-xs text-muted">
                  {i.scope}
                  {!i.hasPerson && <span className="text-warn"> · sem pessoa no Slack</span>}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {withoutPerson.length > 0 && (
        <p className="text-xs text-warn">
          {withoutPerson.length === 1 ? "1 item marcado está" : `${withoutPerson.length} itens marcados estão`} sem pessoa no Slack e não{" "}
          {withoutPerson.length === 1 ? "vai" : "vão"} chegar a ninguém.
        </p>
      )}
    </>
  );
}
