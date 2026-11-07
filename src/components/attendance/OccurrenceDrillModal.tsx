"use client";

import { useMemo } from "react";
import { Modal } from "../Modal";
import { Button } from "../Button";
import { IconPaperclip } from "../icons";
import { OccurrenceBadge } from "./OccurrenceBadge";
import {
  OCCURRENCE_LABEL,
  OCCURRENCE_TYPES,
  Occurrence,
  OccurrenceType,
  acceptsAttachments,
  monthKeyLabel,
  occurrenceDetailLabel,
  occurrencePeriodLabel,
  overlapsMonth,
} from "@/lib/attendance";

export const NO_SECTOR = "Sem setor";
const sectorOf = (o: Occurrence) => o.employeeDepartment?.trim() || NO_SECTOR;

interface Props {
  open: boolean;
  onClose: () => void;
  occurrences: Occurrence[];
  month: string;
  type: OccurrenceType | null;
  sector: string | null;
  onChange: (filters: { type: OccurrenceType | null; sector: string | null }) => void;
  /** Abre a ocorrência para ver ou editar (fecha este detalhe). */
  onOpenOccurrence?: (o: Occurrence) => void;
}

/**
 * Detalhe dos gráficos de Relatórios: quem teve falta, atestado, folga ou
 * comprovante de horas no mês, separado por empresa (setor).
 */
export function OccurrenceDrillModal({ open, onClose, occurrences, month, type, sector, onChange, onOpenOccurrence }: Props) {
  const inMonth = useMemo(() => occurrences.filter((o) => overlapsMonth(o, month)), [occurrences, month]);

  const sectors = useMemo(
    () =>
      [...new Set(inMonth.map(sectorOf))].sort((a, b) =>
        a === NO_SECTOR ? 1 : b === NO_SECTOR ? -1 : a.localeCompare(b, "pt")
      ),
    [inMonth]
  );

  const typeCounts = useMemo(() => {
    const base = sector ? inMonth.filter((o) => sectorOf(o) === sector) : inMonth;
    return Object.fromEntries(OCCURRENCE_TYPES.map((t) => [t, base.filter((o) => o.type === t).length])) as Record<OccurrenceType, number>;
  }, [inMonth, sector]);

  // Empresa → colaborador → ocorrências (por data).
  const groups = useMemo(() => {
    const list = inMonth.filter((o) => (!type || o.type === type) && (!sector || sectorOf(o) === sector));
    const bySector = new Map<string, Map<string, Occurrence[]>>();
    for (const o of [...list].sort((a, b) => a.date.localeCompare(b.date))) {
      const s = sectorOf(o);
      const people = bySector.get(s) ?? new Map<string, Occurrence[]>();
      const key = o.employeeId ?? `nome:${o.employeeName}`;
      people.set(key, [...(people.get(key) ?? []), o]);
      bySector.set(s, people);
    }
    return [...bySector]
      .sort(([a], [b]) => (a === NO_SECTOR ? 1 : b === NO_SECTOR ? -1 : a.localeCompare(b, "pt")))
      .map(([name, people]) => ({
        name,
        count: [...people.values()].reduce((n, l) => n + l.length, 0),
        people: [...people.values()].sort((a, b) => a[0].employeeName.localeCompare(b[0].employeeName, "pt")),
      }));
  }, [inMonth, type, sector]);

  const total = groups.reduce((n, g) => n + g.count, 0);
  const people = groups.reduce((n, g) => n + g.people.length, 0);
  const title = [type ? OCCURRENCE_LABEL[type] : "Ocorrências", sector].filter(Boolean).join(" · ");

  const chip = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-[12.5px] transition ${
      active ? "bg-ink font-bold text-bg" : "border border-border-strong font-semibold text-muted hover:text-ink"
    }`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      maxWidthClassName="max-w-3xl"
      footer={
        <Button type="button" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      <div className="flex flex-col gap-4 text-sm">
        <p className="text-muted">
          {monthKeyLabel(month)} · {total} {total === 1 ? "ocorrência" : "ocorrências"} de {people}{" "}
          {people === 1 ? "colaborador" : "colaboradores"}
        </p>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tipo">
            <button type="button" className={chip(!type)} aria-pressed={!type} onClick={() => onChange({ type: null, sector })}>
              Todos
            </button>
            {OCCURRENCE_TYPES.map((t) => (
              <button key={t} type="button" className={chip(type === t)} aria-pressed={type === t} onClick={() => onChange({ type: t, sector })}>
                {OCCURRENCE_LABEL[t]} · <span className="tabular-nums">{typeCounts[t]}</span>
              </button>
            ))}
          </div>
          {sectors.length > 1 && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Empresa">
              <button type="button" className={chip(!sector)} aria-pressed={!sector} onClick={() => onChange({ type, sector: null })}>
                Todas as empresas
              </button>
              {sectors.map((s) => (
                <button key={s} type="button" className={chip(sector === s)} aria-pressed={sector === s} onClick={() => onChange({ type, sector: s })}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {groups.length === 0 ? (
          <p className="rounded-[12px] border border-border bg-surface px-4 py-6 text-center text-muted">
            Nenhuma ocorrência {type ? `de ${OCCURRENCE_LABEL[type].toLowerCase()} ` : ""}
            {sector ? `em ${sector} ` : ""}neste mês.
          </p>
        ) : (
          groups.map((g) => (
            <section key={g.name} className="rounded-[12px] border border-border bg-surface">
              <header className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3">
                <h3 className="font-display text-base font-semibold text-ink">{g.name}</h3>
                <span className="text-xs text-muted">
                  {g.people.length} {g.people.length === 1 ? "colaborador" : "colaboradores"} · {g.count}{" "}
                  {g.count === 1 ? "ocorrência" : "ocorrências"}
                </span>
              </header>
              <ul className="divide-y divide-border">
                {g.people.map((list) => (
                  <li key={list[0].employeeId ?? list[0].employeeName} className="px-4 py-3">
                    <p className="font-medium text-ink">{list[0].employeeName}</p>
                    <ul className="mt-1.5 flex flex-col gap-1.5">
                      {list.map((o) => (
                        <li key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                          <span className="w-[6.5rem] shrink-0 font-mono tabular-nums text-ink">{occurrencePeriodLabel(o)}</span>
                          {!type && <OccurrenceBadge type={o.type} />}
                          <span className={o.type === "falta" && !o.justified ? "text-critical" : "text-muted"}>
                            {occurrenceDetailLabel(o, month)}
                          </span>
                          {acceptsAttachments(o.type) &&
                            (o.attachments.length > 0 ? (
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
                            ) : (
                              <span className="text-xs text-muted">sem documento</span>
                            ))}
                          {onOpenOccurrence && (
                            <button
                              type="button"
                              onClick={() => onOpenOccurrence(o)}
                              className="ml-auto text-xs font-semibold text-muted underline-offset-2 transition hover:text-ink hover:underline"
                            >
                              Abrir
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </Modal>
  );
}
