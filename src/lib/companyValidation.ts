import { normalizeFieldValue } from "./admission";

export interface CompanyInput {
  name: string;
  shortName: string | null;
  qualification: string;
  signerName: string;
  signerRole: string;
  signerCpf: string;
  cnpj: string | null;
  legalNature: string | null;
  address: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  cep: string | null;
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");

export function parseCompany(body: unknown): { data: CompanyInput } | { error: string } {
  if (typeof body !== "object" || body === null) return { error: "Dados inválidos." };
  const b = body as Record<string, unknown>;
  const data = {
    name: text(b.name, 160),
    qualification: text(b.qualification, 3000),
    signerName: text(b.signerName, 160),
    signerRole: text(b.signerRole, 120),
    signerCpf: text(b.signerCpf, 20),
  };
  if (!data.name) return { error: "Informe o nome da empresa." };
  if (data.qualification.length < 30) return { error: "Escreva a qualificação completa da empresa (sede, CNPJ, representantes)." };
  if (!data.signerName) return { error: "Informe quem assina pela empresa." };
  if (!data.signerRole) return { error: "Informe o cargo de quem assina." };
  if (data.signerCpf.replace(/\D/g, "").length !== 11) return { error: "CPF de quem assina inválido." };

  // CNPJ e sede: opcionais no cadastro, mas o termo de uso de imagem precisa deles.
  const optional = (v: unknown, max: number) => text(v, max) || null;
  let cnpj = optional(b.cnpj, 20);
  if (cnpj) {
    const normalized = normalizeFieldValue("cnpj", cnpj);
    if ("error" in normalized) return { error: "CNPJ da empresa inválido." };
    cnpj = normalized.value;
  }
  let cep = optional(b.cep, 12);
  if (cep) {
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) return { error: "CEP da empresa inválido." };
    cep = `${digits.slice(0, 5)}-${digits.slice(5)}`;
  }
  const state = optional(b.state, 2)?.toUpperCase() ?? null;
  if (state && !/^[A-Z]{2}$/.test(state)) return { error: "UF inválida (use a sigla, ex.: SP)." };

  return {
    data: {
      ...data,
      shortName: optional(b.shortName, 40)?.toUpperCase() ?? null,
      cnpj,
      legalNature: optional(b.legalNature, 120),
      address: optional(b.address, 300),
      district: optional(b.district, 120),
      city: optional(b.city, 120),
      state,
      cep,
    },
  };
}
