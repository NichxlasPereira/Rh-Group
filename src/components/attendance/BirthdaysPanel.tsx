"use client";

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Employee } from "@/lib/attendance";
import { ContractingCompanyInfo, sectorName } from "@/lib/admission";
import { Birthday, MONTH_NAMES, isBirthdayOn } from "@/lib/birthdays";
import { inkOn } from "@/lib/brandColors";
import { IconCake, IconChevronLeft, IconChevronRight, IconCopy } from "../icons";
import { companyLogoUrl } from "./CompanyBrandModal";
import { EmptyState } from "./formControls";

interface BirthdaysPanelProps {
  /** Pessoas já filtradas (busca, setor, inativos). */
  employees: Employee[];
  birthdays: Birthday[];
  companies: ContractingCompanyInfo[];
  areaNameById: Map<string, string>;
  onOpen: (employee: Employee) => void;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Aniversariantes do mês: só dia e mês, com destaque para hoje e para esta semana. */
export function BirthdaysPanel({ employees, birthdays, companies, areaNameById, onOpen }: BirthdaysPanelProps) {
  const now = new Date();
  const thisMonth = now.getMonth() + 1;
  const [month, setMonth] = useState(thisMonth);
  const [showMissing, setShowMissing] = useState(false);

  const companyBySector = useMemo(() => {
    const map = new Map<string, ContractingCompanyInfo>();
    for (const c of companies) if (c.cnpj && !map.has(sectorName(c))) map.set(sectorName(c), c);
    return map;
  }, [companies]);

  const byEmployee = useMemo(() => new Map(birthdays.map((b) => [b.employeeId, b])), [birthdays]);

  const list = employees
    .flatMap((e) => {
      const b = byEmployee.get(e.id);
      return b && b.month === month ? [{ employee: e, birthday: b }] : [];
    })
    .sort((a, b) => a.birthday.day - b.birthday.day || a.employee.name.localeCompare(b.employee.name, "pt-BR"));

  const missing = employees.filter((e) => e.active && !byEmployee.has(e.id));

  // Próximos 6 dias (pode virar o mês).
  const weekAhead = Array.from({ length: 6 }, (_, i) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + i + 1));

  function copyList() {
    const text = [
      `Aniversariantes de ${MONTH_NAMES[month - 1]}:`,
      ...list.map(({ employee, birthday }) =>
        `${pad(birthday.day)} – ${employee.name}${employee.department ? ` (${employee.department})` : ""}`
      ),
    ].join("\n");
    navigator.clipboard.writeText(text).then(
      () => toast.success("Lista copiada."),
      () => toast.error("Não foi possível copiar.")
    );
  }

