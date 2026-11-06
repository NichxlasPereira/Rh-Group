import { NextResponse } from "next/server";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { localCopyInfo, localCopyToken } from "@/lib/localCopy";

/** Situação da cópia no computador (a chave em si nunca volta: o banco só guarda o hash). */
export async function GET() {
  const auth = await requireFrequenciaUser({ admin: true });
  if ("response" in auth) return auth.response;
  return NextResponse.json(await localCopyInfo());
}

/** Gera uma chave nova — a anterior para de funcionar. Mostrada uma vez só. */
export async function POST() {
  const auth = await requireFrequenciaUser({ admin: true });
  if ("response" in auth) return auth.response;
  return NextResponse.json({ token: await localCopyToken.rotate() });
}

/** Desativa a cópia: o computador para de receber arquivos. */
export async function DELETE() {
  const auth = await requireFrequenciaUser({ admin: true });
  if ("response" in auth) return auth.response;
  await localCopyToken.revoke();
  return NextResponse.json({ ok: true });
}
