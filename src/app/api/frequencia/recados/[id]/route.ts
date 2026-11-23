import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";

/** Tira um recado do Mural (todo o RH pode). */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const deleted = await prisma.muralNotice.deleteMany({ where: { id } });
  if (deleted.count === 0) return NextResponse.json({ error: "Recado não encontrado." }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
