import { NextRequest, NextResponse } from "next/server";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { removeLocalCopyDevice, rotateLocalCopyDevice } from "@/lib/localCopy";

type Params = { params: Promise<{ id: string }> };

/** Nova chave para este computador: a anterior dele para de funcionar. */
export async function POST(_request: NextRequest, { params }: Params) {
  const auth = await requireFrequenciaUser({ admin: true });
  if ("response" in auth) return auth.response;
  const token = await rotateLocalCopyDevice((await params).id);
  if (!token) return NextResponse.json({ error: "Computador não encontrado." }, { status: 404 });
  return NextResponse.json({ token });
}

/** Remove o computador: ele para de receber arquivos (os já baixados ficam nele). */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await requireFrequenciaUser({ admin: true });
  if ("response" in auth) return auth.response;
  if (!(await removeLocalCopyDevice((await params).id))) {
    return NextResponse.json({ error: "Computador não encontrado." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
