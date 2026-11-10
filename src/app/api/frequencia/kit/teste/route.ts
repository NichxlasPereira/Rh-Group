import { NextResponse } from "next/server";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { SlackError, slackApi } from "@/lib/slack";
import { kitChannel } from "@/lib/startKit";

/** Manda uma mensagem de teste no canal escolhido. */
export async function POST() {
  const auth = await requireFrequenciaUser({ admin: true });
  if ("response" in auth) return auth.response;
  const channel = await kitChannel();
  if (!channel) return NextResponse.json({ error: "Escolha e salve o canal primeiro." }, { status: 400 });
  try {
    await slackApi("chat.postMessage", {
      channel,
      text: `:wave: Teste do RHGroup: a partir de agora, cada onboarding concluído manda aqui o kit de início do colaborador. (Enviado por ${auth.user.name})`,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof SlackError ? err.message : "Não foi possível enviar." }, { status: 400 });
  }
}
