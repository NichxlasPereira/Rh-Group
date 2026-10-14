/**
 * Consulta os dados públicos de um CNPJ (Receita Federal) para preencher o
 * cadastro da empresa contratante. Usa bases públicas gratuitas, uma depois da
 * outra, porque cada uma às vezes sai do ar ou limita consultas. A Receita
 * devolve quase tudo em maiúsculas e sem acentos: o RH confere antes de salvar.
 */

const SMALL_WORDS = new Set(["de", "da", "do", "das", "dos", "e"]);
const ACCENTS: Record<string, string> = { Sao: "São", Joao: "João", Jose: "José", Conceicao: "Conceição" };
const STREET_TYPES: Record<string, string> = { AV: "Avenida", R: "Rua", AL: "Alameda", TV: "Travessa", PCA: "Praça", ROD: "Rodovia", EST: "Estrada" };

function titleCase(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word, i) => {
      if (i > 0 && SMALL_WORDS.has(word)) return word;
      const titled = word.charAt(0).toUpperCase() + word.slice(1);
      return ACCENTS[titled] ?? titled;
    })
    .join(" ");
}

interface RawCompany {
  name: string;
  nature: string;
  street: string; // tipo + logradouro
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  cep: string;
  partners: { name: string; role: string }[];
}

export interface CnpjDetails {
  name: string;
  legalNature: string;
  address: string;
  district: string;
  city: string;
  state: string;
  cep: string;
  cnpj: string;
  /** Sócios e administradores, para o RH montar a qualificação. */
  partners: { name: string; role: string }[];
}

type Source = (digits: string) => Promise<RawCompany | "not_found">;

async function getJson(url: string): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(8_000),
    headers: { Accept: "application/json", "User-Agent": "CFFGROUP-Onboarding/1.0" },
  });
  return { status: res.status, data: res.ok ? await res.json() : {} };
}

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v)).trim();
type Obj = Record<string, unknown>;

/** publica.cnpj.ws — traz a cidade com acentos. */
const cnpjWs: Source = async (digits) => {
  const { status, data } = await getJson(`https://publica.cnpj.ws/cnpj/${digits}`);
  if (status === 404) return "not_found";
  if (status !== 200) throw new Error(`cnpj.ws ${status}`);
  const e = (data.estabelecimento ?? {}) as Obj;
  return {
    name: str(data.razao_social),
    nature: str((data.natureza_juridica as Obj | undefined)?.descricao),
    street: [str(e.tipo_logradouro), str(e.logradouro)].filter(Boolean).join(" "),
    number: str(e.numero),
    complement: str(e.complemento),
    district: str(e.bairro),
    city: str((e.cidade as Obj | undefined)?.nome),
    state: str((e.estado as Obj | undefined)?.sigla),
    cep: str(e.cep),
    partners: ((data.socios ?? []) as Obj[]).map((s) => ({
      name: str(s.nome),
      role: str((s.qualificacao_socio as Obj | undefined)?.descricao),
    })),
  };
};

const brasilApi: Source = async (digits) => {
  const { status, data } = await getJson(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
  if (status === 404) return "not_found";
  if (status !== 200) throw new Error(`brasilapi ${status}`);
  return {
    name: str(data.razao_social),
    nature: str(data.natureza_juridica),
    street: [str(data.descricao_tipo_de_logradouro), str(data.logradouro)].filter(Boolean).join(" "),
    number: str(data.numero),
    complement: str(data.complemento),
    district: str(data.bairro),
    city: str(data.municipio),
    state: str(data.uf),
    cep: str(data.cep),
    partners: ((data.qsa ?? []) as Obj[]).map((s) => ({ name: str(s.nome_socio), role: str(s.qualificacao_socio) })),
  };
};

const receitaWs: Source = async (digits) => {
  const { status, data } = await getJson(`https://receitaws.com.br/v1/cnpj/${digits}`);
  if (status !== 200) throw new Error(`receitaws ${status}`);
  if (data.status === "ERROR") return "not_found";
  const [type, ...rest] = str(data.logradouro).split(" ");
  return {
    name: str(data.nome),
    nature: str(data.natureza_juridica),
    street: [STREET_TYPES[type] ?? type, ...rest].join(" "),
    number: str(data.numero),
    complement: str(data.complemento),
    district: str(data.bairro),
    city: str(data.municipio),
    state: str(data.uf),
    cep: str(data.cep),
    partners: ((data.qsa ?? []) as Obj[]).map((s) => ({ name: str(s.nome), role: str(s.qual) })),
  };
};

export async function lookupCnpj(digits: string): Promise<CnpjDetails | { error: string }> {
  let raw: RawCompany | null = null;
  for (const source of [cnpjWs, brasilApi, receitaWs]) {
    try {
      const result = await source(digits);
      if (result === "not_found") return { error: "CNPJ não encontrado na Receita." };
      raw = result;
      break;
    } catch {
      // Base fora do ar ou limitando consultas: tenta a próxima.
    }
  }
  if (!raw) return { error: "A consulta à Receita não respondeu agora. Tente de novo em alguns minutos ou preencha à mão." };

  const complement = titleCase(raw.complement.replace(/\s+/g, " "))
    .replace(/\bConj\b\.?/g, "conjunto")
    .replace(/\bAndar\b/g, "andar")
    .replace(/\bSala\b/g, "sala")
    .replace(/(\S) (conjunto|sala)\b/g, "$1, $2");
  const cep = raw.cep.replace(/\D/g, "");
  const seen = new Set<string>();
  return {
    name: raw.name,
    // "206-2 - Sociedade Empresária Limitada" → "sociedade empresária limitada"
    legalNature: raw.nature.replace(/^\d{3}-\d\s*-\s*/, "").toLowerCase(),
    address: [titleCase(raw.street), raw.number ? `nº ${raw.number}` : "", complement].filter(Boolean).join(", "),
    district: titleCase(raw.district),
    city: titleCase(raw.city),
    state: raw.state.toUpperCase(),
    cep: cep.length === 8 ? `${cep.slice(0, 5)}-${cep.slice(5)}` : "",
    cnpj: `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`,
    partners: raw.partners
      .map((p) => ({ name: p.name, role: p.role.replace(/^\d+-/, "").trim() }))
      .filter((p) => p.name && !seen.has(p.name) && seen.add(p.name)),
  };
}
