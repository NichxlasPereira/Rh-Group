import { prisma } from "./prisma";
import { FeedbackTemplate } from "./selecao";

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
