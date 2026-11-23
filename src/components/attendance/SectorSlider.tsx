"use client";

import { useLayoutEffect, useRef, useState } from "react";

export interface SectorOption {
  /** "" = todos os setores. */
  key: string;
  label: string;
  count: number;
}

/**
 * Faixa de setores (aba Colaboradores): a caixinha de destaque desliza até o setor
 * escolhido; setas do teclado passam para o vizinho.
 */
export function SectorSlider({
  options,
  value,
  onChange,
}: {
  options: SectorOption[];
  value: string;
  onChange: (key: string) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ x: number; w: number; h: number } | null>(null);
  const [moves, setMoves] = useState(false);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const el = list.querySelector<HTMLElement>('[aria-selected="true"]');
      setPill(el ? { x: el.offsetLeft, w: el.offsetWidth, h: el.offsetHeight } : null);
      // Traz o setor escolhido para a vista quando a faixa rola.
      el?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: moves ? "smooth" : "auto" });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    const timer = setTimeout(() => setMoves(true), 100);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
    // "moves" só decide se a rolagem é suave; não precisa medir de novo quando muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, options]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = options.findIndex((o) => o.key === value);
    const next = options[Math.min(options.length - 1, Math.max(0, i + (e.key === "ArrowRight" ? 1 : -1)))];
    if (next && next.key !== value) {
      onChange(next.key);
      listRef.current?.querySelector<HTMLElement>(`[data-setor="${CSS.escape(next.key)}"]`)?.focus();
    }
  }

  return (
    <div className="rounded-[14px] neon-cinza border bg-surface p-1.5">
      <div
        ref={listRef}
        role="tablist"
        aria-label="Setores"
        onKeyDown={onKeyDown}
        className="relative flex gap-1 overflow-x-auto [scrollbar-width:none]"
      >
        {pill && (
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute left-0 top-0 rounded-[10px] bg-accent-soft ${moves ? "rh-pill" : ""}`}
            style={{ transform: `translateX(${pill.x}px)`, width: pill.w, height: pill.h }}
          >
            <span className="absolute bottom-0 left-1/2 h-[3px] w-5 -translate-x-1/2 rounded-full bg-ink" />
          </span>
        )}
        {options.map((o) => {
          const selected = o.key === value;
          return (
            <button
              key={o.key || "todos"}
              type="button"
              role="tab"
              data-setor={o.key}
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(o.key)}
              className={`relative flex shrink-0 items-center gap-2 rounded-[10px] px-3.5 py-2 text-[13px] transition ${
                selected ? "font-bold text-ink" : "font-semibold text-muted hover:bg-surface-2 hover:text-ink"
              }`}
            >
              <span className="whitespace-nowrap">{o.label}</span>
              <span
                className={`min-w-6 rounded-full px-1.5 py-px text-center font-mono text-[11px] tabular-nums ${
                  selected ? "bg-ink text-bg" : "bg-surface-2 text-muted"
                }`}
              >
                {o.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Conteúdo de um setor: ao trocar, entra deslizando do lado do setor escolhido
 * (da direita se ele está depois do anterior, da esquerda se está antes). No toque,
 * arrastar para os lados passa para o setor vizinho.
 */
export function SectorSlide({
  index,
  count,
  onSwipe,
  children,
}: {
  index: number;
  count: number;
  onSwipe: (index: number) => void;
  children: React.ReactNode;
}) {
  const [state, setState] = useState({ index, dir: "next" as "next" | "prev", moved: false });
  if (state.index !== index) setState({ index, dir: index > state.index ? "next" : "prev", moved: true });
  const touch = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      className="overflow-x-clip"
      onTouchStart={(e) => {
        const t = e.touches[0];
        touch.current = { x: t.clientX, y: t.clientY };
      }}
      onTouchEnd={(e) => {
        const start = touch.current;
        touch.current = null;
        if (!start) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - start.x;
        const dy = t.clientY - start.y;
        if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        const next = index + (dx < 0 ? 1 : -1);
        if (next >= 0 && next < count) onSwipe(next);
      }}
    >
      <div key={index} className={state.moved ? (state.dir === "next" ? "rh-slide-next" : "rh-slide-prev") : ""}>
        {children}
      </div>
    </div>
  );
}
