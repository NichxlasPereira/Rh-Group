import { RECORD_FIELDS, RecordFieldKey, parseDateCell } from "./employeeRecord";

/** Dados pessoais que a lista de colaboradores e as respostas comuns não devolvem. */
export const PERSONAL_OMIT = Object.fromEntries(RECORD_FIELDS.map((f) => [f.key, true])) as Record<RecordFieldKey, true>;

export type RecordData = Partial<Record<Exclude<RecordFieldKey, "birthDate">, string | null>> & {
  birthDate?: Date | null;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Valida um campo da ficha cadastral. Devolve o valor normalizado (null = apagar)
 * ou { error }. CPF e CEP ficam formatados; datas aceitam dd/mm/aaaa.
 */
export function parseRecordValue(key: RecordFieldKey, raw: unknown): string | Date | null | { error: string } {
  const field = RECORD_FIELDS.find((f) => f.key === key)!;
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") return { error: `${field.label}: valor inválido.` };
  const value = raw.trim();
  if (!value) return null;
  if (value.length > (field.type === "textarea" ? 600 : 160)) return { error: `${field.label}: texto longo demais.` };

  switch (key) {
    case "birthDate": {
      const iso = parseDateCell(value);
      if (!iso) return { error: `Data de nascimento inválida: "${value}" (use dd/mm/aaaa).` };
      return new Date(`${iso}T00:00:00.000Z`);
    }
    case "cpf": {
      const digits = value.replace(/\D/g, "");
      if (digits.length !== 11) return { error: `CPF inválido: precisa ter 11 números.` };
      return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
    }
    case "cep": {
      const digits = value.replace(/\D/g, "");
      if (digits.length !== 8) return { error: `CEP inválido: precisa ter 8 números.` };
      return `${digits.slice(0, 5)}-${digits.slice(5)}`;
    }
    case "personalEmail":
    case "corporateEmail":
      if (!EMAIL.test(value)) return { error: `${field.label} inválido: "${value}".` };
      return value.toLowerCase();
    default:
      return value;
  }
}

/** Corpo do pedido → campos da ficha (só os que vieram; ausentes = não mexe). */
export function parseRecordInput(body: unknown): { data: RecordData } | { error: string } {
  if (typeof body !== "object" || body === null) return { error: "Dados inválidos." };
  const b = body as Record<string, unknown>;
  const data: Record<string, string | Date | null> = {};
  for (const f of RECORD_FIELDS) {
    if (!(f.key in b)) continue;
    const parsed = parseRecordValue(f.key, b[f.key]);
    if (parsed && typeof parsed === "object" && "error" in parsed) return { error: parsed.error };
    data[f.key] = parsed as string | Date | null;
  }
  return { data: data as RecordData };
}
