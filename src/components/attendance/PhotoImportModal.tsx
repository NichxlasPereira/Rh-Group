"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Modal } from "../Modal";
import { Button } from "../Button";
import { Employee, MAX_ATTACHMENT_MB } from "@/lib/attendance";
import { DISPLAYABLE_IMAGE, PHOTO_DOCUMENT_NAME } from "@/lib/employeeProfile";
import { PhotoMatchKind, matchPhoto } from "@/lib/photoMatch";

interface PhotoImportModalProps {
  open: boolean;
  onClose: () => void;
  employees: Employee[];
  /** Recarrega a lista (e os aniversariantes, que mostram a foto) depois de enviar. */
  onImported: () => Promise<void>;
}

type RowStatus = "pronta" | "enviando" | "enviada" | "erro";

interface Row {
  key: string;
  file: File;
  preview: string | null;
  kind: PhotoMatchKind | "manual" | "invalida";
  /** Por que a foto não pode ir (formato ou tamanho). */
  invalid?: string;
  employeeId: string;
  /** Quem pode ser, quando o nome deixa dúvida. */
  candidates: string[];
  include: boolean;
  status: RowStatus;
  error?: string;
}

const KIND_LABEL: Record<Row["kind"], { label: string; tone: string }> = {
  exato: { label: "Nome igual", tone: "bg-ok-soft text-ok" },
  provavel: { label: "Confira", tone: "bg-warn-soft text-warn" },
  manual: { label: "Escolhido por você", tone: "bg-accent-soft text-accent-strong" },
  duvida: { label: "Escolha a pessoa", tone: "bg-critical-soft text-critical" },
  nenhum: { label: "Não encontrado", tone: "bg-critical-soft text-critical" },
  invalida: { label: "Não dá para enviar", tone: "bg-surface-2 text-muted" },
};

const MAX_BYTES = MAX_ATTACHMENT_MB * 1024 * 1024;

/**
 * Fotos para crachá em lote: o RH escolhe as fotos (com o nome da pessoa no nome
 * do arquivo), confere de quem é cada uma e só então envia. Foto com dúvida
 * não vai sem o RH escolher a pessoa.
 */
