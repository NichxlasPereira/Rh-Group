"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "../Modal";
import { Button } from "../Button";
import {
  ATTACHMENT_ACCEPT,
  Attachment,
  Employee,
  MAX_ATTACHMENT_MB,
  OCCURRENCE_LABEL,
  OCCURRENCE_TYPES,
  Occurrence,
  OccurrenceType,
  acceptsAttachments,
  folgaDaysUsed,
  formatDuration,
  formatFileSize,
  isMultiDay,
  minutesBetween,
  occurrenceDays,
  pluralDias,
} from "@/lib/attendance";
import { IconPaperclip, IconX } from "../icons";
import { todayInputValue } from "@/lib/format";
import { Field, inputClass } from "./formControls";

export interface OccurrenceFormValues {
  employeeId: string;
  type: OccurrenceType;
  date: string;
  endDate: string;
  justified: boolean;
  approvedBy: string;
  /** Comprovante de horas: "HH:MM". */
  startTime: string;
  endTime: string;
  notes: string;
}

/** Anexos a enviar e a remover — aplicados depois que a ocorrência é salva. */
export interface AttachmentChanges {
  newFiles: File[];
  removedIds: string[];
}

interface OccurrenceModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: OccurrenceFormValues, attachments: AttachmentChanges) => Promise<void>;
  employees: Employee[];
  /** Todas as ocorrências — usadas para calcular o saldo de folgas. */
  occurrences: Occurrence[];
  occurrence: Occurrence | null;
  preselectedEmployee: Employee | null;
}

type FormErrors = Partial<Record<keyof OccurrenceFormValues, string>>;

const TYPE_HINT: Record<OccurrenceType, string> = {
  falta: "Ausência no dia, com ou sem justificativa.",
  atestado: "Afastamento com atestado médico — pode cobrir vários dias.",
  folga: "Folga concedida por um gestor — desconta do saldo do colaborador.",
  horas: "Ausência em parte do dia (consulta, exame...), com o horário e o comprovante.",
};

function toInputDate(iso: string): string {
  return iso.slice(0, 10);
}

