import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { toCandidateInfo, toJobInfo } from "@/lib/selecao";
import { discardOldHires, loadTemplates } from "@/lib/selecaoServer";

/** Processos seletivos: vagas, candidatos e modelos de devolutiva. */
export async function GET() {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  // Contratados há mais de 30 dias saem do quadro antes de mostrar (além da limpeza de hora em hora).
  await discardOldHires().catch((err) => console.error("Descarte de contratados:", err));
  const [jobs, candidates, templates] = await Promise.all([
    prisma.jobOpening.findMany({ orderBy: [{ status: "asc" }, { priority: "asc" }, { openedAt: "desc" }] }),
    prisma.jobCandidate.findMany({ orderBy: [{ updatedAt: "desc" }] }),
    loadTemplates(),
  ]);
  return NextResponse.json({ jobs: jobs.map(toJobInfo), candidates: candidates.map(toCandidateInfo), templates });
}
