/** Validação de um item do kit de início (tela de configuração). */
export interface StartKitItemInput {
  name: string;
  responsible: string;
  slackMention: string | null; // pessoa do Slack que recebe (ID U…)
  slackUserName: string | null;
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
  if (mention && !/^[UW][A-Z0-9]{6,}$/.test(mention)) {
    return { error: "Escolha na lista a pessoa do Slack que recebe este item." };
  }
  return {
    data: {
      name,
      responsible,
      slackMention: mention || null,
      slackUserName: mention ? text(b.slackUserName, 120) || null : null,
      department: text(b.department, 80) || null,
      area: text(b.area, 80) || null,
    },
  };
}
