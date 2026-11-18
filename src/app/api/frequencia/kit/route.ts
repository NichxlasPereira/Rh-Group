import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { SlackError, slackApi, slackConfig } from "@/lib/slack";
import { SUGGESTED_EXIT_ITEMS, SUGGESTED_ITEMS, kitKind } from "@/lib/startKit";

/** Configuração do kit de início e do offboarding: situação do Slack e itens (cada um com o tipo). */
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
  return NextResponse.json({ slack, items, suggestions: SUGGESTED_ITEMS, exitSuggestions: SUGGESTED_EXIT_ITEMS });
}

/** { action: "sugestao", kind } — cria os itens sugeridos daquela lista (só com ela vazia). */
export async function PUT(request: NextRequest) {
  const auth = await requireFrequenciaUser({ admin: true });
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => null);
  const kind = kitKind(body?.kind);
  if (body?.action === "sugestao" && (await prisma.startKitItem.count({ where: { kind } })) === 0) {
    const list = kind === "saida" ? SUGGESTED_EXIT_ITEMS : SUGGESTED_ITEMS;
    await prisma.startKitItem.createMany({ data: list.map((i, index) => ({ ...i, kind, sortOrder: index })) });
  }
  return NextResponse.json({ ok: true });
}
