"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { currentMonthKey, monthKeyLabel } from "@/lib/attendance";
import { formatDateBR } from "@/lib/format";
import {
  EXPIRING_DAYS,
  Provider,
  ProviderDetail,
  contractStatus,
  invoicePending,
  needsAttention,
} from "@/lib/providers";
import { IconBriefcase, IconCalendarX, IconEdit, IconFile, IconSearch, IconTrash, IconUsers } from "../icons";
import { ActionButton, EmptyState, SkeletonRows } from "../attendance/formControls";
import { ContractBadge } from "./ContractBadge";
import { ProviderFormValues, ProviderModal } from "./ProviderModal";
import { ProviderSheet, SheetTab } from "./ProviderSheet";
import { ProviderImportModal } from "./ProviderImportModal";

async function call(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  if (res.status === 401) {
    window.location.replace("/frequencia/entrar");
    throw new Error("Sessão expirada.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Não foi possível concluir.");
  return data;
}

const errorToast = (err: unknown) => toast.error(err instanceof Error ? err.message : "Erro inesperado.");

const selectClass =
  "h-10 w-full rounded-[10px] border border-border bg-surface-2 px-3 text-sm text-ink focus:border-accent focus:outline-none";

/** Últimos 12 meses e os próximos 2, do mais novo para o mais antigo. */
function monthOptions(): string[] {
  const now = new Date();
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + 2 - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}

interface Props {
  departments: string[];
  /** Áreas de cada empresa (as mesmas do organograma). */
  areasBySector: Map<string, string[]>;
  /** Razão social de cada empresa (sigla → nome), para a importação reconhecer a planilha. */
  companyNames?: Record<string, string>;
  isAdmin: boolean;
  /** Cada vez que muda, abre o cadastro de um novo prestador (botão do cabeçalho). */
  createSignal: number;
  /** Cada vez que muda, abre a importação da planilha (botão do cabeçalho). */
  importSignal: number;
  /** Quantos precisam de atenção (contrato vencendo ou vencido) — o número da aba. */
  onAttentionChange?: (count: number) => void;
}

/**
 * Prestadores de serviço (PJs com contrato temporário): lista no mesmo jeito da
 * de colaboradores, com a situação do contrato e a nota fiscal do mês.
 */
export function ProvidersPanel({ departments, areasBySector, companyNames, isAdmin, createSignal, importSignal, onAttentionChange }: Props) {
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [month, setMonth] = useState(currentMonthKey);
  const [showInactive, setShowInactive] = useState(false);

  const [editing, setEditing] = useState<ProviderDetail | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sheet, setSheet] = useState<ProviderDetail | null>(null);
  const [sheetTab, setSheetTab] = useState<SheetTab>("dados");
  const [importOpen, setImportOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const list: Provider[] = await call("/api/prestadores");
      setProviders(list);
      onAttentionChange?.(list.filter((p) => needsAttention(p)).length);
    } catch (err) {
      errorToast(err);
    }
  }, [onAttentionChange]);

  useEffect(() => {
    void load();
  }, [load]);

  // Botões do cabeçalho da página (0 = nada pedido ainda).
  useEffect(() => {
    if (createSignal > 0) {
      setEditing(null);
      setFormOpen(true);
    }
  }, [createSignal]);
  useEffect(() => {
    if (importSignal > 0) setImportOpen(true);
  }, [importSignal]);

  async function openSheet(p: Pick<Provider, "id">, tab: SheetTab = "dados") {
    try {
      setSheet(await call(`/api/prestadores/${p.id}`));
      setSheetTab(tab);
    } catch (err) {
      errorToast(err);
    }
  }

  async function refreshSheet() {
    if (sheet) setSheet(await call(`/api/prestadores/${sheet.id}`));
    await load();
  }

  async function openEdit(p: Pick<Provider, "id">) {
    try {
      setEditing(await call(`/api/prestadores/${p.id}`));
      setFormOpen(true);
    } catch (err) {
      errorToast(err);
    }
  }

  async function save(values: ProviderFormValues) {
    setSaving(true);
    try {
      const saved: ProviderDetail = await call(editing ? `/api/prestadores/${editing.id}` : "/api/prestadores", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      setFormOpen(false);
      toast.success(editing ? "Prestador atualizado." : "Prestador cadastrado.");
      if (sheet && sheet.id === saved.id) setSheet(saved);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function remove(p: Provider) {
    if (!window.confirm(`Excluir ${p.name}? Os documentos e as notas fiscais dele também são apagados.`)) return;
    try {
      await call(`/api/prestadores/${p.id}`, { method: "DELETE" });
      toast.success("Prestador excluído.");
      await load();
    } catch (err) {
      errorToast(err);
    }
  }

  const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const visible = useMemo(() => {
    const q = fold(search.trim());
    return (providers ?? []).filter(
      (p) =>
        (showInactive || p.active) &&
        (!department || p.department === department) &&
        (!q || fold([p.name, p.role, p.area, p.department].filter(Boolean).join(" ")).includes(q))
    );
  }, [providers, search, department, showInactive]);

  const scoped = useMemo(() => (providers ?? []).filter((p) => !department || p.department === department), [providers, department]);
  const stats = [
    { label: "Prestadores ativos", value: scoped.filter((p) => p.active).length, detail: "com contrato em aberto", icon: IconBriefcase },
    {
      label: "Vencendo",
      value: scoped.filter((p) => contractStatus(p).kind === "vencendo").length,
      detail: `contratos nos próximos ${EXPIRING_DAYS} dias`,
      icon: IconCalendarX,
    },
    { label: "Vencidos", value: scoped.filter((p) => contractStatus(p).kind === "vencido").length, detail: "ainda ativos no cadastro", icon: IconCalendarX },
    {
      label: "Notas pendentes",
      value: scoped.filter((p) => invoicePending(p, month)).length,
      detail: monthKeyLabel(month),
      icon: IconFile,
    },
  ];

  const companies = useMemo(
    () => [...new Set([...departments, ...(providers ?? []).map((p) => p.department).filter((d): d is string => !!d)])].sort(),
    [departments, providers]
  );

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Resumo dos prestadores" className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        {stats.map((card) => (
          <div key={card.label} className="flex flex-col gap-2.5 rounded-[14px] border border-border bg-surface p-4">
            <span className="flex items-center justify-between gap-2 text-[12.5px] font-semibold text-muted">
              {card.label}
              <card.icon className="h-4 w-4 shrink-0 text-muted" />
            </span>
            <span
              className={`font-display text-[30px] font-bold leading-none tabular-nums ${
                card.value > 0 && card.label === "Vencidos" ? "text-critical" : card.value > 0 && card.label === "Vencendo" ? "text-warn" : "text-ink"
              }`}
            >
              {card.value}
            </span>
            <span className="truncate text-xs text-muted" title={card.detail}>
              {card.detail}
            </span>
          </div>
        ))}
      </section>

      <section aria-label="Filtros" className="flex flex-wrap items-end gap-3 rounded-[14px] border border-border bg-surface px-4 py-3">
        <FilterField label="Mês das notas" className="w-full sm:w-44">
          <select value={month} onChange={(e) => setMonth(e.target.value)} className={selectClass}>
            {monthOptions().map((m) => (
              <option key={m} value={m}>
                {monthKeyLabel(m)}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Buscar" className="w-full sm:w-64">
          <div className="relative">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nome, função ou departamento"
              className="h-10 w-full rounded-[10px] border border-border bg-surface-2 pl-9 pr-3 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </div>
        </FilterField>
        <FilterField label="Empresa" className="w-full sm:w-44">
          <select value={department} onChange={(e) => setDepartment(e.target.value)} className={selectClass}>
            <option value="">Todas as empresas</option>
            {companies.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </FilterField>
        <label className="flex h-10 items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
          Mostrar encerrados
        </label>
      </section>

      <div className="rounded-[14px] border border-border bg-surface">
        {providers === null ? (
          <SkeletonRows />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<IconUsers className="h-6 w-6" />}
            title={providers.length ? "Nenhum prestador encontrado" : "Nenhum prestador cadastrado"}
            text={
              providers.length
                ? "Ajuste a busca, a empresa ou marque “Mostrar encerrados”."
                : "Clique em “Novo prestador” ou em “Importar planilha” para trazer a lista que vocês já têm."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2/60 text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-medium">Prestador</th>
                  <th className="px-4 py-3 font-medium">Empresa</th>
                  <th className="px-4 py-3 font-medium">Contrato</th>
                  <th className="px-4 py-3 font-medium">Nota de {monthKeyLabel(month).split(" de ")[0].toLowerCase()}</th>
                  <th className="px-4 py-3 font-medium">Documentos</th>
                  <th className="px-4 py-3 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => {
                  const pending = invoicePending(p, month);
                  const received = p.invoiceMonths.includes(month);
                  return (
                    <tr key={p.id} className={`border-b border-border last:border-0 hover:bg-surface-2/40 ${p.active ? "" : "opacity-60"}`}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-ink">
                          <button
                            type="button"
                            onClick={() => openSheet(p)}
                            className="text-left font-semibold text-ink underline-offset-4 hover:underline"
                            title="Abrir ficha"
                          >
                            {p.name}
                          </button>
                          {!p.active && (
                            <span className="ml-2 rounded-full border border-border-strong px-2 py-0.5 text-[11px] font-medium text-muted">encerrado</span>
                          )}
                        </p>
                        {(p.role || p.area) && <p className="text-xs text-muted">{[p.role, p.area].filter(Boolean).join(" · ")}</p>}
                      </td>
                      <td className="px-4 py-3 text-muted">{p.department || "—"}</td>
                      <td className="px-4 py-3">
                        <ContractBadge provider={p} />
                        <span className="mt-1 block text-xs text-muted">
                          {p.contractStart ? formatDateBR(p.contractStart) : "?"} → {p.contractEnd ? formatDateBR(p.contractEnd) : "sem validade"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {received ? (
                          <button type="button" onClick={() => openSheet(p, "notas")} className="text-xs font-semibold text-ok hover:underline">
                            Recebida
                          </button>
                        ) : pending ? (
                          <button type="button" onClick={() => openSheet(p, "notas")} className="text-xs font-semibold text-warn hover:underline">
                            Pendente · registrar
                          </button>
                        ) : (
                          <span className="text-xs text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => openSheet(p, "documentos")} className="text-xs text-muted hover:text-ink hover:underline">
                          {p.documentCount ? `${p.documentCount} ${p.documentCount === 1 ? "arquivo" : "arquivos"}` : "Enviar"}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <ActionButton label="Registrar nota fiscal" onClick={() => openSheet(p, "notas")}>
                            <IconFile className="h-4 w-4" />
                          </ActionButton>
                          <ActionButton label="Editar" onClick={() => openEdit(p)}>
                            <IconEdit className="h-4 w-4" />
                          </ActionButton>
                          {isAdmin && (
                            <ActionButton label="Excluir" onClick={() => remove(p)} danger>
                              <IconTrash className="h-4 w-4" />
                            </ActionButton>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="border-t border-border px-4 py-2.5 text-xs text-muted">
              Contratos que vencem em até {EXPIRING_DAYS} dias aparecem em amarelo; vencidos, em vermelho. A nota do mês é cobrada de quem tem
              contrato naquele mês.
            </p>
          </div>
        )}
      </div>

      <ProviderModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        provider={editing}
        departments={companies}
        areasBySector={areasBySector}
        saving={saving}
        onSave={save}
      />
      <ProviderSheet
        provider={sheet}
        tab={sheetTab}
        onTab={setSheetTab}
        month={month}
        onClose={() => setSheet(null)}
        onEdit={() => {
          setEditing(sheet);
          setFormOpen(true);
        }}
        onChanged={refreshSheet}
      />
      <ProviderImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        existingNames={(providers ?? []).map((p) => p.name)}
        departments={companies}
        companyNames={companyNames}
        onImported={load}
      />
    </div>
  );
}

function FilterField({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-1.5 text-sm ${className}`}>
      <span className="text-xs font-semibold text-muted">{label}</span>
      {children}
    </label>
  );
}
