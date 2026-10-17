import { MonthTotals, pluralDias } from "@/lib/attendance";
import { IconCalendarPlus, IconMedical, IconUserPlus, IconUsers, IconUserX } from "../icons";

interface AttendanceStatsProps {
  activeEmployees: number;
  totals: MonthTotals;
  periodLabel: string;
  /** Onboardings em andamento (e quantos já podem ser concluídos); some enquanto carrega. */
  onboardings?: { open: number; ready: number } | null;
}

export function AttendanceStats({ activeEmployees, totals, periodLabel, onboardings }: AttendanceStatsProps) {
  const cards = [
    { label: "Colaboradores ativos", value: activeEmployees, detail: "no cadastro", icon: IconUsers },
    {
      label: "Faltas",
      value: totals.faltas,
      detail:
        totals.faltas > 0
          ? `${periodLabel} · ${totals.faltasInjustificadas} sem justificativa`
          : periodLabel,
      icon: IconUserX,
    },
    {
      label: "Atestados",
      value: totals.atestados,
      detail: totals.diasAtestado > 0 ? `${periodLabel} · ${pluralDias(totals.diasAtestado)} no total` : periodLabel,
      icon: IconMedical,
    },
    {
      label: "Folgas",
      value: totals.folgas,
      detail: totals.diasFolga > 0 ? `${periodLabel} · ${pluralDias(totals.diasFolga)} concedidos` : periodLabel,
      icon: IconCalendarPlus,
    },
    ...(onboardings
      ? [
          {
            label: "Onboardings",
            value: onboardings.open,
            detail: onboardings.ready > 0 ? `em andamento · ${onboardings.ready} pronto(s)` : "em andamento",
            icon: IconUserPlus,
          },
        ]
      : []),
  ];

  return (
    <section aria-label="Resumo do período" className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
      {cards.map((card) => (
        <div key={card.label} className="flex flex-col gap-2.5 rounded-[14px] border border-border bg-surface p-4">
          <span className="flex items-center justify-between gap-2 text-[12.5px] font-semibold text-muted">
            {card.label}
            <card.icon className="h-4 w-4 shrink-0 text-muted" />
          </span>
          <span className="font-display text-[30px] font-bold leading-none tabular-nums text-ink">{card.value}</span>
          <span className="truncate text-xs text-muted" title={card.detail}>
            {card.detail}
          </span>
        </div>
      ))}
    </section>
  );
}
