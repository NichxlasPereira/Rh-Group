import { prisma } from "./prisma";
import { sectorName } from "./admission";

type Db = Pick<typeof prisma, "companyArea">;

/**
 * Confere a área do colaborador contra o setor (empresa) dele.
 * `requested` é o que veio no pedido (undefined = não mexeu); `current` é o que já estava salvo.
 * Área escolhida de outra empresa é erro; área antiga que deixou de bater com o setor sai sozinha.
 */
export async function resolveEmployeeArea(
  db: Db,
  department: string | null,
  requested: { areaId?: string | null; areaLead?: boolean },
  current: { areaId: string | null; areaLead: boolean } = { areaId: null, areaLead: false }
): Promise<{ areaId: string | null; areaLead: boolean } | { error: string }> {
  const explicit = requested.areaId !== undefined;
  const areaId = explicit ? requested.areaId! : current.areaId;
  const areaLead = requested.areaLead ?? current.areaLead;
  if (!areaId) return { areaId: null, areaLead: false };

  const area = await db.companyArea.findUnique({ where: { id: areaId }, include: { company: true } });
  if (!area || sectorName(area.company) !== department) {
    if (explicit) return { error: "A área escolhida não pertence ao setor (empresa) do colaborador." };
    return { areaId: null, areaLead: false };
  }
  return { areaId, areaLead };
}

export function parseAreaName(body: unknown): string | { error: string } {
  const raw = typeof body === "object" && body !== null ? (body as Record<string, unknown>).name : undefined;
  const name = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (!name) return { error: "Informe o nome da área." };
  if (name.length > 60) return { error: "O nome da área deve ter até 60 caracteres." };
  return name;
}

const fold = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Já existe área com esse nome na empresa? (ignora maiúsculas e acentos) */
export async function areaNameTaken(db: Db, companyId: string, name: string, exceptId?: string): Promise<boolean> {
  const siblings = await db.companyArea.findMany({ where: { companyId }, select: { id: true, name: true } });
  return siblings.some((a) => a.id !== exceptId && fold(a.name) === fold(name));
}
