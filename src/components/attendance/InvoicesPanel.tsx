"use client";

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Modal } from "../Modal";
import { Button } from "../Button";
import { IconCheckCircle, IconFile, IconPaperclip, IconSearch, IconX } from "../icons";
import { EmptyState, Field, SkeletonRows, inputClass } from "./formControls";
import {
  INVOICE_STATUS_LABEL,
  InvoiceStatus,
  ServiceInvoiceRow,
  competenceLabel,
  formatCents,
} from "@/lib/invoices";
import { formatDateBR } from "@/lib/format";
import { formatFileSize } from "@/lib/attendance";

const STATUS_STYLE: Record<InvoiceStatus, string> = {
  enviada: "bg-warn-soft text-warn",
  recebida: "bg-ok-soft text-ok",
  recusada: "bg-critical-soft text-critical",
};

const FILTERS: { key: InvoiceStatus | "todas"; label: string }[] = [
  { key: "enviada", label: "Para conferir" },
  { key: "recebida", label: "Recebidas" },
  { key: "recusada", label: "Recusadas" },
  { key: "todas", label: "Todas" },
];

interface InvoicesPanelProps {
  invoices: ServiceInvoiceRow[] | null;
  onChanged: () => Promise<void> | void;
}

/** Notas fiscais enviadas pelo portal do colaborador: o RH abre os arquivos e marca recebida ou recusada. */
export function InvoicesPanel({ invoices, onChanged }: InvoicesPanelProps) {
  const [filter, setFilter] = useState<InvoiceStatus | "todas">("enviada");
  const [search, setSearch] = useState("");
  const [refusing, setRefusing] = useState<ServiceInvoiceRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<InvoiceStatus | "todas", number> = { enviada: 0, recebida: 0, recusada: 0, todas: 0 };
    for (const i of invoices ?? []) {
      c[i.status] += 1;
      c.todas += 1;
    }
    return c;
  }, [invoices]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (invoices ?? []).filter(
      (i) =>
        (filter === "todas" || i.status === filter) &&
        (!q || i.employeeName.toLowerCase().includes(q) || (i.employeeDepartment ?? "").toLowerCase().includes(q))
    );
  }, [invoices, filter, search]);

  async function review(invoice: ServiceInvoiceRow, status: InvoiceStatus, reviewNote?: string) {
    setBusyId(invoice.id);
    try {
      const res = await fetch(`/api/notas/${invoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reviewNote }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Não foi possível atualizar a nota.");
      }
      await onChanged();
      toast.success(
        status === "recebida" ? "Nota marcada como recebida." : status === "recusada" ? "Nota recusada." : "Nota de volta para conferir."
      );
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro inesperado.");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Situação" className="flex flex-wrap gap-1 rounded-[12px] border border-border bg-surface p-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={`flex items-center gap-1.5 rounded-[9px] px-3 py-1.5 text-[13px] font-semibold transition ${
                filter === f.key ? "bg-accent-soft text-ink" : "text-muted hover:text-ink"
              }`}
            >
              {f.label}
              <span className="font-mono text-xs tabular-nums text-muted">{counts[f.key]}</span>
            </button>
          ))}
        </div>
        <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-border bg-surface px-3 text-muted focus-within:border-accent sm:max-w-xs">
          <IconSearch className="h-4 w-4 shrink-0" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar colaborador ou empresa"
            aria-label="Buscar notas"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-ink placeholder:text-muted focus:outline-none"
          />
        </label>
      </div>

      <div className="rounded-[14px] border border-border bg-surface">
        {invoices === null ? (
          <SkeletonRows rows={4} />
        ) : list.length === 0 ? (
          <EmptyState
            icon={<IconFile className="h-6 w-6" />}
            title={invoices.length === 0 ? "Nenhuma nota enviada ainda" : "Nenhuma nota nesta lista"}
            text={
              invoices.length === 0
                ? "Os colaboradores PJ enviam pelo portal. Para dar acesso, abra a ficha do colaborador e gere o convite do portal."
                : "Troque o filtro ou a busca para ver as outras notas."
            }
          />
        ) : (
          <ul className="flex flex-col">
            {list.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-start gap-x-6 gap-y-3 border-b border-border px-4 py-3.5 last:border-b-0">
                <div className="flex min-w-[200px] flex-1 flex-col gap-0.5">
                  <span className="font-bold text-ink">{inv.employeeName}</span>
                  <span className="text-xs text-muted">{inv.employeeDepartment ?? "Sem setor"}</span>
                </div>
                <div className="flex min-w-[150px] flex-col gap-0.5">
                  <span className="text-sm font-semibold text-ink">{competenceLabel(inv.competence)}</span>
                  <span className="text-xs text-muted">
                    {[inv.number ? `nº ${inv.number}` : null, inv.amountCents !== null ? formatCents(inv.amountCents) : null]
                      .filter(Boolean)
                      .join(" · ") || "sem número e valor"}
                  </span>
                </div>
                <div className="flex min-w-[180px] flex-1 flex-col gap-1">
                  {inv.files.map((f) => (
                    <a
                      key={f.id}
                      href={`/api/notas/arquivos/${f.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={f.fileName}
                      className="flex max-w-[16rem] items-center gap-1 text-xs text-accent-strong hover:underline"
                    >
                      <IconPaperclip className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{f.fileName}</span>
                      <span className="shrink-0 text-muted">· {formatFileSize(f.size)}</span>
                    </a>
                  ))}
                  {inv.notes && <span className="line-clamp-2 text-xs text-muted">“{inv.notes}”</span>}
                </div>
                <div className="flex min-w-[170px] flex-col items-start gap-1">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[inv.status]}`}>
                    {INVOICE_STATUS_LABEL[inv.status]}
                  </span>
                  <span className="text-xs text-muted">
                    Enviada em {formatDateBR(inv.createdAt)}
                    {inv.reviewedBy && inv.reviewedAt ? ` · por ${inv.reviewedBy} em ${formatDateBR(inv.reviewedAt)}` : ""}
                  </span>
                  {inv.status === "recusada" && inv.reviewNote && (
                    <span className="text-xs text-critical">Motivo: {inv.reviewNote}</span>
                  )}
                </div>
                <div className="ml-auto flex items-center gap-2">
                  {inv.status === "enviada" ? (
                    <>
                      <Button
                        variant="ghost"
                        onClick={() => setRefusing(inv)}
                        disabled={busyId === inv.id}
                        className="!h-9 !rounded-[10px] !px-3 !py-0 text-[13px]"
                      >
                        <IconX className="h-4 w-4" />
                        Recusar
                      </Button>
                      <Button
                        onClick={() => review(inv, "recebida")}
                        disabled={busyId === inv.id}
                        className="!h-9 !rounded-[10px] !px-3 !py-0 text-[13px]"
                      >
                        <IconCheckCircle className="h-4 w-4" />
                        Recebida
                      </Button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => review(inv, "enviada")}
                      disabled={busyId === inv.id}
                      className="text-xs font-semibold text-muted underline-offset-2 hover:text-ink hover:underline"
                    >
                      Voltar para conferir
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <RefuseModal
        key={refusing?.id ?? "nenhuma"}
        invoice={refusing}
        onClose={() => setRefusing(null)}
        onConfirm={async (reason) => {
          if (refusing && (await review(refusing, "recusada", reason))) setRefusing(null);
        }}
      />
    </section>
  );
}

function RefuseModal({
  invoice,
  onClose,
  onConfirm,
}: {
  invoice: ServiceInvoiceRow | null;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [sending, setSending] = useState(false);

  async function confirm() {
    if (!reason.trim()) return setError("Diga o motivo: o colaborador vê no portal.");
    setSending(true);
    await onConfirm(reason.trim());
    setSending(false);
  }

  return (
    <Modal
      open={!!invoice}
      onClose={() => {
        setReason("");
        setError(undefined);
        onClose();
      }}
      title="Recusar nota"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={sending}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={confirm} disabled={sending}>
            {sending ? "Recusando..." : "Recusar nota"}
          </Button>
        </>
      }
    >
      {invoice && (
        <div className="flex flex-col gap-4 text-sm">
          <p className="text-muted">
            Nota de <strong className="text-ink">{invoice.employeeName}</strong> referente a{" "}
            {competenceLabel(invoice.competence).toLowerCase()}. O colaborador vê o motivo no portal e envia de novo.
          </p>
          <Field label="Motivo" error={error}>
            <textarea
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setError(undefined);
              }}
              rows={3}
              placeholder="Ex.: valor diferente do contrato, CNPJ do tomador errado"
              className={inputClass(!!error) + " resize-y"}
            />
          </Field>
        </div>
      )}
    </Modal>
  );
}
