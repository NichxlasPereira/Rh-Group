"use client";

import { useMemo, useState } from "react";
import {
  OCCURRENCE_LABEL,
  OCCURRENCE_TYPES,
  Occurrence,
  OccurrenceType,
  monthKeyLabel,
  monthTotals,
  overlapsMonth,
  summarizeByEmployee,
} from "@/lib/attendance";
import { WEEKDAY_LABELS } from "@/lib/reports";
import { DonutChart } from "../DonutChart";
import { IconCalendarPlus, IconInfo } from "../icons";
import { NO_SECTOR, OccurrenceDrillModal } from "./OccurrenceDrillModal";

interface AttendanceReportsProps {
  occurrences: Occurrence[];
  month: string;
  months: string[];
  /** Abre uma ocorrência (a partir do detalhe dos gráficos). */
  onOpenOccurrence?: (o: Occurrence) => void;
}

type Drill = { type: OccurrenceType | null; sector: string | null };

export function AttendanceReports({ occurrences, month, months, onOpenOccurrence }: AttendanceReportsProps) {
  // Detalhe aberto ao clicar num gráfico (tipo e/ou empresa).
  const [drill, setDrill] = useState<Drill | null>(null);
  const inMonth = useMemo(() => occurrences.filter((o) => overlapsMonth(o, month)), [occurrences, month]);

  const ranking = useMemo(
    () =>
      summarizeByEmployee(occurrences, month).sort(
        (a, b) =>
          b.faltasInjustificadas - a.faltasInjustificadas ||
          b.faltas - a.faltas ||
          b.diasAtestado - a.diasAtestado ||
          b.diasFolga - a.diasFolga
      ),
    [occurrences, month]
  );

  const byType = OCCURRENCE_TYPES.map((t) => ({
    label: OCCURRENCE_LABEL[t],
    value: inMonth.filter((o) => o.type === t).length,
  }));

  // Faltas acontecem num dia só — o dia da semana diz algo sobre padrões.
  // Atestados e folgas cobrem períodos e ficam de fora.
  const byWeekday = useMemo(() => {
    const counts = WEEKDAY_LABELS.map((label) => ({ label, value: 0 }));
    for (const o of inMonth) {
      if (o.type !== "falta") continue;
      counts[new Date(o.date).getUTCDay()].value += 1;
    }
    return counts;
  }, [inMonth]);

  const byDepartment = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of inMonth) {
      const key = o.employeeDepartment?.trim() || NO_SECTOR;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [inMonth]);

  const history = useMemo(
    () =>
      [...months]
        .sort()
        .reverse()
        .filter((m) => m <= month)
        .slice(0, 6)
        .map((m) => ({ month: m, ...monthTotals(occurrences, m) })),
    [occurrences, months, month]
  );

  if (inMonth.length === 0) {
    return (
      <div className="rounded-[14px] border border-border bg-surface px-6 py-16 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-muted">
          <IconCalendarPlus className="h-6 w-6" />
        </div>
        <p className="font-medium text-ink">Nenhuma ocorrência em {monthKeyLabel(month)}</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
          Escolha outro mês no filtro ao lado, ou registre faltas, atestados e folgas para ver quem
          mais se ausenta, os dias da semana mais críticos e a evolução mês a mês.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3 rounded-[14px] border border-border bg-surface px-4 py-3 text-sm text-muted">
        <IconInfo className="mt-0.5 h-5 w-5 shrink-0 text-accent-strong" />
        <p>
          {monthKeyLabel(month)}: {inMonth.length} {inMonth.length === 1 ? "ocorrência" : "ocorrências"} de{" "}
          {ranking.length} {ranking.length === 1 ? "colaborador" : "colaboradores"}. Atestados e folgas que atravessam
          meses contam só os dias que caem neste mês.
        </p>
      </div>

      <div className="rounded-[14px] border border-border bg-surface">
        <h3 className="px-5 pt-5 font-display text-lg font-semibold text-ink">Por colaborador</h3>
        <p className="px-5 pb-3 text-xs text-muted">Ordenado por faltas não justificadas, depois faltas e dias de atestado.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-y border-border bg-surface-2/60 text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-medium">Colaborador</th>
                <th className="px-4 py-3 text-right font-medium">Faltas</th>
                <th className="px-4 py-3 text-right font-medium">Não justif.</th>
                <th className="px-4 py-3 text-right font-medium">Dias de atestado</th>
                <th className="px-4 py-3 text-right font-medium">Dias de folga</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((s) => (
                <tr key={s.key} className="border-b border-border last:border-0 hover:bg-surface-2/40">
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{s.name}</p>
                    <p className="text-xs text-muted">{s.department ?? "Sem setor"}</p>
                  </td>
                  <Num value={s.faltas} />
                  <Num value={s.faltasInjustificadas} highlight />
                  <Num value={s.diasAtestado} />
                  <Num value={s.diasFolga} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Ocorrências por tipo" hint="Clique num tipo para ver quem, por empresa.">
          <DonutChart
            data={byType}
            centerCaption="ocorrências"
            onSelect={(label) => setDrill({ type: OCCURRENCE_TYPES.find((t) => OCCURRENCE_LABEL[t] === label) ?? null, sector: null })}
          />
        </ChartCard>
        <ChartCard title="Faltas por dia da semana">
          {byWeekday.some((d) => d.value > 0) ? (
            <DonutChart data={byWeekday} centerCaption="faltas" />
          ) : (
            <p className="text-sm text-muted">Só há atestados e folgas neste mês.</p>
          )}
        </ChartCard>
        <ChartCard title="Ocorrências por setor" hint="Clique numa empresa para ver os colaboradores.">
          <DonutChart
            data={byDepartment}
            centerCaption="ocorrências"
            onSelect={(label) => setDrill({ type: null, sector: label === "Outros" ? null : label })}
          />
        </ChartCard>
        <ChartCard title="Últimos meses">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-muted">
                <th className="pb-2 font-medium">Mês</th>
                <th className="pb-2 text-right font-medium">Faltas</th>
                <th className="pb-2 text-right font-medium">Dias atest.</th>
                <th className="pb-2 text-right font-medium">Dias folga</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.month} className={`border-t border-border ${h.month === month ? "font-semibold" : ""}`}>
                  <td className="py-2 text-ink">{monthKeyLabel(h.month)}</td>
                  <td className="py-2 text-right font-mono tabular-nums text-ink">{h.faltas}</td>
                  <td className="py-2 text-right font-mono tabular-nums text-ink">{h.diasAtestado}</td>
                  <td className="py-2 text-right font-mono tabular-nums text-ink">{h.diasFolga}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ChartCard>
      </div>

      <OccurrenceDrillModal
        open={drill !== null}
        onClose={() => setDrill(null)}
        occurrences={occurrences}
        month={month}
        type={drill?.type ?? null}
        sector={drill?.sector ?? null}
        onChange={setDrill}
        onOpenOccurrence={
          onOpenOccurrence
            ? (o) => {
                setDrill(null);
                onOpenOccurrence(o);
              }
            : undefined
        }
      />
    </div>
  );
}

function Num({ value, highlight }: { value: number; highlight?: boolean }) {
  return (
    <td
      className={`px-4 py-3 text-right font-mono tabular-nums ${
        value === 0 ? "text-muted" : highlight ? "font-semibold text-critical" : "text-ink"
      }`}
    >
      {value}
    </td>
  );
}

function ChartCard({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[14px] border border-border bg-surface p-5">
      <h3 className={`font-display text-lg font-semibold text-ink ${hint ? "" : "mb-4"}`}>{title}</h3>
      {hint && <p className="mb-4 text-xs text-muted">{hint}</p>}
      {children}
    </div>
  );
}
