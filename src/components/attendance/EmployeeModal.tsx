"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Modal } from "../Modal";
import { Button } from "../Button";
import { CompanyArea, Employee, MAX_ATTACHMENT_MB } from "@/lib/attendance";
import { DISPLAYABLE_IMAGE } from "@/lib/employeeProfile";
import { RECORD_FIELDS, RecordEntry, RecordFieldKey } from "@/lib/employeeRecord";
import { Field, inputClass } from "./formControls";

export interface EmployeeFormValues {
  name: string;
  department: string;
  role: string;
  active: boolean;
  folgaAllowance: string;
  startDate: string;
  contractType: string;
  contractEnd: string;
  areaId: string;
  areaLead: boolean;
  /** Gestor direto ("" = ninguém). */
  managerId: string;
  /** Nova foto para crachá escolhida no formulário (enviada depois de salvar). */
  photo: File | null;
  /** Ficha cadastral; só vai para o servidor se o RH mexeu (recordDirty). */
  record: Partial<Record<RecordFieldKey, string>>;
  recordDirty: boolean;
}

const EMPTY: EmployeeFormValues = {
  name: "",
  department: "",
  role: "",
  active: true,
  folgaAllowance: "0",
  startDate: "",
  contractType: "",
  contractEnd: "",
  areaId: "",
  areaLead: false,
  managerId: "",
  photo: null,
  record: {},
  recordDirty: false,
};

const PLACEHOLDER: Partial<Record<RecordFieldKey, string>> = {
  jobFunction: "Ex.: Analista de cobrança",
  corporateEmail: "nome@empresa.com.br",
  cpf: "000.000.000-00",
  phone: "(11) 90000-0000",
  personalEmail: "nome@gmail.com",
  emergencyContact: "Nome, parentesco e telefone",
  address: "Rua, número, complemento, bairro, cidade/UF",
  cep: "00000-000",
  pixKeys: "Chaves Pix ou banco, agência e conta",
};

const CONTRACT_OPTIONS = ["PJ", "CLT", "Estágio", "Outro"];

interface EmployeeModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: EmployeeFormValues) => Promise<void>;
  employee: Employee | null;
  existingDepartments: string[];
  /** Áreas cadastradas para cada setor (empresa). */
  areasBySector: Map<string, CompanyArea[]>;
  /** Todos os colaboradores: para escolher o gestor direto. */
  employees: Employee[];
}

