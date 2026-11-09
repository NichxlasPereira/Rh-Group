"use client";

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Modal } from "../Modal";
import { Button } from "../Button";
import { inputClass } from "../attendance/formControls";
import { parseProviderSheet, validateProviderInput } from "@/lib/providers";

interface Props {
  open: boolean;
  onClose: () => void;
  existingNames: string[];
  /** Empresas do grupo (mesmo "Setor (empresa)" dos colaboradores). */
  departments: string[];
  /** Razão social de cada empresa (sigla → nome), para reconhecer o nome da planilha. */
  companyNames?: Record<string, string>;
  onImported: () => Promise<void>;
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const key = (s: string) => fold(s).replace(/[^a-z0-9]+/g, " ").trim();

/** Cada palavra do valor é começo da palavra correspondente do nome ("nowpro tec" ↔ "nowpro technology and solutions ltda"). */
const wordsPrefix = (value: string, name: string) => {
  const v = value.split(" ");
  const n = name.split(" ");
  return v.length <= n.length && v.every((w, i) => n[i].startsWith(w));
};

/**
 * Empresa da planilha → empresa cadastrada, pela sigla ou pela razão social:
 * "NOWPRO.AI" → NOWPRO AI; "NOWPRO TECHNOLOGY" ou "nowpro.tec" → NOWPRO
 * (NOWPRO TECHNOLOGY AND SOLUTIONS LTDA). Se ficar em dúvida, deixa para escolher.
 */
function matchCompany(value: string | undefined, departments: string[], fullNames: Record<string, string>): string {
  if (!value) return "";
  const v = key(value);
  if (!v) return "";
  const exact = departments.filter((d) => key(d) === v || key(fullNames[d] ?? "") === v);
  if (exact.length === 1) return exact[0];
  const close = departments.filter((d) => {
    const full = key(fullNames[d] ?? "");
    return (full && wordsPrefix(v, full)) || v.startsWith(key(d) + " ");
  });
  return close.length === 1 ? close[0] : "";
}

/**
 * Importa prestadores colando a planilha (copiar no Excel/Google Planilhas e
 * colar aqui, com a linha de títulos). Mostra o que vai entrar antes de salvar.
 */
export function ProviderImportModal({ open, onClose, existingNames, departments, companyNames = {}, onImported }: Props) {
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  // Empresa escolhida à mão em cada linha (índice → empresa).
  const [companyOverride, setCompanyOverride] = useState<Record<number, string>>({});

  const parsed = useMemo(() => parseProviderSheet(raw), [raw]);
  const existing = useMemo(() => new Set(existingNames.map(fold)), [existingNames]);
  const preview = useMemo(
    () =>
      parsed.rows.map((sheetRow, i) => {
        const company = companyOverride[i] ?? matchCompany(sheetRow.department, departments, companyNames);
        const row: Record<string, string> = { ...sheetRow, department: company };
        const result = validateProviderInput(row);
        const duplicate = existing.has(fold(row.name ?? ""));
        return {
          row,
          sheetCompany: sheetRow.department ?? "",
          error: "error" in result ? result.error : duplicate ? "Já cadastrado — fica de fora." : null,
          duplicate,
        };
      }),
    [parsed, existing, departments, companyNames, companyOverride]
  );
  const ready = preview.filter((p) => !p.error);

  function close() {
    setRaw("");
    setCompanyOverride({});
    onClose();
  }

  async function importAll() {
    setBusy(true);
    let ok = 0;
    const failed: string[] = [];
    for (const p of ready) {
      const res = await fetch("/api/prestadores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p.row) });
      if (res.ok) ok++;
      else failed.push(p.row.name);
    }
    setBusy(false);
    await onImported();
    if (failed.length) toast.error(`Não importados: ${failed.join(", ")}`);
    if (ok) toast.success(`${ok} ${ok === 1 ? "prestador importado" : "prestadores importados"}.`);
    if (!failed.length) close();
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Importar prestadores"
      maxWidthClassName="max-w-3xl"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={close}>
            Cancelar
          </Button>
          <Button type="button" onClick={importAll} disabled={busy || ready.length === 0}>
            {busy ? "Importando…" : ready.length ? `Importar ${ready.length}` : "Importar"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 text-sm">
        <p className="text-muted">
          Na planilha, selecione as linhas <strong className="text-ink">com a linha de títulos</strong> (NOME, DATA NASCIMENTO, RG, CPF, TELEFONE,
          EMPRESA, FUNÇÃO, Data de Contratação, Término do contrato, DEPARTAMENTO, Dados bancários…), copie e cole aqui. Nada é salvo até você
          clicar em Importar.
        </p>
        <textarea
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            setCompanyOverride({});
          }}
          rows={6}
          placeholder="Cole aqui a planilha…"
          className={inputClass(false) + " font-mono text-xs"}
        />

        {parsed.unknownColumns.length > 0 && (
          <p className="text-xs text-muted">Colunas ignoradas: {parsed.unknownColumns.join(", ")}</p>
        )}

        {preview.length > 0 && (
          <div className="overflow-x-auto rounded-[12px] border border-border">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-border bg-surface-2/60 text-xs uppercase tracking-wide text-muted">
                  <th className="px-3 py-2 font-medium">Nome</th>
                  <th className="px-3 py-2 font-medium">Empresa</th>
                  <th className="px-3 py-2 font-medium">Função</th>
                  <th className="px-3 py-2 font-medium">Contrato</th>
                  <th className="px-3 py-2 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((p, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 font-medium text-ink">{p.row.name}</td>
                    <td className="px-3 py-2">
                      <select
                        value={p.row.department}
                        onChange={(e) => setCompanyOverride((o) => ({ ...o, [i]: e.target.value }))}
                        className={`rounded-[8px] border bg-surface-2 px-2 py-1 text-[13px] ${p.row.department ? "border-border text-ink" : "border-warn text-warn"}`}
                        title={p.sheetCompany ? `Na planilha: ${p.sheetCompany}` : undefined}
                      >
                        <option value="">{p.sheetCompany ? `Escolha (planilha: ${p.sheetCompany})` : "Sem empresa"}</option>
                        {departments.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-muted">{p.row.role || "—"}</td>
                    <td className="px-3 py-2 text-muted">
                      {p.row.contractStart || "?"} → {p.row.contractEnd || "sem término"}
                    </td>
                    <td className={`px-3 py-2 ${p.error ? (p.duplicate ? "text-muted" : "text-critical") : "text-ok"}`}>{p.error ?? "Pronto"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}
