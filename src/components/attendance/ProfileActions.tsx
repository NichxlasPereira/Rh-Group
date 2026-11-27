"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "../Button";
import { IconChevronDown } from "../icons";

export interface ProfileAction {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  /** Ação sensível (ex.: desligar): fica em vermelho. */
  danger?: boolean;
}

/**
 * Caixa "Ações" do cabeçalho da ficha: um botão só que abre a lista de ações.
 * A lista abre por cima de tudo (a faixa recorta o que passa da borda), alinhada
 * à direita do botão, e fecha com clique fora, Esc ou rolagem.
 */
export function ProfileActions({ actions }: { actions: ProfileAction[] }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const r = buttonRef.current?.getBoundingClientRect();
    if (r)
      setPos({
        top: r.bottom + 8,
        right: Math.max(8, window.innerWidth - r.right),
      });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    menuRef.current
      ?.querySelector<HTMLButtonElement>("[role=menuitem]")
      ?.focus({ preventScroll: true });
    const inside = (t: EventTarget | null) =>
      t instanceof Node &&
      (menuRef.current?.contains(t) || buttonRef.current?.contains(t));
    const onDown = (e: MouseEvent) => {
      if (!inside(e.target)) setOpen(false);
    };
    const onScroll = (e: Event) => {
      if (!inside(e.target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      setOpen(false);
      buttonRef.current?.querySelector("button")?.focus();
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", () => setOpen(false), { once: true });
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open, pos]);

  function onMenuKey(e: React.KeyboardEvent) {
    if (e.key === "Tab") return setOpen(false);
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [
      ...(menuRef.current?.querySelectorAll<HTMLButtonElement>(
        "[role=menuitem]",
      ) ?? []),
    ];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      e.key === "ArrowDown"
        ? (i + 1) % items.length
        : (i - 1 + items.length) % items.length;
    items[next]?.focus();
  }

  return (
    <>
      <span ref={buttonRef} className="inline-flex">
        <Button
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="!h-10 !rounded-[10px] !px-4 !py-0 text-[13px]"
        >
          Ações
          <IconChevronDown
            className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`}
          />
        </Button>
      </span>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label="Ações da ficha"
            onKeyDown={onMenuKey}
            style={{ top: pos.top, right: pos.right }}
            className="fixed z-[70] flex w-60 flex-col rounded-[14px] border border-border bg-surface p-1.5 text-ink shadow-[0_18px_40px_-18px_rgba(0,0,0,0.6)]"
          >
            {actions.map((a) => (
              <button
                key={a.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  a.onClick();
                }}
                className={`flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-[13.5px] font-semibold outline-none transition hover:bg-surface-2 focus-visible:bg-surface-2 ${
                  a.danger ? "text-critical" : "text-ink"
                }`}
              >
                <span
                  className={`shrink-0 ${a.danger ? "text-critical" : "text-muted"}`}
                >
                  {a.icon}
                </span>
                {a.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
