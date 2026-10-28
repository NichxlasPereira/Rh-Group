import { OCCURRENCE_LABEL, OccurrenceType } from "@/lib/attendance";

const STYLES: Record<OccurrenceType, string> = {
  falta: "bg-critical-soft text-critical",
  atestado: "bg-accent-soft text-accent-strong",
  folga: "bg-ok-soft text-ok",
  horas: "bg-warn-soft text-warn",
};

export function OccurrenceBadge({ type }: { type: OccurrenceType }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${STYLES[type]}`}>
      {OCCURRENCE_LABEL[type]}
    </span>
  );
}

export function JustifiedBadge({ justified }: { justified: boolean }) {
  return justified ? (
    <span className="inline-flex items-center rounded-full bg-ok-soft px-2.5 py-1 text-xs font-medium text-ok">
      Justificada
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full border border-border-strong px-2.5 py-1 text-xs font-medium text-muted">
      Não justificada
    </span>
  );
}
