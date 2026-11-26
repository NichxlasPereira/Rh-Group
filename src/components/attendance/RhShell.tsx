"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { ThemeToggle } from "../ThemeToggle";
import { IconBox, IconKey, IconLayoutSide, IconLayoutTop, IconLogout } from "../icons";
import { BrandArt, BrandDot, CffLogo } from "../brand";

export interface RhSection<K extends string> {
  key: K;
  label: string;
  icon: (props: { className?: string }) => React.ReactNode;
  /** Contador ao lado do nome (ex.: documentos para analisar). */
  badge?: number;
}

/** Atalho de configuração no menu da conta (administradores): abre uma tela ou um painel. */
export interface ShellSetting {
  key: string;
  label: string;
  icon: (props: { className?: string }) => React.ReactNode;
  badge?: number;
  onClick: () => void;
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
  /** Configurações no menu da conta (Acessos, kits do Slack...). */
  settings?: ShellSetting[];
  /** Botão extra ao lado do tema (ex.: guia da demonstração). */
  extra?: React.ReactNode;
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

const TOP_MENU_KEY = "menuNoTopo";
// Menu no topo: troca de seção no tempo da entrada da página (rh-fade de 0,22 s + 120 ms de
// cascata); o nome que fecha/abre usa o mesmo tempo no .rh-top-nome do globals.css.
const SWITCH_MS = 240;

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
  settings = [],
  extra,
  title,
  description,
  actions,
  hideHeader = false,
  busy = false,
  children,
}: RhShellProps<K>) {
  // Menu no topo (barra horizontal) em vez da barra lateral, lembrado neste navegador.
  const [topMenu, setTopMenu] = useState(false);
  useEffect(() => {
    try {
      setTopMenu(localStorage.getItem(TOP_MENU_KEY) === "1");
    } catch {}
  }, []);
  function toggleTopMenu() {
    setTopMenu((v) => {
      try {
        localStorage.setItem(TOP_MENU_KEY, v ? "0" : "1");
      } catch {}
      return !v;
    });
  }

  // Só anima depois da primeira medida, para a marca não "voar" ao abrir a página.
  const [pillMoves, setPillMoves] = useState(false);

  // Menu (no topo ou lateral, só ícones): no clique a página já troca e, junto com a entrada
  // dela, o nome da seção anterior fecha, o da clicada abre e a caixinha desliza de uma para a
  // outra. Feito direto na página (fora do React) para a seção nova, ao carregar, não atrapalhar
  // a animação. Só um dos dois menus existe de cada vez; os dois usam estas referências.
  const topListRef = useRef<HTMLDivElement>(null);
  const topPillRef = useRef<HTMLSpanElement>(null);
  const topAnim = useRef<{ at: K; busy: boolean; timer?: ReturnType<typeof setTimeout>; frame?: number }>({
    at: active,
    busy: false,
  });
  const topItem = (key: K) =>
    topListRef.current?.querySelector<HTMLElement>(`[data-secao="${CSS.escape(String(key))}"]`) ?? null;
  const placeTopPill = (el: HTMLElement | null, smooth: boolean) => {
    const pillEl = topPillRef.current;
    if (!pillEl) return;
    // Tela fora do menu (ex.: Acessos, aberta pelo menu da conta): sem caixinha.
    if (!el) {
      pillEl.style.opacity = "0";
      return;
    }
    pillEl.style.transition = smooth ? "" : "none";
    pillEl.style.opacity = "1";
    pillEl.style.transform = `translate(${el.offsetLeft}px, ${el.offsetTop}px)`;
    pillEl.style.width = `${el.offsetWidth}px`;
    pillEl.style.height = `${el.offsetHeight}px`;
  };
  const openTopName = (key: K | null) => {
    for (const item of topListRef.current?.querySelectorAll<HTMLElement>("[data-secao]") ?? []) {
      if (key !== null && item.dataset.secao === String(key)) item.setAttribute("data-aberto", "");
      else item.removeAttribute("data-aberto");
    }
  };
  const stopTopAnim = () => {
    clearTimeout(topAnim.current.timer);
    if (topAnim.current.frame) cancelAnimationFrame(topAnim.current.frame);
    topAnim.current.busy = false;
  };
  // Fora de uma troca, o menu segue a seção ativa (ao abrir a página, ao mudar de tamanho...).
  useLayoutEffect(() => {
    const list = topListRef.current;
    if (!list) return;
    const sync = () => {
      if (topAnim.current.busy) return;
      topAnim.current.at = active;
      openTopName(active);
      placeTopPill(topItem(active), false);
    };
    sync();
    // A lista e cada seção: no menu lateral a lista não muda de tamanho quando um nome abre.
    const observer = new ResizeObserver(sync);
    observer.observe(list);
    for (const item of list.querySelectorAll<HTMLElement>("[data-secao]")) observer.observe(item);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, sections, topMenu]);
  useEffect(() => stopTopAnim, []);

  function goToTopSection(key: K) {
    const animate =
      pillMoves &&
      window.matchMedia("(min-width: 1024px)").matches &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const from = topItem(topAnim.current.at);
    const to = topItem(key);
    stopTopAnim();
    topAnim.current.at = key;
    if (!animate || !from || !to || from === to) {
      onChange(key);
      return;
    }
    topAnim.current.busy = true;
    onChange(key);
    openTopName(key);
    // As bordas da caixinha vão da seção anterior à clicada, nas posições de cada quadro (os
    // nomes estão fechando e abrindo ao mesmo tempo): na horizontal, de lado; no menu lateral,
    // para cima ou para baixo. O relógio é o horário, não os quadros.
    const start = performance.now();
    const ease = (t: number) => 1 - (1 - t) ** 3;
    const mix = (a: number, b: number, e: number) => a + (b - a) * e;
    const tick = () => {
      const e = ease(Math.min(1, (performance.now() - start) / SWITCH_MS));
      const left = mix(from.offsetLeft, to.offsetLeft, e);
      const top = mix(from.offsetTop, to.offsetTop, e);
      const right = mix(from.offsetLeft + from.offsetWidth, to.offsetLeft + to.offsetWidth, e);
      const pillEl = topPillRef.current;
      if (pillEl) {
        pillEl.style.transition = "none";
        pillEl.style.transform = `translate(${left}px, ${top}px)`;
        pillEl.style.width = `${right - left}px`;
        pillEl.style.height = `${mix(from.offsetHeight, to.offsetHeight, e)}px`;
      }
      topAnim.current.frame = requestAnimationFrame(tick);
    };
    tick();
    topAnim.current.timer = setTimeout(() => {
      if (topAnim.current.frame) cancelAnimationFrame(topAnim.current.frame);
      topAnim.current.busy = false;
      placeTopPill(to, false);
    }, SWITCH_MS + 40);
  }
  useEffect(() => {
    const timer = setTimeout(() => setPillMoves(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // Botões das seções (iguais nos dois menus). Computador: o ícone escolhido sobe, cresce um
  // pouco, fica redondo com o arco neon e mostra o nome logo abaixo, abrindo espaço nos
  // vizinhos (no topo, para os lados; no lateral, para baixo). Celular: faixa com os nomes.
  const topButtons = sections.map((s) => {
    const current = s.key === active;
    return (
      <button
        key={s.key}
        type="button"
        data-secao={String(s.key)}
        onClick={() => goToTopSection(s.key)}
        aria-current={current ? "page" : undefined}
        title={s.label}
        aria-label={s.label}
        className={`rh-dock-item relative flex shrink-0 items-center rounded-[9px] px-2 py-2 text-[13px] transition lg:h-[64px] lg:w-[40px] lg:justify-center lg:p-0 ${
          current ? "font-bold text-ink" : "font-semibold text-muted hover:text-ink lg:hover:bg-transparent hover:bg-surface-2"
        }`}
      >
        <span className="rh-dock-icone relative flex items-center lg:absolute lg:left-1/2 lg:top-1/2 lg:-ml-[17px] lg:-mt-[17px] lg:h-[34px] lg:w-[34px] lg:justify-center lg:rounded-full">
          <s.icon className="h-[17px] w-[17px] shrink-0" />
          {!!s.badge && (
            <span className="absolute -right-0.5 -top-0.5 hidden h-2 w-2 rounded-full bg-brand ring-2 ring-surface lg:block" />
          )}
        </span>
        <span className="ml-1.5 whitespace-nowrap lg:hidden">{s.label}</span>
        {!!s.badge && (
          <span className="ml-1.5 min-w-5 rounded-full bg-brand px-1.5 py-px text-center text-[11px] font-bold tabular-nums text-white lg:hidden">
            {s.badge}
          </span>
        )}
        <span className="rh-dock-nome pointer-events-none absolute bottom-0 left-1/2 -ml-[80px] hidden w-[160px] justify-center whitespace-nowrap font-display text-[10px] font-medium uppercase leading-[13px] tracking-[0.18em] text-ink lg:flex">
          {s.label}
        </span>
      </button>
    );
  });
  const content = (
      <main className="relative flex min-w-0 flex-1 flex-col gap-6 px-4 py-6 sm:px-8 lg:py-7">
        {busy && (
          <span
            role="progressbar"
            aria-label="Carregando"
            className={`pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden ${topMenu ? "" : "lg:left-[96px]"}`}
          >
            <span className="rh-progress block h-full w-2/5 rounded-full bg-ink/70" />
          </span>
        )}
        {!hideHeader && (
          <>
        {/* Faixa grafite do cartão da CFFGROUP: sempre no tema escuro. */}
        <header
          data-theme="dark"
          className="brand-band relative flex flex-col items-start gap-4 overflow-clip rounded-[18px] px-5 py-6 text-ink shadow-[0_18px_40px_-24px_rgba(0,0,0,0.6)] sm:px-7 sm:pr-[300px]"
        >
          <BrandArt variant="band" className="pointer-events-none absolute right-0 top-0 hidden h-full w-[340px] text-white/[0.12] sm:block" />
          {/* A faixa fica parada na troca de seção; só os textos e os botões entram de novo. Os
              botões ficam embaixo do título, à esquerda, deixando o logo da direita à vista. */}
          <div key={`${String(active)}-titulo`} className="rh-fade relative flex flex-col gap-2">
            <span className="font-display text-[11.5px] font-medium uppercase tracking-[0.2em] text-white/75">
              CFF Group · {moduleLabel}
            </span>
            <h1 className="font-display text-[32px] font-semibold uppercase leading-none tracking-[0.02em] text-white sm:text-[38px]">
              {title}
              <BrandDot className="ml-1 h-2.5 w-2.5 align-baseline" />
            </h1>
            {/* Altura fixa (duas linhas) para a faixa não mudar de tamanho de uma aba para outra. */}
            <p className="line-clamp-2 min-h-[2.5rem] max-w-[62ch] text-sm leading-5 text-white/85" title={description}>
              {description}
            </p>
          </div>
          <div key={`${String(active)}-acoes`} className="rh-fade relative flex min-h-10 flex-wrap items-center gap-2.5">
            {actions}
          </div>
        </header>
          </>
        )}
        {/* O conteúdo de cada seção (e a ficha) entra em cascata curta. */}
        <div key={`${String(active)}-${hideHeader ? "ficha" : "secao"}`} className="rh-stagger flex min-w-0 flex-col gap-6">
          {children}
        </div>
      </main>
  );

  if (topMenu) {
    return (
      <div className="flex flex-1 flex-col">
        {/* Menu no topo: logo, seções lado a lado, outros módulos e a conta, numa barra só. */}
        <div className="flex flex-col gap-3 border-b border-border bg-surface px-3 py-3 lg:sticky lg:top-0 lg:z-40 lg:flex-row lg:items-center lg:gap-5 lg:px-6 lg:py-2">
          <div className="flex items-center justify-between gap-3 px-2 lg:px-0">
            <div className="flex items-center gap-3">
              <CffLogo className="h-7 w-auto text-ink" />
              <span className="border-l border-border-strong pl-3 font-display text-[13px] font-medium uppercase tracking-[0.18em] text-muted">
                {moduleLabel}
              </span>
            </div>
            <div className="flex items-center gap-2 lg:hidden">
              {extra}
              <ThemeToggle />
            </div>
          </div>

          <nav aria-label={`Seções do ${moduleLabel}`} className="min-w-0">
            <div
              ref={topListRef}
              data-anima={pillMoves ? "" : undefined}
              className="relative -mx-1 flex gap-0.5 overflow-x-auto px-1 pb-1 lg:gap-0 lg:overflow-visible lg:px-2 lg:pb-0"
            >
              {/* Celular: caixinha da seção atual (posição de placeTopPill). No computador quem
                  marca a seção é o próprio ícone, que sobe (data-aberto). */}
              <span
                ref={topPillRef}
                aria-hidden="true"
                className="rh-pill-suave pointer-events-none absolute left-0 top-0 rounded-[9px] bg-accent-soft opacity-0 lg:hidden"
              >
                <span className="absolute bottom-0 left-1/2 h-[3px] w-4 -translate-x-1/2 rounded-full bg-ink" />
              </span>
              {topButtons}
            </div>
          </nav>

          {/* À direita só o tema e a conta; o resto (outros módulos, senha, menu lateral, sair) fica no menu da conta. */}
          <div className="flex shrink-0 items-center justify-end gap-2 px-1 lg:ml-auto lg:px-0">
            <div className="hidden items-center gap-2 lg:flex">
              {extra}
              <ThemeToggle />
            </div>
            <AccountMenu
              user={user}
              otherModules={otherModules}
              settings={settings}
              onChangePassword={onChangePassword}
              onLogout={onLogout}
              switchLabel="Usar menu lateral"
              onSwitchMenu={toggleTopMenu}
            />
          </div>
        </div>
        {content}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      {/* Menu lateral: barra fina só com os ícones, como o do topo. A seção aberta mostra o nome
          numa caixinha que passa da barra; embaixo, só o tema e a conta. */}
      <aside className="relative z-30 flex shrink-0 flex-col gap-3 border-b border-border bg-surface px-3 py-3 lg:sticky lg:top-0 lg:h-screen lg:w-[96px] lg:gap-6 lg:border-b-0 lg:border-r lg:px-0 lg:py-5">
        <div className="flex items-center justify-between gap-3 px-2 lg:justify-center lg:px-0">
          <div className="flex items-center gap-3">
            <CffLogo className="h-7 w-auto text-ink lg:h-auto lg:w-14" />
            <span className="border-l border-border-strong pl-3 font-display text-[13px] font-medium uppercase tracking-[0.18em] text-muted lg:hidden">
              {moduleLabel}
            </span>
          </div>
          <div className="flex items-center gap-2 lg:hidden">
            {extra}
            <ThemeToggle />
            <AccountMenu
              user={user}
              otherModules={otherModules}
              settings={settings}
              onChangePassword={onChangePassword}
              onLogout={onLogout}
              switchLabel="Usar menu no topo"
              onSwitchMenu={toggleTopMenu}
            />
          </div>
        </div>

        <nav aria-label={navLabel} className="min-w-0">
          <div
            ref={topListRef}
            data-anima={pillMoves ? "" : undefined}
            data-dock="lateral"
            className="relative -mx-1 flex gap-0.5 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:items-center lg:gap-0 lg:overflow-visible lg:px-0 lg:pb-0"
          >
            {/* Celular: caixinha da seção atual (posição de placeTopPill). No computador, igual ao
                menu do topo: o ícone escolhido cresce, fica redondo e mostra o nome embaixo. */}
            <span
              ref={topPillRef}
              aria-hidden="true"
              className="rh-pill-suave pointer-events-none absolute left-0 top-0 rounded-[9px] bg-accent-soft opacity-0 lg:hidden"
            >
              <span className="absolute bottom-0 left-1/2 h-[3px] w-4 -translate-x-1/2 rounded-full bg-ink" />
            </span>
            {topButtons}
          </div>
        </nav>

        <div className="hidden lg:mt-auto lg:flex lg:flex-col lg:items-center lg:gap-3">
          {extra}
          <ThemeToggle placement="side" />
          <AccountMenu
            user={user}
            otherModules={otherModules}
            settings={settings}
            onChangePassword={onChangePassword}
            onLogout={onLogout}
            switchLabel="Usar menu no topo"
            onSwitchMenu={toggleTopMenu}
            placement="side"
          />
        </div>
      </aside>

      {content}
    </div>
  );
}

/** Menu da conta: as iniciais abrem um painel com a pessoa, outros módulos, trocar senha,
 *  trocar de menu (topo ou lateral) e sair. */
function AccountMenu({
  user,
  otherModules,
  settings,
  onChangePassword,
  onLogout,
  switchLabel,
  onSwitchMenu,
  placement = "below",
}: {
  user: { name: string; role: "admin" | "member" } | null;
  otherModules: ShellModuleLink[];
  settings: ShellSetting[];
  onChangePassword?: () => void;
  onLogout: () => void;
  switchLabel: string;
  onSwitchMenu: () => void;
  /** side: abre ao lado das iniciais, para cima (rodapé do menu lateral). */
  placement?: "below" | "side";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pending = settings.reduce((n, s) => n + (s.badge ?? 0), 0);
  const item =
    "flex w-full items-center gap-3 rounded-[9px] px-3 py-2 text-left text-[13px] font-semibold text-ink transition hover:bg-surface-2";
  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={user ? `Conta de ${user.name}` : "Conta"}
        title={user?.name}
        className={`relative flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-xs font-extrabold text-accent-strong transition hover:brightness-110 ${
          open ? "ring-2 ring-brand ring-offset-2 ring-offset-surface" : ""
        }`}
      >
        {user ? initials(user.name) : <IconKey className="h-4 w-4" />}
        {/* Algo para ver nas configurações (ex.: pedidos de acesso). */}
        {pending > 0 && (
          <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full bg-brand ring-2 ring-surface" aria-hidden="true" />
        )}
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Conta"
          className={`rh-fade absolute z-50 w-64 ${
            placement === "side" ? "bottom-0 left-[calc(100%+10px)]" : "right-0 top-[calc(100%+8px)]"
          } rounded-[14px] neon-cinza border bg-surface p-1.5 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.55)]`}
        >
          {user && (
            <div className="flex items-center gap-3 px-3 pb-3 pt-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-extrabold text-accent-strong">
                {initials(user.name)}
              </span>
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-sm font-bold text-ink">{user.name}</span>
                <span className="text-xs text-muted">{user.role === "admin" ? "Administrador" : "Acesso RH"}</span>
              </span>
            </div>
          )}
          {settings.length > 0 && (
            <div className="border-t border-border py-1.5">
              <span className="block px-3 pb-1 pt-0.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">Configurações</span>
              {settings.map((st) => (
                <button key={st.key} type="button" role="menuitem" onClick={run(st.onClick)} className={item}>
                  <st.icon className="h-4 w-4 shrink-0 text-muted" />
                  <span className="flex-1">{st.label}</span>
                  {!!st.badge && (
                    <span className="min-w-5 rounded-full bg-brand px-1.5 py-px text-center text-[11px] font-bold tabular-nums text-white">
                      {st.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
          {otherModules.length > 0 && (
            <div className="border-t border-border py-1.5">
              <span className="block px-3 pb-1 pt-0.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">Outros módulos</span>
              {otherModules.map((m) => (
                <Link key={m.href} href={m.href} prefetch={false} role="menuitem" onClick={() => setOpen(false)} className={item}>
                  <m.icon className="h-4 w-4 shrink-0 text-muted" />
                  {m.label}
                </Link>
              ))}
            </div>
          )}
          <div className="border-t border-border py-1.5">
            {onChangePassword && (
              <button type="button" role="menuitem" onClick={run(onChangePassword)} className={item}>
                <IconKey className="h-4 w-4 shrink-0 text-muted" />
                Trocar minha senha
              </button>
            )}
            <button type="button" role="menuitem" onClick={run(onSwitchMenu)} className={`${item} hidden lg:flex`}>
              {placement === "side" ? (
                <IconLayoutTop className="h-4 w-4 shrink-0 text-muted" />
              ) : (
                <IconLayoutSide className="h-4 w-4 shrink-0 text-muted" />
              )}
              {switchLabel}
            </button>
          </div>
          <div className="border-t border-border pt-1.5">
            <button type="button" role="menuitem" onClick={run(onLogout)} className={`${item} hover:text-critical`}>
              <IconLogout className="h-4 w-4 shrink-0 text-muted" />
              Sair
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
