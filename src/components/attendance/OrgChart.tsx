"use client";

import { useCallback, useState } from "react";
import { CompanyArea, Employee, OCCURRENCE_LABEL, Occurrence, OccurrenceType } from "@/lib/attendance";
import { ContractingCompanyInfo, isGroupSector, sectorName } from "@/lib/admission";
import { todayInputValue } from "@/lib/format";
import { inkOn } from "@/lib/brandColors";
import { CffLogo } from "../brand";
import { IconEdit, IconUsers } from "../icons";
import { brandStripe, companyLogoUrl } from "./CompanyBrandModal";
import { EmptyState } from "./formControls";

const NO_SECTOR = "Sem setor";

interface OrgChartProps {
  /** Pessoas já filtradas (busca, setor, inativos). */
  employees: Employee[];
  companies: ContractingCompanyInfo[];
  areas: CompanyArea[];
  occurrences: Occurrence[];
  /** Setor escolhido no filtro: abre essa empresa. */
  focus: string;
  onOpen: (employee: Employee) => void;
  onManageAreas: (company: ContractingCompanyInfo) => void;
  /** Abre o logo e as cores da empresa. */
  onBrand: (company: ContractingCompanyInfo) => void;
}

interface AreaGroup {
  key: string;
  name: string;
  leads: Employee[];
  team: Employee[];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]}` : parts[0];
}

const byName = (a: Employee, b: Employee) => a.name.localeCompare(b.name, "pt-BR");

const GAP = 12; // espaço entre cartões (gap-3)
const ROW_GAP = 18; // entre fileiras
const CARD_MIN = 150;
const CARD_MAX = 200;

/**
 * Distribui os cartões das empresas: uma fileira se couberem; senão, fileiras com
 * número par de cartões (a última pode ter menos), todas do mesmo tamanho.
 */
function layoutRows<T>(items: T[], width: number): { rows: T[][]; cardSize: number } {
  const n = items.length;
  if (n === 0 || width <= 0) return { rows: n ? [items] : [], cardSize: CARD_MAX };
  const fit = Math.max(1, Math.floor((width + GAP) / (CARD_MIN + GAP)));
  let perRow = n;
  if (n > fit) {
    const evenFit = Math.max(2, fit - (fit % 2));
    perRow = Math.ceil(n / Math.ceil(n / evenFit));
    perRow = Math.min(evenFit, perRow + (perRow % 2));
  }
  const cardSize = Math.min(CARD_MAX, Math.floor((width - (perRow - 1) * GAP) / perRow));
  const rows: T[][] = [];
  for (let i = 0; i < n; i += perRow) rows.push(items.slice(i, i + perRow));
  return { rows, cardSize };
}

/** Organograma: o grupo, as empresas (setores) e, na empresa aberta, as áreas com responsáveis. */
export function OrgChart({ employees, companies, areas, occurrences, focus, onOpen, onManageAreas, onBrand }: OrgChartProps) {
  const [selected, setSelected] = useState<string | null>(null);
  // Largura disponível para os cartões das empresas (muda com a janela).
  const [rowWidth, setRowWidth] = useState(0);
  const measureRow = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setRowWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const companyBySector = new Map<string, ContractingCompanyInfo>();
  for (const c of companies) if (c.cnpj && !companyBySector.has(sectorName(c))) companyBySector.set(sectorName(c), c);

  const bySector = new Map<string, Employee[]>();
  for (const sector of [...companyBySector.keys()].sort((a, b) => a.localeCompare(b, "pt-BR"))) bySector.set(sector, []);
  for (const e of employees) {
    const sector = e.department && companyBySector.has(e.department) ? e.department : NO_SECTOR;
    if (!bySector.has(sector)) bySector.set(sector, []);
    bySector.get(sector)!.push(e);
  }
  const sectors = [...bySector.entries()].map(([name, people]) => ({
    name,
    people,
    company: companyBySector.get(name) ?? null,
  }));

  // Nenhuma empresa em destaque: abre a do filtro de setor ou a que o RH clicar.
  const openName = (focus && bySector.has(focus) ? focus : null) ?? (selected && bySector.has(selected) ? selected : null);
  const open = sectors.find((s) => s.name === openName) ?? null;

  // Quem está fora hoje (folga, atestado ou falta).
  const today = todayInputValue();
  const todayStatus = new Map<string, OccurrenceType>();
  for (const o of occurrences) {
    if (o.employeeId && o.date.slice(0, 10) <= today && o.endDate.slice(0, 10) >= today) todayStatus.set(o.employeeId, o.type);
  }

  const openBrand = open?.company?.brandColor ?? null;
  const openLogo = open?.company ? companyLogoUrl(open.company) : null;

  let groups: AreaGroup[] = [];
  if (open) {
    const companyAreas = open.company ? areas.filter((a) => a.companyId === open.company!.id) : [];
    groups = companyAreas
      .map((a) => {
        const people = open.people.filter((e) => e.areaId === a.id).sort(byName);
        return { key: a.id, name: a.name, leads: people.filter((e) => e.areaLead), team: people.filter((e) => !e.areaLead) };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    const known = new Set(companyAreas.map((a) => a.id));
    const loose = open.people.filter((e) => !e.areaId || !known.has(e.areaId)).sort(byName);
    if (loose.length > 0) groups.push({ key: "sem-area", name: "Sem área", leads: [], team: loose });
  }

  if (sectors.length === 0) {
    return (
      <div className="rounded-[14px] border border-border bg-surface">
        <EmptyState
          icon={<IconUsers className="h-6 w-6" />}
          title="Nenhuma empresa no organograma"
          text="Cadastre as empresas com CNPJ no Onboarding (Termos) para montar a estrutura do grupo."
        />
      </div>
    );
  }

  // A CFFGROUP é o próprio topo (clicável); as demais ficam lado a lado abaixo dela.
  const holding = sectors.find((s) => s.company && isGroupSector(s.name)) ?? null;
  const row = sectors.filter((s) => s !== holding);
  const companyCount = row.filter((s) => s.company).length;
  const n = row.length;
  const holdingOpen = !!holding && holding.name === openName;
  const { rows, cardSize } = layoutRows(row, rowWidth);

  return (
    <div className="flex flex-col gap-5">
      {/* Topo: o grupo */}
      <div className="flex flex-col items-center">
        <button
          type="button"
          data-theme="dark"
          disabled={!holding}
          onClick={() => holding && setSelected(holdingOpen ? null : holding.name)}
          aria-pressed={holding ? holdingOpen : undefined}
          aria-label={holding ? `CFFGROUP: ${holding.people.length} pessoas` : undefined}
          className={`brand-band flex items-center gap-4 rounded-[16px] px-6 py-4 text-left text-white shadow-[0_18px_40px_-24px_rgba(0,0,0,0.6)] transition enabled:hover:brightness-110 ${
            holdingOpen ? "ring-2 ring-ink ring-offset-2 ring-offset-bg" : ""
          }`}
        >
          <CffLogo className="h-[34px] w-auto text-white" />
          <span className="flex flex-col leading-tight">
            <span className="font-display text-lg font-semibold uppercase tracking-[0.06em]">
              {holding
                ? `${holding.people.length} ${holding.people.length === 1 ? "pessoa" : "pessoas"}`
                : `${employees.length} ${employees.length === 1 ? "pessoa" : "pessoas"}`}
            </span>
            <span className="text-xs text-white/85">
              {holding ? `${employees.length} no grupo · ` : ""}
              {companyCount} {companyCount === 1 ? "empresa" : "empresas"} {holding ? "abaixo" : ""}
            </span>
            {holdingOpen && <span className="mt-1 text-xs font-bold">▾ aberta abaixo</span>}
          </span>
        </button>
        {n > 0 && <span aria-hidden="true" className="h-[22px] w-0.5 bg-border-strong" />}
      </div>

      {/* Nível das empresas: os cartões dividem a largura e, se não couberem, quebram em fileiras
          ligadas pelo tronco central (fileiras cheias têm número par: o tronco passa entre dois cartões). */}
      <div ref={measureRow} className="-mt-5 w-full">
        {rowWidth > 0 &&
          rows.map((items, r) => {
            const last = r === rows.length - 1;
            return (
              <div
                key={r}
                className="relative mx-auto pt-[22px]"
                style={{ width: items.length * cardSize + (items.length - 1) * GAP, marginBottom: last ? 0 : ROW_GAP }}
              >
                {items.length > 1 && (
                  <span
                    aria-hidden="true"
                    className="absolute top-0 h-0.5 bg-border-strong"
                    style={{ left: cardSize / 2 - 1, right: cardSize / 2 - 1 }}
                  />
                )}
                {!last && (
                  <span
                    aria-hidden="true"
                    className="absolute left-1/2 top-0 w-0.5 -translate-x-1/2 bg-border-strong"
                    style={{ bottom: -ROW_GAP }}
                  />
                )}
                <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${items.length}, ${cardSize}px)` }}>
                  {items.map((s) => {
                    const isOpen = s.name === openName;
                    const logo = s.company ? companyLogoUrl(s.company) : null;
                    const brand = s.company?.brandColor ?? null;
                    return (
                      <div key={s.name} className="relative flex min-w-0 flex-col">
                        <span aria-hidden="true" className="-mt-[22px] h-[22px] w-0.5 self-center bg-border-strong" />
                        <button
                          type="button"
                          onClick={() => setSelected(isOpen ? null : s.name)}
                          aria-pressed={isOpen}
                          aria-label={`${s.name}: ${s.people.length} ${s.people.length === 1 ? "pessoa" : "pessoas"}`}
                          // Aberto: anel separado do cartão pela cor da página, visível nos dois temas.
                          style={isOpen && brand ? { boxShadow: `0 0 0 2px var(--bg), 0 0 0 4px ${brand}` } : undefined}
                          className={`flex h-full flex-col overflow-clip rounded-[14px] border border-border bg-white text-left transition hover:border-border-strong ${
                            isOpen && !brand ? "shadow-[0_0_0_2px_var(--bg),0_0_0_4px_var(--ink)]" : ""
                          } ${s.company ? "" : "border-dashed"}`}
                        >
                          {brand && (
                            <span aria-hidden="true" className="h-1.5 shrink-0" style={{ background: brandStripe(brand, s.company?.accentColor) }} />
                          )}
                          {/* O cartão da empresa é sempre branco (os logos são feitos para fundo claro). */}
                          <span data-theme="light" className="flex flex-1 flex-col gap-1.5 px-3 py-3">
                            <span className="flex items-center justify-between gap-2">
                              {logo ? (
                                <span className="flex h-10 min-w-0 flex-1 items-center">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={logo} alt="" className="h-full w-auto max-w-full object-contain object-left" />
                                </span>
                              ) : (
                                <span className="font-display text-base font-semibold uppercase tracking-[0.04em] text-ink">{s.name}</span>
                              )}
                              <span className="font-display text-xl font-bold tabular-nums text-ink">{s.people.length}</span>
                            </span>
                            {/* Com logo, o nome do setor fica logo abaixo dele. */}
                            {logo && <span className="text-xs font-semibold uppercase tracking-[0.04em] text-muted">{s.name}</span>}
                            {isOpen && <span className="text-xs font-bold text-ink">▾ aberta abaixo</span>}
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
      </div>

      {!open && (
        <p className="rounded-[14px] border border-dashed border-border-strong px-4 py-6 text-center text-sm text-muted">
          {holding ? "Clique na CFFGROUP ou numa empresa" : "Clique numa empresa"} para ver as áreas e as pessoas.
        </p>
      )}

      {/* Empresa aberta: áreas */}
      {open && (
        <section
          aria-label={`Áreas de ${open.name}`}
          className="flex flex-col gap-4 overflow-clip rounded-[18px] border border-border bg-surface-2/40 p-4 sm:p-5"
        >
          {/* Cabeçalho da empresa aberta: logo e cores da marca dela. */}
          <div
            className="relative -mx-4 -mt-4 flex flex-wrap items-center justify-between gap-4 border-b border-border px-4 pb-4 pt-5 sm:-mx-5 sm:-mt-5 sm:px-5"
            style={
              openBrand
                ? { background: `linear-gradient(120deg, color-mix(in srgb, ${openBrand} 16%, transparent), transparent 65%)` }
                : undefined
            }
          >
            {openBrand && (
              <span
                aria-hidden="true"
                className="absolute inset-x-0 top-0 h-1.5"
                style={{ background: brandStripe(openBrand, open.company?.accentColor) }}
              />
            )}
            <div className="flex min-w-0 items-center gap-4">
              {openLogo ? (
                <span className="flex h-11 shrink-0 items-center rounded-[10px] bg-white px-2.5 py-1.5 shadow-[0_6px_18px_-12px_rgba(0,0,0,0.5)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={openLogo} alt={`Logo da ${open.name}`} className="h-full w-auto max-w-[180px] object-contain" />
                </span>
              ) : (
                open === holding && (
                  <span className="flex h-11 shrink-0 items-center rounded-[10px] bg-white px-2.5 py-1.5 shadow-[0_6px_18px_-12px_rgba(0,0,0,0.5)]">
                    <CffLogo className="h-full w-auto text-[#17181a]" />
                  </span>
                )
              )}
              <div className="min-w-0">
                <h2 className="font-display text-[17px] font-semibold uppercase tracking-[0.06em] text-ink">
                  {open.name}
                </h2>
                <p className="text-xs text-muted">
                  {open.people.length} {open.people.length === 1 ? "pessoa" : "pessoas"} · clique numa pessoa para abrir a
                  ficha
                </p>
              </div>
            </div>
            {open.company && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onBrand(open.company!)}
                  className="flex h-9 items-center gap-2 rounded-[10px] border border-border-strong bg-surface px-3 text-xs font-semibold text-ink transition hover:bg-ink hover:text-bg"
                >
                  <span
                    aria-hidden="true"
                    className="h-3.5 w-3.5 rounded-full border border-border-strong"
                    style={{ background: openBrand ? brandStripe(openBrand, open.company.accentColor) : "transparent" }}
                  />
                  Identidade visual
                </button>
                <button
                  type="button"
                  onClick={() => onManageAreas(open.company!)}
                  className="flex h-9 items-center gap-2 rounded-[10px] border border-border-strong bg-surface px-3 text-xs font-semibold text-ink transition hover:bg-ink hover:text-bg"
                >
                  <IconEdit className="h-4 w-4" />
                  Organizar áreas
                </button>
              </div>
            )}
          </div>

          {groups.length === 0 ? (
            <p className="rounded-[14px] border border-dashed border-border-strong px-4 py-8 text-center text-sm text-muted">
              {open.company
                ? "Nenhuma área cadastrada para esta empresa. Use “Organizar áreas” para criar as áreas (Tecnologia, Comercial...)."
                : "Ninguém sem setor."}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {groups.map((g) => (
                <div
                  key={g.key}
                  style={openBrand && g.key !== "sem-area" ? { borderTopColor: openBrand, borderTopWidth: 3 } : undefined}
                  className={`flex flex-col gap-3 rounded-[14px] border bg-surface p-3.5 ${
                    g.key === "sem-area" ? "border-dashed border-border-strong sm:col-span-full" : "border-border"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-display text-[15px] font-semibold uppercase tracking-[0.06em] text-ink">
                      {g.key === "sem-area" && !open.company ? "Pessoas sem setor" : g.name}
                    </span>
                    <span className="font-mono text-xs tabular-nums text-muted">{g.leads.length + g.team.length}</span>
                  </span>

                  {g.key !== "sem-area" &&
                    (g.leads.length > 0 ? (
                      g.leads.map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => onOpen(e)}
                          className="flex items-center gap-2.5 rounded-[10px] bg-surface-2 p-2 text-left transition hover:bg-border"
                        >
                          <Avatar employee={e} status={todayStatus.get(e.id)} size="lg" color={openBrand} />
                          <span className="flex min-w-0 flex-col leading-tight">
                            <span className="truncate text-[13px] font-bold text-ink">{e.name}</span>
                            <span className="text-[11px] text-muted">Responsável{e.role ? ` · ${e.role}` : ""}</span>
                          </span>
                        </button>
                      ))
                    ) : (
                      <span className="rounded-[10px] border border-dashed border-border-strong px-3 py-2.5 text-xs text-muted">
                        Sem responsável. Marque na ficha (Editar).
                      </span>
                    ))}

                  {g.team.length > 0 && (
                    <ul
                      className={
                        g.key === "sem-area"
                          ? "grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2 xl:grid-cols-3"
                          : "ml-[15px] flex flex-col gap-1 border-l-2 border-border pl-3"
                      }
                    >
                      {g.team.map((e) => (
                        <li key={e.id}>
                          <button
                            type="button"
                            onClick={() => onOpen(e)}
                            title={e.role ? `${e.name} · ${e.role}` : e.name}
                            className={`flex w-full items-center gap-2 rounded-[8px] px-1.5 py-1 text-left text-[13px] text-ink transition hover:bg-surface-2 ${
                              e.active ? "" : "opacity-60"
                            }`}
                          >
                            <Avatar employee={e} status={todayStatus.get(e.id)} />
                            <span className="max-w-[65%] shrink-0 truncate">{shortName(e.name)}</span>
                            {e.role && <span className="ml-auto min-w-0 truncate text-[11px] text-muted">{e.role}</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}

          <span className="flex flex-wrap gap-4 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full outline outline-2 outline-offset-1 outline-ok" />
              de folga hoje
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full outline outline-2 outline-offset-1 outline-warn" />
              atestado ou falta hoje
            </span>
          </span>
        </section>
      )}
    </div>
  );
}

function Avatar({
  employee,
  status,
  size = "sm",
  color,
}: {
  employee: Employee;
  status?: OccurrenceType;
  size?: "sm" | "lg";
  /** Cor da marca da empresa (responsáveis). */
  color?: string | null;
}) {
  const ring = status === "folga" ? "outline outline-2 outline-offset-1 outline-ok" : status ? "outline outline-2 outline-offset-1 outline-warn" : "";
  const dims = size === "lg" ? "h-8 w-8 rounded-[9px] text-[12.5px]" : "h-[26px] w-[26px] rounded-full text-[10.5px]";
  return (
    <span
      aria-hidden={!status}
      style={color ? { background: color, color: inkOn(color) } : undefined}
      className={`flex shrink-0 items-center justify-center bg-gradient-to-b from-[#8a8c90] to-[#3a3b3f] font-display font-semibold text-white ${dims} ${ring}`}
    >
      {initials(employee.name)}
      {status && <span className="sr-only"> ({OCCURRENCE_LABEL[status]} hoje)</span>}
    </span>
  );
}
