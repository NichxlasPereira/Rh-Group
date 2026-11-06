import { NextRequest, NextResponse } from "next/server";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { addLocalCopyDevice, listLocalCopyDevices } from "@/lib/localCopy";

/** Computadores que recebem a cópia (as chaves nunca voltam: o banco só guarda o hash). */
export async function GET() {
  const auth = await requireFrequenciaUser({ admin: true });
  if ("response" in auth) return auth.response;
  return NextResponse.json({ devices: await listLocalCopyDevices() });
}

/** Adiciona um computador e devolve a chave dele — mostrada uma vez só. */
export async function POST(request: NextRequest) {
  const auth = await requireFrequenciaUser({ admin: true });
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.replace(/\s+/g, " ").trim() : "";
  if (!name || name.length > 60) {
    return NextResponse.json({ error: "Dê um nome ao computador (até 60 caracteres)." }, { status: 400 });
  }
  return NextResponse.json({ token: await addLocalCopyDevice(name, auth.user.name) }, { status: 201 });
}
