import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { admissionByToken } from "@/lib/admissionServer";
import { FieldType, normalizeFieldValue } from "@/lib/admission";
import { fillNdaTemplate, ndaTemplate, renderNdaPdf } from "@/lib/nda";

const NEEDED: { key: string; label: string }[] = [
  { key: "nome", label: "nome completo" },
  { key: "cpf", label: "CPF" },
  { key: "rg", label: "RG" },
  { key: "nascimento", label: "data de nascimento" },
  { key: "endereco", label: "endereço" },
];

/**
 * Gera o acordo preenchido para o candidato baixar e assinar no gov.br. Usa os
 * dados que estão no formulário (enviados no corpo), já que o "Enviar dados"
 * só acontece no fim, depois dos documentos — inclusive este.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admission = await admissionByToken(token);
  if (!admission) return NextResponse.json({ error: "Link inválido ou expirado." }, { status: 404 });
  if (!admission.contractingCompanyId) {
    return NextResponse.json({ error: "O RH ainda não definiu a empresa contratante. Fale com o RH." }, { status: 409 });
  }
  const company = await prisma.contractingCompany.findUnique({ where: { id: admission.contractingCompanyId } });
  if (!company) return NextResponse.json({ error: "Empresa contratante não encontrada. Fale com o RH." }, { status: 409 });

  const body = await request.json().catch(() => null);
  const values = (body?.values ?? {}) as Record<string, unknown>;
  const data: Record<string, string> = {};
  const missing: string[] = [];
  for (const need of NEEDED) {
    const field = admission.fields.find((f) => f.key === need.key);
    if (!field) {
      data[need.key] = "________________"; // o RH não pediu este dado: fica um espaço para completar
      continue;
    }
    const raw = typeof values[field.id] === "string" ? (values[field.id] as string) : "";
    const result = normalizeFieldValue(field.type as FieldType, raw);
    if ("error" in result || !result.value) missing.push(need.label);
    else data[need.key] = result.value;
  }
  if (missing.length) {
    return NextResponse.json(
      { error: `Para gerar o acordo, preencha corretamente em "Seus dados": ${missing.join(", ")}.` },
      { status: 400 }
    );
  }

  const { text } = await ndaTemplate();
  const filled = fillNdaTemplate(text, {
    company,
    candidate: { nome: data.nome, nascimento: data.nascimento, rg: data.rg, cpf: data.cpf, endereco: data.endereco },
  });
  const pdf = await renderNdaPdf(filled, `Acordo de confidencialidade – ${data.nome}`);
  const fileName = `Acordo de confidencialidade - ${data.nome}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="acordo-de-confidencialidade.pdf"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
