import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { toCandidateInfo, toJobInfo } from "@/lib/selecao";
import { loadTemplates } from "@/lib/selecaoServer";

/** Processos seletivos: vagas, candidatos e modelos de devolutiva. */
export async function GET() {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const [jobs, candidates, templates] = await Promise.all([
    prisma.jobOpening.findMany({ orderBy: [{ status: "asc" }, { priority: "asc" }, { openedAt: "desc" }] }),
    prisma.jobCandidate.findMany({ orderBy: [{ updatedAt: "desc" }] }),
    loadTemplates(),
  ]);
  return NextResponse.json({ jobs: jobs.map(toJobInfo), candidates: candidates.map(toCandidateInfo), templates });
}
