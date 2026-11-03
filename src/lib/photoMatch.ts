/**
 * Fotos em lote: descobre de quem é cada foto pelo nome do arquivo
 * ("Maria Souza.jpg", "foto_joao-pedro-silva.png"). Na dúvida, não escolhe:
 * o RH confirma antes de enviar.
 */

export type PhotoMatchKind = "exato" | "provavel" | "duvida" | "nenhum";

interface Person {
  id: string;
  name: string;
}

const CONNECTORS = new Set(["de", "da", "do", "das", "dos", "e"]);
// Palavras que costumam vir no nome do arquivo e não fazem parte do nome da pessoa.
const NOISE = new Set(["foto", "fotos", "cracha", "perfil", "img", "image", "imagem", "whatsapp", "copia", "copy", "final"]);

export function foldName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function nameTokens(value: string): string[] {
  return foldName(value)
    .split(" ")
    .filter((t) => t && !CONNECTORS.has(t));
}

/** Nome da pessoa contido no nome do arquivo: sem extensão, números e palavras como "foto". */
export function nameFromFile(fileName: string): string[] {
  return nameTokens(fileName.replace(/\.[a-z0-9]{2,5}$/i, "")).filter((t) => !NOISE.has(t) && !/^\d+$/.test(t));
}

/**
 * - exato: o nome do arquivo é o nome completo de uma só pessoa;
 * - provavel: nome e sobrenome(s) do arquivo batem com uma só pessoa (ex.: "João Silva" → "João Pedro Silva");
 * - duvida: mais de uma pessoa possível, ou só o primeiro nome;
 * - nenhum: ninguém com esse nome.
 */
export function matchPhoto<T extends Person>(fileName: string, people: T[]): { kind: PhotoMatchKind; person: T | null; candidates: T[] } {
  const file = nameFromFile(fileName);
  if (file.length === 0) return { kind: "nenhum", person: null, candidates: [] };
  const key = file.join(" ");

  const exact = people.filter((p) => nameTokens(p.name).join(" ") === key);
  if (exact.length === 1) return { kind: "exato", person: exact[0], candidates: exact };
  if (exact.length > 1) return { kind: "duvida", person: null, candidates: exact };

  // Todas as palavras do arquivo estão no nome da pessoa, e o primeiro nome é o mesmo.
  const partial = people.filter((p) => {
    const tokens = nameTokens(p.name);
    return tokens[0] === file[0] && file.every((t) => tokens.includes(t));
  });
  if (partial.length === 1 && file.length >= 2) return { kind: "provavel", person: partial[0], candidates: partial };
  if (partial.length > 0) return { kind: "duvida", person: null, candidates: partial };
  return { kind: "nenhum", person: null, candidates: [] };
}
