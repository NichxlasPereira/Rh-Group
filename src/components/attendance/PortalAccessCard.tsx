"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { IconCopy, IconLink } from "../icons";
import { formatDateBR } from "@/lib/format";

interface PortalStatus {
  hasPassword: boolean;
  inviteExpiresAt: string | null;
  lastLoginAt: string | null;
}

/**
 * Acesso do colaborador ao portal: o RH gera o convite (primeiro acesso ou
 * nova senha) e manda o link. O link só aparece na hora em que é gerado.
 */
export function PortalAccessCard({ employeeId, active }: { employeeId: string; active: boolean }) {
  const [status, setStatus] = useState<PortalStatus | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/employees/${employeeId}/portal`, { cache: "no-store" });
    if (res.ok) setStatus(await res.json());
  }, [employeeId]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  async function invite() {
    setBusy(true);
    try {
      const res = await fetch(`/api/employees/${employeeId}/portal`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Não foi possível gerar o convite.");
      setLink(body.link);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setBusy(false);
    }
  }

  function copy() {
    if (!link) return;
    navigator.clipboard.writeText(link).then(
      () => toast.success("Link copiado. Mande para o colaborador."),
      () => toast.error("Não foi possível copiar.")
    );
  }

  const state = !status
    ? null
    : status.hasPassword
      ? { label: "Ativo", style: "bg-ok-soft text-ok", text: status.lastLoginAt ? `Último acesso em ${formatDateBR(status.lastLoginAt)}.` : "Senha criada; ainda não voltou a entrar." }
      : status.inviteExpiresAt
        ? { label: "Convidado", style: "bg-warn-soft text-warn", text: `Convite enviado, vale até ${formatDateBR(status.inviteExpiresAt)}.` }
        : { label: "Sem acesso", style: "border border-border-strong text-muted", text: "Gere o convite para ele criar a senha." };

  return (
    <section aria-label="Portal do colaborador" className="flex flex-col gap-3.5 rounded-[16px] border border-border bg-surface p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-[17px] font-semibold uppercase tracking-[0.06em] text-ink">Portal</h2>
        {state && <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ${state.style}`}>{state.label}</span>}
      </div>
      <p className="text-[13px] leading-relaxed text-muted">
        {state?.text ?? "Carregando..."} Ele entra com o e-mail corporativo da ficha.
      </p>
      {link && (
        <div className="flex items-center gap-2 rounded-[10px] border border-border bg-surface-2 px-3 py-2">
          <IconLink className="h-4 w-4 shrink-0 text-muted" />
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink" title={link}>
            {link}
          </span>
          <button
            type="button"
            onClick={copy}
            className="flex shrink-0 items-center gap-1 rounded-[8px] px-2 py-1 text-xs font-bold text-ink transition hover:bg-surface"
          >
            <IconCopy className="h-3.5 w-3.5" />
            Copiar
          </button>
        </div>
      )}
      {active && (
        <button
          type="button"
          onClick={invite}
          disabled={busy}
          className="h-10 rounded-[10px] border border-border-strong text-[13px] font-bold text-ink transition hover:bg-surface-2 disabled:opacity-50"
        >
          {busy ? "Gerando..." : status?.hasPassword ? "Gerar link para nova senha" : link || status?.inviteExpiresAt ? "Gerar novo convite" : "Gerar convite"}
        </button>
      )}
    </section>
  );
}
