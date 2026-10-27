"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { ThemeToggle } from "../ThemeToggle";
import { IconBox, IconChevronLeft, IconKey, IconLogout } from "../icons";
import { BrandArt, BrandDot, CffLogo } from "../brand";

export interface RhSection<K extends string> {
  key: K;
  label: string;
  icon: (props: { className?: string }) => React.ReactNode;
  /** Contador ao lado do nome (ex.: documentos para analisar). */
  badge?: number;
}

/** Link para outro módulo no rodapé do menu. */
export interface ShellModuleLink {
  href: string;
  label: string;
  icon: (props: { className?: string }) => React.ReactNode;
}

interface RhShellProps<K extends string> {
  sections: RhSection<K>[];
  active: K;
  onChange: (key: K) => void;
  user?: { name: string; role: "admin" | "member" } | null;
  onChangePassword?: () => void;
  onLogout: () => void;
  /** Sigla ao lado do logo e na faixa do cabeçalho. */
  moduleLabel?: string;
  /** Título do grupo de seções no menu. */
  navLabel?: string;
  otherModules?: ShellModuleLink[];
  title: string;
  description: string;
  actions?: React.ReactNode;
  /** Esconde o cabeçalho da seção (a ficha do colaborador tem o seu). */
  hideHeader?: boolean;
  /** Carregando dados: linha de progresso no topo. */
  busy?: boolean;
  children: React.ReactNode;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

const COLLAPSED_KEY = "menuLateralRecolhido";

const DEFAULT_OTHER_MODULES: ShellModuleLink[] = [{ href: "/", label: "Estoque", icon: IconBox }];

/** Estrutura dos módulos: barra lateral com as seções e área de conteúdo com cabeçalho. */
export function RhShell<K extends string>({
  sections,
  active,
  onChange,
  user = null,
  onChangePassword,
  onLogout,
  moduleLabel = "RH",
  navLabel = "Gestão de pessoas",
  otherModules = DEFAULT_OTHER_MODULES,
  title,
  description,
  actions,
  hideHeader = false,
  busy = false,
  children,
}: RhShellProps<K>) {
  // Marca da seção atual: desliza até o item clicado (medida no próprio menu).
  const listRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  // Só anima depois da primeira medida, para a marca não "voar" ao abrir a página.
  const [pillMoves, setPillMoves] = useState(false);
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const el = list.querySelector<HTMLElement>('[aria-current="page"]');
      setPill(el ? { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight } : null);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [active, sections]);
  useEffect(() => {
    const timer = setTimeout(() => setPillMoves(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // Menu recolhido (só os ícones), lembrado neste navegador.
  const [collapsed, setCollapsed] = useState(false);
  // Desliza só quando a pessoa clica (ao abrir a página já vem no tamanho certo).
  const [collapseMoves, setCollapseMoves] = useState(false);
  useEffect(() => {
    try {
      // Lido depois de montar para não divergir do HTML do servidor.
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "1");
    } catch {}
  }, []);
  function toggleCollapsed() {
    setCollapseMoves(true);
    setCollapsed((v) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, v ? "0" : "1");
      } catch {}
      return !v;
    });
  }
  // Rótulos somem por opacidade enquanto a largura desliza (o menu corta o resto).
  const label = `whitespace-nowrap transition-opacity duration-200 ${collapsed ? "lg:opacity-0" : ""}`;

  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      <aside
        className={`flex shrink-0 flex-col gap-4 border-b border-border bg-surface px-3 py-4 lg:sticky lg:top-0 lg:h-screen lg:gap-6 lg:overflow-x-hidden lg:border-b-0 lg:border-r lg:py-5 ${
          collapsed ? "lg:w-[62px]" : "lg:w-60"
        } ${collapseMoves ? "lg:transition-[width] lg:duration-300 lg:ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none" : ""}`}
      >
        <div className={`flex items-center justify-between gap-3 px-2 ${collapsed ? "lg:justify-center lg:px-0" : ""}`}>
          <div className={`flex items-center gap-3 ${collapsed ? "lg:hidden" : ""}`}>
            <CffLogo className="h-8 w-auto text-ink" />
            <span className="border-l border-border-strong pl-3 font-display text-[13px] font-medium uppercase tracking-[0.18em] text-muted">
              {moduleLabel}
            </span>
          </div>
          <div className="lg:hidden">
            <ThemeToggle />
          </div>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            title={collapsed ? "Expandir menu" : "Recolher menu"}
            aria-expanded={!collapsed}
            className="hidden h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[9px] text-muted transition hover:bg-surface-2 hover:text-ink active:bg-border lg:flex"
          >
            <IconChevronLeft
              className={`h-4 w-4 ${collapseMoves ? "transition-transform duration-300 motion-reduce:transition-none" : ""} ${collapsed ? "rotate-180" : ""}`}
            />
          </button>
        </div>

