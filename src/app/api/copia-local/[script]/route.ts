import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

/**
 * Instalador e programa da cópia no computador, para o Mac baixar direto do
 * RHGroup (sem precisar do projeto): curl -fsSL <endereço>/api/copia-local/instalar.sh | bash
 * Não têm nada secreto — a chave de cada computador vem à parte.
 */
const SCRIPTS: Record<string, string> = {
  "instalar.sh": "instalar.sh",
  "programa.sh": "copia-local.sh",
};

function publicOrigin(request: NextRequest): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ script: string }> }) {
  const { script } = await params;
  const file = SCRIPTS[script];
  if (!file) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  const source = await readFile(path.join(process.cwd(), "integrations", "copia-local", file), "utf8");
  // O instalador já sai com o endereço deste RHGroup (oficial ou teste).
  const body = source.replaceAll("__RHGROUP_URL__", publicOrigin(request));
  return new NextResponse(body, {
    headers: { "Content-Type": "text/x-shellscript; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
