"use client";

import { FormEvent, useEffect, useState } from "react";
import { Modal } from "../Modal";
import { Button } from "../Button";
import { Field, inputClass } from "../attendance/formControls";
import { BILLINGS, BILLING_LABEL, Billing, ProviderDetail } from "@/lib/providers";

/** Valores do formulário (texto, como o usuário digita). */
export type ProviderFormValues = Record<
  | "name"
  | "birthDate"
  | "rg"
  | "cpf"
  | "taxId"
  | "phone"
  | "emergencyContact"
  | "personalEmail"
  | "corporateEmail"
  | "address"
  | "cep"
  | "registration"
  | "department"
  | "role"
  | "area"
  | "contractStart"
  | "contractEnd"
  | "amount"
  | "pixKey"
  | "notes",
  string
> & { billing: Billing; active: boolean };

const isoDay = (v: string | null) => (v ? v.slice(0, 10) : "");
const cents = (v: number | null) => (v === null ? "" : (v / 100).toFixed(2).replace(".", ","));

export function emptyProviderForm(): ProviderFormValues {
  return {
    name: "",
    birthDate: "",
    rg: "",
    cpf: "",
    taxId: "",
    phone: "",
    emergencyContact: "",
    personalEmail: "",
    corporateEmail: "",
    address: "",
    cep: "",
    registration: "",
    department: "",
    role: "",
    area: "",
    contractStart: "",
    contractEnd: "",
    amount: "",
    pixKey: "",
    notes: "",
    billing: "mensal",
    active: true,
  };
}

function fromDetail(p: ProviderDetail): ProviderFormValues {
  return {
    name: p.name,
    birthDate: isoDay(p.birthDate),
    rg: p.rg ?? "",
    cpf: p.cpf ?? "",
    taxId: p.taxId ?? "",
    phone: p.phone ?? "",
    emergencyContact: p.emergencyContact ?? "",
    personalEmail: p.personalEmail ?? "",
    corporateEmail: p.corporateEmail ?? "",
    address: p.address ?? "",
    cep: p.cep ?? "",
    registration: p.registration ?? "",
    department: p.department ?? "",
    role: p.role ?? "",
    area: p.area ?? "",
    contractStart: isoDay(p.contractStart),
    contractEnd: isoDay(p.contractEnd),
    amount: cents(p.amountCents),
    pixKey: p.pixKey ?? "",
    notes: p.notes ?? "",
    billing: p.billing,
    active: p.active,
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Editando: a ficha completa; novo: null. */
  provider: ProviderDetail | null;
  departments: string[];
  saving: boolean;
  onSave: (values: ProviderFormValues) => Promise<void>;
}

/** Cadastro e edição do prestador — as mesmas colunas da planilha do RH. */
export function ProviderModal({ open, onClose, provider, departments, saving, onSave }: Props) {
  const [values, setValues] = useState<ProviderFormValues>(emptyProviderForm);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setValues(provider ? fromDetail(provider) : emptyProviderForm());
    setError("");
  }, [open, provider]);

  const set = <K extends keyof ProviderFormValues>(key: K, value: ProviderFormValues[K]) => setValues((v) => ({ ...v, [key]: value }));
  const input = (key: Exclude<keyof ProviderFormValues, "billing" | "active">, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input value={values[key]} onChange={(e) => set(key, e.target.value)} className={inputClass(false)} {...props} />
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!values.name.trim()) return setError("Informe o nome do prestador.");
    setError("");
    try {
      await onSave(values);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    }
  }

  const companies = values.department && !departments.includes(values.department) ? [values.department, ...departments] : departments;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={provider ? "Editar prestador" : "Novo prestador"}
      maxWidthClassName="max-w-3xl"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="provider-form" disabled={saving}>
            {saving ? "Salvando…" : provider ? "Salvar alterações" : "Cadastrar prestador"}
          </Button>
        </>
      }
    >
      <form id="provider-form" onSubmit={submit} className="flex flex-col gap-5">
        {error && <p className="rounded-[10px] bg-critical-soft px-3 py-2 text-sm text-critical">{error}</p>}

        <Section title="Contrato">
          <Field label="Nome" className="sm:col-span-2">
            {input("name", { autoFocus: true, maxLength: 120 })}
          </Field>
          <Field label="Empresa">
            <select value={values.department} onChange={(e) => set("department", e.target.value)} className={inputClass(false)}>
              <option value="">Selecione…</option>
              {companies.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Função">{input("role", { maxLength: 80 })}</Field>
          <Field label="Departamento">{input("area", { maxLength: 80, placeholder: "Ex.: Marketing" })}</Field>
          <Field label="Registro do colaborador">{input("registration", { maxLength: 40 })}</Field>
          <Field label="Data de contratação">{input("contractStart", { type: "date" })}</Field>
          <Field label="Término do contrato" hint="Contrato temporário: o RHGroup avisa 30 dias antes.">
            {input("contractEnd", { type: "date" })}
          </Field>
          <Field label="Valor (opcional)">{input("amount", { inputMode: "decimal", placeholder: "Ex.: 3.500,00" })}</Field>
          <Field label="Cobrança">
            <select value={values.billing} onChange={(e) => set("billing", e.target.value as Billing)} className={inputClass(false)}>
              {BILLINGS.map((b) => (
                <option key={b} value={b}>
                  {BILLING_LABEL[b]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="CNPJ da PJ">{input("taxId", { inputMode: "numeric", placeholder: "00.000.000/0000-00" })}</Field>
          <Field label="Dados bancários (chave Pix)">{input("pixKey", { maxLength: 120 })}</Field>
        </Section>

        <Section title="Dados pessoais" note="Só aparecem na ficha do prestador.">
          <Field label="Data de nascimento">{input("birthDate", { type: "date" })}</Field>
          <Field label="RG">{input("rg", { maxLength: 30 })}</Field>
          <Field label="CPF">{input("cpf", { inputMode: "numeric", placeholder: "000.000.000-00" })}</Field>
          <Field label="Telefone">{input("phone", { inputMode: "tel", maxLength: 40 })}</Field>
          <Field label="Contato de emergência" className="sm:col-span-2">
            {input("emergencyContact", { maxLength: 160, placeholder: "Nome (parentesco) e telefone" })}
          </Field>
          <Field label="E-mail pessoal">{input("personalEmail", { type: "email", maxLength: 120 })}</Field>
          <Field label="E-mail corporativo">{input("corporateEmail", { type: "email", maxLength: 120 })}</Field>
          <Field label="Endereço" className="sm:col-span-2">
            {input("address", { maxLength: 240 })}
          </Field>
          <Field label="CEP">{input("cep", { inputMode: "numeric", maxLength: 12 })}</Field>
        </Section>

        <Field label="Observações (opcional)">
          <textarea value={values.notes} onChange={(e) => set("notes", e.target.value)} rows={3} maxLength={1000} className={inputClass(false)} />
        </Field>

        {provider && (
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={values.active} onChange={(e) => set("active", e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
            Contrato ativo (desmarque quando o prestador sair)
          </label>
        )}
      </form>
    </Modal>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 font-display text-base font-semibold text-ink">
        {title}
        {note && <span className="ml-2 text-xs font-normal text-muted">{note}</span>}
      </legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}
