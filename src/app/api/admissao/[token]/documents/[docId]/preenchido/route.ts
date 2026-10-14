import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { admissionByToken } from "@/lib/admissionServer";
import { FieldType, normalizeFieldValue } from "@/lib/admission";
import {
  AGREEMENTS,
  CANDIDATE_PLACEHOLDER_FIELD,
  COMPANY_ADDRESS_PLACEHOLDERS,
  agreementTemplate,
  fillAgreementTemplate,
  isAgreementKind,
  renderAgreementPdf,
  splitCep,
  templatePlaceholders,
} from "@/lib/agreements";

/**
 * Gera o termo (acordo de confidencialidade ou uso de imagem) preenchido para
 * o candidato baixar e assinar no gov.br. Usa os dados que estão no formulário
 * (enviados no corpo), já que o "Enviar dados" só acontece no fim, depois dos
 * documentos — inclusive deste.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string; docId: string }> }) {
  const { token, docId } = await params;
  const admission = await admissionByToken(token);
  if (!admission) return NextResponse.json({ error: "Link inválido ou expirado." }, { status: 404 });
  const document = admission.documents.find((d) => d.id === docId);
  if (!document || !isAgreementKind(document.kind)) {
    return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
  }
  const kind = document.kind;
  if (!admission.contractingCompanyId) {
    return NextResponse.json({ error: "O RH ainda não definiu a empresa contratante. Fale com o RH." }, { status: 409 });
  }
  const company = await prisma.contractingCompany.findUnique({ where: { id: admission.contractingCompanyId } });
  if (!company) return NextResponse.json({ error: "Empresa contratante não encontrada. Fale com o RH." }, { status: 409 });

  const { text } = await agreementTemplate(kind);
  const used = templatePlaceholders(text);
  const companyField = { EMPRESA_NATUREZA: company.legalNature, EMPRESA_CNPJ: company.cnpj, EMPRESA_ENDERECO: company.address,
    EMPRESA_BAIRRO: company.district, EMPRESA_CIDADE: company.city, EMPRESA_UF: company.state, EMPRESA_CEP: company.cep } as Record<string, string | null>;
  if (COMPANY_ADDRESS_PLACEHOLDERS.some((key) => used.has(key) && !companyField[key])) {
    return NextResponse.json(
      { error: "O RH ainda precisa completar o cadastro da empresa (CNPJ e endereço) para gerar este termo. Fale com o RH." },
      { status: 409 }
    );
  }

  // Só confere os dados que o texto usa. Dado que o RH não pediu fica em branco para completar.
  const body = await request.json().catch(() => null);
  const values = (body?.values ?? {}) as Record<string, unknown>;
  const candidate: Record<string, string> = {};
  const missing: string[] = [];
  const keys = new Set([...used].map((p) => CANDIDATE_PLACEHOLDER_FIELD[p]).filter(Boolean));
  for (const key of keys) {
    const field = admission.fields.find((f) => f.key === key);
    if (!field) continue;
    const raw = typeof values[field.id] === "string" ? (values[field.id] as string) : "";
    const result = normalizeFieldValue(field.type as FieldType, raw);
    if ("error" in result || !result.value) {
      const label = field.label.replace(/\s*\(.*\)$/, "");
      missing.push(/^[A-Z0-9 -]+$/.test(label) ? label : label.toLowerCase());
    }
    else candidate[key] = result.value;
  }
  if (!missing.length && used.has("CEP") && candidate.endereco && !splitCep(candidate.endereco).cep) {
    missing.push("CEP no endereço");
  }
  if (missing.length) {
    return NextResponse.json(
      { error: `Para gerar o termo, preencha corretamente em "Seus dados": ${missing.join(", ")}.` },
      { status: 400 }
    );
  }

  const name = candidate.nome ?? "candidato";
  const filled = fillAgreementTemplate(text, { company, candidate });
  const { fileName } = AGREEMENTS[kind];
  const pdf = await renderAgreementPdf(kind, filled, `${fileName} – ${name}`);
  const fullName = `${fileName} - ${name}.pdf`;
  const asciiName = `${fileName.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-")}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fullName)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
