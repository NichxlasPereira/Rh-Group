"use client";

import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { IconCheck, IconChevronDown, IconSearch } from "./icons";

/**
 * Lista de escolha do sistema (no lugar do <select> do navegador): mesmo campo fechado,
 * painel arredondado no tema, grupos, ✓ na opção escolhida, busca quando há muitas opções
 * e teclado (setas, Enter, Esc). Usa os mesmos filhos do <select>: <option> e <optgroup>.
 */

type Item = { value: string; label: string; disabled: boolean; group: string | null };

interface SelectProps {
  value: string | number;
  onChange: (e: { target: { value: string } }) => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  id?: string;
  title?: string;
  "aria-label"?: string;
}

const SEARCH_FROM = 9;
const PANEL_MAX = 320;

function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return "";
}

function collect(children: ReactNode, group: string | null, out: Item[]) {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const el = child as ReactElement<{ children?: ReactNode; value?: string | number; label?: string; disabled?: boolean }>;
    if (el.type === Fragment) collect(el.props.children, group, out);
    else if (el.type === "optgroup") collect(el.props.children, el.props.label ?? "", out);
    else if (el.type === "option") {
      const label = textOf(el.props.children);
      out.push({ value: String(el.props.value ?? label), label, disabled: Boolean(el.props.disabled), group });
    }
  });
  return out;
}

export function Select({ value, onChange, children, className = "", disabled, id, title, "aria-label": ariaLabel }: SelectProps) {
  const items = collect(children, null, []);
  const current = String(value ?? "");
  const selected = items.find((i) => i.value === current) ?? null;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState<{ top: number; left: number; width: number; up: boolean } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const place = () => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(Math.max(r.width, 224), window.innerWidth - 16);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    const below = window.innerHeight - r.bottom;
    const up = below < Math.min(PANEL_MAX, 220) && r.top > below;
    setPos({ top: up ? r.top - 6 : r.bottom + 6, left, width, up });
  };

  useLayoutEffect(() => {
    if (open) place();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const inside = (t: EventTarget | null) =>
      t instanceof Node && (panelRef.current?.contains(t) || triggerRef.current?.contains(t));
    const onDown = (e: MouseEvent) => {
      if (!inside(e.target)) setOpen(false);
    };
    const onScroll = (e: Event) => {
      if (!inside(e.target)) setOpen(false);
    };
    // Esc fecha só a lista (não a janela em volta).
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", place);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  // Ao abrir: foco na opção escolhida (ou na busca), já visível na lista.
  useEffect(() => {
    if (!open || !pos) return;
    const panel = panelRef.current;
    if (!panel) return;
    const search = panel.querySelector<HTMLInputElement>("input");
    const chosen = panel.querySelector<HTMLButtonElement>('[aria-selected="true"]');
    chosen?.scrollIntoView({ block: "nearest" });
    (search ?? chosen ?? panel.querySelector<HTMLButtonElement>("[role=option]:not(:disabled)"))?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, Boolean(pos)]);

  function close() {
    setOpen(false);
    setQuery("");
  }

  function pick(v: string) {
    close();
    triggerRef.current?.focus();
    if (v !== current) onChange({ target: { value: v } });
  }

  function onTriggerKey(e: ReactKeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
    }
  }

  function onPanelKey(e: ReactKeyboardEvent) {
    if (e.key === "Tab") {
      close();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const options = [...(panelRef.current?.querySelectorAll<HTMLButtonElement>("[role=option]:not(:disabled)") ?? [])];
    if (!options.length) return;
    const i = options.indexOf(document.activeElement as HTMLButtonElement);
    let next = i;
    if (e.key === "Home") next = 0;
    else if (e.key === "End") next = options.length - 1;
    else if (e.key === "ArrowDown") next = i < 0 ? 0 : Math.min(options.length - 1, i + 1);
    else next = i <= 0 ? -1 : i - 1;
    if (next < 0) panelRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    else options[next].focus();
  }

  const term = query.trim().toLowerCase();
  const visible = term ? items.filter((i) => i.label.toLowerCase().includes(term)) : items;
  const groups: { name: string | null; items: Item[] }[] = [];
  for (const it of visible) {
    const last = groups[groups.length - 1];
    if (last && last.name === it.group) last.items.push(it);
    else groups.push({ name: it.group, items: [it] });
  }

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        title={title}
        disabled={disabled}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={onTriggerKey}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel ? `${ariaLabel}: ${selected?.label ?? ""}` : undefined}
        className={`${className} inline-flex cursor-pointer items-center gap-2 text-left disabled:cursor-not-allowed ${open ? "border-accent" : ""}`}
      >
        {/* Todas as opções no mesmo lugar (invisíveis): o campo fica com a largura da maior, como o do navegador. */}
        <span className="grid min-w-0 flex-1">
          {items.map((it, i) => (
            <span
              key={i}
              aria-hidden={it !== selected}
              className={`col-start-1 row-start-1 truncate ${it === selected ? "" : "invisible"}`}
            >
              {it.label}
            </span>
          ))}
          {!selected && <span className="col-start-1 row-start-1 truncate text-muted">Selecione…</span>}
        </span>
        <IconChevronDown className={`h-4 w-4 shrink-0 text-muted transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            onKeyDown={onPanelKey}
            style={{
              left: pos.left,
              width: pos.width,
              ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }),
            }}
            className="fixed z-[70] flex flex-col overflow-hidden rounded-[14px] border border-border bg-surface text-ink shadow-[0_18px_40px_-18px_rgba(0,0,0,0.6)]"
          >
            {items.length >= SEARCH_FROM && (
              <div className="border-b border-border p-2">
                <label className="relative flex">
                  <span className="sr-only">Buscar</span>
                  <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const first = visible.find((i) => !i.disabled);
                        if (first) pick(first.value);
                      }
                    }}
                    placeholder="Buscar"
                    className="h-9 w-full rounded-[10px] border border-border bg-surface-2 pl-9 pr-3 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
                  />
                </label>
              </div>
            )}
            <div
              id={listId}
              role="listbox"
              aria-label={ariaLabel}
              className="flex flex-col overflow-y-auto overscroll-contain p-1.5"
              style={{ maxHeight: Math.min(PANEL_MAX, Math.max(160, (pos.up ? pos.top : window.innerHeight - pos.top) - 16)) }}
            >
              {groups.map((g, gi) => (
                <div key={`${g.name ?? ""}-${gi}`} role={g.name ? "group" : undefined} aria-label={g.name ?? undefined} className="flex flex-col">
                  {g.name && (
                    <span className="px-3 pb-1 pt-2.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted">{g.name}</span>
                  )}
                  {g.items.map((it, i) => {
                    const isSel = it.value === current;
                    return (
                      <button
                        key={i}
                        type="button"
                        role="option"
                        aria-selected={isSel}
                        disabled={it.disabled}
                        onClick={() => pick(it.value)}
                        className={`flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left text-[13.5px] outline-none transition hover:bg-surface-2 focus-visible:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                          isSel ? "bg-surface-2 font-semibold" : ""
                        }`}
                      >
                        <span className="min-w-0 flex-1">{it.label || "—"}</span>
                        <IconCheck className={`h-4 w-4 shrink-0 text-brand ${isSel ? "" : "invisible"}`} />
                      </button>
                    );
                  })}
                </div>
              ))}
              {visible.length === 0 && <span className="px-3 py-4 text-center text-sm text-muted">Nada encontrado.</span>}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
