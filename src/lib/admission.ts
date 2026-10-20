/** Tipos e textos da admissão digital, usados no servidor e no navegador. */

export type AdmissionStatus = "em_andamento" | "concluida" | "cancelada";
export type DocumentStatus = "pendente" | "enviado" | "aprovado" | "recusado";

export const ADMISSION_STATUS_LABEL: Record<AdmissionStatus, string> = {
  em_andamento: "Em andamento",
  concluida: "Concluído",
  cancelada: "Cancelado",
};

export const DOCUMENT_STATUS_LABEL: Record<DocumentStatus, string> = {
  pendente: "Não enviado",
  enviado: "Em análise",
  aprovado: "Aprovado",
  recusado: "Recusado",
};

export interface ChecklistItem {
  name: string;
  description?: string;
  required: boolean;
}

/** Documentos pedidos por padrão no onboarding. O RH ajusta em cada onboarding. */
export const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { name: "Documento de identidade (RG ou CNH)", description: "Frente e verso, legíveis.", required: true },
  {
    name: "Dados bancários (com chave Pix)",
    description: "Comprovante com banco, agência e conta em seu nome. A chave Pix você digita em “Seus dados”.",
    required: true,
  },
  { name: "Foto para crachá", description: "Foto recente, de frente, com fundo claro.", required: true },
];

export type FieldType = "text" | "cpf" | "rg" | "cnpj" | "date" | "email" | "tel" | "textarea";

export interface FieldTemplate {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
}

/** Dados que o candidato preenche no link. O RH inclui ou retira em cada onboarding. */
export const DEFAULT_FIELDS: FieldTemplate[] = [
  { key: "nome", label: "Nome completo", type: "text", required: true },
  { key: "cpf", label: "CPF", type: "cpf", required: true },
  { key: "rg", label: "RG", type: "rg", required: true },
  { key: "nascimento", label: "Data de nascimento", type: "date", required: true },
  // Nacionalidade e estado civil entram no termo de uso de imagem.
  { key: "nacionalidade", label: "Nacionalidade", type: "text", required: true },
  { key: "estadocivil", label: "Estado civil", type: "text", required: true },
  { key: "email", label: "E-mail", type: "email", required: true },
  { key: "telefone", label: "Telefone / WhatsApp", type: "tel", required: true },
  { key: "endereco", label: "Endereço completo (com CEP)", type: "textarea", required: true },
  { key: "pix", label: "Chave Pix (CNPJ)", type: "cnpj", required: true },
];

export interface AdmissionFieldInfo {
  id: string;
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  value: string | null;
}

function validCpf(digits: string): boolean {
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  for (const len of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(digits[i]) * (len + 1 - i);
    const check = ((sum * 10) % 11) % 10;
    if (check !== Number(digits[len])) return false;
  }
  return true;
}

/**
 * CNPJ numérico ou alfanumérico (emitido a partir de julho/2026): 12 caracteres
 * A–Z/0–9 + 2 dígitos verificadores. Cada caractere vale (código ASCII − 48),
 * o que mantém o cálculo antigo para CNPJs só com números.
 */
function validCnpj(value: string): boolean {
  if (!/^[A-Z0-9]{12}\d{2}$/.test(value) || /^(.)\1{13}$/.test(value)) return false;
  const digit = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += (value.charCodeAt(i) - 48) * weights[i];
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return digit(12) === Number(value[12]) && digit(13) === Number(value[13]);
}

/**
 * Valida e padroniza a resposta de um campo. Retorna o valor a gravar
 * (null = vazio) ou um erro. Usada no navegador e de novo no servidor.
 */
