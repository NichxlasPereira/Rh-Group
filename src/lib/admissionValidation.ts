import { ChecklistItem } from "./admission";

export interface AdmissionFields {
  candidateName: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  department: string | null;
  areaId: string | null;
  startDate: Date | null;
  notes: string | null;
}

const optional = (v: unknown, max = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export function parseAdmissionFields(body: unknown): { data: AdmissionFields } | { error: string } {
  if (typeof body !== "object" || body === null) return { error: "Dados inválidos." };
  const b = body as Record<string, unknown>;

  // O nome é opcional: normalmente o próprio candidato preenche no link.
  const candidateName = typeof b.candidateName === "string" ? b.candidateName.trim().replace(/\s+/g, " ") : "";

  const email = optional(b.email);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "E-mail inválido." };

  let startDate: Date | null = null;
  if (typeof b.startDate === "string" && b.startDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.startDate)) return { error: "Data de início inválida." };
    startDate = new Date(`${b.startDate}T00:00:00.000Z`);
  }

  return {
    data: {
      candidateName: candidateName ? candidateName.slice(0, 160) : null,
      email: email?.toLowerCase() ?? null,
      phone: optional(b.phone, 40),
      role: optional(b.role),
      department: optional(b.department),
      // Área só faz sentido com empresa; a rota confere se é da empresa escolhida.
      areaId: optional(b.department) ? optional(b.areaId, 40) : null,
      startDate,
      notes: optional(b.notes, 1000),
    },
  };
}

export function parseChecklist(raw: unknown): { data: ChecklistItem[] } | { error: string } {
  if (!Array.isArray(raw)) return { error: "Lista de documentos inválida." };
  const items: ChecklistItem[] = [];
  for (const entry of raw) {
    const name = typeof entry?.name === "string" ? entry.name.trim() : "";
    if (!name) continue;
    items.push({
      name: name.slice(0, 120),
      description: typeof entry.description === "string" && entry.description.trim() ? entry.description.trim().slice(0, 300) : undefined,
      required: entry.required !== false,
    });
  }
  if (items.length === 0) return { error: "Inclua pelo menos um documento." };
  if (items.length > 40) return { error: "Lista de documentos grande demais." };
  return { data: items };
}
