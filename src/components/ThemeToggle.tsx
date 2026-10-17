"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconAuto, IconMoon, IconSun } from "./icons";
import {
  applyResolvedTheme,
  readStoredThemeMode,
  resolveTheme,
  THEME_STORAGE_KEY,
  ThemeMode,
} from "@/lib/theme";

const OPTIONS: { mode: ThemeMode; label: string; hint: string; icon: typeof IconSun }[] = [
  { mode: "light", label: "Claro", hint: "Sempre claro", icon: IconSun },
  { mode: "dark", label: "Escuro", hint: "Sempre escuro", icon: IconMoon },
  { mode: "auto", label: "Automático", hint: "Claro de dia, escuro à noite", icon: IconAuto },
];

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>("auto");
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, right: 0 });
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    setMode(readStoredThemeMode());
  }, []);

  useEffect(() => {
    applyResolvedTheme(resolveTheme(mode));

    if (mode !== "auto") return;

    const interval = setInterval(() => {
      applyResolvedTheme(resolveTheme("auto"));
    }, 60_000);

    return () => clearInterval(interval);
  }, [mode]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        buttonRef.current &&
        !buttonRef.current.contains(target) &&
        panelRef.current &&
        !panelRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  function toggleOpen() {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
    setOpen((o) => !o);
  }

  function selectMode(next: ThemeMode) {
    setMode(next);
    setOpen(false);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // localStorage indisponível — a preferência só vale para esta sessão
    }
  }

  const current = OPTIONS.find((o) => o.mode === mode) ?? OPTIONS[2];
  const CurrentIcon = current.icon;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Escolher tema (atual: ${current.label})`}
        aria-expanded={open}
        onClick={toggleOpen}
        className={`flex h-10 w-10 items-center justify-center rounded-full border border-border-strong text-ink transition-colors hover:bg-surface-2 ${
          open ? "bg-surface-2" : ""
        }`}
      >
        <CurrentIcon className="h-[18px] w-[18px]" />
      </button>

      {mounted &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            aria-label="Tema"
            style={{ top: position.top, right: position.right }}
            // Só aparece e some (leve deslize de 4 px), sem encolher: transição discreta.
            className={`fixed z-50 flex w-60 flex-col gap-0.5 rounded-[12px] border border-border bg-surface p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.3)] transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none ${
              open ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0"
            }`}
          >
            <span className="px-2.5 pb-1 pt-1.5 font-display text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
              Tema
            </span>
            {OPTIONS.map(({ mode: optionMode, label, hint, icon: Icon }) => {
              const selected = mode === optionMode;
              return (
                <button
                  key={optionMode}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  tabIndex={open ? 0 : -1}
                  onClick={() => selectMode(optionMode)}
                  className={`flex items-center gap-3 rounded-[8px] px-2.5 py-2 text-left transition ${
                    selected ? "bg-surface-2 text-ink" : "text-muted hover:bg-surface-2 hover:text-ink"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex flex-1 flex-col leading-tight">
                    <span className="text-[13px] font-semibold">{label}</span>
                    <span className="text-[11.5px] text-muted">{hint}</span>
                  </span>
                  {selected && <span className="h-2 w-2 shrink-0 rounded-full bg-brand" aria-hidden="true" />}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}