export function normalizeFieldValue(type: FieldType, raw: string): { value: string | null } | { error: string } {
  const text = raw.trim();
  if (!text) return { value: null };
  if (text.length > 1000) return { error: "Texto longo demais." };
  switch (type) {
    case "cpf": {
      const digits = text.replace(/\D/g, "");
      if (!validCpf(digits)) return { error: "CPF inválido. Confira os números." };
      return { value: `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}` };
    }
    case "rg": {
      // O formato muda de estado para estado: só confere que há um número de verdade.
      if (text.replace(/[^0-9A-Za-z]/g, "").length < 5) return { error: "RG inválido. Digite o número completo." };
      return { value: text.toUpperCase().replace(/\s+/g, " ") };
    }
    case "cnpj": {
      const chars = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!validCnpj(chars)) return { error: "CNPJ inválido. Confira os números (a chave Pix deve ser o CNPJ)." };
      return { value: `${chars.slice(0, 2)}.${chars.slice(2, 5)}.${chars.slice(5, 8)}/${chars.slice(8, 12)}-${chars.slice(12)}` };
    }
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? { value: text.toLowerCase() } : { error: "E-mail inválido." };
    case "tel": {
      const digits = text.replace(/\D/g, "");
      if (digits.length < 10 || digits.length > 13) return { error: "Telefone inválido. Inclua o DDD." };
      return { value: text };
    }
    case "date": {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(new Date(`${text}T00:00:00Z`).getTime())) {
        return { error: "Data inválida." };
      }
      return { value: text };
    }
    default:
      return { value: text.replace(type === "textarea" ? /[ \t]+/g : /\s+/g, " ") };
  }
}

export function fieldsProgress(fields: Pick<AdmissionFieldInfo, "required" | "value">[]) {
  const required = fields.filter((f) => f.required);
  return { required: required.length, filled: required.filter((f) => f.value).length };
}

export interface AdmissionFileInfo {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface AdmissionDocumentInfo {
  id: string;
  kind: "upload" | "nda" | "imagem";
  name: string;
  description: string | null;
  required: boolean;
  status: DocumentStatus;
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  files: AdmissionFileInfo[];
}

export interface AdmissionInfo {
  id: string;
  candidateName: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  department: string | null;
  startDate: string | null;
  status: AdmissionStatus;
  notes: string | null;
  tokenExpiresAt: string;
  createdBy: string | null;
  employeeId: string | null;
  contractingCompanyId: string | null;
  driveStatus: "enviado" | "erro" | "nao_configurado" | null;
  driveFolderUrl: string | null;
  driveError: string | null;
  driveSyncedAt: string | null;
  sheetStatus: "ok" | "erro" | "nao_configurado" | null;
  sheetError: string | null;
  sheetSyncedAt: string | null;
  createdAt: string;
  documents: AdmissionDocumentInfo[];
  fields: AdmissionFieldInfo[];
}

export interface AdmissionProgress {
  required: number;
  approved: number;
  inReview: number;
  refused: number;
  missing: number;
}

/** Progresso considera só os documentos obrigatórios. */
export function admissionProgress(docs: Pick<AdmissionDocumentInfo, "required" | "status">[]): AdmissionProgress {
  const required = docs.filter((d) => d.required);
  return {
    required: required.length,
    approved: required.filter((d) => d.status === "aprovado").length,
    inReview: required.filter((d) => d.status === "enviado").length,
    refused: required.filter((d) => d.status === "recusado").length,
    missing: required.filter((d) => d.status === "pendente").length,
  };
}

export const LINK_VALID_DAYS = 30;

/** Empresa que assina o acordo de confidencialidade como contratante. */
export interface ContractingCompanyInfo {
  id: string;
  name: string;
  /** Nome curto que aparece como setor dos colaboradores. */
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

/** Nome com que a empresa aparece como setor dos colaboradores. */
export function sectorName(company: Pick<ContractingCompanyInfo, "name" | "shortName">): string {
  return (company.shortName || company.name).trim();
}

/** Termos que o sistema gera preenchidos e o candidato assina no gov.br. */
export const GENERATED_DOCUMENT_KINDS = ["nda", "imagem"] as const;
export const isGeneratedDocument = (kind: string) => (GENERATED_DOCUMENT_KINDS as readonly string[]).includes(kind);

/**
 * Setores da lista de escolha: o nome curto de cada empresa com CNPJ
 * cadastrado no onboarding (o setor dos colaboradores é a empresa).
 */
export function companySectors(companies: Pick<ContractingCompanyInfo, "name" | "shortName" | "cnpj">[]): string[] {
  const names = companies.filter((c) => c.cnpj).map(sectorName);
  return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, "pt-BR"));
}
