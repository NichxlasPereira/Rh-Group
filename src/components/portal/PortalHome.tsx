"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { INVOICE_STATUS_LABEL, InvoiceStatus, ServiceInvoice, competenceLabel, formatCents } from "@/lib/invoices";
import { formatDateBR } from "@/lib/format";
import { formatFileSize } from "@/lib/attendance";
import { IconChevronLeft, IconFile, IconLogout, IconPaperclip } from "../icons";
import { BrandDot } from "../brand";
import { PortalBrand } from "./PortalBrand";
import { PortalInvoiceForm } from "./PortalInvoiceForm";
import { PORTAL_SOON, PortalShell, PortalView } from "./PortalShell";

interface PortalHomeProps {
  employee: { name: string; role: string | null; department: string | null; contractType: string | null };
}

const STATUS_STYLE: Record<InvoiceStatus, string> = {
  enviada: "bg-warn-soft text-warn",
  recebida: "bg-ok-soft text-ok",
  recusada: "bg-critical-soft text-critical",
};

export function PortalHome({ employee }: PortalHomeProps) {
  const [view, setView] = useState<PortalView>("inicio");
  const [invoices, setInvoices] = useState<ServiceInvoice[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const router = useRouter();

  const load = useCallback(async () => {
    const res = await fetch("/api/portal/notas", { cache: "no-store" });
    if (res.status === 401) return router.replace("/portal/entrar");
    if (!res.ok) return setLoadError(true);
    setLoadError(false);
    setInvoices(await res.json());
  }, [router]);

  useEffect(() => {
    // Busca dos dados ao abrir o portal.
    load().catch(() => setLoadError(true));
  }, [load]);

  async function logout() {
    await fetch("/api/portal/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/portal/entrar");
  }

  const firstName = employee.name.trim().split(/\s+/)[0];
  const pending = invoices?.filter((i) => i.status === "enviada").length ?? 0;
  const who = [employee.role, employee.department].filter(Boolean).join(" · ") || undefined;

  if (view === "nota") {
    return (
      <PortalShell
        employee={employee}
        view={view}
        onNavigate={setView}
        onLogout={logout}
        title="Nota fiscal"
        subtitle="PDF e XML da nota do mês. O RH confere e você acompanha a situação aqui."
        mobileHeader={
          <header className="flex items-center gap-2 px-3 pb-2 pt-5">
            <button
              type="button"
              onClick={() => setView("inicio")}
              aria-label="Voltar"
              className="flex h-11 w-11 items-center justify-center rounded-[12px] text-ink transition hover:bg-surface"
            >
              <IconChevronLeft className="h-5 w-5" />
            </button>
            <h1 className="font-display text-[22px] font-semibold uppercase tracking-[0.04em] text-ink">
              Nota fiscal
              <BrandDot className="ml-1 h-[7px] w-[7px] align-baseline" />
            </h1>
          </header>
        }
      >
        <PortalInvoiceForm
          onCancel={() => setView("inicio")}
          onSent={async () => {
            setView("inicio");
            await load();
          }}
        />
      </PortalShell>
    );
  }

  return (
    <PortalShell
      employee={employee}
      view={view}
      onNavigate={setView}
      onLogout={logout}
      title={`Olá, ${firstName}`}
      subtitle={who}
      mobileHeader={
        <PortalBrand title={`Olá, ${firstName}`} subtitle={who}>
          <button
            type="button"
            onClick={logout}
            aria-label="Sair"
            title="Sair"
            className="flex h-11 w-11 items-center justify-center rounded-[12px] border border-white/25 text-white transition hover:bg-white/10"
          >
            <IconLogout className="h-5 w-5" />
          </button>
        </PortalBrand>
      }
    >
      <div className="flex flex-col gap-6 px-4 py-5 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] lg:items-start lg:p-0">
        <section aria-label="Atalhos" className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => setView("nota")}
            className="col-span-2 flex items-center gap-3.5 rounded-[14px] border border-border-strong bg-surface p-4 text-left transition hover:bg-surface-2 active:bg-border"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] bg-accent text-accent-ink">
              <IconFile className="h-5 w-5" />
            </span>
            <span className="flex flex-col gap-0.5 leading-tight">
              <span className="text-[15px] font-bold text-ink">Enviar nota fiscal</span>
              <span className="text-xs text-muted">
                {employee.contractType === "PJ" ? "PDF e XML da nota do mês" : "Para quem presta serviço como PJ"}
              </span>
            </span>
          </button>
          {PORTAL_SOON.map((s) => (
            <div
              key={s.label}
              aria-disabled="true"
              className="flex min-h-[84px] flex-col justify-between gap-2 rounded-[14px] border border-border bg-surface p-3.5 opacity-60"
            >
              <s.icon className="h-5 w-5 text-muted" />
              <span className="flex flex-col leading-tight">
                <span className="text-[13px] font-bold text-ink">{s.label}</span>
                <span className="text-[11px] text-muted">Em breve</span>
              </span>
            </div>
          ))}
        </section>

        <section aria-label="Minhas notas" className="flex flex-col gap-2">
          <h2 className="flex items-baseline justify-between font-display text-[15px] font-semibold uppercase tracking-[0.08em] text-ink">
            Minhas notas
            {pending > 0 && (
              <span className="font-sans text-xs font-semibold normal-case tracking-normal text-muted">
                {pending} aguardando o RH
              </span>
            )}
          </h2>
          {loadError ? (
            <p className="rounded-[12px] border border-border bg-surface px-4 py-3 text-sm text-muted">
              Não foi possível carregar suas notas. Recarregue a página.
            </p>
          ) : invoices === null ? (
            <div className="flex flex-col gap-2">
              <span className="rh-skeleton h-16 rounded-[12px]" />
              <span className="rh-skeleton h-16 rounded-[12px]" />
            </div>
          ) : invoices.length === 0 ? (
            <p className="rounded-[12px] border border-dashed border-border-strong px-4 py-5 text-center text-sm text-muted">
              Você ainda não enviou nenhuma nota por aqui.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {invoices.map((inv) => (
                <li key={inv.id} className="flex flex-col gap-2 rounded-[12px] border border-border bg-surface px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex min-w-0 flex-col leading-tight">
                      <span className="text-[14px] font-bold text-ink">{competenceLabel(inv.competence)}</span>
                      <span className="text-xs text-muted">
                        {[inv.number ? `nº ${inv.number}` : null, inv.amountCents !== null ? formatCents(inv.amountCents) : null, `enviada em ${formatDateBR(inv.createdAt)}`]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_STYLE[inv.status]}`}>
                      {INVOICE_STATUS_LABEL[inv.status]}
                    </span>
                  </div>
                  {inv.status === "recusada" && inv.reviewNote && (
                    <p className="rounded-[10px] bg-critical-soft px-3 py-2 text-xs leading-relaxed text-critical">
                      Motivo: {inv.reviewNote}. Envie a nota corrigida.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {inv.files.map((f) => (
                      <a
                        key={f.id}
                        href={`/api/portal/notas/arquivos/${f.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex max-w-full items-center gap-1 text-xs text-muted hover:text-ink hover:underline"
                      >
                        <IconPaperclip className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{f.fileName}</span>
                        <span className="shrink-0">· {formatFileSize(f.size)}</span>
                      </a>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </PortalShell>
  );
}
