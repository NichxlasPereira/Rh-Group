"use client";

import { FormEvent, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Modal } from "../Modal";
import { Button } from "../Button";
import { Field, inputClass } from "../attendance/formControls";
import { IconPaperclip, IconTrash } from "../icons";
import { monthKeyLabel } from "@/lib/attendance";
import { formatDateBR } from "@/lib/format";
import { formatFileSize } from "@/lib/attendance";
import { ProviderDetail, contractStatus, contractStatusLabel, formatCents } from "@/lib/providers";
import { ContractBadge } from "./ContractBadge";

export type SheetTab = "dados" | "documentos" | "notas";

interface Props {
  provider: ProviderDetail | null;
  tab: SheetTab;
  onTab: (tab: SheetTab) => void;
  month: string;
  onClose: () => void;
  onEdit: () => void;
  /** Recarrega a ficha (e a lista) depois de enviar ou apagar arquivos. */
  onChanged: () => Promise<void>;
}

async function send(url: string, init: RequestInit) {
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

/** Ficha do prestador: dados, documentos e notas fiscais. */
export function ProviderSheet({ provider, tab, onTab, month, onClose, onEdit, onChanged }: Props) {
  if (!provider) return null;
  const tabs: { key: SheetTab; label: string }[] = [
    { key: "dados", label: "Dados" },
    { key: "documentos", label: `Documentos · ${provider.documents.length}` },
    { key: "notas", label: `Notas fiscais · ${provider.invoices.length}` },
  ];

  return (
    <Modal
      open
      onClose={onClose}
      title={provider.name}
      maxWidthClassName="max-w-3xl"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onEdit}>
            Editar dados
          </Button>
          <Button type="button" onClick={onClose}>
            Fechar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 text-sm">
        <div className="flex flex-wrap items-center gap-2 text-muted">
          <span>{[provider.role, provider.area, provider.department].filter(Boolean).join(" · ") || "Prestador de serviço"}</span>
          <ContractBadge provider={provider} />
        </div>

        <div role="tablist" className="flex gap-1 border-b border-border">
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={tab === t.key}
              onClick={() => onTab(t.key)}
              className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-semibold transition ${
                tab === t.key ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "dados" && <DataTab provider={provider} />}
        {tab === "documentos" && <DocumentsTab provider={provider} onChanged={onChanged} />}
        {tab === "notas" && <InvoicesTab provider={provider} month={month} onChanged={onChanged} />}
      </div>
    </Modal>
  );
}

function DataTab({ provider: p }: { provider: ProviderDetail }) {
  const rows: [string, string | null][] = [
    ["Setor (empresa)", p.department],
    ["Cargo", p.role],
    ["Área", p.area],
    ["Início do contrato", p.contractStart ? formatDateBR(p.contractStart) : null],
    ["Validade do contrato", p.contractEnd ? `${formatDateBR(p.contractEnd)} · ${contractStatusLabel(contractStatus(p))}` : null],
  ];
  return <DataList title="Cadastro" rows={rows} />;
}

