"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Modal } from "../Modal";
import { Button } from "../Button";
import { Field, inputClass } from "./formControls";
import { todayInputValue } from "@/lib/format";
import type { Employee } from "@/lib/attendance";
import type { StartKitView } from "@/lib/startKit";

interface PreviewItem {
  id: string;
  name: string;
  responsible: string;
  recipient: string | null;
  hasPerson: boolean;
  scope: string;
}

interface Preview {
  slackReady: boolean;
  department: string | null;
  area: string | null;
  items: PreviewItem[];
}

/**
 * Desligar colaborador com offboarding: pergunta o último dia, mostra o que vai
 * para quem no Slack (com caixinhas para tirar o que não precisa) e, ao
 * confirmar, desliga e manda os pedidos de desativação a cada responsável.
 */
export function OffboardingModal({
  employee,
  onClose,
  onDone,
}: {
  employee: Employee | null;
  onClose: () => void;
  onDone: (employee: Employee, kit: StartKitView | null) => void | Promise<void>;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [lastDay, setLastDay] = useState(todayInputValue());
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!employee) return;
    setPreview(null);
    setSkip(new Set());
    setLastDay(todayInputValue());
    let alive = true;
    fetch(`/api/employees/${employee.id}/offboarding`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Não foi possível carregar o offboarding.");
        if (alive) setPreview(data);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Erro inesperado."));
    return () => {
      alive = false;
    };
  }, [employee]);

  async function confirm() {
    if (!employee) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/employees/${employee.id}/offboarding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lastDay, skip: [...skip] }),
      });
      if (res.status === 401) {
        window.location.replace("/frequencia/entrar");
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Não foi possível desligar.");
      await onDone(employee, data.kit ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setBusy(false);
    }
  }

  const items = preview?.items ?? [];
  const chosen = items.filter((i) => !skip.has(i.id));
  const withoutPerson = chosen.filter((i) => !i.hasPerson);
  const scopeLabel = preview?.department ? `${preview.department}${preview.area ? ` › ${preview.area}` : ""}` : "quem está sem empresa";

  return (
    <Modal
      open={!!employee}
      onClose={onClose}
      title="Desligar colaborador"
      maxWidthClassName="max-w-lg"
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" type="button" disabled={busy || !preview || !lastDay} onClick={confirm}>
            {busy ? "Desligando…" : chosen.length > 0 && preview?.slackReady ? "Desligar e enviar" : "Desligar"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 text-sm">
        <p className="text-ink">
          Desligar <strong>{employee?.name}</strong>? A pessoa sai da lista de ativos e não aparece mais ao registrar ocorrências. A ficha e o
          histórico continuam guardados.
        </p>

        <Field label="Último dia">
          <input type="date" value={lastDay} onChange={(e) => setLastDay(e.target.value)} className={inputClass(false)} />
        </Field>

        <section className="flex flex-col gap-2.5 rounded-[12px] border border-border bg-surface-2/50 p-4">
          <h3 className="font-display text-[15px] font-semibold text-ink">Offboarding no Slack</h3>
          {preview === null ? (
            <p className="text-xs text-muted">Carregando…</p>
          ) : (
            <>
              <p className="text-xs text-muted">
                Cada responsável recebe por mensagem direta os pedidos dele, com um botão <strong className="text-ink">Pronto</strong>.
                Desmarque o que não precisa neste desligamento.
              </p>
              {!preview.slackReady && (
                <p className="rounded-[10px] bg-warn-soft px-3 py-2 text-xs text-warn">O Slack não está conectado: o offboarding fica só na ficha.</p>
              )}
              {items.length === 0 ? (
                <p className="rounded-[10px] bg-warn-soft px-3 py-2 text-xs text-warn">
                  Nenhum pedido de saída vale para {scopeLabel}. Cadastre itens no botão Offboarding, na aba Offboarding. Dá para desligar
                  assim mesmo.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {items.map((i) => {
                    const included = !skip.has(i.id);
                    return (
                      <li key={i.id} className="flex items-start gap-2.5">
                        <input
                          type="checkbox"
                          checked={included}
                          onChange={(e) =>
                            setSkip((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.delete(i.id);
                              else next.add(i.id);
                              return next;
                            })
                          }
                          aria-label={`Pedir ${i.name}`}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
                        />
                        <span className="min-w-0 text-[13px]">
                          <span className={`font-semibold ${included ? "text-ink" : "text-muted line-through"}`}>{i.name}</span>
                          <span className="text-muted"> · {i.recipient ?? i.responsible}</span>
                          <span className="block text-xs text-muted">
                            {i.scope}
                            {!i.hasPerson && <span className="text-warn"> · sem pessoa no Slack</span>}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {withoutPerson.length > 0 && (
                <p className="text-xs text-warn">
                  {withoutPerson.length === 1 ? "1 item marcado está" : `${withoutPerson.length} itens marcados estão`} sem pessoa no Slack e não{" "}
                  {withoutPerson.length === 1 ? "vai" : "vão"} chegar a ninguém.
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </Modal>
  );
}
