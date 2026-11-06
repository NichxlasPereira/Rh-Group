"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "../Button";
import { Modal } from "../Modal";
import { inputClass } from "../attendance/formControls";

interface Info {
  active: boolean;
  createdAt: string | null;
  lastSeenAt: string | null;
}

const when = (value: string | null) =>
  value ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "";

async function call(method: string) {
  const res = await fetch("/api/frequencia/copia-local", { method });
  if (res.status === 401) {
    window.location.replace("/frequencia/entrar");
    throw new Error("Sessão expirada.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Não foi possível concluir.");
  return data;
}

/**
 * Cópia no computador: o administrador gera a chave que o programa instalado
 * no Mac do RH usa para baixar os documentos dos onboardings concluídos.
 */
export function LocalCopyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setInfo(await call("GET"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro inesperado.");
    }
  }, []);

  useEffect(() => {
    if (open) {
      setToken(null);
      void load();
    }
  }, [open, load]);

  async function generate() {
    if (info?.active && !window.confirm("Gerar uma chave nova? O computador que usa a chave atual para de receber arquivos até receber a nova.")) return;
    setBusy(true);
    try {
      const data = await call("POST");
      setToken(data.token);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!window.confirm("Desativar a cópia no computador? Os arquivos que já estão lá continuam, mas nada novo será baixado.")) return;
    setBusy(true);
    try {
      await call("DELETE");
      setToken(null);
      await load();
      toast.success("Cópia no computador desativada.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cópia no computador"
      maxWidthClassName="max-w-lg"
      footer={
        <Button type="button" onClick={onClose}>
          Pronto
        </Button>
      }
    >
      <div className="flex flex-col gap-4 text-sm">
        <p className="text-muted">
          Os documentos aprovados de cada onboarding concluído também são baixados para uma pasta no computador onde o programa da
          cópia está instalado — uma pasta por pessoa. Os arquivos continuam guardados aqui no RHGroup.
        </p>

        <div className="rounded-[12px] border border-border bg-surface px-4 py-3">
          {info === null ? (
            <p className="text-muted">Carregando…</p>
          ) : info.active ? (
            <div className="flex flex-col gap-1">
              <p className="font-semibold text-ok">Ativa</p>
              <p className="text-xs text-muted">Chave gerada em {when(info.createdAt)}</p>
              <p className="text-xs text-muted">
                {info.lastSeenAt
                  ? `Último contato do computador: ${when(info.lastSeenAt)}`
                  : "O computador ainda não se conectou com esta chave."}
              </p>
            </div>
          ) : (
            <p className="text-muted">Desativada — nenhum computador recebe os documentos.</p>
          )}
        </div>

        {token && (
          <div className="flex flex-col gap-2">
            <p className="text-muted">
              Chave da cópia — <strong className="text-ink">mostrada só agora</strong>. Cole no instalador quando ele pedir. Se perder,
              gere outra.
            </p>
            <input readOnly value={token} onFocus={(e) => e.target.select()} className={inputClass(false) + " font-mono text-xs"} />
            <Button
              type="button"
              variant="ghost"
              className="!px-4 !py-2 self-start text-xs"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(token);
                  toast.success("Chave copiada.");
                } catch {
                  toast.error("Não foi possível copiar. Selecione a chave e copie.");
                }
              }}
            >
              Copiar chave
            </Button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" className="!px-4 !py-2 text-xs" disabled={busy || info === null} onClick={generate}>
            {info?.active ? "Gerar nova chave" : "Gerar chave"}
          </Button>
          {info?.active && (
            <Button type="button" variant="ghost" className="!px-4 !py-2 text-xs" disabled={busy} onClick={revoke}>
              Desativar
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
