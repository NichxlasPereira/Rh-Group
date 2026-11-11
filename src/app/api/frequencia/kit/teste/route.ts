import { NextRequest, NextResponse } from "next/server";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { SlackError, slackApi } from "@/lib/slack";

/** Manda uma mensagem direta de teste para a pessoa escolhida ({ userId: "U…" }). */
export async function POST(request: NextRequest) {
  const auth = await requireFrequenciaUser({ admin: true });
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
  if (!/^[UW][A-Z0-9]{6,}$/.test(userId)) return NextResponse.json({ error: "Escolha a pessoa do Slack." }, { status: 400 });
  try {
    await slackApi("chat.postMessage", {
      channel: userId,
      text: `:wave: Teste do RHGroup: quando um colaborador novo estiver chegando, os itens do kit de início que forem com você chegam aqui, com um botão "Pronto". (Enviado por ${auth.user.name})`,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof SlackError ? err.message : "Não foi possível enviar." }, { status: 400 });
  }
}
