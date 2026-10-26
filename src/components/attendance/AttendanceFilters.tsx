"use client";

import { OCCURRENCE_LABEL, OCCURRENCE_TYPES, OccurrenceType, monthKeyLabel } from "@/lib/attendance";
import { IconSearch } from "../icons";

export type AttendanceTabKey = "ocorrencias" | "colaboradores" | "aniversariantes" | "relatorios" | "admissoes" | "acessos";

export const ALL_MONTHS = "todos";

export type TeamView = "lista" | "organograma";

const TEAM_VIEWS: { key: TeamView; label: string }[] = [
  { key: "lista", label: "Lista" },
  { key: "organograma", label: "Organograma" },
];

interface AttendanceFiltersProps {
  tab: AttendanceTabKey;
  months: string[];
  month: string;
  onMonthChange: (value: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  type: OccurrenceType | "";
  onTypeChange: (value: OccurrenceType | "") => void;
  departments: string[];
  department: string;
  onDepartmentChange: (value: string) => void;
  showInactive: boolean;
  onShowInactiveChange: (value: boolean) => void;
  teamView: TeamView;
  onTeamViewChange: (value: TeamView) => void;
  onExport: () => void;
  exportDisabled: boolean;
}

const selectClass =
  "h-10 w-full rounded-[10px] border border-border bg-surface-2 px-3 text-sm text-ink focus:border-accent focus:outline-none";

export function AttendanceFilters(props: AttendanceFiltersProps) {
  const { tab } = props;

  return (
    <section
      aria-label="Filtros"
      className="flex flex-wrap items-end gap-3 rounded-[14px] border border-border bg-surface px-4 py-3"
    >
      {/* Aniversariantes troca de mês no próprio cartão. */}
      {tab !== "aniversariantes" && (
        <Field label="Mês" className="w-full sm:w-44">
          <select value={props.month} onChange={(e) => props.onMonthChange(e.target.value)} className={selectClass}>
            {tab !== "relatorios" && <option value={ALL_MONTHS}>Todo o período</option>}
            {props.months.map((m) => (
              <option key={m} value={m}>
                {monthKeyLabel(m)}
              </option>
            ))}
          </select>
        </Field>
      )}

      {tab !== "relatorios" && (
        <Field label="Buscar" className="w-full sm:w-64">
          <div className="relative">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={props.search}
              onChange={(e) => props.onSearchChange(e.target.value)}
              placeholder={tab === "ocorrencias" ? "Colaborador ou observação" : "Nome ou cargo"}
              className="h-10 w-full rounded-[10px] border border-border bg-surface-2 pl-9 pr-3 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </div>
        </Field>
      )}

      {tab === "ocorrencias" && (
        <Field label="Tipo" className="w-full sm:w-40">
          <select
            value={props.type}
            onChange={(e) => props.onTypeChange(e.target.value as OccurrenceType | "")}
            className={selectClass}
          >
            <option value="">Todos os tipos</option>
            {OCCURRENCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {OCCURRENCE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Setor" className="w-full sm:w-44">
        <select
          value={props.department}
          onChange={(e) => props.onDepartmentChange(e.target.value)}
          className={selectClass}
        >
          <option value="">Todos os setores</option>
          {props.departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </Field>

      {tab === "colaboradores" && (
        <label className="flex h-10 items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={props.showInactive}
            onChange={(e) => props.onShowInactiveChange(e.target.checked)}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          Mostrar inativos
        </label>
      )}

      {tab === "colaboradores" && (
        <div
          role="group"
          aria-label="Forma de ver a equipe"
          className="flex h-10 items-center rounded-[10px] border border-border bg-surface-2 p-1 sm:ml-auto"
        >
          {TEAM_VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              aria-pressed={props.teamView === v.key}
              onClick={() => props.onTeamViewChange(v.key)}
              className={`h-full rounded-[7px] px-3 text-[13px] font-semibold transition active:scale-95 ${
                props.teamView === v.key ? "bg-accent text-accent-ink" : "text-muted hover:text-ink"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}

      {tab === "ocorrencias" && (
        <button
          type="button"
          onClick={props.onExport}
          disabled={props.exportDisabled}
          className="h-10 rounded-[10px] border border-border-strong px-4 text-xs font-semibold text-ink transition hover:bg-ink hover:text-bg disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-ink sm:ml-auto"
        >
          Exportar CSV
        </button>
      )}
    </section>
  );
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-1.5 text-sm ${className}`}>
      <span className="text-xs font-semibold text-muted">{label}</span>
      {children}
    </label>
  );
}