export function OccurrenceModal({
  open,
  onClose,
  onSubmit,
  employees,
  occurrences,
  occurrence,
  preselectedEmployee,
}: OccurrenceModalProps) {
  const [values, setValues] = useState<OccurrenceFormValues>(() =>
    initialValues(occurrence, preselectedEmployee)
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [fileError, setFileError] = useState<string>();

  useEffect(() => {
    if (!open) return;
    setNewFiles([]);
    setRemovedIds([]);
    setFileError(undefined);
    setValues(initialValues(occurrence, preselectedEmployee));
    setErrors({});
  }, [open, occurrence, preselectedEmployee]);

  // Só ativos, mas mantém o colaborador atual da ocorrência mesmo se estiver inativo.
  const employeeOptions = useMemo(
    () =>
      employees
        .filter((e) => e.active || e.id === values.employeeId)
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [employees, values.employeeId]
  );

  const periodDays =
    isMultiDay(values.type) && values.date && values.endDate && values.endDate >= values.date
      ? occurrenceDays({ date: values.date, endDate: values.endDate })
      : null;

  const hoursMinutes = values.type === "horas" ? minutesBetween(values.startTime, values.endTime) : 0;

  // Saldo de folgas do colaborador escolhido, sem contar a própria ocorrência em edição.
  const selectedEmployee = employees.find((e) => e.id === values.employeeId) ?? null;
  const folgaBalance = useMemo(() => {
    if (!selectedEmployee) return null;
    const used = folgaDaysUsed(occurrences, selectedEmployee.id, occurrence?.id);
    return { total: selectedEmployee.folgaAllowance, remaining: selectedEmployee.folgaAllowance - used };
  }, [selectedEmployee, occurrences, occurrence?.id]);

  // Gestores: nomes já usados antes + colaboradores ativos, como sugestão.
  const managerSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const o of occurrences) if (o.approvedBy) set.add(o.approvedBy);
    for (const e of employees) if (e.active) set.add(e.name);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [occurrences, employees]);

  function set<K extends keyof OccurrenceFormValues>(key: K, value: OccurrenceFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function validate(): FormErrors {
    const errs: FormErrors = {};
    if (!values.employeeId) errs.employeeId = "Selecione um colaborador.";
    if (!values.date) errs.date = "Informe a data.";
    if (isMultiDay(values.type)) {
      if (!values.endDate) errs.endDate = "Informe o último dia.";
      else if (values.date && values.endDate < values.date) {
        errs.endDate = "A data final não pode ser anterior à data inicial.";
      }
    }
    if (values.type === "horas") {
      if (!values.startTime) errs.startTime = "Informe o início.";
      if (!values.endTime) errs.endTime = "Informe o fim.";
      else if (values.startTime && values.endTime <= values.startTime) {
        errs.endTime = "Precisa ser depois do início.";
      }
    }
    if (values.type === "folga") {
      if (!values.approvedBy.trim()) errs.approvedBy = "Informe o gestor que concedeu a folga.";
      if (folgaBalance && periodDays && periodDays > folgaBalance.remaining) {
        errs.endDate =
          folgaBalance.remaining <= 0
            ? "O colaborador não tem folgas restantes."
            : `Saldo insuficiente: restam ${pluralDias(folgaBalance.remaining)}.`;
      }
    }
    return errs;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    try {
      // Anexos só valem para atestado e comprovante de horas; em outro tipo, nada é enviado.
      await onSubmit(values, { newFiles: acceptsAttachments(values.type) ? newFiles : [], removedIds });
    } finally {
      setSubmitting(false);
    }
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const accepted: File[] = [];
    const rejected: string[] = [];
    for (const file of Array.from(list)) {
      if (file.size > MAX_ATTACHMENT_MB * 1024 * 1024) rejected.push(file.name);
      else accepted.push(file);
    }
    setNewFiles((prev) => [...prev, ...accepted]);
    setFileError(
      rejected.length > 0 ? `Acima de ${MAX_ATTACHMENT_MB} MB, não adicionado: ${rejected.join(", ")}.` : undefined
    );
  }

  const keptAttachments = (occurrence?.attachments ?? []).filter((a) => !removedIds.includes(a.id));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={occurrence ? "Editar ocorrência" : "Registrar ocorrência"}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="submit" form="occurrence-form" disabled={submitting}>
            {submitting ? "Salvando..." : occurrence ? "Salvar alterações" : "Registrar ocorrência"}
          </Button>
        </>
      }
    >
      <form id="occurrence-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Colaborador" error={errors.employeeId}>
          <select
            value={values.employeeId}
            onChange={(e) => set("employeeId", e.target.value)}
            className={inputClass(!!errors.employeeId)}
          >
            <option value="">Selecione...</option>
            {employeeOptions.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name}
                {emp.department ? ` — ${emp.department}` : ""}
                {!emp.active ? " (inativo)" : ""}
              </option>
            ))}
          </select>
          {employees.length === 0 && (
            <span className="text-xs text-muted">Cadastre um colaborador antes de registrar ocorrências.</span>
          )}
        </Field>

        <div className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink">Tipo</span>
          <div role="radiogroup" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {OCCURRENCE_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={values.type === t}
                onClick={() => set("type", t)}
                className={`rounded-[10px] border px-3 py-2 text-sm font-semibold leading-tight transition ${
                  values.type === t
                    ? "border-accent bg-accent-soft text-accent-strong"
                    : "border-border bg-surface-2 text-muted hover:text-ink"
                }`}
              >
                {OCCURRENCE_LABEL[t]}
              </button>
            ))}
          </div>
          <span className="text-xs text-muted">{TYPE_HINT[values.type]}</span>
        </div>

        <div className={`grid grid-cols-1 gap-4 ${values.type === "horas" ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
          <Field label={isMultiDay(values.type) ? "Primeiro dia" : "Data"} error={errors.date}>
            <input
              type="date"
              value={values.date}
              onChange={(e) => {
                const next = e.target.value;
                set("date", next);
                // Mantém o período com pelo menos um dia ao mover a data inicial para frente.
                if (next && values.endDate < next) set("endDate", next);
              }}
              className={inputClass(!!errors.date) + " font-mono"}
            />
          </Field>

          {values.type === "horas" && (
            <>
              <Field label="Das" error={errors.startTime}>
                <input
                  type="time"
                  value={values.startTime}
                  onChange={(e) => set("startTime", e.target.value)}
                  className={inputClass(!!errors.startTime) + " font-mono"}
                />
              </Field>
              <Field
                label="Até"
                error={errors.endTime}
                hint={hoursMinutes > 0 ? `${formatDuration(hoursMinutes)} fora` : undefined}
              >
                <input
                  type="time"
                  value={values.endTime}
                  min={values.startTime || undefined}
                  onChange={(e) => set("endTime", e.target.value)}
                  className={inputClass(!!errors.endTime) + " font-mono"}
                />
              </Field>
            </>
          )}

          {isMultiDay(values.type) && (
            <Field
              label="Último dia"
              error={errors.endDate}
              hint={
                periodDays
                  ? `${pluralDias(periodDays)} de ${values.type === "folga" ? "folga" : "afastamento"}`
                  : undefined
              }
            >
              <input
                type="date"
                value={values.endDate}
                min={values.date || undefined}
                onChange={(e) => set("endDate", e.target.value)}
                className={inputClass(!!errors.endDate) + " font-mono"}
              />
            </Field>
          )}
        </div>

        {values.type === "folga" && (
          <>
            <Field label="Gestor que concedeu" error={errors.approvedBy}>
              <input
                value={values.approvedBy}
                onChange={(e) => set("approvedBy", e.target.value)}
                className={inputClass(!!errors.approvedBy)}
                placeholder="Nome do gestor"
                list="gestores-sugeridos"
              />
              <datalist id="gestores-sugeridos">
                {managerSuggestions.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </Field>
            <FolgaBalance balance={folgaBalance} requested={periodDays} />
          </>
        )}

        {acceptsAttachments(values.type) && (
          <AttachmentPicker
            label={values.type === "horas" ? "Comprovante" : "Documento do atestado"}
            what={values.type === "horas" ? "do comprovante" : "do atestado"}
            existing={keptAttachments}
            newFiles={newFiles}
            error={fileError}
            onAdd={addFiles}
            onRemoveExisting={(id) => setRemovedIds((prev) => [...prev, id])}
            onRemoveNew={(index) => setNewFiles((prev) => prev.filter((_, i) => i !== index))}
          />
        )}

        {values.type === "falta" && (
          <label className="flex items-start gap-3 rounded-[10px] border border-border bg-surface-2 px-3 py-2.5 text-sm">
            <input
              type="checkbox"
              checked={values.justified}
              onChange={(e) => set("justified", e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
            />
            <span>
              <span className="font-medium text-ink">Falta justificada</span>
              <span className="block text-xs text-muted">
                Marque se houve justificativa aceita (ex.: declaração, combinado com o gestor).
              </span>
            </span>
          </label>
        )}

        <Field
          label="Observações (opcional)"
          hint={
            values.type === "atestado" || values.type === "horas"
              ? "Evite registrar diagnóstico ou CID — são dados de saúde sensíveis (LGPD)."
              : undefined
          }
        >
          <textarea
            value={values.notes}
            onChange={(e) => set("notes", e.target.value)}
            rows={3}
            className={inputClass(false) + " resize-y"}
            placeholder={
              values.type === "falta"
                ? "Ex.: motivo informado pelo colaborador"
                : values.type === "folga"
                  ? "Ex.: folga de aniversário, compensação de banco de horas..."
                  : values.type === "horas"
                    ? "Ex.: consulta, exame, audiência"
                    : "Ex.: atestado entregue ao RH em mãos"
            }
          />
        </Field>
      </form>
    </Modal>
  );
}

function FolgaBalance({
  balance,
  requested,
}: {
  balance: { total: number; remaining: number } | null;
  requested: number | null;
}) {
  if (!balance) {
    return <p className="text-xs text-muted">Selecione o colaborador para ver o saldo de folgas.</p>;
  }
  const after = requested ? balance.remaining - requested : null;
  const exceeds = after !== null && after < 0;
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 rounded-[10px] border px-3 py-2.5 text-sm ${
        exceeds ? "border-critical bg-critical-soft" : "border-border bg-surface-2"
      }`}
    >
      <span className="text-muted">
        Saldo de folgas:{" "}
        <strong className="font-mono tabular-nums text-ink">{Math.max(balance.remaining, 0)}</strong> de{" "}
        <span className="font-mono tabular-nums">{balance.total}</span> restantes
      </span>
      {after !== null && (
        <span className={`text-xs font-semibold ${exceeds ? "text-critical" : "text-ok"}`}>
          {exceeds ? "Saldo insuficiente" : `Depois desta folga: ${pluralDias(after)}`}
        </span>
      )}
      {balance.total === 0 && (
        <span className="w-full text-xs text-muted">
          Defina quantas folgas o colaborador tem em “colaboradores” → editar.
        </span>
      )}
    </div>
  );
}

