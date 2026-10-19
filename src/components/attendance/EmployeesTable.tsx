"use client";

import { Employee, EmployeeSummary, pluralDias } from "@/lib/attendance";
import { IconCalendarPlus, IconEdit, IconTrash, IconUsers } from "../icons";
import { ActionButton, EmptyState } from "./formControls";

interface EmployeesTableProps {
  employees: Employee[];
  hasAny: boolean;
  summaries: Map<string, EmployeeSummary>;
  folgaRemaining: Map<string, number>;
  periodLabel: string;
  onRegister: (employee: Employee) => void;
  onEdit: (employee: Employee) => void;
  onDelete: (employee: Employee) => void;
  /** Abre a ficha do colaborador. */
  onOpen: (employee: Employee) => void;
}

export function EmployeesTable({
  employees,
  hasAny,
  summaries,
  folgaRemaining,
  periodLabel,
  onRegister,
  onEdit,
  onDelete,
  onOpen,
}: EmployeesTableProps) {
  return (
    <div className="rounded-[14px] border border-border bg-surface">
      {employees.length === 0 ? (
        <EmptyState
          icon={<IconUsers className="h-6 w-6" />}
          title={hasAny ? "Nenhum colaborador encontrado" : "Nenhum colaborador cadastrado"}
          text={
            hasAny
              ? "Ajuste a busca ou o filtro de setor."
              : "Clique em “Novo colaborador” para montar a lista da equipe."
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2/60 text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-medium">Colaborador</th>
                <th className="px-4 py-3 font-medium">Setor</th>
                <th className="px-4 py-3 font-medium">Faltas</th>
                <th className="px-4 py-3 font-medium">Atestados</th>
                <th className="px-4 py-3 font-medium">Folgas</th>
                <th className="px-4 py-3 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => {
                const s = summaries.get(emp.id);
                return (
                  <tr
                    key={emp.id}
                    className={`border-b border-border last:border-0 hover:bg-surface-2/40 ${emp.active ? "" : "opacity-60"}`}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">
                        <button
                          type="button"
                          onClick={() => onOpen(emp)}
                          className="text-left font-semibold text-ink underline-offset-4 hover:underline"
                          title="Abrir ficha"
                        >
                          {emp.name}
                        </button>
                        {!emp.active && (
                          <span className="ml-2 rounded-full border border-border-strong px-2 py-0.5 text-[11px] font-medium text-muted">
                            inativo
                          </span>
                        )}
                      </p>
                      {emp.role && <p className="text-xs text-muted">{emp.role}</p>}
                    </td>
                    <td className="px-4 py-3 text-muted">{emp.department || "—"}</td>
                    <td className="px-4 py-3">
                      <Count value={s?.faltas ?? 0} tone="critical" />
                      {s && s.faltasInjustificadas > 0 && (
                        <span className="block text-xs text-muted">
                          {s.faltasInjustificadas} não {s.faltasInjustificadas === 1 ? "justificada" : "justificadas"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Count value={s?.atestados ?? 0} tone="accent" />
                      {s && s.diasAtestado > 0 && (
                        <span className="block text-xs text-muted">
                          {s.diasAtestado} {s.diasAtestado === 1 ? "dia" : "dias"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <FolgaCell
                        remaining={folgaRemaining.get(emp.id) ?? 0}
                        total={emp.folgaAllowance}
                        usedInPeriod={s?.diasFolga ?? 0}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {emp.active && (
                          <ActionButton label="Registrar ocorrência" onClick={() => onRegister(emp)}>
                            <IconCalendarPlus className="h-4 w-4" />
                          </ActionButton>
                        )}
                        <ActionButton label="Editar" onClick={() => onEdit(emp)}>
                          <IconEdit className="h-4 w-4" />
                        </ActionButton>
                        <ActionButton label="Excluir" onClick={() => onDelete(emp)} danger>
                          <IconTrash className="h-4 w-4" />
                        </ActionButton>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="border-t border-border px-4 py-2.5 text-xs text-muted">
            Contagens referentes a {periodLabel}. O saldo de folgas é o total acumulado, independente do mês.
          </p>
        </div>
      )}
    </div>
  );
}

function FolgaCell({ remaining, total, usedInPeriod }: { remaining: number; total: number; usedInPeriod: number }) {
  const color = remaining <= 0 ? "text-critical" : remaining <= 2 ? "text-warn" : "text-ok";
  return (
    <div className="flex flex-col">
      <span className="whitespace-nowrap">
        <span className={`font-mono text-base font-semibold tabular-nums ${total === 0 ? "text-muted" : color}`}>
          {Math.max(remaining, 0)}
        </span>
        <span className="text-xs text-muted"> de {total} restantes</span>
      </span>
      {usedInPeriod > 0 && <span className="text-xs text-muted">{pluralDias(usedInPeriod)} no período</span>}
    </div>
  );
}

function Count({ value, tone }: { value: number; tone: "critical" | "accent" }) {
  const color = value === 0 ? "text-muted" : tone === "critical" ? "text-critical" : "text-accent-strong";
  return <span className={`font-mono text-base font-semibold tabular-nums ${color}`}>{value}</span>;
}
