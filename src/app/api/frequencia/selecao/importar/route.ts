import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { readXlsx } from "@/lib/xlsx";
import { planImport } from "@/lib/selecaoImport";
import { saveTemplates } from "@/lib/selecaoServer";

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Importa a planilha "Acompanhamento de vagas" (.xlsx). Com apply=0 só mostra o que
 * entraria; com apply=1 substitui as vagas e candidatos do sistema pelos da planilha.
 */
export async function POST(request: NextRequest) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Escolha a planilha (.xlsx)." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "A planilha passa de 10 MB." }, { status: 400 });
  let plan;
  try {
    plan = planImport(readXlsx(Buffer.from(await file.arrayBuffer())));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Não foi possível ler a planilha." }, { status: 400 });
  }
  if (!plan.jobs.length && !plan.candidates.length) {
    return NextResponse.json({ error: "Não encontrei vagas nem candidatos nessa planilha." }, { status: 400 });
  }
  const stages: Record<string, number> = {};
  for (const c of plan.candidates) stages[c.stage] = (stages[c.stage] ?? 0) + 1;
  const summary = {
    jobs: plan.jobs.length,
    candidates: plan.candidates.length,
    stages,
    feedbacks: plan.candidates.filter((c) => c.feedbackDue || c.feedbackAt).length,
    templates: plan.templates.length,
    warnings: plan.warnings,
    replaces: { jobs: await prisma.jobOpening.count(), candidates: await prisma.jobCandidate.count() },
  };
  if (form?.get("apply") !== "1") return NextResponse.json({ preview: summary });

  await prisma.$transaction(async (tx) => {
    await tx.jobCandidate.deleteMany({});
    await tx.jobOpening.deleteMany({});
    const ids = new Map<string, string>();
    for (const { key, ...job } of plan.jobs) {
      ids.set(key, (await tx.jobOpening.create({ data: { ...job, createdBy: auth.user.name } })).id);
    }
    for (const { jobKey, ...c } of plan.candidates) {
      await tx.jobCandidate.create({ data: { ...c, jobId: jobKey ? (ids.get(jobKey) ?? null) : null, createdBy: auth.user.name } });
    }
  });
  if (plan.templates.length) await saveTemplates(plan.templates);
  return NextResponse.json({ imported: summary });
}
