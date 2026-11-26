import { prisma } from "./prisma";
import { FeedbackTemplate, HIRED_KEEP_DAYS } from "./selecao";

const TEMPLATES_KEY = "selecao_modelos";

/** Modelos de devolutiva (ficam no banco: trazem dados da empresa, fora do código). */
export async function loadTemplates(): Promise<FeedbackTemplate[]> {
  const row = await prisma.appSetting.findUnique({ where: { key: TEMPLATES_KEY } });
  try {
    const list = row ? JSON.parse(row.value) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function saveTemplates(list: FeedbackTemplate[]): Promise<void> {
  const value = JSON.stringify(list);
  await prisma.appSetting.upsert({ where: { key: TEMPLATES_KEY }, create: { key: TEMPLATES_KEY, value }, update: { value } });
}

/**
 * Contratados há mais de 30 dias saem do quadro: o cadastro do candidato é descartado e a
 * contratação passa a contar só como número na vaga (o funil continua igual).
 */
export async function discardOldHires(now = new Date()): Promise<number> {
  const limit = new Date(now.getTime() - HIRED_KEEP_DAYS * 86_400_000);
  const hired = await prisma.jobCandidate.findMany({
    where: { stage: "contratado" },
    select: { id: true, jobId: true, hiredAt: true, phase3Date: true, phase2Date: true, phase1Date: true, createdAt: true },
  });
  const old = hired.filter((c) => (c.hiredAt ?? c.phase3Date ?? c.phase2Date ?? c.phase1Date ?? c.createdAt) <= limit);
  if (old.length === 0) return 0;
  await prisma.$transaction(async (tx) => {
    for (const c of old) {
      if (c.jobId) {
        await tx.jobOpening.update({
          where: { id: c.jobId },
          data: { extraHired: { increment: 1 }, extraPhase1: { increment: 1 } },
        });
      }
      await tx.jobCandidate.delete({ where: { id: c.id } });
    }
  });
  return old.length;
}
