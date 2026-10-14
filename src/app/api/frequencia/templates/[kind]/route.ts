import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { AGREEMENTS, AGREEMENT_MARKUP_HELP, AGREEMENT_PLACEHOLDERS, agreementTemplate, isAgreementKind } from "@/lib/agreements";

type Params = { params: Promise<{ kind: string }> };

/** Texto de um termo (o padrão ou o editado pelo RH), os marcadores e a formatação. */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await requireFrequenciaUser({ admin: true });
  if ("response" in auth) return auth.response;
  const { kind } = await params;
  if (!isAgreementKind(kind)) return NextResponse.json({ error: "Termo não encontrado." }, { status: 404 });
  return NextResponse.json({ ...(await agreementTemplate(kind)), placeholders: AGREEMENT_PLACEHOLDERS, markup: AGREEMENT_MARKUP_HELP });
}

export async function PUT(request: NextRequest, { params }: Params) {
  const auth = await requireFrequenciaUser({ admin: true });
  if ("response" in auth) return auth.response;
  const { kind } = await params;
  if (!isAgreementKind(kind)) return NextResponse.json({ error: "Termo não encontrado." }, { status: 404 });
  const body = await request.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.replace(/\r\n/g, "\n").trim() : "";
  if (text.length < 200) return NextResponse.json({ error: "O texto do termo parece incompleto." }, { status: 400 });
  if (text.length > 40000) return NextResponse.json({ error: "Texto longo demais." }, { status: 400 });
  if (!text.includes("{{NOME}}") || !text.includes("{{CPF}}")) {
    return NextResponse.json({ error: "O texto precisa ter pelo menos os marcadores {{NOME}} e {{CPF}}." }, { status: 400 });
  }
  const key = AGREEMENTS[kind].settingKey;
  await prisma.appSetting.upsert({ where: { key }, create: { key, value: text }, update: { value: text } });
  return NextResponse.json({ ok: true });
}

/** Volta ao texto padrão. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await requireFrequenciaUser({ admin: true });
  if ("response" in auth) return auth.response;
  const { kind } = await params;
  if (!isAgreementKind(kind)) return NextResponse.json({ error: "Termo não encontrado." }, { status: 404 });
  await prisma.appSetting.deleteMany({ where: { key: AGREEMENTS[kind].settingKey } });
  return NextResponse.json({ ok: true });
}
