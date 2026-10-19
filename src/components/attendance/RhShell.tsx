"use client";

import Link from "next/link";
import { ThemeToggle } from "../ThemeToggle";
import { IconBox, IconKey, IconLogout } from "../icons";
import { BrandArt, BrandDot, CffLogo } from "../brand";

export interface RhSection<K extends string> {
  key: K;
  label: string;
  icon: (props: { className?: string }) => React.ReactNode;
  /** Contador ao lado do nome (ex.: documentos para analisar). */
  badge?: number;
}

interface RhShellProps<K extends string> {
  sections: RhSection<K>[];
  active: K;
  onChange: (key: K) => void;
  user: { name: string; role: "admin" | "member" } | null;
  onChangePassword: () => void;
  onLogout: () => void;
  title: string;
  description: string;
  actions?: React.ReactNode;
  /** Esconde o cabeçalho da seção (a ficha do colaborador tem o seu). */
  hideHeader?: boolean;
  children: React.ReactNode;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** Estrutura do RHGroup: barra lateral com as seções e área de conteúdo com cabeçalho. */
export function RhShell<K extends string>({
  sections,
  active,
  onChange,
  user,
  onChangePassword,
  onLogout,
  title,
  description,
  actions,
  hideHeader = false,
  children,
}: RhShellProps<K>) {
  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      <aside className="flex shrink-0 flex-col gap-4 border-b border-border bg-surface px-3 py-4 lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:gap-6 lg:border-b-0 lg:border-r lg:py-5">
        <div className="flex items-center justify-between gap-3 px-2">
          <div className="flex items-center gap-3">
            <CffLogo className="h-8 w-auto text-ink" />
            <span className="border-l border-border-strong pl-3 font-display text-[13px] font-medium uppercase tracking-[0.18em] text-muted">
              RH
            </span>
          </div>
          <div className="lg:hidden">
            <ThemeToggle />
          </div>
        </div>

        <nav aria-label="Seções do RHGroup" className="flex flex-col gap-1">
          <span className="hidden px-2.5 pb-1 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted lg:block">
            Gestão de pessoas
          </span>
          <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
            {sections.map((s) => {
              const current = s.key === active;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => onChange(s.key)}
                  aria-current={current ? "page" : undefined}
                  className={`flex shrink-0 items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-sm transition ${
                    current ? "bg-accent-soft font-bold text-ink" : "font-semibold text-muted hover:bg-surface-2 hover:text-ink"
                  }`}
                >
                  <s.icon className={`h-[18px] w-[18px] shrink-0 ${current ? "text-ink" : ""}`} />
                  <span className="lg:flex-1">{s.label}</span>
                  {!!s.badge && (
                    <span
                      className="min-w-5 rounded-full bg-brand px-1.5 py-px text-center text-[11px] font-bold tabular-nums text-white"
                    >
                      {s.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        <nav aria-label="Outros módulos" className="hidden flex-col gap-1 lg:flex">
          <span className="px-2.5 pb-1 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">Outros módulos</span>
          <Link
            href="/"
            // Trocar de módulo encerra a sessão do atual; nada de pré-carregar.
            prefetch={false}
            className="flex items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-sm font-semibold text-muted transition hover:bg-surface-2 hover:text-ink"
          >
            <IconBox className="h-[18px] w-[18px]" />
            Estoque
          </Link>
        </nav>

        {user && (
          <div className="flex items-center gap-2.5 rounded-[12px] border border-border bg-surface-2 px-2.5 py-2.5 lg:mt-auto">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-extrabold text-accent-strong">
              {initials(user.name)}
            </span>
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-[13px] font-bold text-ink">{user.name}</span>
              <span className="text-[11.5px] text-muted">{user.role === "admin" ? "Administrador" : "Acesso RH"}</span>
            </span>
            <button
              type="button"
              onClick={onChangePassword}
              aria-label="Trocar minha senha"
              title="Trocar minha senha"
              className="rounded-[8px] p-1.5 text-muted transition hover:bg-surface hover:text-ink"
            >
              <IconKey className="h-4 w-4" />
            </button>
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
        )}
      </aside>

      <main className="flex min-w-0 flex-1 flex-col gap-6 px-4 py-6 sm:px-8 lg:py-7">
        {!hideHeader && (
          <>
        {/* Faixa grafite do cartão da CFFGROUP: sempre no tema escuro. */}
        <header
          data-theme="dark"
          className="brand-band relative flex flex-wrap items-end justify-between gap-4 overflow-clip rounded-[18px] px-5 py-6 text-ink shadow-[0_18px_40px_-24px_rgba(0,0,0,0.6)] sm:px-7"
        >
          <BrandArt variant="band" className="pointer-events-none absolute right-0 top-0 hidden h-full w-[340px] text-white/[0.12] sm:block" />
          <div className="relative flex flex-col gap-2">
            <span className="font-display text-[11.5px] font-medium uppercase tracking-[0.2em] text-white/75">
              CFF Group · RH
            </span>
            <h1 className="font-display text-[32px] font-semibold uppercase leading-none tracking-[0.02em] text-white sm:text-[38px]">
              {title}
              <BrandDot className="ml-1 h-2.5 w-2.5 align-baseline" />
            </h1>
            <p className="max-w-[62ch] text-sm text-white/85">{description}</p>
          </div>
          <div className="relative flex flex-wrap items-center gap-2.5">
            <div className="hidden lg:block">
              <ThemeToggle />
            </div>
            {actions}
          </div>
        </header>
          </>
        )}
        {children}
      </main>
    </div>
  );
}
