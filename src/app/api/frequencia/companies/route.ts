import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { parseCompany } from "@/lib/companyValidation";

/** Empresas contratantes (para o acordo de confidencialidade). Todo o RH vê; só admin altera. */
export async function GET() {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const companies = await prisma.contractingCompany.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(companies);
}

export async function POST(request: NextRequest) {
  const auth = await requireFrequenciaUser({ admin: true });
  if ("response" in auth) return auth.response;
  const parsed = parseCompany(await request.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const company = await prisma.contractingCompany.create({ data: parsed.data });
  return NextResponse.json(company, { status: 201 });
}
