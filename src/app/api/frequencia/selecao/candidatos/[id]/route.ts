import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { parseCandidate, toCandidateInfo } from "@/lib/selecao";

/** Atualiza o candidato (fase, datas, devolutiva...). */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const parsed = parseCandidate(await request.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json(parsed, { status: 400 });
  const current = await prisma.jobCandidate.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ error: "Candidato não encontrado." }, { status: 404 });
  const job = parsed.data.jobId ? await prisma.jobOpening.findUnique({ where: { id: parsed.data.jobId } }) : null;
  const candidate = await prisma.jobCandidate.update({
    where: { id },
    data: { ...parsed.data, jobId: job?.id ?? null, jobTitle: job?.title ?? current.jobTitle },
  });
  return NextResponse.json(toCandidateInfo(candidate));
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  await prisma.jobCandidate.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