function DataList({ title, rows }: { title: string; rows: [string, string | null][] }) {
  return (
    <section className="rounded-[12px] border border-border bg-surface">
      <h3 className="border-b border-border px-4 py-2.5 font-display text-[15px] font-semibold text-ink">{title}</h3>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 px-4 py-3 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className={`break-words ${value ? "text-ink" : "text-muted"}`}>{value || "—"}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

function DocumentsTab({ provider, onChanged }: { provider: ProviderDetail; onChanged: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(e: FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!name.trim()) return toast.error("Informe qual é o documento.");
    if (!file) return toast.error("Selecione um arquivo.");
    const form = new FormData();
    form.set("name", name);
    form.set("file", file);
    setBusy(true);
    try {
      await send(`/api/prestadores/${provider.id}/documentos`, { method: "POST", body: form });
      setName("");
      if (fileRef.current) fileRef.current.value = "";
      await onChanged();
      toast.success("Documento enviado.");
    } catch (err) {
      errorToast(err);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, label: string) {
    if (!window.confirm(`Apagar o documento “${label}”?`)) return;
    try {
      await send(`/api/prestadores/documentos/${id}`, { method: "DELETE" });
      await onChanged();
    } catch (err) {
      errorToast(err);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={upload} className="grid grid-cols-1 items-end gap-3 rounded-[12px] border border-border bg-surface p-4 sm:grid-cols-[1fr_1fr_auto]">
        <Field label="Documento">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Contrato assinado" maxLength={80} className={inputClass(false)} />
        </Field>
        <Field label="Arquivo (PDF ou imagem, até 10 MB)">
          <input ref={fileRef} type="file" accept={ACCEPT} className="text-sm text-muted file:mr-3 file:rounded-full file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-ink" />
        </Field>
        <Button type="submit" disabled={busy} className="!px-4 !py-2 text-xs">
          {busy ? "Enviando…" : "Enviar"}
        </Button>
      </form>

      {provider.documents.length === 0 ? (
        <p className="text-muted">Nenhum documento ainda. Envie o contrato assinado, o cartão CNPJ ou outros arquivos do prestador.</p>
      ) : (
        <ul className="divide-y divide-border rounded-[12px] border border-border bg-surface">
          {provider.documents.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-3">
              <IconPaperclip className="h-4 w-4 shrink-0 text-muted" />
              <div className="min-w-0 flex-1">
                <a href={`/api/prestadores/documentos/${d.id}`} target="_blank" rel="noopener noreferrer" className="font-medium text-ink hover:underline">
                  {d.name}
                </a>
                <p className="truncate text-xs text-muted">
                  {d.fileName} · {formatFileSize(d.size)} · {formatDateBR(d.createdAt)}
                  {d.uploadedBy ? ` · ${d.uploadedBy}` : ""}
                </p>
              </div>
              <button type="button" onClick={() => remove(d.id, d.name)} title="Apagar" className="rounded-[8px] p-2 text-muted hover:bg-surface-2 hover:text-critical">
                <IconTrash className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function InvoicesTab({ provider, month, onChanged }: { provider: ProviderDetail; month: string; onChanged: () => Promise<void> }) {
  const [form, setForm] = useState({ month, number: "", amount: "", issueDate: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    const body = new FormData();
    for (const [k, v] of Object.entries(form)) body.set(k, v);
    const file = fileRef.current?.files?.[0];
    if (file) body.set("file", file);
    setBusy(true);
    try {
      await send(`/api/prestadores/${provider.id}/notas`, { method: "POST", body });
      setForm((f) => ({ ...f, number: "", amount: "", issueDate: "", notes: "" }));
      if (fileRef.current) fileRef.current.value = "";
      await onChanged();
      toast.success(`Nota de ${monthKeyLabel(form.month)} registrada.`);
    } catch (err) {
      errorToast(err);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, label: string) {
    if (!window.confirm(`Apagar a nota de ${label}?`)) return;
    try {
      await send(`/api/prestadores/notas/${id}`, { method: "DELETE" });
      await onChanged();
    } catch (err) {
      errorToast(err);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={add} className="grid grid-cols-1 items-end gap-3 rounded-[12px] border border-border bg-surface p-4 sm:grid-cols-3">
        <Field label="Mês (competência)">
          <input type="month" required value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} className={inputClass(false)} />
        </Field>
        <Field label="Número da nota (opcional)">
          <input value={form.number} maxLength={40} onChange={(e) => setForm({ ...form, number: e.target.value })} className={inputClass(false)} />
        </Field>
        <Field label="Valor (opcional)">
          <input value={form.amount} inputMode="decimal" placeholder="Ex.: 3.500,00" onChange={(e) => setForm({ ...form, amount: e.target.value })} className={inputClass(false)} />
        </Field>
        <Field label="Emissão (opcional)">
          <input type="date" value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} className={inputClass(false)} />
        </Field>
        <Field label="Arquivo da nota (opcional)">
          <input ref={fileRef} type="file" accept={ACCEPT} className="text-sm text-muted file:mr-3 file:rounded-full file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-ink" />
        </Field>
        <Button type="submit" disabled={busy || !form.month} className="!px-4 !py-2 text-xs">
          {busy ? "Registrando…" : "Registrar nota"}
        </Button>
      </form>

      {provider.invoices.length === 0 ? (
        <p className="text-muted">Nenhuma nota registrada ainda.</p>
      ) : (
        <ul className="divide-y divide-border rounded-[12px] border border-border bg-surface">
          {provider.invoices.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink">
                  {monthKeyLabel(i.month)}
                  {i.number ? <span className="font-normal text-muted"> · nº {i.number}</span> : null}
                </p>
                <p className="text-xs text-muted">
                  {[i.amountCents !== null ? formatCents(i.amountCents) : null, i.issueDate ? `emitida em ${formatDateBR(i.issueDate)}` : null, i.uploadedBy ? `registrada por ${i.uploadedBy}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              {i.fileName ? (
                <a href={`/api/prestadores/notas/${i.id}`} target="_blank" rel="noopener noreferrer" className="flex max-w-[12rem] items-center gap-1 text-xs text-accent-strong hover:underline" title={i.fileName}>
                  <IconPaperclip className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{i.fileName}</span>
                </a>
              ) : (
                <span className="text-xs text-muted">sem arquivo</span>
              )}
              <button type="button" onClick={() => remove(i.id, monthKeyLabel(i.month))} title="Apagar" className="rounded-[8px] p-2 text-muted hover:bg-surface-2 hover:text-critical">
                <IconTrash className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
