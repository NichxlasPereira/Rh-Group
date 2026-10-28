import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";

/** RH confere a nota: recebida, recusada (com o motivo) ou de volta para conferir. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const body = await request.json().catch(() => null);

  const status = body?.status;
  if (status !== "recebida" && status !== "recusada" && status !== "enviada") {
    return NextResponse.json({ error: "Situação inválida." }, { status: 400 });
  }
  const reviewNote = typeof body?.reviewNote === "string" && body.reviewNote.trim() ? body.reviewNote.trim().slice(0, 500) : null;
  if (status === "recusada" && !reviewNote) {
    return NextResponse.json({ error: "Diga o motivo da recusa: o colaborador vê no portal." }, { status: 400 });
  }

  const existing = await prisma.serviceInvoice.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Nota não encontrada." }, { status: 404 });

  const reviewed = status !== "enviada";
  await prisma.serviceInvoice.update({
    where: { id },
    data: {
      status,
      reviewNote: status === "recusada" ? reviewNote : null,
      reviewedBy: reviewed ? auth.user.name : null,
      reviewedAt: reviewed ? new Date() : null,
    },
  });
  return NextResponse.json({ ok: true });
}
