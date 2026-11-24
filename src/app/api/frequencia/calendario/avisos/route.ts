import { NextRequest, NextResponse } from "next/server";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { SlackError, slackApi, slackConfig } from "@/lib/slack";
import {
  DAYS_BEFORE_OPTIONS,
  loadSettings,
  loadStatus,
  parseSettings,
  saveSettings,
  sendCalendarPreview,
} from "@/lib/calendarReminders";

/** Avisos do calendário no Slack (administradores): situação do Slack, configuração e último envio. */
export async function GET() {
  const auth = await requireFrequenciaUser({ admin: true });
  if ("response" in auth) return auth.response;
  const config = slackConfig();
  const slack: { configured: boolean; ok: boolean; workspace?: string; error?: string } = {
    configured: !!config,
    ok: false,
  };
  if (config) {
    try {
      const r = await slackApi<{ team?: string }>("auth.test", {});
      slack.ok = true;
      slack.workspace = r.team;
    } catch (err) {
      slack.error = err instanceof SlackError ? err.message : "Não foi possível falar com o Slack.";
    }
  }
  const [settings, status] = await Promise.all([loadSettings(), loadStatus()]);
  return NextResponse.json({ slack, settings, status, daysBeforeOptions: DAYS_BEFORE_OPTIONS });
}

/** Salva quem recebe e o que recebe. */
export async function PUT(request: NextRequest) {
  const auth = await requireFrequenciaUser({ admin: true });
  if ("response" in auth) return auth.response;
  const settings = parseSettings(await request.json().catch(() => null));
  if (!settings) return NextResponse.json({ error: "Configuração inválida." }, { status: 400 });
  await saveSettings(settings);
  return NextResponse.json({ settings });
}

/** Manda agora uma prévia para as pessoas escolhidas (sem marcar nada como enviado). */
export async function POST(request: NextRequest) {
  const auth = await requireFrequenciaUser({ admin: true });
  if ("response" in auth) return auth.response;
  if (!slackConfig())
    return NextResponse.json({ error: "Slack não configurado: falta SLACK_BOT_TOKEN no Railway." }, { status: 400 });
  const settings = parseSettings(await request.json().catch(() => null));
  if (!settings?.recipients.length)
    return NextResponse.json({ error: "Escolha ao menos uma pessoa para receber." }, { status: 400 });
  const { ok, errors } = await sendCalendarPreview(settings);
  if (!ok) return NextResponse.json({ error: errors.join(" ") || "Não foi possível enviar." }, { status: 400 });
  return NextResponse.json({ ok, errors });
}
