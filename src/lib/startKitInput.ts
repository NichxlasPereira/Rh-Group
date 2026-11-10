/** Validação de um item do kit de início (tela de configuração). */
export interface StartKitItemInput {
  name: string;
  responsible: string;
  slackMention: string | null;
  department: string | null;
  area: string | null;
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export function validateStartKitItem(body: unknown): { data: StartKitItemInput } | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = text(b.name, 80);
  if (!name) return { error: "Informe o item (ex.: Notebook, E-mail corporativo)." };
  const responsible = text(b.responsible, 40);
  if (!responsible) return { error: "Informe quem cuida do item (ex.: TI, Facilities, Gestor)." };
  const mention = text(b.slackMention, 20).replace(/^@/, "").toUpperCase();
  if (mention && !/^[UWS][A-Z0-9]{6,}$/.test(mention)) {
    return { error: "ID do Slack inválido: use o ID do membro (começa com U) ou do grupo (começa com S)." };
  }
  return {
    data: {
      name,
      responsible,
      slackMention: mention || null,
      department: text(b.department, 80) || null,
      area: text(b.area, 80) || null,
    },
  };
}
