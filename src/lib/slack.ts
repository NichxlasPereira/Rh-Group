import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Integração com o Slack (app "RHGroup"): o token do bot e o segredo de
 * assinatura ficam nas variáveis SLACK_BOT_TOKEN e SLACK_SIGNING_SECRET do
 * Railway — nunca no código nem no banco.
 */

export interface SlackConfig {
  token: string;
  signingSecret: string | null;
}

export function slackConfig(): SlackConfig | null {
  const token = process.env.SLACK_BOT_TOKEN?.trim();
  if (!token) return null;
  return { token, signingSecret: process.env.SLACK_SIGNING_SECRET?.trim() || null };
}

export class SlackError extends Error {}

const FRIENDLY: Record<string, string> = {
  channel_not_found: "Conversa não encontrada no Slack. Confira se a pessoa ainda está no workspace.",
  invalid_auth: "Token do Slack inválido. Confira SLACK_BOT_TOKEN no Railway.",
  not_authed: "Token do Slack ausente. Confira SLACK_BOT_TOKEN no Railway.",
  account_inactive: "O app do Slack foi desativado ou removido do workspace.",
  missing_scope: "O app do Slack não tem todas as permissões (chat:write, im:write, users:read). Atualize o app com o manifesto do RHGroup e reinstale.",
  user_not_found: "Pessoa não encontrada no Slack (pode ter saído do workspace). Escolha outra em Onboarding › Kit de início.",
  cannot_dm_bot: "Não dá para mandar mensagem direta para um bot.",
  ratelimited: "O Slack pediu para esperar um pouco (muitas mensagens). Tente de novo em instantes.",
};

/** Chama um método da Web API do Slack; lança SlackError com mensagem em português. */
export async function slackApi<T = Record<string, unknown>>(
  method: string,
  body: Record<string, unknown>,
  opts: { form?: boolean } = {}
): Promise<T> {
  const config = slackConfig();
  if (!config) throw new SlackError("Slack não configurado: falta SLACK_BOT_TOKEN no Railway.");
  let res: Response;
  try {
    // SLACK_API_BASE só serve para testes locais (simulador do Slack).
    const base = process.env.SLACK_API_BASE?.trim() || "https://slack.com/api";
    // Métodos de leitura (ex.: users.list) só entendem formulário; os de escrita, JSON.
    res = await fetch(`${base}/${method}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": opts.form ? "application/x-www-form-urlencoded" : "application/json; charset=utf-8",
      },
      body: opts.form
        ? new URLSearchParams(Object.entries(body).map(([k, v]) => [k, String(v)])).toString()
        : JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new SlackError("Não foi possível falar com o Slack agora.");
  }
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string } & T;
  if (!data.ok) throw new SlackError(FRIENDLY[data.error ?? ""] ?? `O Slack recusou (${data.error ?? res.status}).`);
  return data;
}

/**
 * Confere que o pedido veio mesmo do Slack (assinatura v0 com o segredo do
 * app) e é recente (até 5 minutos), para ninguém marcar itens de fora.
 */
export function verifySlackSignature(rawBody: string, timestamp: string | null, signature: string | null): boolean {
  const secret = slackConfig()?.signingSecret;
  if (!secret || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;
  const expected = "v0=" + createHmac("sha256", secret).update(`v0:${timestamp}:${rawBody}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Texto seguro dentro de mensagens do Slack (&, < e > têm significado especial). */
export function slackEscape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
