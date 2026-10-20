"use client";

import { FormEvent, useEffect, useState } from "react";
import { Modal } from "../Modal";
import { Button } from "../Button";
import { CompanyArea, Employee } from "@/lib/attendance";
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
}

export function EmployeeModal({ open, onClose, onSubmit, employee, existingDepartments, areasBySector }: EmployeeModalProps) {
  const [values, setValues] = useState<EmployeeFormValues>(EMPTY);
  const [error, setError] = useState<string>();
  const [allowanceError, setAllowanceError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

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
          }
        : EMPTY
    );
    setError(undefined);
    setAllowanceError(undefined);
  }, [open, employee]);

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
      await onSubmit(values);
    } finally {
      setSubmitting(false);
    }
  }

  const sectorAreas = areasBySector.get(values.department) ?? [];

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
            onChange={(e) => setValues((v) => ({ ...v, department: e.target.value, areaId: "", areaLead: false }))}
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