        <nav aria-label={`Seções do ${moduleLabel}`} className="flex flex-col gap-1">
          <span className={`hidden px-2.5 pb-1 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted lg:block ${label}`}>
            {navLabel}
          </span>
          <div
            ref={listRef}
            className="relative -mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0"
          >
            {pill && (
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute left-0 top-0 rounded-[9px] bg-accent-soft ${pillMoves ? "rh-pill" : ""}`}
                style={{ transform: `translate(${pill.x}px, ${pill.y}px)`, width: pill.w, height: pill.h }}
              >
                {/* Barra fina da seção atual: à esquerda no menu lateral, embaixo no menu do celular. */}
                <span className="absolute bottom-0 left-1/2 h-[3px] w-4 -translate-x-1/2 rounded-full bg-ink lg:bottom-auto lg:left-0 lg:top-1/2 lg:h-4 lg:w-[3px] lg:-translate-x-0 lg:-translate-y-1/2" />
              </span>
            )}
            {sections.map((s) => {
              const current = s.key === active;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => onChange(s.key)}
                  aria-current={current ? "page" : undefined}
                  title={collapsed ? s.label : undefined}
                  className={`relative flex shrink-0 items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-sm transition lg:overflow-hidden ${
                    current
                      ? `font-bold text-ink ${pill ? "" : "bg-accent-soft"}`
                      : "font-semibold text-muted hover:bg-surface-2 hover:text-ink active:bg-border"
                  }`}
                >
                  <s.icon className={`h-[18px] w-[18px] shrink-0 ${current ? "text-ink" : ""}`} />
                  <span className={`lg:flex-1 ${label}`}>{s.label}</span>
                  {!!s.badge && (
                    <span
                      className={`min-w-5 rounded-full bg-brand px-1.5 py-px text-center text-[11px] font-bold tabular-nums text-white ${label}`}
                    >
                      {s.badge}
                    </span>
                  )}
                  {/* Recolhido: o contador vira um ponto no canto do ícone. */}
                  {!!s.badge && collapsed && (
                    <span className="absolute left-[24px] top-1.5 hidden h-2 w-2 rounded-full bg-brand ring-2 ring-surface lg:block" />
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        {otherModules.length > 0 && (
          <nav aria-label="Outros módulos" className="hidden flex-col gap-1 lg:flex">
            <span className={`px-2.5 pb-1 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted ${label}`}>
              Outros módulos
            </span>
            {otherModules.map((m) => (
              <Link
                key={m.href}
                href={m.href}
                // Trocar de módulo encerra a sessão do atual; nada de pré-carregar.
                prefetch={false}
                title={collapsed ? m.label : undefined}
                className="flex items-center gap-2.5 overflow-hidden rounded-[9px] px-2.5 py-2 text-sm font-semibold text-muted transition hover:bg-surface-2 hover:text-ink"
              >
                <m.icon className="h-[18px] w-[18px] shrink-0" />
                <span className={label}>{m.label}</span>
              </Link>
            ))}
          </nav>
        )}

        {/* Sem conta individual (senha compartilhada do módulo): só o botão de sair. */}
        {!user && !onChangePassword && (
          <button
            type="button"
            onClick={onLogout}
            title={collapsed ? "Sair" : undefined}
            className="flex items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-sm font-semibold text-muted transition hover:bg-surface-2 hover:text-ink lg:mt-auto lg:overflow-hidden"
          >
            <IconLogout className="h-[18px] w-[18px] shrink-0" />
            <span className={label}>Sair</span>
          </button>
        )}

        {user && (
          <div
            className={`flex items-center gap-2.5 rounded-[12px] border border-border bg-surface-2 px-2.5 py-2.5 lg:mt-auto ${
              collapsed ? "lg:flex-col lg:gap-1 lg:border-transparent lg:bg-transparent lg:px-[3px] lg:py-0" : ""
            }`}
          >
            <span
              title={collapsed ? user.name : undefined}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-extrabold text-accent-strong"
            >
              {initials(user.name)}
            </span>
            <span className={`flex min-w-0 flex-1 flex-col leading-tight ${collapsed ? "lg:hidden" : ""}`}>
              <span className="truncate text-[13px] font-bold text-ink">{user.name}</span>
              <span className="text-[11.5px] text-muted">{user.role === "admin" ? "Administrador" : "Acesso RH"}</span>
            </span>
            <button
              type="button"
              onClick={onChangePassword}
              aria-label="Trocar minha senha"
              title="Trocar minha senha"
              className={`rounded-[8px] p-1.5 text-muted transition hover:bg-surface hover:text-ink ${collapsed ? "lg:hidden" : ""}`}
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

      <main className="relative flex min-w-0 flex-1 flex-col gap-6 px-4 py-6 sm:px-8 lg:py-7">
        {busy && (
          <span
            role="progressbar"
            aria-label="Carregando"
            className={`pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden ${collapsed ? "lg:left-[62px]" : "lg:left-60"}`}
          >
            <span className="rh-progress block h-full w-2/5 rounded-full bg-ink/70" />
          </span>
        )}
        {/* Cada seção (e a ficha) aparece em cascata curta: cabeçalho, indicadores e conteúdo. */}
        <div key={`${String(active)}-${hideHeader ? "ficha" : "secao"}`} className="rh-stagger flex min-w-0 flex-col gap-6">
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
              CFF Group · {moduleLabel}
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
        </div>
      </main>
    </div>
  );
}
