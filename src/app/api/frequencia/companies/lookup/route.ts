import { NextRequest, NextResponse } from "next/server";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { normalizeFieldValue } from "@/lib/admission";
import { lookupCnpj } from "@/lib/cnpjLookup";

/** Dados públicos do CNPJ para preencher o cadastro da empresa (só administradores). */
export async function GET(request: NextRequest) {
  const auth = await requireFrequenciaUser({ admin: true });
  if ("response" in auth) return auth.response;
  const raw = request.nextUrl.searchParams.get("cnpj") ?? "";
  const normalized = normalizeFieldValue("cnpj", raw);
  if (!("value" in normalized) || !normalized.value) return NextResponse.json({ error: "CNPJ inválido." }, { status: 400 });
  const digits = normalized.value.replace(/[^0-9A-Z]/g, "");
  if (!/^\d{14}$/.test(digits)) {
    return NextResponse.json({ error: "A consulta automática só aceita CNPJ numérico. Preencha à mão." }, { status: 400 });
  }
  const result = await lookupCnpj(digits);
  if ("error" in result) return NextResponse.json(result, { status: 502 });
  return NextResponse.json(result);
}
