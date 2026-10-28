"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Button } from "../Button";
import { IconPaperclip, IconX } from "../icons";
import { Field, inputClass } from "../attendance/formControls";
import { MAX_ATTACHMENT_MB, formatFileSize } from "@/lib/attendance";
import {
  INVOICE_ACCEPT,
  MAX_INVOICE_FILES,
  competenceLabel,
  defaultCompetence,
  parseAmountCents,
  recentCompetences,
} from "@/lib/invoices";

/** Envio da nota fiscal: mês, arquivos e, se quiser, número, valor e recado ao RH. */
export function PortalInvoiceForm({ onCancel, onSent }: { onCancel: () => void; onSent: () => void }) {
  const [competence, setCompetence] = useState(defaultCompetence());
  const [files, setFiles] = useState<File[]>([]);
  const [number, setNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<{ files?: string; amount?: string; form?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function addFiles(list: FileList | null) {
    if (!list) return;
    const tooBig = Array.from(list).filter((f) => f.size > MAX_ATTACHMENT_MB * 1024 * 1024);
    const next = [...files, ...Array.from(list).filter((f) => !tooBig.includes(f))].slice(0, MAX_INVOICE_FILES);
    setFiles(next);
    setErrors((e) => ({
      ...e,
      files: tooBig.length ? `Acima de ${MAX_ATTACHMENT_MB} MB, não adicionado: ${tooBig.map((f) => f.name).join(", ")}.` : undefined,
    }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (files.length === 0) errs.files = "Anexe o PDF ou o XML da nota.";
    if (amount.trim() && parseAmountCents(amount) === null) errs.amount = "Valor inválido. Use, por exemplo, 6.500,00.";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const form = new FormData();
    form.append("competence", competence);
    form.append("number", number);
    form.append("amount", amount);
    form.append("notes", notes);
    for (const f of files) form.append("files", f);

    setSubmitting(true);
    try {
      const res = await fetch("/api/portal/notas", { method: "POST", body: form });
      if (res.status === 401) return router.replace("/portal/entrar");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErrors({ form: body.error || "Não foi possível enviar a nota." });
        return;
      }
      toast.success("Nota enviada ao RH.");
      onSent();
    } catch {
      setErrors({ form: "Sem conexão. Tente de novo." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-1 flex-col lg:gap-5">
      {/* Celular: uma coluna. Computador: dados à esquerda, arquivos à direita, num cartão. */}
      <div className="flex flex-1 flex-col gap-5 px-4 pb-6 pt-2 lg:grid lg:flex-none lg:grid-cols-2 lg:gap-x-8 lg:rounded-[16px] lg:border lg:border-border lg:bg-surface lg:p-6">
        <Field label="Mês da nota (competência)">
          <select value={competence} onChange={(e) => setCompetence(e.target.value)} className={inputClass(false) + " h-12 text-base"}>
            {recentCompetences().map((c) => (
              <option key={c} value={c}>
                {competenceLabel(c)}
              </option>
            ))}
          </select>
        </Field>

        <div className="flex flex-col gap-2 text-sm lg:col-start-2 lg:row-span-3 lg:row-start-1">
          <span className="font-medium text-ink">Arquivos da nota</span>
          {files.map((f, i) => (
            <div key={`${f.name}-${i}`} className="flex items-center gap-3 rounded-[12px] border border-border bg-surface px-3 py-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-surface-2 font-mono text-[10.5px] font-semibold uppercase text-ink">
                {f.name.split(".").pop()?.slice(0, 4) || "arq"}
              </span>
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate font-semibold text-ink">{f.name}</span>
                <span className="text-xs text-muted">{formatFileSize(f.size)}</span>
              </span>
              <button
                type="button"
                onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                aria-label={`Remover ${f.name}`}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-muted transition hover:bg-surface-2 hover:text-critical"
              >
                <IconX className="h-4 w-4" />
              </button>
            </div>
          ))}
          {files.length < MAX_INVOICE_FILES && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className={`flex h-12 items-center justify-center gap-2 rounded-[12px] border border-dashed font-semibold text-ink transition hover:bg-surface ${
                errors.files ? "border-critical" : "border-border-strong"
              }`}
            >
              <IconPaperclip className="h-4 w-4" />
              {files.length === 0 ? "Anexar PDF ou XML" : "Anexar outro arquivo"}
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={INVOICE_ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          {errors.files ? (
            <span className="text-xs text-critical">{errors.files}</span>
          ) : (
            <span className="text-xs leading-relaxed text-muted">
              Mande o PDF e, se tiver, o XML que a prefeitura gera junto: com ele a conferência é mais rápida. Até {MAX_ATTACHMENT_MB} MB cada.
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Número (opcional)">
            <input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              inputMode="numeric"
              placeholder="1234"
              className={inputClass(false) + " h-12 font-mono text-base"}
            />
          </Field>
          <Field label="Valor (opcional)" error={errors.amount}>
            <input
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setErrors((er) => ({ ...er, amount: undefined }));
              }}
              inputMode="decimal"
              placeholder="6.500,00"
              className={inputClass(!!errors.amount) + " h-12 font-mono text-base"}
            />
          </Field>
        </div>

        <Field label="Recado para o RH (opcional)">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className={inputClass(false) + " resize-none text-base"}
          />
        </Field>

        {errors.form && (
          <p className="rounded-[12px] bg-critical-soft px-3.5 py-2.5 text-sm text-critical lg:col-span-2">{errors.form}</p>
        )}
      </div>

      <footer className="sticky bottom-0 border-t border-border bg-bg/95 px-4 pb-6 pt-3 backdrop-blur lg:static lg:flex lg:justify-end lg:gap-3 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting} className="hidden lg:inline-flex">
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting} className="h-12 w-full !rounded-[12px] text-[15px] lg:h-auto lg:w-auto lg:!rounded-full lg:text-sm">
          {submitting ? "Enviando..." : "Enviar nota ao RH"}
        </Button>
      </footer>
    </form>
  );
}
