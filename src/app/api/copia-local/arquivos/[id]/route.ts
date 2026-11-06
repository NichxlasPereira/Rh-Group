import { NextRequest, NextResponse } from "next/server";
import { readAttachment } from "@/lib/attachmentStorage";
import { localCopyDevice, localCopyFile } from "@/lib/localCopy";

/** Um arquivo para a cópia no computador (só de onboarding concluído, documento aprovado). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await localCopyDevice(request))) {
    return NextResponse.json({ error: "Chave inválida ou desativada." }, { status: 401 });
  }
  const { id } = await params;
  const file = await localCopyFile(id);
  const data = file && (await readAttachment(file.storedName, "admissoes"));
  if (!file || !data) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(data.byteLength),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}