export function EmployeeModal({
  open,
  onClose,
  onSubmit,
  employee,
  existingDepartments,
  areasBySector,
  employees,
}: EmployeeModalProps) {
  const [values, setValues] = useState<EmployeeFormValues>(EMPTY);
  const [error, setError] = useState<string>();
  const [allowanceError, setAllowanceError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  // Foto: prévia da nova escolhida e se a atual carregou (404 = sem foto).
  const [preview, setPreview] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string>();
  const [hasCurrentPhoto, setHasCurrentPhoto] = useState(true);
  const photoInput = useRef<HTMLInputElement>(null);
  // Ficha cadastral do colaborador em edição: carregada completa (o acesso fica registrado).
  const [recordStatus, setRecordStatus] = useState<"loading" | "ready" | "error">("ready");
  const [fromOnboarding, setFromOnboarding] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setValues(
      employee
        ? {
            name: employee.name,
            department: employee.department ?? "",
            role: employee.role ?? "",
            active: employee.active,
            folgaAllowance: String(employee.folgaAllowance),
            startDate: employee.startDate?.slice(0, 10) ?? "",
            contractType: employee.contractType ?? "",
            contractEnd: employee.contractEnd?.slice(0, 10) ?? "",
            areaId: employee.areaId ?? "",
            areaLead: employee.areaLead,
            managerId: employee.managerId ?? "",
            photo: null,
            record: {},
            recordDirty: false,
          }
        : EMPTY
    );
    setFromOnboarding(new Set());
    setRecordStatus(employee ? "loading" : "ready");
    if (!employee) return;
    let cancelled = false;
    fetch(`/api/employees/${employee.id}/ficha?completo=1`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((body: { record: RecordEntry[] }) => {
        if (cancelled) return;
        setValues((v) => ({ ...v, record: Object.fromEntries(body.record.map((r) => [r.key, r.value ?? ""])) }));
        setFromOnboarding(new Set(body.record.filter((r) => r.source === "onboarding").map((r) => r.key)));
        setRecordStatus("ready");
      })
      .catch(() => !cancelled && setRecordStatus("error"));
    return () => {
      cancelled = true;
    };
    setError(undefined);
    setAllowanceError(undefined);
    setPhotoError(undefined);
    setHasCurrentPhoto(true);
    setPreview(null);
  }, [open, employee]);

  // Libera a prévia anterior da memória.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function choosePhoto(file: File | undefined) {
    if (photoInput.current) photoInput.current.value = "";
    if (!file) return;
    if (!DISPLAYABLE_IMAGE.test(file.type)) {
      setPhotoError("Envie a foto em JPG, PNG ou WEBP.");
      return;
    }
    if (file.size > MAX_ATTACHMENT_MB * 1024 * 1024) {
      setPhotoError(`A foto passa do limite de ${MAX_ATTACHMENT_MB} MB.`);
      return;
    }
    setPhotoError(undefined);
    setValues((v) => ({ ...v, photo: file }));
    setPreview(URL.createObjectURL(file));
  }

  function clearPhoto() {
    setValues((v) => ({ ...v, photo: null }));
    setPreview(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!values.name.trim()) {
      setError("Informe o nome do colaborador.");
      return;
    }
    const allowance = values.folgaAllowance.trim() === "" ? 0 : Number(values.folgaAllowance);
    if (!Number.isInteger(allowance) || allowance < 0 || allowance > 365) {
      setAllowanceError("Informe um número inteiro entre 0 e 365.");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({ ...values, recordDirty: values.recordDirty && recordStatus === "ready" });
    } finally {
      setSubmitting(false);
    }
  }

  const sectorAreas = areasBySector.get(values.department) ?? [];

  // Gestor: alguém ativo da mesma empresa, menos a própria pessoa e quem já responde a ela.
  const below = new Set<string>();
  if (employee) {
    const reports = new Map<string, string[]>();
    for (const e of employees) if (e.managerId) reports.set(e.managerId, [...(reports.get(e.managerId) ?? []), e.id]);
    const stack = [employee.id];
    while (stack.length) {
      for (const id of reports.get(stack.pop()!) ?? []) {
        if (below.has(id)) continue;
        below.add(id);
        stack.push(id);
      }
    }
  }
  const candidates = values.department
    ? employees
        .filter((e) => e.active && e.department === values.department && e.id !== employee?.id && !below.has(e.id))
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    : [];
  const sameArea = values.areaId ? candidates.filter((e) => e.areaId === values.areaId) : [];
  const otherAreas = candidates.filter((e) => !sameArea.includes(e));
  const currentManager = employees.find((e) => e.id === values.managerId);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={employee ? "Editar colaborador" : "Novo colaborador"}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="submit" form="employee-form" disabled={submitting}>
            {submitting ? "Salvando..." : employee ? "Salvar alterações" : "Cadastrar colaborador"}
          </Button>
        </>
      }
    >
      <form id="employee-form" onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-4 sm:col-span-2">
          {preview || (employee && hasCurrentPhoto) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview ?? `/api/employees/${employee!.id}/photo?v=${employee!.updatedAt}`}
              alt={preview ? "Prévia da nova foto" : `Foto atual de ${employee!.name}`}
              onError={() => !preview && setHasCurrentPhoto(false)}
              className="h-[72px] w-[72px] shrink-0 rounded-[16px] border border-border object-cover"
            />
          ) : (
            <div
              aria-hidden="true"
              className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-[16px] border border-dashed border-border-strong text-[11px] font-semibold text-muted"
            >
              Sem foto
            </div>
          )}
          <div className="flex min-w-0 flex-col gap-1.5 text-sm">
            <span className="font-medium text-ink">Foto para crachá</span>
            <div className="flex flex-wrap gap-2">
              <label className="cursor-pointer rounded-[8px] border border-border-strong bg-surface px-3 py-1.5 text-[13px] font-semibold text-ink transition hover:bg-surface-2 focus-within:ring-2 focus-within:ring-accent">
                {preview || (employee && hasCurrentPhoto) ? "Trocar foto" : "Escolher foto"}
                <input
                  ref={photoInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => choosePhoto(e.target.files?.[0])}
                  className="sr-only"
                />
              </label>
              {preview && (
                <button
                  type="button"
                  onClick={clearPhoto}
                  className="rounded-[8px] px-3 py-1.5 text-[13px] font-semibold text-muted hover:text-ink"
                >
                  Desfazer
                </button>
              )}
            </div>
            {photoError ? (
              <span className="text-xs text-critical">{photoError}</span>
            ) : (
              <span className="text-xs text-muted">
                JPG, PNG ou WEBP, até {MAX_ATTACHMENT_MB} MB. Fica guardada nos documentos da ficha.
              </span>
            )}
          </div>
        </div>

        <Field label="Nome" error={error} className="sm:col-span-2">
          <input
            value={values.name}
            onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
            className={inputClass(!!error)}
            placeholder="Nome completo"
            autoFocus
          />
        </Field>

        <Field label="Setor (empresa)" hint="Empresas com CNPJ cadastrado no onboarding.">
          <select
            value={values.department}
            // As áreas são de cada empresa: trocar de setor limpa a área.
            onChange={(e) => setValues((v) => ({ ...v, department: e.target.value, areaId: "", areaLead: false, managerId: "" }))}
            className={inputClass(false)}
          >
            <option value="">Sem setor</option>
            {/* Valor antigo fora da lista continua visível até o RH trocar. */}
            {values.department && !existingDepartments.includes(values.department) && (
              <option value={values.department}>{values.department} (fora da lista)</option>
            )}
            {existingDepartments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Cargo (opcional)">
          <input
            value={values.role}
            onChange={(e) => setValues((v) => ({ ...v, role: e.target.value }))}
            className={inputClass(false)}
            placeholder="Ex.: Analista"
          />
        </Field>

        <Field
          label="Área"
          hint={
            !values.department
              ? "Escolha o setor (empresa) primeiro."
              : sectorAreas.length === 0
                ? "Esta empresa ainda não tem áreas. Crie em Colaboradores › Organograma."
                : "Usada no organograma."
          }
        >
          <select
            value={values.areaId}
            onChange={(e) =>
              setValues((v) => ({ ...v, areaId: e.target.value, areaLead: e.target.value ? v.areaLead : false }))
            }
            disabled={sectorAreas.length === 0}
            className={inputClass(false) + " disabled:opacity-60"}
          >
            <option value="">Sem área</option>
            {sectorAreas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>

        <label
          className={`flex items-start gap-3 self-start rounded-[10px] border border-border bg-surface-2 px-3 py-2.5 text-sm sm:mt-[26px] ${
            values.areaId ? "" : "opacity-60"
          }`}
        >
          <input
            type="checkbox"
            checked={values.areaLead}
            disabled={!values.areaId}
            onChange={(e) => setValues((v) => ({ ...v, areaLead: e.target.checked }))}
            className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
          />
          <span>
            <span className="font-medium text-ink">Responsável pela área</span>
            <span className="block text-xs text-muted">Aparece no topo da área no organograma.</span>
          </span>
        </label>

        <Field
          label="Responde a"
          hint={
            !values.department
              ? "Escolha o setor (empresa) primeiro."
              : "Gestor direto: monta os níveis do organograma. Sem gestor, a pessoa fica abaixo do responsável da área."
          }
          className="sm:col-span-2"
        >
          <select
            value={values.managerId}
            onChange={(e) => setValues((v) => ({ ...v, managerId: e.target.value }))}
            disabled={!values.department}
            className={inputClass(false) + " disabled:opacity-60"}
          >
            <option value="">Ninguém (topo ou responsável da área)</option>
            {/* Gestor salvo que saiu da lista (outra empresa ou inativo) continua visível até o RH trocar. */}
            {currentManager && !candidates.includes(currentManager) && (
              <option value={currentManager.id}>{currentManager.name} (fora da lista)</option>
            )}
            {sameArea.length > 0 && (
              <optgroup label="Nesta área">
                {sameArea.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                    {e.role ? ` · ${e.role}` : ""}
                  </option>
                ))}
              </optgroup>
            )}
            {otherAreas.length > 0 && (
              <optgroup label={sameArea.length > 0 ? "Outras áreas da empresa" : "Pessoas da empresa"}>
                {otherAreas.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                    {e.role ? ` · ${e.role}` : ""}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </Field>

        <Field
          label="Folgas a que tem direito (dias)"
          error={allowanceError}
          hint="Total concedido. O saldo restante desconta as folgas já lançadas."
          className="sm:col-span-2"
        >
          <input
            type="number"
            min={0}
            max={365}
            step={1}
            value={values.folgaAllowance}
            onChange={(e) => {
              setValues((v) => ({ ...v, folgaAllowance: e.target.value }));
              setAllowanceError(undefined);
            }}
            className={inputClass(!!allowanceError) + " font-mono tabular-nums sm:max-w-40"}
            placeholder="0"
          />
        </Field>

        <Field label="Data de entrada">
          <input
            type="date"
            value={values.startDate}
            onChange={(e) => setValues((v) => ({ ...v, startDate: e.target.value }))}
            className={inputClass(false) + " font-mono"}
          />
        </Field>

        <Field label="Tipo de contrato">
          <select
            value={values.contractType}
            onChange={(e) => setValues((v) => ({ ...v, contractType: e.target.value }))}
            className={inputClass(false)}
          >
            <option value="">Não informado</option>
            {CONTRACT_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c === "PJ" ? "PJ (prestação de serviços)" : c}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Fim do contrato (opcional)"
          hint="A ficha avisa quando faltar menos de 30 dias para a renovação."
          className="sm:col-span-2"
        >
          <input
            type="date"
            value={values.contractEnd}
            onChange={(e) => setValues((v) => ({ ...v, contractEnd: e.target.value }))}
            className={inputClass(false) + " font-mono sm:max-w-52"}
          />
        </Field>

        <div className="flex flex-col gap-1 border-t border-border pt-4 sm:col-span-2">
          <span className="font-display text-[15px] font-semibold uppercase tracking-[0.06em] text-ink">Ficha cadastral</span>
          <span className="text-xs text-muted">
            {recordStatus === "loading"
              ? "Carregando os dados..."
              : recordStatus === "error"
                ? "Não foi possível carregar a ficha cadastral. Feche e abra de novo para editar estes campos."
                : "Dados pessoais e de contato. Abrir esta edição fica registrado com o seu nome (LGPD)."}
          </span>
        </div>
        {recordStatus === "ready" &&
          RECORD_FIELDS.map((f) => {
            const set = (value: string) =>
              setValues((v) => ({ ...v, record: { ...v.record, [f.key]: value }, recordDirty: true }));
            return (
              <Field
                key={f.key}
                label={f.label}
                hint={fromOnboarding.has(f.key) ? "Preenchido com o dado do onboarding." : undefined}
                className={f.type === "textarea" ? "sm:col-span-2" : ""}
              >
                {f.type === "textarea" ? (
                  <textarea
                    rows={2}
                    value={values.record[f.key] ?? ""}
                    onChange={(e) => set(e.target.value)}
                    placeholder={PLACEHOLDER[f.key]}
                    maxLength={600}
                    className={inputClass(false) + " resize-y"}
                  />
                ) : (
                  <input
                    type={f.type === "date" ? "date" : f.type === "email" ? "email" : "text"}
                    value={values.record[f.key] ?? ""}
                    onChange={(e) => set(e.target.value)}
                    placeholder={PLACEHOLDER[f.key]}
                    maxLength={160}
                    inputMode={f.type === "cpf" || f.key === "cep" ? "numeric" : f.type === "tel" ? "tel" : undefined}
                    className={inputClass(false) + (f.type === "date" ? " font-mono" : "")}
                  />
                )}
              </Field>
            );
          })}

        {employee && (
          <label className="flex items-start gap-3 rounded-[10px] border border-border bg-surface-2 px-3 py-2.5 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={values.active}
              onChange={(e) => setValues((v) => ({ ...v, active: e.target.checked }))}
              className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
            />
            <span>
              <span className="font-medium text-ink">Colaborador ativo</span>
              <span className="block text-xs text-muted">
                Desative quem saiu da empresa: o histórico é mantido, mas o nome deixa de aparecer ao
                registrar novas ocorrências.
              </span>
            </span>
          </label>
        )}
      </form>
    </Modal>
  );
}
