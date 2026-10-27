"use client";

import { TabKey } from "./Tabs";
import { IconSearch } from "./icons";

export type MaterialSortKey = "nome" | "estoque-asc" | "estoque-desc";

interface SearchPanelProps {
  tab: TabKey;
  categories: string[];
  materialSearch: string;
  onMaterialSearchChange: (value: string) => void;
  materialCategory: string;
  onMaterialCategoryChange: (value: string) => void;
  materialSort: MaterialSortKey;
  onMaterialSortChange: (value: MaterialSortKey) => void;
  historySearch: string;
  onHistorySearchChange: (value: string) => void;
}

export function SearchPanel({
  tab,
  categories,
  materialSearch,
  onMaterialSearchChange,
  materialCategory,
  onMaterialCategoryChange,
  materialSort,
  onMaterialSortChange,
  historySearch,
  onHistorySearchChange,
}: SearchPanelProps) {
  if (tab === "relatorios") return null;

  return (
    <aside className="flex w-full shrink-0 flex-col gap-4 rounded-[14px] border border-border bg-surface p-4 xl:w-64">
      <h2 className="font-display text-base font-semibold text-ink">Pesquisar</h2>

      {tab === "estoque" ? (
        <>
          <Field label="Buscar">
            <SearchInput
              value={materialSearch}
              onChange={onMaterialSearchChange}
              placeholder="Nome, fornecedor ou local"
            />
          </Field>

          <Field label="Categoria">
            <select
              value={materialCategory}
              onChange={(e) => onMaterialCategoryChange(e.target.value)}
              className="w-full rounded-[10px] border border-border bg-surface-2 px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
            >
              <option value="">Todas as categorias</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Ordenar por">
            <select
              value={materialSort}
              onChange={(e) => onMaterialSortChange(e.target.value as MaterialSortKey)}
              className="w-full rounded-[10px] border border-border bg-surface-2 px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
            >
              <option value="nome">Nome (A-Z)</option>
              <option value="estoque-asc">Estoque (crescente)</option>
              <option value="estoque-desc">Estoque (decrescente)</option>
            </select>
          </Field>
        </>
      ) : (
        <Field label="Buscar">
          <SearchInput
            value={historySearch}
            onChange={onHistorySearchChange}
            placeholder="Material ou responsável"
          />
        </Field>
      )}
    </aside>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-[10px] border border-border bg-surface-2 py-2 pl-9 pr-3 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
      />
    </div>
  );
}
