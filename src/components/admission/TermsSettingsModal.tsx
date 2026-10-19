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

type CompanyForm = { [K in keyof Omit<ContractingCompanyInfo, "id">]: string };
const EMPTY_COMPANY: CompanyForm = {
  name: "",
  shortName: "",
  qualification: "",
  signerName: "",
  signerRole: "",
  signerCpf: "",
  cnpj: "",
  legalNature: "",
  address: "",
  district: "",
  city: "",
  state: "",
  cep: "",
};

type TermKind = "nda" | "imagem";
const TERM_TABS: { kind: TermKind; label: string; format: string }[] = [
  { kind: "nda", label: "Acordo de confidencialidade", format: "A4, Times 10, justificado" },
  { kind: "imagem", label: "Termo de uso de imagem", format: "Carta, Arial 12, justificado" },
];

interface TemplateInfo {
  text: string;
  custom: boolean;
  placeholders: { key: string; description: string }[];
  markup: { syntax: string; description: string }[];
}

/** Falta o que o termo de uso de imagem cita da empresa (CNPJ e sede). */
export const companyIncomplete = (c: ContractingCompanyInfo) =>
  !c.cnpj || !c.legalNature || !c.address || !c.district || !c.city || !c.state || !c.cep;

/** Só administradores: empresas contratantes e os textos dos termos gerados. */
export function TermsSettingsModal({
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
  const [tab, setTab] = useState<"empresas" | TermKind>("empresas");
  // null = lista; "" = nova empresa; id = editando
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CompanyForm>(EMPTY_COMPANY);
  const [templates, setTemplates] = useState<Partial<Record<TermKind, TemplateInfo>>>({});
  const [drafts, setDrafts] = useState<Partial<Record<TermKind, string>>>({});
  const [saving, setSaving] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [partners, setPartners] = useState<{ name: string; role: string }[]>([]);

  const termKind = tab === "empresas" ? null : tab;
  const template = termKind ? templates[termKind] : undefined;
  const draft = termKind ? (drafts[termKind] ?? "") : "";

  async function loadTemplate(kind: TermKind) {
    const t: TemplateInfo = await send(`/api/frequencia/templates/${kind}`, "GET");
    setTemplates((all) => ({ ...all, [kind]: t }));
    setDrafts((all) => ({ ...all, [kind]: t.text }));
  }

  useEffect(() => {
    if (!open || !termKind || templates[termKind]) return;
    loadTemplate(termKind).catch(errorToast);
  }, [open, termKind, templates]);

  function edit(company: ContractingCompanyInfo | null) {
    setEditingId(company?.id ?? "");
    setPartners([]);
    if (!company) return setForm(EMPTY_COMPANY);
    const values = { ...EMPTY_COMPANY };
    for (const key of Object.keys(EMPTY_COMPANY) as (keyof CompanyForm)[]) values[key] = company[key] ?? "";
    // Cadastros antigos têm o CNPJ só no texto de qualificação: já traz para o campo.
    if (!values.cnpj) values.cnpj = company.qualification.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/)?.[0] ?? "";
    setForm(values);
  }

  async function lookup() {
    setLookingUp(true);
    try {
      const d = await send(`/api/frequencia/companies/lookup?cnpj=${encodeURIComponent(form.cnpj)}`, "GET");
      setForm((f) => ({
        ...f,
        name: f.name || d.name,
        cnpj: d.cnpj,
        legalNature: d.legalNature,
        address: d.address,
        district: d.district,
        city: d.city,
        state: d.state,
        cep: d.cep,
        qualification:
          f.qualification ||
          `**${d.name},** ${d.legalNature}, com sede na ${d.address}, bairro ${d.district}, ${d.city}/${d.state}, CEP ${d.cep}, inscrita no CNPJ sob nº ${d.cnpj}, neste ato representada por `,
      }));
      setPartners(d.partners ?? []);
      toast.success("Dados da Receita preenchidos. Confira acentos e complemento antes de salvar.");
    } catch (err) {
      errorToast(err);
    } finally {
      setLookingUp(false);
    }
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
    if (!window.confirm(`Excluir ${company.name}? Onboardings com essa empresa ficam sem os termos até você escolher outra.`)) return;
    try {
      await send(`/api/frequencia/companies/${company.id}`, "DELETE");
      await onCompaniesChanged();
      toast.success("Empresa excluída.");
    } catch (err) {
      errorToast(err);
    }
  }

  async function saveTemplate(reset: boolean) {
    if (!termKind) return;
    if (reset && !window.confirm("Voltar ao texto padrão? O texto editado será descartado.")) return;
    setSaving(true);
    try {
      if (reset) await send(`/api/frequencia/templates/${termKind}`, "DELETE");
      else await send(`/api/frequencia/templates/${termKind}`, "PUT", { text: draft });
      await loadTemplate(termKind);
      toast.success(reset ? "Texto padrão restaurado." : "Texto salvo.");
    } catch (err) {
      errorToast(err);
    } finally {
      setSaving(false);
    }
  }

  const set = (key: keyof CompanyForm, value: string) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <Modal open={open} onClose={onClose} title="Termos do onboarding" maxWidthClassName="max-w-3xl">
      <div className="mb-4 flex flex-wrap gap-2">
        {[{ key: "empresas" as const, label: "Empresas contratantes" }, ...TERM_TABS.map((t) => ({ key: t.kind, label: t.label }))].map(
          (t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                tab === t.key ? "bg-ink text-bg" : "text-muted hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          )
        )}
      </div>

      {tab === "empresas" && editingId === null && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            A empresa escolhida em cada onboarding entra no acordo de confidencialidade e no termo de uso de imagem. Sem
            empresa, o candidato não recebe os termos. Com uma só empresa cadastrada, os novos onboardings já saem com ela.
          </p>
          {companies.length === 0 ? (
            <p className="rounded-[10px] bg-surface-2 px-3 py-4 text-center text-sm text-muted">Nenhuma empresa cadastrada.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {companies.map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-3 rounded-[10px] border border-border p-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">
                      {c.name}
                      {c.shortName && (
                        <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-muted">
                          Setor: {c.shortName}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted">
                      {c.cnpj ? `CNPJ ${c.cnpj} · ` : ""}Assina: {c.signerName} · {c.signerRole}
                    </p>
                    {companyIncomplete(c) && (
                      <p className="mt-1 text-xs font-semibold text-warn">
                        Falta CNPJ e endereço da sede para o termo de uso de imagem — clique em Editar.
                      </p>
                    )}
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
        <form onSubmit={saveCompany} className="grid grid-cols-1 gap-3 sm:grid-cols-6">
          <Field label="CNPJ" className="sm:col-span-4">
            <input
              value={form.cnpj}
              onChange={(e) => set("cnpj", e.target.value)}
              className={inputClass(false) + " font-mono"}
              placeholder="00.000.000/0000-00"
              autoFocus
            />
          </Field>
          <div className="flex items-end sm:col-span-2">
            <Button
              type="button"
              variant="ghost"
              disabled={lookingUp || form.cnpj.replace(/\W/g, "").length < 14}
              className="w-full !px-3 !py-2 text-xs"
              onClick={lookup}
            >
              {lookingUp ? "Buscando..." : "Buscar pelo CNPJ"}
            </Button>
          </div>
          <Field label="Razão social" className="sm:col-span-4">
            <input value={form.name} onChange={(e) => set("name", e.target.value)} className={inputClass(false)} required />
          </Field>
          <Field label="Nome curto (setor)" hint="Aparece como setor dos colaboradores." className="sm:col-span-2">
            <input
              value={form.shortName}
              onChange={(e) => set("shortName", e.target.value.toUpperCase())}
              placeholder="Ex.: TOKITE"
              className={inputClass(false)}
            />
          </Field>
          <Field label="Natureza jurídica" className="sm:col-span-3">
            <input
              value={form.legalNature}
              onChange={(e) => set("legalNature", e.target.value)}
              placeholder="sociedade empresária limitada"
              className={inputClass(false)}
            />
          </Field>
          <Field label="Endereço da sede (logradouro, nº, complemento)" className="sm:col-span-3">
            <input value={form.address} onChange={(e) => set("address", e.target.value)} className={inputClass(false)} />
          </Field>
          <Field label="Bairro" className="sm:col-span-2">
            <input value={form.district} onChange={(e) => set("district", e.target.value)} className={inputClass(false)} />
          </Field>
          <Field label="Cidade" className="sm:col-span-2">
            <input value={form.city} onChange={(e) => set("city", e.target.value)} className={inputClass(false)} />
          </Field>
          <Field label="UF" className="sm:col-span-1">
            <input value={form.state} onChange={(e) => set("state", e.target.value)} maxLength={2} className={inputClass(false) + " uppercase"} />
          </Field>
          <Field label="CEP" className="sm:col-span-1">
            <input value={form.cep} onChange={(e) => set("cep", e.target.value)} className={inputClass(false) + " font-mono"} />
          </Field>
          <Field label="Qualificação (como aparece no acordo de confidencialidade)" className="sm:col-span-6">
            <textarea
              value={form.qualification}
              onChange={(e) => set("qualification", e.target.value)}
              rows={4}
              required
              placeholder="**EMPRESA LTDA,** sociedade ..., com sede na ..., inscrita no CNPJ sob nº ..., neste ato representada por seus sócios **NOME DO SÓCIO**, ..."
              className={inputClass(false) + " resize-y"}
            />
          </Field>
          <p className="-mt-1 text-xs text-muted sm:col-span-6">
            Entre <code>**asteriscos**</code> sai em negrito, como o nome da empresa e dos sócios no modelo. Termine sem
            pontuação: o acordo continua com “, e, de outro lado,”.
            {partners.length > 0 && (
              <>
                {" "}
                Sócios e administradores na Receita:{" "}
                {partners.map((p) => `${p.name} (${p.role})`).join("; ")}. Complete com nacionalidade, estado civil,
                profissão e CPF de quem representa.
              </>
            )}
          </p>
          <Field label="Quem assina pela empresa" className="sm:col-span-2">
            <input value={form.signerName} onChange={(e) => set("signerName", e.target.value)} className={inputClass(false)} required />
          </Field>
          <Field label="Cargo de quem assina" className="sm:col-span-2">
            <input value={form.signerRole} onChange={(e) => set("signerRole", e.target.value)} className={inputClass(false)} required />
          </Field>
          <Field label="CPF de quem assina" className="sm:col-span-2">
            <input
              value={form.signerCpf}
              onChange={(e) => set("signerCpf", e.target.value)}
              className={inputClass(false) + " font-mono"}
              inputMode="numeric"
              required
            />
          </Field>
          <div className="flex gap-2 sm:col-span-6">
            <Button type="submit" disabled={saving} className="!px-4 !py-1.5 text-xs">
              {saving ? "Salvando..." : "Salvar"}
            </Button>
            <Button type="button" variant="ghost" className="!px-4 !py-1.5 text-xs" onClick={() => setEditingId(null)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {termKind &&
        (!template ? (
          <p className="py-8 text-center text-sm text-muted">Carregando...</p>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted">
              {template.custom ? "Texto editado pelo RH." : "Texto padrão."} O PDF sai no formato do modelo (
              {TERM_TABS.find((t) => t.kind === termKind)?.format}). Formatação, uma por linha:
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
              onChange={(e) => setDrafts((all) => ({ ...all, [termKind]: e.target.value }))}
              rows={16}
              className={inputClass(false) + " resize-y font-mono text-xs"}
              aria-label="Texto do termo"
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
