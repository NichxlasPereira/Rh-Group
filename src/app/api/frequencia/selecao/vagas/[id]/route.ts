import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { parseJob, toJobInfo } from "@/lib/selecao";

/** Edita a vaga (nome, prioridade, status, posições...). */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const parsed = parseJob(await request.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json(parsed, { status: 400 });
  const exists = await prisma.jobOpening.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: "Vaga não encontrada." }, { status: 404 });
  const job = await prisma.jobOpening.update({ where: { id }, data: parsed.data });
  // O nome da vaga de origem acompanha a vaga.
  await prisma.jobCandidate.updateMany({ where: { jobId: id }, data: { jobTitle: job.title } });
  return NextResponse.json(toJobInfo(job));
}

/** Exclui a vaga; os candidatos continuam (com o nome da vaga de origem). */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  await prisma.jobOpening.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
