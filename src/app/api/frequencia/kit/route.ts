import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { SlackError, slackApi, slackConfig } from "@/lib/slack";
import { SUGGESTED_ITEMS, kitChannel, setKitChannel } from "@/lib/startKit";

/** Configuração do kit de início: situação do Slack, canal e itens. */
export async function GET() {
  const auth = await requireFrequenciaUser({ admin: true });
  if ("response" in auth) return auth.response;

  const config = slackConfig();
  let slack: { configured: boolean; interactive: boolean; ok: boolean; workspace?: string; bot?: string; error?: string } = {
    configured: !!config,
    interactive: !!config?.signingSecret,
    ok: false,
  };
  if (config) {
    try {
      const r = await slackApi<{ team?: string; user?: string }>("auth.test", {});
      slack = { ...slack, ok: true, workspace: r.team, bot: r.user };
    } catch (err) {
      slack.error = err instanceof SlackError ? err.message : "Não foi possível falar com o Slack.";
    }
  }
  const items = await prisma.startKitItem.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  return NextResponse.json({ slack, channel: await kitChannel(), items, suggestions: SUGGESTED_ITEMS });
}

/** Troca o canal do Slack ({ channel: "#onboarding" }) ou cria os itens sugeridos ({ action: "sugestao" }). */
export async function PUT(request: NextRequest) {
  const auth = await requireFrequenciaUser({ admin: true });
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => null);

  if (body?.action === "sugestao") {
    if ((await prisma.startKitItem.count()) === 0) {
      await prisma.startKitItem.createMany({ data: SUGGESTED_ITEMS.map((i, index) => ({ ...i, sortOrder: index })) });
    }
    return NextResponse.json({ ok: true });
  }

  const raw = typeof body?.channel === "string" ? body.channel.trim() : "";
  if (raw && !/^(#[a-z0-9_\-à-ú.]{1,80}|[CG][A-Z0-9]{6,})$/i.test(raw)) {
    return NextResponse.json({ error: "Use o nome do canal com # (ex.: #onboarding) ou o ID do canal (começa com C)." }, { status: 400 });
  }
  await setKitChannel(raw || null);
  return NextResponse.json({ channel: raw || null });
}
