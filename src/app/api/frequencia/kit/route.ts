import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { SlackError, slackApi, slackConfig } from "@/lib/slack";
import { SUGGESTED_ITEMS } from "@/lib/startKit";

/** Configuração do kit de início: situação do Slack e itens. */
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
  return NextResponse.json({ slack, items, suggestions: SUGGESTED_ITEMS });
}

/** { action: "sugestao" } — cria os itens sugeridos (só com a lista vazia). */
export async function PUT(request: NextRequest) {
  const auth = await requireFrequenciaUser({ admin: true });
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => null);
  if (body?.action === "sugestao" && (await prisma.startKitItem.count()) === 0) {
    await prisma.startKitItem.createMany({ data: SUGGESTED_ITEMS.map((i, index) => ({ ...i, sortOrder: index })) });
  }
  return NextResponse.json({ ok: true });
}
