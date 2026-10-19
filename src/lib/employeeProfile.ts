/**
 * Ficha do colaborador: o que vem do onboarding digital (dados pessoais,
 * documentos, foto para crachá) e como os dados pessoais aparecem mascarados.
 */

/** Esconde a maior parte de um dado pessoal; o RH pode pedir para ver completo (fica registrado). */
export function maskFieldValue(type: string, value: string | null): string | null {
  if (!value) return value;
  const digits = value.replace(/\D/g, "");
  switch (type) {
    case "cpf":
      return digits.length === 11 ? `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**` : "***";
    case "rg": {
      const chars = value.replace(/[^0-9A-Za-z]/g, "");
      return chars.length > 3 ? `${chars.slice(0, 2)}${"*".repeat(chars.length - 3)}${chars.slice(-1)}` : "***";
    }
    case "tel":
      return digits.length >= 10 ? `(${digits.slice(0, 2)}) *****-${digits.slice(-4)}` : "***";
    case "cnpj": {
      const chars = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
      return chars.length === 14 ? `${chars.slice(0, 2)}.***.***/${chars.slice(8, 12)}-**` : "***";
    }
    case "textarea":
      // Endereço e textos livres: só aparecem completos.
      return "Oculto";
    default:
      return value;
  }
}

/** Tipos de dado que ficam mascarados na ficha. */
export const SENSITIVE_TYPES = new Set(["cpf", "rg", "tel", "cnpj", "textarea"]);

/** Foto que o navegador consegue mostrar (HEIC fica de fora: abre como arquivo). */
export const DISPLAYABLE_IMAGE = /^image\/(jpeg|png|webp)$/;