  return (
    <section className="rounded-[14px] border border-border bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-warn-soft text-warn">
            <IconCake className="h-5 w-5" />
          </span>
          <h2 className="font-display text-[17px] font-semibold text-ink">
            Aniversariantes de {MONTH_NAMES[month - 1]}
          </h2>
          <span className="rounded-full bg-surface-2 px-2.5 py-0.5 font-mono text-xs tabular-nums text-muted">{list.length}</span>
        </div>
        <div className="flex items-center gap-2">
          {month !== thisMonth && (
            <button
              type="button"
              onClick={() => setMonth(thisMonth)}
              className="h-9 rounded-[10px] px-3 text-[13px] font-semibold text-muted transition hover:bg-surface-2 hover:text-ink"
            >
              Mês atual
            </button>
          )}
          <div className="flex items-center rounded-[10px] border border-border bg-surface-2 p-0.5">
            <button
              type="button"
              aria-label="Mês anterior"
              onClick={() => setMonth((m) => (m + 10) % 12 + 1)}
              className="flex h-8 w-8 items-center justify-center rounded-[8px] text-muted transition hover:bg-surface hover:text-ink"
            >
              <IconChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Próximo mês"
              onClick={() => setMonth((m) => (m % 12) + 1)}
              className="flex h-8 w-8 items-center justify-center rounded-[8px] text-muted transition hover:bg-surface hover:text-ink"
            >
              <IconChevronRight className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={copyList}
            disabled={list.length === 0}
            className="flex h-9 items-center gap-1.5 rounded-[10px] border border-border-strong px-3 text-[13px] font-semibold text-ink transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <IconCopy className="h-4 w-4" />
            Copiar lista
          </button>
        </div>
      </header>

      {list.length === 0 ? (
        <EmptyState
          icon={<IconCake className="h-6 w-6" />}
          title={`Nenhum aniversariante em ${MONTH_NAMES[month - 1]}`}
          text="A data vem da ficha cadastral (Editar ficha ou importação da planilha) ou do onboarding."
        />
      ) : (
        <ul key={month} className="rh-enter flex flex-col">
          {list.map(({ employee: e, birthday: b }) => {
            const today = isBirthdayOn(b, now);
            const soon = !today && weekAhead.some((d) => isBirthdayOn(b, d));
            const past = month === thisMonth && b.day < now.getDate() && !today;
            const company = e.department ? (companyBySector.get(e.department) ?? null) : null;
            const color = company?.brandColor ?? null;
            const logo = company ? companyLogoUrl(company) : null;
            const area = e.areaId ? areaNameById.get(e.areaId) : null;
            return (
              <li key={e.id} className="border-b border-border last:border-b-0">
                <button
                  type="button"
                  onClick={() => onOpen(e)}
                  className={`flex w-full items-center gap-3.5 px-4 py-3 text-left transition hover:bg-surface-2 ${
                    today ? "bg-warn-soft hover:bg-warn-soft" : ""
                  } ${past ? "opacity-55" : ""}`}
                >
                  <span className="flex w-11 shrink-0 flex-col items-center leading-none">
                    <span className="font-display text-[22px] font-semibold tabular-nums text-ink">{pad(b.day)}</span>
                    <span className="mt-1 text-[11px] uppercase tracking-wide text-muted">{MONTH_NAMES[month - 1].slice(0, 3)}</span>
                  </span>

                  <span className="relative shrink-0">
                    {b.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/employees/${e.id}/photo?v=${b.photo}`}
                        alt=""
                        className="h-11 w-11 rounded-full object-cover"
                      />
                    ) : (
                      <span
                        style={color ? { background: color, color: inkOn(color) } : undefined}
                        className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-b from-[#8a8c90] to-[#3a3b3f] font-display text-[15px] font-semibold text-white"
                      >
                        {initials(e.name)}
                      </span>
                    )}
                    {today && (
                      <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-surface text-warn ring-2 ring-warn-soft">
                        <IconCake className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </span>

                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[14px] font-bold text-ink">{e.name}</span>
                    <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
                      {logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={logo} alt="" className="h-4 w-4 shrink-0 rounded-[3px] bg-white object-contain" />
                      ) : (
                        <span
                          style={color ? { background: color } : undefined}
                          className="h-2 w-2 shrink-0 rounded-full bg-border-strong"
                        />
                      )}
                      <span className="truncate">{[e.department, area, e.role].filter(Boolean).join(" · ") || "Sem setor"}</span>
                    </span>
                  </span>

                  {today ? (
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-warn px-2.5 py-1 text-[11px] font-bold text-bg">
                      <IconCake className="h-3.5 w-3.5" />
                      Hoje
                    </span>
                  ) : soon ? (
                    <span className="shrink-0 rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-bold text-accent-strong">
                      Esta semana
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {missing.length > 0 && (
        <footer className="border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={() => setShowMissing((v) => !v)}
            aria-expanded={showMissing}
            className="text-xs font-semibold text-warn underline-offset-2 hover:underline"
          >
            {missing.length} {missing.length === 1 ? "colaborador ativo" : "colaboradores ativos"} sem data de nascimento
          </button>
          {showMissing && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {missing.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => onOpen(e)}
                  className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs text-ink transition hover:border-border-strong"
                >
                  {e.name}
                </button>
              ))}
              <span className="basis-full text-xs text-muted">
                Abra a ficha e preencha em Editar ficha, ou use a importação da planilha.
              </span>
            </div>
          )}
        </footer>
      )}
    </section>
  );
}
