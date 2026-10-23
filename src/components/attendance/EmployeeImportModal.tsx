"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Modal } from "../Modal";
import { Button } from "../Button";
import { IMPORT_LABELS, ImportAction, ImportResult, parseTable, rowsFromTable } from "@/lib/employeeRecord";

interface EmployeeImportModalProps {
  open: boolean;
  onClose: () => void;
  /** Recarrega colaboradores e áreas depois de importar. */
  onImported: () => Promise<void>;
}

interface Preview {
  summary: Record<ImportAction, number>;
  results: ImportResult[];
  applied: boolean;
}

const ACTION_LABEL: Record<ImportAction, { label: string; tone: string }> = {
  atualizar: { label: "Atualizar", tone: "bg-ok-soft text-ok" },
  criar: { label: "Novo", tone: "bg-accent-soft text-accent-strong" },
  sem_mudancas: { label: "Sem mudanças", tone: "bg-surface-2 text-muted" },
  nao_encontrado: { label: "Não encontrado", tone: "bg-warn-soft text-warn" },
  ignorar: { label: "Ignorada", tone: "bg-critical-soft text-critical" },
};

/** Importa a planilha de colaboradores (colada do Excel/Sheets ou CSV) para a ficha cadastral. */
export function EmployeeImportModal({ open, onClose, onImported }: EmployeeImportModalProps) {
  const [text, setText] = useState("");
  const [createMissing, setCreateMissing] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);

  const parsed = text.trim() ? rowsFromTable(parseTable(text)) : null;

  function close() {
    setText("");
    setPreview(null);
    setCreateMissing(false);
    onClose();
  }

  async function loadFile(file: File | undefined) {
    if (!file) return;
    if (/\.xlsx?$/i.test(file.name)) {
      toast.error("Arquivo do Excel: copie as células (com o cabeçalho) e cole no campo, ou salve como CSV.", {
        duration: 8000,
      });
      return;
    }
    setText(await file.text());
    setPreview(null);
  }

  async function run(apply: boolean) {
    if (!parsed) return;
    setBusy(true);
    const res = await fetch("/api/employees/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: parsed.rows, apply, createMissing }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      toast.error(body.error || "Não foi possível importar.");
      return;
    }
    setPreview(body);
    if (apply) {
      await onImported();
      toast.success("Planilha importada.");
    }
  }

  const toApply = preview ? preview.summary.atualizar + preview.summary.criar : 0;

  return (
    <Modal
      open={open}
      onClose={close}
      title="Importar planilha de colaboradores"
      maxWidthClassName="max-w-4xl"
      footer={
        preview?.applied ? (
          <Button type="button" onClick={close}>
            Concluir
          </Button>
        ) : preview ? (
          <>
            <Button variant="ghost" type="button" onClick={() => setPreview(null)} disabled={busy}>
              Voltar
            </Button>
            <Button type="button" onClick={() => run(true)} disabled={busy || toApply === 0}>
              {busy ? "Importando..." : `Importar ${toApply} ${toApply === 1 ? "colaborador" : "colaboradores"}`}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" type="button" onClick={close}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => run(false)} disabled={busy || !parsed?.rows.length}>
              {busy ? "Conferindo..." : "Conferir"}
            </Button>
          </>
        )
      }
    >
      {!preview ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            Na planilha, selecione as células <strong className="text-ink">com a linha do cabeçalho</strong>, copie e cole
            abaixo. Também dá para enviar um arquivo CSV. O sistema encontra cada pessoa pelo CPF ou pelo nome; células
            vazias não apagam o que já está na ficha.
          </p>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setPreview(null);
            }}
            rows={8}
            placeholder={"NOME\tDATA NASCIMENTO\tRG\tCPF\tTELEFONE\t...\nMaria Silva\t31/12/1990\t..."}
            className="w-full rounded-[10px] border border-border bg-surface-2 px-3 py-2 font-mono text-xs text-ink placeholder:text-muted focus:border-accent focus:outline-none"
            aria-label="Linhas da planilha"
            spellCheck={false}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="cursor-pointer rounded-[8px] border border-border-strong bg-surface px-3 py-1.5 text-[13px] font-semibold text-ink transition hover:bg-surface-2 focus-within:ring-2 focus-within:ring-accent">
              Enviar arquivo CSV
              <input
                type="file"
                accept=".csv,.tsv,.txt,text/csv,text/plain,.xlsx,.xls"
                onChange={(e) => {
                  loadFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
                className="sr-only"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={createMissing}
                onChange={(e) => setCreateMissing(e.target.checked)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              Cadastrar como novos quem não for encontrado
            </label>
          </div>

          {parsed && (
            <div className="flex flex-col gap-2 rounded-[12px] border border-border bg-surface-2/50 p-3 text-sm">
              <span className="text-ink">
                <strong>{parsed.rows.length}</strong> {parsed.rows.length === 1 ? "linha" : "linhas"} de colaboradores.
                Colunas reconhecidas:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {parsed.columns.map((c) => (
                  <span key={c} className="rounded-full bg-ok-soft px-2.5 py-0.5 text-xs font-semibold text-ok">
                    {IMPORT_LABELS[c]}
                  </span>
                ))}
                {parsed.ignored.map((h) => (
                  <span
                    key={h}
                    title="Coluna não reconhecida: fica de fora"
                    className="rounded-full bg-surface px-2.5 py-0.5 text-xs font-semibold text-muted line-through"
                  >
                    {h}
                  </span>
                ))}
              </div>
              {!parsed.columns.includes("name") && !parsed.columns.includes("cpf") && (
                <span className="text-xs text-critical">
                  Falta a coluna NOME (ou CPF) para saber de quem é cada linha.
                </span>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(ACTION_LABEL) as ImportAction[])
              .filter((a) => preview.summary[a] > 0)
              .map((a) => (
                <span key={a} className={`rounded-full px-3 py-1 text-xs font-bold ${ACTION_LABEL[a].tone}`}>
                  {preview.summary[a]} · {ACTION_LABEL[a].label}
                </span>
              ))}
          </div>
          <p className="text-sm text-muted">
            {preview.applied
              ? "Importação concluída. As fichas já mostram os dados novos."
              : "Confira antes de importar. Os dados pessoais não aparecem aqui: só os campos que vão mudar."}
          </p>
          <div className="max-h-[50vh] overflow-auto rounded-[12px] border border-border">
            <table className="w-full text-left text-[13px]">
              <thead className="sticky top-0 bg-surface-2 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Linha</th>
                  <th className="px-3 py-2 font-medium">Planilha</th>
                  <th className="px-3 py-2 font-medium">Colaborador</th>
                  <th className="px-3 py-2 font-medium">O que muda</th>
                </tr>
              </thead>
              <tbody>
                {preview.results.map((r) => (
                  <tr key={r.line} className="border-t border-border align-top">
                    <td className="px-3 py-2 font-mono text-xs text-muted">{r.line}</td>
                    <td className="px-3 py-2 text-ink">{r.name || "—"}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${ACTION_LABEL[r.action].tone}`}>
                        {ACTION_LABEL[r.action].label}
                      </span>
                      {r.employee && r.action !== "criar" && <span className="block text-xs text-muted">{r.employee}</span>}
                    </td>
                    <td className="px-3 py-2">
                      {r.changes.length > 0 && <span className="text-ink">{r.changes.join(", ")}</span>}
                      {r.warnings.map((w) => (
                        <span key={w} className="block text-xs text-warn">
                          {w}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}
