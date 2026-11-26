import { NextRequest, NextResponse } from "next/server";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { parseTemplates } from "@/lib/selecao";
import { saveTemplates } from "@/lib/selecaoServer";

/** Salva os modelos de devolutiva ({ templates: [{ title, text }] }). */
export async function PUT(request: NextRequest) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const templates = parseTemplates(await request.json().catch(() => null));
  if (!templates) return NextResponse.json({ error: "Modelos inválidos." }, { status: 400 });
  await saveTemplates(templates);
  return NextResponse.json({ templates });
}
