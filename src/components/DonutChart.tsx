"use client";

import { useId, useMemo, useState } from "react";
import { formatQuantity } from "@/lib/format";

const SERIES_VARS = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
  "var(--series-7)",
];

const MAX_SLOTS = SERIES_VARS.length;

export interface DonutDatum {
  label: string;
  value: number;
}

interface DonutChartProps {
  data: DonutDatum[];
  centerCaption: string;
  /** Com isto, cada fatia e cada linha da legenda viram clicáveis (abrem o detalhe). */
  onSelect?: (label: string) => void;
}

interface Slice extends DonutDatum {
  color: string;
  pct: number;
  offsetPct: number;
}

function foldToSlots(data: DonutDatum[]): DonutDatum[] {
  if (data.length <= MAX_SLOTS) return data;
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const kept = sorted.slice(0, MAX_SLOTS - 1);
  const rest = sorted.slice(MAX_SLOTS - 1);
  const restTotal = rest.reduce((sum, d) => sum + d.value, 0);
  return [...kept, { label: "Outros", value: restTotal }];
}

export function DonutChart({ data, centerCaption, onSelect }: DonutChartProps) {
  const gradientId = useId();
  const [hovered, setHovered] = useState<number | null>(null);

  const { slices, total } = useMemo(() => {
    const folded = foldToSlots(data);
    const totalValue = folded.reduce((sum, d) => sum + d.value, 0);
    const { list } = folded.reduce<{ acc: number; list: Slice[] }>(
      (state, d, i) => {
        const pct = totalValue > 0 ? (d.value / totalValue) * 100 : 0;
        const slice: Slice = {
          ...d,
          color: SERIES_VARS[i % SERIES_VARS.length],
          pct,
          offsetPct: state.acc,
        };
        return { acc: state.acc + pct, list: [...state.list, slice] };
      },
      { acc: 0, list: [] }
    );
    return { slices: list, total: totalValue };
  }, [data]);

  const size = 160;
  const strokeWidth = 26;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const visibleCount = slices.filter((s) => s.value > 0).length;
  const gap = visibleCount > 1 ? circumference * 0.012 : 0;

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          viewBox={`0 0 ${size} ${size}`}
          width={size}
          height={size}
          className="-rotate-90"
          role="img"
          aria-label={`Gráfico em rosca: ${centerCaption}`}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--surface-2)"
            strokeWidth={strokeWidth}
          />
          {slices.map((slice, i) => {
            if (slice.value <= 0) return null;
            const rawLength = (slice.pct / 100) * circumference;
            const length = Math.max(rawLength - gap, 0);
            const offset = (slice.offsetPct / 100) * circumference;
            const isHovered = hovered === i;
            return (
              <circle
                key={`${gradientId}-${slice.label}`}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={slice.color}
                strokeWidth={isHovered ? strokeWidth + 3 : strokeWidth}
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-offset}
                strokeLinecap="round"
                style={{ transition: "stroke-width 0.15s ease", cursor: onSelect ? "pointer" : undefined }}
                onClick={onSelect ? () => onSelect(slice.label) : undefined}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              >
                <title>{`${slice.label}: ${formatQuantity(slice.value)} (${slice.pct.toFixed(0)}%)`}</title>
              </circle>
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-2xl font-semibold tabular-nums text-ink">
            {formatQuantity(total)}
          </span>
          <span className="text-xs text-muted">{centerCaption}</span>
        </div>
      </div>

      <ul className="flex w-full flex-col gap-2">
        {slices.map((slice, i) => {
          const content = (
            <>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: slice.color }} aria-hidden="true" />
              <span className="flex-1 truncate text-left text-ink">{slice.label}</span>
              <span className="font-mono tabular-nums text-muted">
                {formatQuantity(slice.value)} · {slice.pct.toFixed(0)}%
              </span>
            </>
          );
          const rowClass = `flex w-full items-center gap-2 rounded-[8px] px-2 py-1 text-sm transition ${hovered === i ? "bg-surface-2" : ""}`;
          return (
            <li key={slice.label} onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
              {onSelect && slice.value > 0 ? (
                <button type="button" onClick={() => onSelect(slice.label)} className={`${rowClass} cursor-pointer`} title={`Ver ${slice.label}`}>
                  {content}
                </button>
              ) : (
                <div className={rowClass}>{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
