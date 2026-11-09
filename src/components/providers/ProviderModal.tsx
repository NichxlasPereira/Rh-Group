"use client";

import { FormEvent, useEffect, useState } from "react";
import { Modal } from "../Modal";
import { Button } from "../Button";
import { Field, inputClass } from "../attendance/formControls";
import { ProviderDetail } from "@/lib/providers";

/** Os mesmos campos do colaborador, mais o início e a validade do contrato. */
export interface ProviderFormValues {
  name: string;
  department: string;
  role: string;
  area: string;
  contractStart: string;
  contractEnd: string;
  active: boolean;
}

const isoDay = (v: string | null) => (v ? v.slice(0, 10) : "");

function initialValues(p: ProviderDetail | null): ProviderFormValues {
  return {
    name: p?.name ?? "",
    department: p?.department ?? "",
    role: p?.role ?? "",
    area: p?.area ?? "",
    contractStart: isoDay(p?.contractStart ?? null),
    contractEnd: isoDay(p?.contractEnd ?? null),
    active: p?.active ?? true,
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Editando: a ficha; novo: null. */
  provider: ProviderDetail | null;
  departments: string[];
  /** Áreas de cada empresa (as mesmas do organograma). */
  areasBySector: Map<string, string[]>;
  saving: boolean;
  onSave: (values: ProviderFormValues) => Promise<void>;
}

/** Cadastro do prestador — igual ao do colaborador, com o contrato temporário. */
export function ProviderModal({ open, onClose, provider, departments, areasBySector, saving, onSave }: Props) {
  const [values, setValues] = useState<ProviderFormValues>(() => initialValues(null));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setValues(initialValues(provider));
    setError("");
  }, [open, provider]);

  const set = <K extends keyof ProviderFormValues>(key: K, value: ProviderFormValues[K]) => setValues((v) => ({ ...v, [key]: value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!values.name.trim()) return setError("Informe o nome do prestador.");
    if (values.contractStart && values.contractEnd && values.contractEnd < values.contractStart) {
      return setError("A validade do contrato não pode ser antes do início.");
    }
    setError("");
    try {
      await onSave(values);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    }
  }

  const sectorAreas = values.department ? (areasBySector.get(values.department) ?? []) : [];
  // Área antiga que não está mais na lista continua visível até o RH trocar.
  const areas = values.area && !sectorAreas.includes(values.area) ? [values.area, ...sectorAreas] : sectorAreas;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={provider ? "Editar prestador" : "Novo prestador"}
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
      <form id="provider-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nome" error={error} className="sm:col-span-2">
          <input
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            className={inputClass(!!error)}
            placeholder="Nome completo"
            maxLength={120}
            autoFocus
          />
        </Field>

        <Field label="Setor (empresa)" hint="Empresas com CNPJ cadastrado no onboarding.">
          <select
            value={values.department}
            // As áreas são de cada empresa: trocar de setor limpa a área.
            onChange={(e) => setValues((v) => ({ ...v, department: e.target.value, area: "" }))}
            className={inputClass(false)}
          >
            <option value="">Sem setor</option>
            {values.department && !departments.includes(values.department) && (
              <option value={values.department}>{values.department} (fora da lista)</option>
            )}
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Cargo (opcional)">
          <input value={values.role} onChange={(e) => set("role", e.target.value)} className={inputClass(false)} placeholder="Ex.: Gestor de tráfego" maxLength={80} />
        </Field>

        <Field
          label="Área"
          hint={
            !values.department
              ? "Escolha o setor (empresa) primeiro."
              : areas.length === 0
                ? "Esta empresa ainda não tem áreas. Crie em Colaboradores › Organograma."
                : undefined
          }
        >
          <select
            value={values.area}
            onChange={(e) => set("area", e.target.value)}
            disabled={areas.length === 0}
            className={inputClass(false) + " disabled:opacity-60"}
          >
            <option value="">Sem área</option>
            {areas.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </Field>

        <div />

        <Field label="Início do contrato">
          <input type="date" value={values.contractStart} onChange={(e) => set("contractStart", e.target.value)} className={inputClass(false)} />
        </Field>
        <Field label="Validade do contrato" hint="O RHGroup avisa 30 dias antes de vencer.">
          <input type="date" value={values.contractEnd} onChange={(e) => set("contractEnd", e.target.value)} className={inputClass(false)} />
        </Field>

        {provider && (
          <label className="flex items-center gap-2 text-sm text-ink sm:col-span-2">
            <input type="checkbox" checked={values.active} onChange={(e) => set("active", e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
            Contrato ativo (desmarque quando o prestador sair)
          </label>
        )}
      </form>
    </Modal>
  );
}
