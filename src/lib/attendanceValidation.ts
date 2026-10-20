import { OCCURRENCE_TYPES, OccurrenceType, isMultiDay } from "./attendance";

export interface EmployeeInput {
  name: string;
  department: string | null;
  role: string | null;
  active: boolean;
  folgaAllowance: number;
  // Ficha: só entram quando vêm no pedido (ausentes = não mexe).
  startDate?: Date | null;
  contractType?: string | null;
  contractEnd?: Date | null;
  // Organograma: idem (ausentes = não mexe).
  areaId?: string | null;
  areaLead?: boolean;
}

export const CONTRACT_TYPES = ["PJ", "CLT", "Estágio", "Outro"] as const;

/** "AAAA-MM-DD" → data; "" ou null → null; ausente → undefined; inválida → erro. */
function optionalDate(value: unknown): Date | null | undefined | "invalid" {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "invalid";
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? "invalid" : date;
}

export function validateEmployeeInput(body: unknown): { data: EmployeeInput } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Dados inválidos." };
  }
  const b = body as Record<string, unknown>;

  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return { error: "O nome do colaborador é obrigatório." };

  const department = typeof b.department === "string" && b.department.trim() ? b.department.trim() : null;
  const role = typeof b.role === "string" && b.role.trim() ? b.role.trim() : null;
  const active = b.active === undefined ? true : b.active === true;

  const folgaAllowance =
    b.folgaAllowance === undefined || b.folgaAllowance === null || b.folgaAllowance === ("" as unknown)
      ? 0
      : Number(b.folgaAllowance);
  if (!Number.isInteger(folgaAllowance) || folgaAllowance < 0 || folgaAllowance > 365) {
    return { error: "O total de folgas deve ser um número inteiro entre 0 e 365." };
  }

  const startDate = optionalDate(b.startDate);
  if (startDate === "invalid") return { error: "Data de entrada inválida." };
  const contractEnd = optionalDate(b.contractEnd);
  if (contractEnd === "invalid") return { error: "Fim do contrato inválido." };
  let contractType: string | null | undefined;
  if (b.contractType !== undefined) {
    contractType = typeof b.contractType === "string" && b.contractType ? b.contractType : null;
    if (contractType && !(CONTRACT_TYPES as readonly string[]).includes(contractType)) {
      return { error: "Tipo de contrato inválido." };
    }
  }

  let areaId: string | null | undefined;
  if (b.areaId !== undefined) areaId = typeof b.areaId === "string" && b.areaId ? b.areaId : null;
  const areaLead = b.areaLead === undefined ? undefined : b.areaLead === true;

  return {
    data: {
      name,
      department,
      role,
      active,
      folgaAllowance,
      ...(startDate !== undefined ? { startDate } : {}),
      ...(contractType !== undefined ? { contractType } : {}),
      ...(contractEnd !== undefined ? { contractEnd } : {}),
      ...(areaId !== undefined ? { areaId } : {}),
      ...(areaLead !== undefined ? { areaLead } : {}),
    },
  };
}

export interface OccurrenceInput {
  employeeId: string;
  type: OccurrenceType;
  date: Date;
  endDate: Date;
  justified: boolean;
  approvedBy: string | null;
  notes: string | null;
}

function parseDate(raw: unknown): Date | null {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function validateOccurrenceInput(body: unknown): { data: OccurrenceInput } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Dados inválidos." };
  }
  const b = body as Record<string, unknown>;

  const employeeId = typeof b.employeeId === "string" ? b.employeeId : "";
  if (!employeeId) return { error: "Selecione um colaborador." };

  const type = b.type as OccurrenceType;
  if (!OCCURRENCE_TYPES.includes(type)) return { error: "Tipo de ocorrência inválido." };

  const date = parseDate(b.date);
  if (!date) return { error: "Informe uma data válida." };

  let endDate = date;
  if (isMultiDay(type)) {
    const parsedEnd = b.endDate ? parseDate(b.endDate) : date;
    if (!parsedEnd) return { error: "Informe uma data final válida." };
    if (parsedEnd.getTime() < date.getTime()) {
      return { error: `A data final ${type === "folga" ? "da folga" : "do atestado"} não pode ser anterior à data inicial.` };
    }
    endDate = parsedEnd;
  }

  let approvedBy: string | null = null;
  if (type === "folga") {
    approvedBy = typeof b.approvedBy === "string" ? b.approvedBy.trim() : "";
    if (!approvedBy) return { error: "Informe o gestor que concedeu a folga." };
  }

  const justified = isMultiDay(type) ? true : b.justified === true;
  const notes = typeof b.notes === "string" && b.notes.trim() ? b.notes.trim() : null;

  return { data: { employeeId, type, date, endDate, justified, approvedBy, notes } };
}
