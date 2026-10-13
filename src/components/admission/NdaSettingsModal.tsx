"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "../Button";
import { Modal } from "../Modal";
import { IconTrash } from "../icons";
import { Field, inputClass } from "../attendance/formControls";
import type { ContractingCompanyInfo } from "@/lib/admission";

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Não foi possível concluir.");
  return data;
}

const errorToast = (err: unknown) => toast.error(err instanceof Error ? err.message : "Erro inesperado.");

type CompanyForm = Omit<ContractingCompanyInfo, "id">;
const EMPTY_COMPANY: CompanyForm = { name: "", qualification: "", signerName: "", signerRole: "", signerCpf: "" };

/** Só administradores: empresas contratantes e o texto do acordo de confidencialidade. */
export function NdaSettingsModal({
  open,
  onClose,
  companies,
  onCompaniesChanged,
}: {
  open: boolean;
  onClose: () => void;
  companies: ContractingCompanyInfo[];
  onCompaniesChanged: () => Promise<void>;
}) {
  const [tab, setTab] = useState<"empresas" | "texto">("empresas");
  // null = lista; "" = nova empresa; id = editando
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CompanyForm>(EMPTY_COMPANY);
  const [template, setTemplate] = useState<{
    text: string;
    custom: boolean;
    placeholders: { key: string; description: string }[];
    markup: { syntax: string; description: string }[];
  } | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || template) return;
    send("/api/frequencia/nda-template", "GET")
      .then((t) => {
        setTemplate(t);
        setDraft(t.text);
      })
      .catch(errorToast);
  }, [open, template]);

  function edit(company: ContractingCompanyInfo | null) {
    setEditingId(company?.id ?? "");
    setForm(company ? { ...company } : EMPTY_COMPANY);
  }

  async function saveCompany(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) await send(`/api/frequencia/companies/${editingId}`, "PATCH", form);
      else await send("/api/frequencia/companies", "POST", form);
      await onCompaniesChanged();
      setEditingId(null);
      toast.success("Empresa salva.");
    } catch (err) {
      errorToast(err);
    } finally {
      setSaving(false);
    }
  }

  async function removeCompany(company: ContractingCompanyInfo) {
    if (!window.confirm(`Excluir ${company.name}? Onboardings com essa empresa ficam sem acordo até você escolher outra.`)) return;
    try {
      await send(`/api/frequencia/companies/${company.id}`, "DELETE");
      await onCompaniesChanged();
      toast.success("Empresa excluída.");
    } catch (err) {
      errorToast(err);
    }
  }

  async function saveTemplate(reset: boolean) {
    if (reset && !window.confirm("Voltar ao texto padrão do acordo? O texto editado será descartado.")) return;
    setSaving(true);
    try {
      if (reset) await send("/api/frequencia/nda-template", "DELETE");
      else await send("/api/frequencia/nda-template", "PUT", { text: draft });
      const t = await send("/api/frequencia/nda-template", "GET");
      setTemplate(t);
      setDraft(t.text);
      toast.success(reset ? "Texto padrão restaurado." : "Texto do acordo salvo.");
    } catch (err) {
      errorToast(err);
    } finally {
      setSaving(false);
    }
  }

  const set = (key: keyof CompanyForm, value: string) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <Modal open={open} onClose={onClose} title="Acordo de confidencialidade" maxWidthClassName="max-w-3xl">
      <div className="mb-4 flex gap-2">
        {(["empresas", "texto"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              tab === t ? "bg-ink text-bg" : "text-muted hover:text-ink"
            }`}
          >
            {t === "empresas" ? "Empresas contratantes" : "Texto do acordo"}
          </button>
        ))}
      </div>

      {tab === "empresas" && editingId === null && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            A empresa escolhida em cada onboarding aparece no acordo como CONTRATANTE. Sem empresa, o candidato não recebe o
            acordo. Com uma só empresa cadastrada, os novos onboardings já saem com ela.
          </p>
          {companies.length === 0 ? (
            <p className="rounded-[10px] bg-surface-2 px-3 py-4 text-center text-sm text-muted">Nenhuma empresa cadastrada.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {companies.map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-3 rounded-[10px] border border-border p-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{c.name}</p>
                    <p className="text-xs text-muted">
                      Assina: {c.signerName} · {c.signerRole}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button variant="ghost" className="!px-3 !py-1 text-xs" onClick={() => edit(c)}>
                      Editar
                    </Button>
                    <button
                      type="button"
                      onClick={() => removeCompany(c)}
                      title="Excluir empresa"
                      className="rounded-[8px] p-2 text-muted transition hover:bg-surface-2 hover:text-critical"
                    >
                      <IconTrash className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Button className="self-start !px-4 !py-2 text-xs" onClick={() => edit(null)}>
            Cadastrar empresa
          </Button>
        </div>
      )}

      {tab === "empresas" && editingId !== null && (
        <form onSubmit={saveCompany} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nome da empresa" className="sm:col-span-2">
            <input value={form.name} onChange={(e) => set("name", e.target.value)} className={inputClass(false)} autoFocus required />
          </Field>
          <Field label="Qualificação (como aparece no acordo)" className="sm:col-span-2">
            <textarea
              value={form.qualification}
              onChange={(e) => set("qualification", e.target.value)}
              rows={4}
              required
              placeholder="**EMPRESA LTDA,** sociedade ..., com sede na ..., inscrita no CNPJ sob nº ..., neste ato representada por seus sócios **NOME DO SÓCIO**, ..."
              className={inputClass(false) + " resize-y"}
            />
          </Field>
          <p className="-mt-1 text-xs text-muted sm:col-span-2">
            Entre <code>**asteriscos**</code> sai em negrito, como o nome da empresa e dos sócios no modelo. Termine sem
            pontuação: o acordo continua com “, e, de outro lado,”.
          </p>
          <Field label="Quem assina pela empresa">
            <input value={form.signerName} onChange={(e) => set("signerName", e.target.value)} className={inputClass(false)} required />
          </Field>
          <Field label="Cargo de quem assina">
            <input value={form.signerRole} onChange={(e) => set("signerRole", e.target.value)} className={inputClass(false)} required />
          </Field>
          <Field label="CPF de quem assina">
            <input
              value={form.signerCpf}
              onChange={(e) => set("signerCpf", e.target.value)}
              className={inputClass(false) + " font-mono"}
              inputMode="numeric"
              required
            />
          </Field>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={saving} className="!px-4 !py-1.5 text-xs">
              {saving ? "Salvando..." : "Salvar"}
            </Button>
            <Button type="button" variant="ghost" className="!px-4 !py-1.5 text-xs" onClick={() => setEditingId(null)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {tab === "texto" &&
        (template === null ? (
          <p className="py-8 text-center text-sm text-muted">Carregando...</p>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted">
              {template.custom ? "Texto editado pelo RH." : "Texto padrão."} O PDF sai no formato do modelo (Times 10,
              justificado). Formatação, uma por linha:
            </p>
            <ul className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
              {template.markup.map((m) => (
                <li key={m.syntax}>
                  <code className="font-semibold text-ink">{m.syntax}</code> <span className="text-muted">— {m.description}</span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted">Os marcadores abaixo são trocados pelos dados de cada pessoa ao gerar o PDF:</p>
            <ul className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
              {template.placeholders.map((p) => (
                <li key={p.key}>
                  <code className="font-semibold text-ink">{`{{${p.key}}}`}</code> <span className="text-muted">— {p.description}</span>
                </li>
              ))}
            </ul>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={16}
              className={inputClass(false) + " resize-y font-mono text-xs"}
              aria-label="Texto do acordo"
            />
            <div className="flex flex-wrap gap-2">
              <Button disabled={saving || draft === template.text} className="!px-4 !py-1.5 text-xs" onClick={() => saveTemplate(false)}>
                Salvar texto
              </Button>
              {template.custom && (
                <Button variant="ghost" disabled={saving} className="!px-4 !py-1.5 text-xs" onClick={() => saveTemplate(true)}>
                  Voltar ao texto padrão
                </Button>
              )}
            </div>
          </div>
        ))}
    </Modal>
  );
}
