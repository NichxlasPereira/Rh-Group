export interface CompanyInput {
  name: string;
  qualification: string;
  signerName: string;
  signerRole: string;
  signerCpf: string;
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");

export function parseCompany(body: unknown): { data: CompanyInput } | { error: string } {
  if (typeof body !== "object" || body === null) return { error: "Dados inválidos." };
  const b = body as Record<string, unknown>;
  const data = {
    name: text(b.name, 160),
    qualification: text(b.qualification, 3000),
    signerName: text(b.signerName, 160),
    signerRole: text(b.signerRole, 120),
    signerCpf: text(b.signerCpf, 20),
  };
  if (!data.name) return { error: "Informe o nome da empresa." };
  if (data.qualification.length < 30) return { error: "Escreva a qualificação completa da empresa (sede, CNPJ, representantes)." };
  if (!data.signerName) return { error: "Informe quem assina pela empresa." };
  if (!data.signerRole) return { error: "Informe o cargo de quem assina." };
  if (data.signerCpf.replace(/\D/g, "").length !== 11) return { error: "CPF de quem assina inválido." };
  return { data };
}
