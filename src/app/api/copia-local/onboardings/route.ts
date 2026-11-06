import { NextRequest, NextResponse } from "next/server";
import { isLocalCopyRequest, localCopyList, markLocalCopySeen } from "@/lib/localCopy";

/** Lista para a cópia no computador: onboardings concluídos e os arquivos de cada um. */
export async function GET(request: NextRequest) {
  if (!(await isLocalCopyRequest(request))) {
    return NextResponse.json({ error: "Chave inválida ou desativada. Gere uma nova no RHGroup, aba Onboarding." }, { status: 401 });
  }
  const admissions = await localCopyList();
  await markLocalCopySeen();
  return NextResponse.json({ admissions }, { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}
