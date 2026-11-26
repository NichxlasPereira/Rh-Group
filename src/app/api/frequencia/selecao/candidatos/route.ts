import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { parseCandidate, toCandidateInfo } from "@/lib/selecao";

/** Novo candidato numa vaga. */
export async function POST(request: NextRequest) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const parsed = parseCandidate(await request.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json(parsed, { status: 400 });
  const job = parsed.data.jobId ? await prisma.jobOpening.findUnique({ where: { id: parsed.data.jobId } }) : null;
  const candidate = await prisma.jobCandidate.create({
    data: { ...parsed.data, jobId: job?.id ?? null, jobTitle: job?.title ?? null, createdBy: auth.user.name },
  });
  return NextResponse.json(toCandidateInfo(candidate), { status: 201 });
}
