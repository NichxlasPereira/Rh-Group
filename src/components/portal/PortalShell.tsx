"use client";

import { BrandArt, BrandDot, CffLogo } from "../brand";
import { IconCalendarPlus, IconClock, IconFile, IconHome, IconLogout, IconMedical } from "../icons";

export type PortalView = "inicio" | "nota";

const NAV: { key: PortalView; label: string; icon: (props: { className?: string }) => React.ReactNode }[] = [
  { key: "inicio", label: "Início", icon: IconHome },
  { key: "nota", label: "Enviar nota fiscal", icon: IconFile },
];

/** O que vem depois no portal: aparece, mas ainda não abre. */
export const PORTAL_SOON = [
  { label: "Enviar atestado", icon: IconMedical },
  { label: "Pedir folga", icon: IconCalendarPlus },
  { label: "Comprovante de horas", icon: IconClock },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

interface PortalShellProps {
  employee: { name: string; role: string | null; department: string | null };
  view: PortalView;
  onNavigate: (view: PortalView) => void;
  onLogout: () => void;
  title: string;
  subtitle?: string;
  /** Topo da tela no celular (faixa da marca ou barra de voltar). */
  mobileHeader: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Portal no computador: menu lateral e faixa grafite no topo, como no RH.
 * No celular, só o topo próprio de cada tela e o conteúdo em coluna.
 */
export function PortalShell({ employee, view, onNavigate, onLogout, title, subtitle, mobileHeader, children }: PortalShellProps) {
  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      <aside className="hidden shrink-0 flex-col gap-6 border-r border-border bg-surface px-3 py-5 lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64">
        <div className="flex items-center gap-3 px-2">
          <CffLogo className="h-8 w-auto text-ink" />
          <span className="border-l border-border-strong pl-3 font-display text-[13px] font-medium uppercase tracking-[0.18em] text-muted">
            Portal
          </span>
        </div>

        <nav aria-label="Portal do colaborador" className="flex flex-col gap-1">
          <span className="px-2.5 pb-1 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">Seu RH</span>
          {NAV.map((item) => {
            const current = item.key === view;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onNavigate(item.key)}
                aria-current={current ? "page" : undefined}
                className={`relative flex items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-sm transition ${
                  current ? "bg-accent-soft font-bold text-ink" : "font-semibold text-muted hover:bg-surface-2 hover:text-ink active:bg-border"
                }`}
              >
                {current && <span aria-hidden="true" className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-ink" />}
                <item.icon className="h-[18px] w-[18px] shrink-0" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="flex flex-col gap-1">
          <span className="px-2.5 pb-1 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">Em breve</span>
          {PORTAL_SOON.map((s) => (
            <span key={s.label} className="flex items-center gap-2.5 px-2.5 py-2 text-sm font-semibold text-muted/60">
              <s.icon className="h-[18px] w-[18px] shrink-0" />
              {s.label}
            </span>
          ))}
        </div>

        <div className="mt-auto flex items-center gap-2.5 rounded-[12px] border border-border bg-surface-2 px-2.5 py-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-extrabold text-accent-strong">
            {initials(employee.name)}
          </span>
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate text-[13px] font-bold text-ink">{employee.name}</span>
            <span className="truncate text-[11.5px] text-muted">{employee.role || "Colaborador"}</span>
          </span>
          <button
            type="button"
            onClick={onLogout}
            aria-label="Sair"
            title="Sair"
            className="rounded-[8px] p-1.5 text-muted transition hover:bg-surface hover:text-ink"
          >
            <IconLogout className="h-4 w-4" />
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="lg:hidden">{mobileHeader}</div>
        <main className="flex flex-1 flex-col lg:mx-auto lg:w-full lg:max-w-6xl lg:px-8 lg:py-7">
          {/* Cada tela entra em cascata curta: faixa e conteúdo. */}
          <div key={view} className="rh-stagger flex flex-1 flex-col lg:gap-6">
            <header className="brand-band relative hidden flex-col gap-2 overflow-clip rounded-[18px] px-7 py-6 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.6)] lg:flex">
              <BrandArt variant="band" className="pointer-events-none absolute right-0 top-0 h-full w-[340px] text-white/[0.12]" />
              <span className="relative font-display text-[11.5px] font-medium uppercase tracking-[0.2em] text-white/75">
                CFF Group · Portal do colaborador
              </span>
              <h1 className="relative font-display text-[38px] font-semibold uppercase leading-none tracking-[0.02em] text-white">
                {title}
                <BrandDot className="ml-1 h-2.5 w-2.5 align-baseline" />
              </h1>
              {subtitle && <p className="relative text-sm text-white/85">{subtitle}</p>}
            </header>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
