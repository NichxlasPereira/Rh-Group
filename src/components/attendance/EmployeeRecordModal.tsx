"use client";

import { FormEvent, useState } from "react";
import toast from "react-hot-toast";
import { Modal } from "../Modal";
import { Button } from "../Button";
import { RECORD_FIELDS, RecordFieldKey } from "@/lib/employeeRecord";
import { Field, inputClass } from "./formControls";

export interface RecordEntry {
  key: RecordFieldKey;
  label: string;
  type: string;
  sensitive: boolean;
  source: "ficha" | "onboarding" | null;
  value: string | null;
}

interface EmployeeRecordModalProps {
  employeeId: string;
  employeeName: string;
  /** Valores completos (a ficha foi aberta com os dados à vista). */
  record: RecordEntry[];
  onClose: () => void;
  onSaved: () => void;
}

const PLACEHOLDER: Partial<Record<RecordFieldKey, string>> = {
  registration: "Ex.: 0042",
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

/** Edição da ficha cadastral (o que veio do onboarding aparece preenchido e pode ser corrigido). */
export function EmployeeRecordModal({ employeeId, employeeName, record, onClose, onSaved }: EmployeeRecordModalProps) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(record.map((r) => [r.key, r.value ?? ""]))
  );
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(undefined);
    const res = await fetch(`/api/employees/${employeeId}/cadastro`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(body.error || "Não foi possível salvar a ficha.");
      return;
    }
    toast.success("Ficha cadastral atualizada.");
    onSaved();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Ficha cadastral · ${employeeName}`}
      maxWidthClassName="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="record-form" disabled={saving}>
            {saving ? "Salvando..." : "Salvar ficha"}
          </Button>
        </>
      }
    >
      <form id="record-form" onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <p className="text-xs text-muted sm:col-span-2">
          Empresa, cargo, departamento (área) e data de contratação ficam em “Editar ficha”. Campos vazios ficam em
          branco na ficha.
        </p>
        {RECORD_FIELDS.map((f) => {
          const fromOnboarding = record.find((r) => r.key === f.key)?.source === "onboarding";
          const set = (v: string) => setValues((s) => ({ ...s, [f.key]: v }));
          return (
            <Field
              key={f.key}
              label={f.label}
              hint={fromOnboarding ? "Preenchido com o dado do onboarding." : undefined}
              className={f.type === "textarea" ? "sm:col-span-2" : ""}
            >
              {f.type === "textarea" ? (
                <textarea
                  rows={2}
                  value={values[f.key] ?? ""}
                  onChange={(e) => set(e.target.value)}
                  placeholder={PLACEHOLDER[f.key]}
                  maxLength={600}
                  className={inputClass(false) + " resize-y"}
                />
              ) : (
                <input
                  type={f.type === "date" ? "date" : f.type === "email" ? "email" : "text"}
                  value={values[f.key] ?? ""}
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
        {error && <p className="text-sm text-critical sm:col-span-2">{error}</p>}
      </form>
    </Modal>
  );
}
