import { NextRequest, NextResponse } from "next/server";
import { verifySlackSignature } from "@/lib/slack";
import { setTaskDone } from "@/lib/startKit";

/**
 * Cliques nos botões das mensagens do Slack ("Pronto" / "Desfazer" do kit de
 * início). Sem login: só vale com a assinatura do app RHGroup no Slack.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!verifySlackSignature(raw, request.headers.get("x-slack-request-timestamp"), request.headers.get("x-slack-signature"))) {
    return NextResponse.json({ error: "Assinatura do Slack inválida." }, { status: 401 });
  }

  let payload: {
    type?: string;
    user?: { name?: string; username?: string; id?: string };
    actions?: { action_id?: string; value?: string }[];
  };
  try {
    payload = JSON.parse(new URLSearchParams(raw).get("payload") ?? "{}");
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  if (payload.type === "block_actions") {
    const by = payload.user?.name || payload.user?.username || payload.user?.id || "Slack";
    for (const action of payload.actions ?? []) {
      if (!action.value) continue;
      if (action.action_id === "kit_pronto") await setTaskDone(action.value, true, by, "slack");
      if (action.action_id === "kit_desfazer") await setTaskDone(action.value, false, by, "slack");
    }
  }
  // O Slack só precisa de um 200 rápido; a mensagem já foi atualizada.
  return new NextResponse(null, { status: 200 });
}
