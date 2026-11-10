import { NextRequest, NextResponse } from "next/server";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { setTaskDone } from "@/lib/startKit";

/** RH marca ou desmarca um item do kit na ficha ({ done: true|false }); a mensagem do Slack acompanha. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => null);
  const requestId = await setTaskDone((await params).taskId, body?.done === true, auth.user.name, "rhgroup");
  if (!requestId) return NextResponse.json({ error: "Item não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
