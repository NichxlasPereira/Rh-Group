/** Recados do Mural do RH: o que o navegador recebe e a validação do que o RH publica. */

export interface MuralNoticeInfo {
  id: string;
  title: string;
  body: string | null;
  /** Último dia em que aparece ("AAAA-MM-DD"), ou null (fica até alguém tirar). */
  until: string | null;
  createdBy: string | null;
  createdAt: string;
}

export const NOTICE_TITLE_MAX = 80;
export const NOTICE_BODY_MAX = 400;

export type NoticeInput = { title: string; body: string | null; until: Date | null };

/** Valida o corpo do POST. Devolve os dados ou { error }. */
export function parseNotice(body: unknown, today: Date): NoticeInput | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const title = typeof b.title === "string" ? b.title.trim().replace(/\s+/g, " ") : "";
  const text = typeof b.body === "string" ? b.body.trim() : "";
  const untilRaw = typeof b.until === "string" ? b.until.trim() : "";
  if (!title) return { error: "Escreva o título do recado." };
  if (title.length > NOTICE_TITLE_MAX) return { error: `O título pode ter até ${NOTICE_TITLE_MAX} caracteres.` };
  if (text.length > NOTICE_BODY_MAX) return { error: `O texto pode ter até ${NOTICE_BODY_MAX} caracteres.` };
  let until: Date | null = null;
  if (untilRaw) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(untilRaw);
    const d = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
    if (!d || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== untilRaw) {
      return { error: "Data inválida." };
    }
    if (d.getTime() < startOfDayUTC(today).getTime()) return { error: "Escolha hoje ou uma data futura." };
    until = d;
  }
  return { title, body: text || null, until };
}

/** Meia-noite (UTC) do dia de hoje no calendário local: datas sem hora são gravadas assim. */
export function startOfDayUTC(now: Date): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export function toNoticeInfo(n: {
  id: string;
  title: string;
  body: string | null;
  until: Date | null;
  createdBy: string | null;
  createdAt: Date;
}): MuralNoticeInfo {
  return {
    id: n.id,
    title: n.title,
    body: n.body,
    until: n.until ? n.until.toISOString().slice(0, 10) : null,
    createdBy: n.createdBy,
    createdAt: n.createdAt.toISOString(),
  };
}
