"use client";

import { useCallback, useState } from "react";
import { CompanyArea, Employee, OCCURRENCE_LABEL, Occurrence, OccurrenceType } from "@/lib/attendance";
import { ContractingCompanyInfo, isGroupSector, sectorName } from "@/lib/admission";
import { todayInputValue } from "@/lib/format";
import { Birthday, isBirthdayOn } from "@/lib/birthdays";
import { inkOn } from "@/lib/brandColors";
import { CffLogo } from "../brand";
import { IconCake, IconEdit, IconUsers } from "../icons";
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
  /** Dia e mês de nascimento: bolinho em quem faz aniversário hoje. */
  birthdays: Birthday[];
  onOpen: (employee: Employee) => void;
  onManageAreas: (company: ContractingCompanyInfo) => void;
  /** Abre o logo e as cores da empresa. */
  onBrand: (company: ContractingCompanyInfo) => void;
}

/**
 * Monta a hierarquia da empresa: cada pessoa fica abaixo do gestor direto (se ele
 * é da mesma empresa); quem não tem gestor fica abaixo do responsável da sua área.
 */
function buildTree(people: Employee[]): { roots: Employee[]; kids: Map<string, Employee[]> } {
  const ids = new Set(people.map((e) => e.id));
  const leadOf = new Map<string, string>();
  for (const e of people) if (e.areaLead && e.areaId && !leadOf.has(e.areaId)) leadOf.set(e.areaId, e.id);
  const parent = new Map<string, string>();
  for (const e of people) {
    if (e.managerId && e.managerId !== e.id && ids.has(e.managerId)) parent.set(e.id, e.managerId);
    else if (!e.managerId && !e.areaLead && e.areaId && leadOf.has(e.areaId)) parent.set(e.id, leadOf.get(e.areaId)!);
  }
  // Dado antigo em ciclo (A → B → A): a pessoa sobe para o topo em vez de sumir.
  for (const e of people) {
    const seen = new Set([e.id]);
    for (let up = parent.get(e.id); up; up = parent.get(up)) {
      if (seen.has(up)) {
        parent.delete(e.id);
        break;
      }
      seen.add(up);
    }
  }
  const kids = new Map<string, Employee[]>();
  for (const e of people) {
    const up = parent.get(e.id);
    if (up) kids.set(up, [...(kids.get(up) ?? []), e]);
  }
  return { roots: people.filter((e) => !parent.has(e.id)), kids };
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
export function OrgChart({
  employees,
  companies,
  areas,
  occurrences,
  focus,
  birthdays,
  onOpen,
  onManageAreas,
  onBrand,
}: OrgChartProps) {
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
  const now = new Date();
  const birthdayToday = new Set(birthdays.filter((b) => isBirthdayOn(b, now)).map((b) => b.employeeId));

  const openBrand = open?.company?.brandColor ?? null;
  const openLogo = open?.company ? companyLogoUrl(open.company) : null;
  const tree = open ? buildTree([...open.people].sort(byName)) : null;
  const treeCtx: NodeCtx = {
    kids: tree?.kids ?? new Map(),
    status: todayStatus,
    birthdayToday,
    brand: openBrand,
    nameById: new Map(employees.map((e) => [e.id, e.name])),
    areaNameById: new Map(areas.map((a) => [a.id, a.name])),
    topIds: new Set(tree?.roots.map((e) => e.id)),
    onOpen,
  };

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
          // Acima da linha que desce até as empresas: o anel de aberta não é atravessado por ela.
          className={`brand-band relative z-10 flex items-center gap-4 rounded-[16px] px-6 py-4 text-left text-white shadow-[0_18px_40px_-24px_rgba(0,0,0,0.6)] transition enabled:hover:brightness-110 enabled:active:brightness-95 ${
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
                          className={`flex h-full flex-col overflow-clip rounded-[14px] border border-border bg-white text-left transition hover:border-border-strong hover:shadow-[0_10px_24px_-14px_rgba(0,0,0,0.45)] ${
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
          key={open.name}
          aria-label={`Áreas de ${open.name}`}
          className="rh-fade flex flex-col gap-4 overflow-clip rounded-[18px] border border-border bg-surface-2/40 p-4 sm:p-5"
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

          {open.people.length === 0 ? (
            <p className="rounded-[14px] border border-dashed border-border-strong px-4 py-8 text-center text-sm text-muted">
              Ninguém nesta empresa ainda.
            </p>
          ) : (
            // Um organograma só, de cima para baixo; rola para o lado se não couber.
            <div className="-mx-1 overflow-x-auto px-1 pb-1">
              <div className="mx-auto flex w-max flex-col items-center pt-1">
                <div
                  data-theme="light"
                  className="flex items-center gap-3 rounded-[12px] border border-border bg-surface px-4 py-2.5 shadow-[0_8px_20px_-16px_rgba(0,0,0,0.5)]"
                >
                  {openLogo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={openLogo} alt="" className="h-8 w-auto max-w-[140px] object-contain" />
                  ) : open === holding ? (
                    <CffLogo className="h-7 w-auto text-[#17181a]" />
                  ) : (
                    <span className="font-display text-sm font-semibold uppercase tracking-[0.06em] text-ink">{open.name}</span>
                  )}
                  <span className="border-l border-border pl-3 font-display text-lg font-bold tabular-nums text-ink">
                    {open.people.length}
                  </span>
                </div>
                <Children list={tree!.roots} ctx={treeCtx} />
              </div>
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
            <span className="flex items-center gap-1.5">
              <IconCake className="h-3.5 w-3.5 text-warn" />
              aniversário hoje
            </span>
          </span>
        </section>
      )}
    </div>
  );
}

interface NodeCtx {
  kids: Map<string, Employee[]>;
  status: Map<string, OccurrenceType>;
  birthdayToday: Set<string>;
  brand: string | null;
  /** Nome do gestor que está fora da empresa (aparece como "responde a"). */
  nameById: Map<string, string>;
  areaNameById: Map<string, string>;
  /** Quem está no topo (sem gestor nesta empresa). */
  topIds: Set<string>;
  onOpen: (employee: Employee) => void;
}

const LINE = "bg-border-strong";
const PANEL_COLUMN = 200;

/** Uma pessoa e, abaixo dela, quem responde a ela. */
function Subtree({ employee, ctx }: { employee: Employee; ctx: NodeCtx }) {
  return (
    <div className="flex flex-col items-center">
      <PersonNode employee={employee} ctx={ctx} />
      <Children list={ctx.kids.get(employee.id) ?? []} ctx={ctx} parentArea={employee.areaId} />
    </div>
  );
}

/**
 * Quem fica abaixo de alguém. Quem não tem ninguém abaixo vai para um quadro em
 * lista (não alarga a árvore); quem tem equipe, ou responde pela área, abre um
 * galho próprio ao lado.
 */
function Children({ list, ctx, parentArea = null }: { list: Employee[]; ctx: NodeCtx; parentArea?: string | null }) {
  if (list.length === 0) return null;
  const branches = list.filter((c) => c.areaLead || ctx.kids.has(c.id));
  const leaves = list.filter((c) => !branches.includes(c));
  const columns: React.ReactNode[] = [];
  if (leaves.length > 0) {
    const cols = leaves.length > 16 ? 3 : leaves.length > 6 ? 2 : 1;
    columns.push(
      <ul
        key="equipe"
        style={{ width: cols * PANEL_COLUMN, gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        className="grid gap-x-1 gap-y-0.5 rounded-[12px] border border-border bg-surface-2/60 p-1.5"
      >
        {leaves.map((e) => (
          <li key={e.id} className="min-w-0">
            {/* A área só aparece quando é diferente da de quem está acima. */}
            <PersonRow employee={e} ctx={ctx} showArea={e.areaId !== parentArea} />
          </li>
        ))}
      </ul>
    );
  }
  for (const b of branches) columns.push(<Subtree key={b.id} employee={b} ctx={ctx} />);

  return (
    <>
      <span aria-hidden="true" className={`h-4 w-0.5 ${LINE}`} />
      {columns.length === 1 ? (
        columns[0]
      ) : (
        <div className="flex items-start">
          {columns.map((col, i) => (
            <div key={i} className="relative flex flex-col items-center px-1.5 pt-4">
              {/* Barra que liga os irmãos e a linha que desce até cada um. */}
              <span
                aria-hidden="true"
                className={`absolute top-0 h-0.5 ${LINE} ${i === 0 ? "left-1/2" : "left-0"} ${i === columns.length - 1 ? "right-1/2" : "right-0"}`}
              />
              <span aria-hidden="true" className={`absolute left-1/2 top-0 h-4 w-0.5 -translate-x-1/2 ${LINE}`} />
              {col}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/** Cartão de quem tem equipe (ou é responsável): foto, nome, cargo em destaque e área. */
function PersonNode({ employee: e, ctx }: { employee: Employee; ctx: NodeCtx }) {
  // No topo, mas com gestor: ele é de outra empresa.
  const outside = e.managerId && ctx.topIds.has(e.id) ? ctx.nameById.get(e.managerId) : undefined;
  const area = e.areaId ? ctx.areaNameById.get(e.areaId) : undefined;
  return (
    <button
      type="button"
      onClick={() => ctx.onOpen(e)}
      title={[e.name, e.role, area].filter(Boolean).join(" · ")}
      className={`flex w-[152px] flex-col items-center gap-1.5 rounded-[12px] border border-border bg-surface px-2.5 py-3 text-center shadow-[0_8px_20px_-16px_rgba(0,0,0,0.5)] transition hover:border-border-strong hover:bg-surface-2 ${
        e.active ? "" : "opacity-60"
      }`}
    >
      <Avatar employee={e} status={ctx.status.get(e.id)} birthday={ctx.birthdayToday.has(e.id)} size="xl" color={ctx.brand} />
      <span className="w-full truncate text-[13px] font-bold leading-tight text-ink">{shortName(e.name)}</span>
      {e.role && (
        <span
          style={ctx.brand ? { background: ctx.brand, color: inkOn(ctx.brand) } : undefined}
          className={`max-w-full truncate rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] ${ctx.brand ? "" : "bg-ink text-bg"}`}
        >
          {e.role}
        </span>
      )}
      {(area || e.areaLead) && (
        <span className="w-full truncate text-[10.5px] font-semibold text-muted">
          {[area, e.areaLead ? "responsável" : null].filter(Boolean).join(" · ")}
        </span>
      )}
      {outside && <span className="w-full truncate text-[10.5px] text-muted">Responde a {shortName(outside)}</span>}
    </button>
  );
}

/** Pessoa no quadro da equipe: nome e, embaixo, cargo (e a área, se mudar). */
function PersonRow({ employee: e, ctx, showArea }: { employee: Employee; ctx: NodeCtx; showArea: boolean }) {
  const area = e.areaId ? ctx.areaNameById.get(e.areaId) : undefined;
  const detail = [e.role, showArea ? area : null].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      onClick={() => ctx.onOpen(e)}
      title={[e.name, e.role, area].filter(Boolean).join(" · ")}
      className={`flex w-full items-center gap-2 rounded-[8px] px-1.5 py-1 text-left text-[13px] text-ink transition hover:bg-surface ${
        e.active ? "" : "opacity-60"
      }`}
    >
      <Avatar employee={e} status={ctx.status.get(e.id)} birthday={ctx.birthdayToday.has(e.id)} />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate font-semibold">{shortName(e.name)}</span>
        {detail && <span className="truncate text-[11px] text-muted">{detail}</span>}
      </span>
    </button>
  );
}

function Avatar({
  employee,
  status,
  birthday = false,
  size = "sm",
  color,
}: {
  employee: Employee;
  status?: OccurrenceType;
  /** Faz aniversário hoje. */
  birthday?: boolean;
  size?: "sm" | "lg" | "xl";
  /** Cor da marca da empresa (responsáveis). */
  color?: string | null;
}) {
  const ring = status === "folga" ? "outline outline-2 outline-offset-1 outline-ok" : status ? "outline outline-2 outline-offset-1 outline-warn" : "";
  const dims =
    size === "xl"
      ? "h-11 w-11 rounded-full text-[15px]"
      : size === "lg"
        ? "h-8 w-8 rounded-[9px] text-[12.5px]"
        : "h-[26px] w-[26px] rounded-full text-[10.5px]";
  return (
    <span
      aria-hidden={!status && !birthday}
      style={color ? { background: color, color: inkOn(color) } : undefined}
      className={`relative flex shrink-0 items-center justify-center bg-gradient-to-b from-[#8a8c90] to-[#3a3b3f] font-display font-semibold text-white ${dims} ${ring}`}
    >
      {initials(employee.name)}
      {status && <span className="sr-only"> ({OCCURRENCE_LABEL[status]} hoje)</span>}
      {birthday && (
        <span className="absolute -bottom-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-surface text-warn ring-1 ring-border">
          <IconCake className="h-3 w-3" />
          <span className="sr-only"> (aniversário hoje)</span>
        </span>
      )}
    </span>
  );
}
