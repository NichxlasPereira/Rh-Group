import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { validateStartKitItem } from "@/lib/startKitInput";

type Params = { params: Promise<{ id: string }> };

/** Edita um item (vale para os próximos onboardings; os já enviados não mudam). */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireFrequenciaUser({ admin: true });
  if ("response" in auth) return auth.response;
  const result = validateStartKitItem(await request.json().catch(() => null));
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  const updated = await prisma.startKitItem.updateMany({ where: { id: (await params).id }, data: result.data });
  if (!updated.count) return NextResponse.json({ error: "Item não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await requireFrequenciaUser({ admin: true });
  if ("response" in auth) return auth.response;
  await prisma.startKitItem.deleteMany({ where: { id: (await params).id } });
  return NextResponse.json({ ok: true });
}