export function PhotoImportModal({ open, onClose, employees, onImported }: PhotoImportModalProps) {
  const [rows, setRows] = useState<Row[]>([]);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const people = useMemo(
    () => employees.filter((e) => e.active).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [employees]
  );
  const nameById = useMemo(() => new Map(employees.map((e) => [e.id, e.name])), [employees]);

  // Prévias ficam na memória do navegador até a foto sair da lista ou o modal fechar.
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);
  useEffect(() => () => rowsRef.current.forEach(revoke), []);

  function close() {
    if (sending) return;
    rows.forEach(revoke);
    setRows([]);
    setDone(false);
    onClose();
  }

  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const added: Row[] = [...list].map((file, i) => {
      const invalid = !DISPLAYABLE_IMAGE.test(file.type)
        ? "Formato não aceito: use JPG, PNG ou WEBP."
        : file.size > MAX_BYTES
          ? `Maior que ${MAX_ATTACHMENT_MB} MB.`
          : undefined;
      const match = matchPhoto(file.name, people);
      return {
        key: `${file.name}-${file.size}-${file.lastModified}-${i}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        preview: invalid ? null : URL.createObjectURL(file),
        kind: invalid ? "invalida" : match.kind,
        invalid,
        employeeId: match.person?.id ?? "",
        candidates: match.candidates.map((c) => c.id),
        include: !invalid && (match.kind === "exato" || match.kind === "provavel"),
        status: "pronta",
      };
    });
    setRows((current) => markRepeated([...current, ...added]));
    setDone(false);
  }

  function choose(key: string, employeeId: string) {
    setRows((current) =>
      markRepeated(
        current.map((r) => (r.key === key ? { ...r, employeeId, kind: employeeId ? "manual" : "duvida", include: !!employeeId } : r))
      )
    );
  }

  function toggle(key: string, include: boolean) {
    setRows((current) => current.map((r) => (r.key === key ? { ...r, include } : r)));
  }

  function remove(key: string) {
    const row = rows.find((r) => r.key === key);
    if (row) revoke(row);
    setRows((current) => current.filter((r) => r.key !== key));
  }

  const ready = rows.filter((r) => r.include && r.employeeId && r.status !== "enviada" && !r.invalid);
  const repeated = repeatedIds(rows);
  const blocked = ready.some((r) => repeated.has(r.employeeId));
  const counts = rows.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.kind]: (acc[r.kind] ?? 0) + 1 }), {});

  async function send() {
    setSending(true);
    let ok = 0;
    for (const row of ready) {
      setRows((current) => current.map((r) => (r.key === row.key ? { ...r, status: "enviando", error: undefined } : r)));
      const form = new FormData();
      form.append("name", PHOTO_DOCUMENT_NAME);
      form.append("file", row.file);
      const res = await fetch(`/api/employees/${row.employeeId}/documents`, { method: "POST", body: form }).catch(() => null);
      const error = res?.ok ? undefined : (await res?.json().catch(() => ({})))?.error || "Não foi possível enviar.";
      if (!error) ok += 1;
      setRows((current) =>
        current.map((r) => (r.key === row.key ? { ...r, status: error ? "erro" : "enviada", error, include: !!error } : r))
      );
    }
    setSending(false);
    setDone(true);
    await onImported();
    if (ok === ready.length) toast.success(`${ok} ${ok === 1 ? "foto enviada" : "fotos enviadas"}.`);
    else toast.error(`${ok} de ${ready.length} fotos enviadas. Veja as que deram erro na lista.`, { duration: 8000 });
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Enviar fotos para crachá"
      maxWidthClassName="max-w-4xl"
      footer={
        <>
          <Button variant="ghost" type="button" onClick={close} disabled={sending}>
            {done ? "Concluir" : "Cancelar"}
          </Button>
          <Button type="button" onClick={send} disabled={sending || ready.length === 0 || blocked}>
            {sending
              ? "Enviando..."
              : `Enviar ${ready.length} ${ready.length === 1 ? "foto" : "fotos"}`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          Coloque o <strong className="text-ink">nome do colaborador no nome do arquivo</strong> (ex.:{" "}
          <span className="font-mono text-xs text-ink">Maria Souza.jpg</span>). O sistema acha a pessoa e mostra abaixo
          para você conferir. Só vão as fotos marcadas; com dúvida, escolha a pessoa antes. A foto nova passa a ser a do
          crachá e a anterior continua nos documentos.
        </p>

        <label className="flex cursor-pointer flex-col items-center gap-1 rounded-[12px] border border-dashed border-border-strong bg-surface-2/50 px-4 py-5 text-center transition hover:bg-surface-2 focus-within:ring-2 focus-within:ring-accent">
          <span className="text-sm font-semibold text-ink">{rows.length ? "Adicionar mais fotos" : "Escolher as fotos"}</span>
          <span className="text-xs text-muted">JPG, PNG ou WEBP, até {MAX_ATTACHMENT_MB} MB cada. Pode escolher várias de uma vez.</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={sending}
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
            className="sr-only"
          />
        </label>

        {rows.length > 0 && (
          <>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(KIND_LABEL) as Row["kind"][])
                .filter((k) => counts[k])
                .map((k) => (
                  <span key={k} className={`rounded-full px-3 py-1 text-xs font-bold ${KIND_LABEL[k].tone}`}>
                    {counts[k]} · {KIND_LABEL[k].label}
                  </span>
                ))}
            </div>
            {blocked && (
              <p className="rounded-[10px] bg-critical-soft px-3 py-2 text-xs font-semibold text-critical">
                Duas fotos marcadas para a mesma pessoa. Desmarque uma ou troque a pessoa.
              </p>
            )}
            <ul className="flex max-h-[50vh] flex-col overflow-auto rounded-[12px] border border-border">
              {rows.map((r) => {
                const isRepeated = r.include && !!r.employeeId && repeated.has(r.employeeId);
                // Nomes parecidos no topo da lista quando o sistema não escolheu sozinho.
                const options = r.kind === "exato" || r.kind === "provavel" ? [] : r.candidates;
                return (
                  <li
                    key={r.key}
                    className={`flex flex-wrap items-center gap-3 border-b border-border px-3 py-2.5 last:border-b-0 ${
                      isRepeated ? "bg-critical-soft/40" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={r.include}
                      disabled={sending || !!r.invalid || !r.employeeId || r.status === "enviada"}
                      onChange={(e) => toggle(r.key, e.target.checked)}
                      aria-label={`Enviar ${r.file.name}`}
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-surface-2 text-[10px] text-muted">
                      {r.preview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.preview} alt="" className="h-full w-full object-cover" />
                      ) : (
                        "sem prévia"
                      )}
                    </span>
                    <span className="flex min-w-[160px] flex-1 flex-col gap-0.5">
                      <span className="truncate font-mono text-xs text-ink" title={r.file.name}>
                        {r.file.name}
                      </span>
                      <span className={`self-start rounded-full px-2 py-0.5 text-[11px] font-bold ${KIND_LABEL[r.kind].tone}`}>
                        {KIND_LABEL[r.kind].label}
                      </span>
                    </span>
                    <span className="flex min-w-[220px] flex-1 flex-col gap-0.5">
                      {r.invalid ? (
                        <span className="text-xs text-muted">{r.invalid}</span>
                      ) : (
                        <select
                          value={r.employeeId}
                          disabled={sending || r.status === "enviada"}
                          onChange={(e) => choose(r.key, e.target.value)}
                          aria-label={`De quem é ${r.file.name}`}
                          className="h-9 rounded-[9px] border border-border bg-surface px-2 text-[13px] text-ink focus:border-accent focus:outline-none"
                        >
                          <option value="">Escolha a pessoa...</option>
                          {options.length > 0 && (
                            <optgroup label="Nomes parecidos">
                              {options.map((id) => (
                                <option key={id} value={id}>
                                  {nameById.get(id)}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          <optgroup label="Todos os colaboradores ativos">
                            {people.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                                {p.department ? ` · ${p.department}` : ""}
                              </option>
                            ))}
                          </optgroup>
                        </select>
                      )}
                      {isRepeated && <span className="text-xs font-semibold text-critical">Outra foto marcada para esta pessoa.</span>}
                      {r.error && <span className="text-xs text-critical">{r.error}</span>}
                    </span>
                    <span className="flex w-24 shrink-0 justify-end">
                      {r.status === "enviando" ? (
                        <span className="text-xs font-semibold text-muted">Enviando...</span>
                      ) : r.status === "enviada" ? (
                        <span className="text-xs font-bold text-ok">Enviada</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => remove(r.key)}
                          disabled={sending}
                          className="text-xs font-semibold text-muted underline-offset-2 hover:text-ink hover:underline"
                        >
                          Tirar da lista
                        </button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </Modal>
  );
}

function revoke(row: Row) {
  if (row.preview) URL.revokeObjectURL(row.preview);
}

/** Pessoas com mais de uma foto marcada (que ainda não foi enviada). */
function repeatedIds(rows: Row[]): Set<string> {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const r of rows) {
    if (!r.include || !r.employeeId || r.status === "enviada") continue;
    if (seen.has(r.employeeId)) repeated.add(r.employeeId);
    seen.add(r.employeeId);
  }
  return repeated;
}

/** Duas fotos que acharam a mesma pessoa sozinhas: nenhuma vai sem o RH decidir. */
function markRepeated(rows: Row[]): Row[] {
  const repeated = repeatedIds(rows.filter((r) => r.kind === "exato" || r.kind === "provavel"));
  return rows.map((r) =>
    (r.kind === "exato" || r.kind === "provavel") && repeated.has(r.employeeId) ? { ...r, kind: "duvida", include: false } : r
  );
}
