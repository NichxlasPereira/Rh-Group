import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";

const HEX = /^#[0-9a-f]{6}$/i;

/** Cores da marca da empresa (organograma). "" ou null apaga a cor. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;

  if (!(await prisma.contractingCompany.findUnique({ where: { id }, select: { id: true } }))) {
    return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  }
  const body = await request.json().catch(() => null);
  const color = (value: unknown): string | null | "invalid" => {
    if (value === null || value === undefined || value === "") return null;
    return typeof value === "string" && HEX.test(value) ? value.toLowerCase() : "invalid";
  };
  const brandColor = color(body?.brandColor);
  const accentColor = color(body?.accentColor);
  if (brandColor === "invalid" || accentColor === "invalid") {
    return NextResponse.json({ error: "Cor inválida (use o formato #RRGGBB)." }, { status: 400 });
  }
  const updated = await prisma.contractingCompany.update({ where: { id }, data: { brandColor, accentColor } });
  return NextResponse.json(updated);
}
