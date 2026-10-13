import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { NDA_MARKUP_HELP, NDA_PLACEHOLDERS, NDA_TEMPLATE_KEY, ndaTemplate } from "@/lib/nda";

/** Texto do acordo (o padrão ou o editado pelo RH) e os marcadores disponíveis. */
export async function GET() {
  const auth = await requireFrequenciaUser({ admin: true });
  if ("response" in auth) return auth.response;
  return NextResponse.json({ ...(await ndaTemplate()), placeholders: NDA_PLACEHOLDERS, markup: NDA_MARKUP_HELP });
}

export async function PUT(request: NextRequest) {
  const auth = await requireFrequenciaUser({ admin: true });
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.replace(/\r\n/g, "\n").trim() : "";
  if (text.length < 200) return NextResponse.json({ error: "O texto do acordo parece incompleto." }, { status: 400 });
  if (text.length > 40000) return NextResponse.json({ error: "Texto longo demais." }, { status: 400 });
  if (!text.includes("{{NOME}}") || !text.includes("{{CPF}}")) {
    return NextResponse.json({ error: "O texto precisa ter pelo menos os marcadores {{NOME}} e {{CPF}}." }, { status: 400 });
  }
  await prisma.appSetting.upsert({ where: { key: NDA_TEMPLATE_KEY }, create: { key: NDA_TEMPLATE_KEY, value: text }, update: { value: text } });
  return NextResponse.json({ ok: true });
}

/** Volta ao texto padrão. */
export async function DELETE() {
  const auth = await requireFrequenciaUser({ admin: true });
  if ("response" in auth) return auth.response;
  await prisma.appSetting.deleteMany({ where: { key: NDA_TEMPLATE_KEY } });
  return NextResponse.json({ ok: true });
}
