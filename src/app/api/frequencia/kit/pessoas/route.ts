import { NextResponse } from "next/server";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { SlackError } from "@/lib/slack";
import { slackPeople } from "@/lib/startKit";

/** Pessoas do Slack, para escolher quem recebe cada item do kit. */
export async function GET() {
  const auth = await requireFrequenciaUser({ admin: true });
  if ("response" in auth) return auth.response;
  try {
    return NextResponse.json(await slackPeople());
  } catch (err) {
    return NextResponse.json({ error: err instanceof SlackError ? err.message : "Não foi possível listar as pessoas do Slack." }, { status: 400 });
  }
}