function AttachmentPicker({
  label,
  what,
  existing,
  newFiles,
  error,
  onAdd,
  onRemoveExisting,
  onRemoveNew,
}: {
  label: string;
  /** Complemento do texto de ajuda ("do atestado", "do comprovante"). */
  what: string;
  existing: Attachment[];
  newFiles: File[];
  error?: string;
  onAdd: (files: FileList | null) => void;
  onRemoveExisting: (id: string) => void;
  onRemoveNew: (index: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const empty = existing.length === 0 && newFiles.length === 0;

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-ink">{label}</span>
      <div
        className={`flex flex-col gap-2 rounded-[10px] border border-dashed bg-surface-2 p-3 ${
          error ? "border-critical" : "border-border-strong"
        }`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onAdd(e.dataTransfer.files);
        }}
      >
        {existing.map((a) => (
          <FileRow
            key={a.id}
            name={a.fileName}
            size={a.size}
            href={`/api/attachments/${a.id}`}
            onRemove={() => onRemoveExisting(a.id)}
          />
        ))}
        {newFiles.map((f, i) => (
          <FileRow key={`${f.name}-${i}`} name={f.name} size={f.size} pending onRemove={() => onRemoveNew(i)} />
        ))}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex items-center justify-center gap-2 rounded-[8px] px-3 py-2 text-sm font-semibold text-accent-strong transition hover:bg-accent-soft"
        >
          <IconPaperclip className="h-4 w-4" />
          {empty ? "Anexar documento" : "Anexar outro documento"}
        </button>
        {empty && (
          <p className="text-center text-xs text-muted">
            PDF ou foto {what} (JPG, PNG, HEIC) · até {MAX_ATTACHMENT_MB} MB · ou arraste aqui
          </p>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ATTACHMENT_ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => {
            onAdd(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {error && <span className="text-xs text-critical">{error}</span>}
    </div>
  );
}

function FileRow({
  name,
  size,
  href,
  pending,
  onRemove,
}: {
  name: string;
  size: number;
  href?: string;
  pending?: boolean;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-[8px] border border-border bg-surface px-3 py-2">
      <IconPaperclip className="h-4 w-4 shrink-0 text-muted" />
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 flex-1 truncate text-ink underline-offset-2 hover:underline"
        >
          {name}
        </a>
      ) : (
        <span className="min-w-0 flex-1 truncate text-ink">{name}</span>
      )}
      <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
        {pending ? "novo · " : ""}
        {formatFileSize(size)}
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remover ${name}`}
        title="Remover"
        className="shrink-0 rounded-full p-1 text-muted transition hover:bg-surface-2 hover:text-critical"
      >
        <IconX className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function initialValues(occurrence: Occurrence | null, preselected: Employee | null): OccurrenceFormValues {
  if (!occurrence) return { ...emptyForm(), employeeId: preselected?.id ?? "" };
  return {
    employeeId: occurrence.employeeId ?? "",
    type: occurrence.type,
    date: toInputDate(occurrence.date),
    endDate: toInputDate(occurrence.endDate),
    justified: occurrence.justified,
    approvedBy: occurrence.approvedBy ?? "",
    startTime: occurrence.startTime ?? "",
    endTime: occurrence.endTime ?? "",
    notes: occurrence.notes ?? "",
  };
}

function emptyForm(): OccurrenceFormValues {
  const today = todayInputValue();
  return {
    employeeId: "",
    type: "falta",
    date: today,
    endDate: today,
    justified: false,
    approvedBy: "",
    startTime: "",
    endTime: "",
    notes: "",
  };
}
