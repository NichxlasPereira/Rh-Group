"use client";

import { Occurrence, acceptsAttachments, formatDuration, minutesBetween, occurrenceDays, pluralDias } from "@/lib/attendance";
import { formatDateBR } from "@/lib/format";
import { IconCalendarPlus, IconEdit, IconPaperclip, IconTrash } from "../icons";
import { ActionButton, EmptyState } from "./formControls";
import { JustifiedBadge, OccurrenceBadge } from "./OccurrenceBadge";

interface OccurrencesTableProps {
  occurrences: Occurrence[];
  hasAny: boolean;
  onEdit: (occurrence: Occurrence) => void;
  onDelete: (occurrence: Occurrence) => void;
}

export function OccurrencesTable({ occurrences, hasAny, onEdit, onDelete }: OccurrencesTableProps) {
  return (
    <div className="rounded-[14px] border border-border bg-surface">
      {occurrences.length === 0 ? (
        <EmptyState
          icon={<IconCalendarPlus className="h-6 w-6" />}
          title={hasAny ? "Nenhuma ocorrência encontrada" : "Nenhuma ocorrência registrada"}
          text={
            hasAny
              ? "Ajuste a busca, o tipo ou o mês para encontrar o que procura."
              : "Clique em “registrar ocorrência” para lançar uma falta, atestado, folga ou comprovante de horas."
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2/60 text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium">Colaborador</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Detalhe</th>
                <th className="px-4 py-3 font-medium">Observações</th>
                <th className="px-4 py-3 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {occurrences.map((o) => {
                const days = occurrenceDays(o);
                return (
                  <tr key={o.id} className="border-b border-border last:border-0 hover:bg-surface-2/40">
                    <td className="whitespace-nowrap px-4 py-3 font-mono tabular-nums text-ink">
                      {formatDateBR(o.date)}
                      {days > 1 && <span className="block text-xs text-muted">até {formatDateBR(o.endDate)}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">{o.employeeName}</p>
                      <p className="text-xs text-muted">
                        {o.employeeDepartment ?? "Sem setor"}
                        {!o.employeeId && " · cadastro excluído"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <OccurrenceBadge type={o.type} />
                    </td>
                    <td className="px-4 py-3">
                      {o.type === "falta" ? (
                        <JustifiedBadge justified={o.justified} />
                      ) : o.type === "folga" ? (
                        <div className="flex flex-col items-start gap-0.5">
                          <span className="font-mono tabular-nums text-ink">{pluralDias(days)}</span>
                          <span className="text-xs text-muted">por {o.approvedBy ?? "—"}</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-start gap-1">
                          {o.type === "horas" ? (
                            <span className="whitespace-nowrap font-mono tabular-nums text-ink">
                              {o.startTime}–{o.endTime}
                              <span className="text-muted"> · {formatDuration(minutesBetween(o.startTime, o.endTime))}</span>
                            </span>
                          ) : (
                            <span className="font-mono tabular-nums text-ink">
                              {days} {days === 1 ? "dia" : "dias"}
                            </span>
                          )}
                          {o.attachments.length === 0 ? (
                            <button
                              type="button"
                              onClick={() => onEdit(o)}
                              className="flex items-center gap-1 text-xs text-warn hover:underline"
                            >
                              <IconPaperclip className="h-3.5 w-3.5" />
                              sem documento
                            </button>
                          ) : (
                            o.attachments.map((a) => (
                              <a
                                key={a.id}
                                href={`/api/attachments/${a.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={a.fileName}
                                className="flex max-w-[11rem] items-center gap-1 text-xs text-accent-strong hover:underline"
                              >
                                <IconPaperclip className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">{a.fileName}</span>
                              </a>
                            ))
                          )}
                        </div>
                      )}
                    </td>
                    <td className="max-w-xs px-4 py-3 text-muted">
                      <span className="line-clamp-2">{o.notes || "—"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {acceptsAttachments(o.type) && (
                          <ActionButton label="Anexar documento" onClick={() => onEdit(o)}>
                            <IconPaperclip className="h-4 w-4" />
                          </ActionButton>
                        )}
                        <ActionButton label="Editar" onClick={() => onEdit(o)}>
                          <IconEdit className="h-4 w-4" />
                        </ActionButton>
                        <ActionButton label="Excluir" onClick={() => onDelete(o)} danger>
                          <IconTrash className="h-4 w-4" />
                        </ActionButton>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
