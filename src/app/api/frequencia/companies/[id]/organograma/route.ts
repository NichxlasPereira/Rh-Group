import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";

/**
 * Tira a empresa do organograma ou volta a mostrar ({ hidden: boolean }).
 * A empresa continua nos termos do onboarding e no cadastro dos colaboradores.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;

  if (!(await prisma.contractingCompany.findUnique({ where: { id }, select: { id: true } }))) {
    return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  }
  const body = await request.json().catch(() => null);
  if (typeof body?.hidden !== "boolean") {
    return NextResponse.json({ error: "Informe se a empresa fica fora do organograma." }, { status: 400 });
  }
  const updated = await prisma.contractingCompany.update({ where: { id }, data: { hiddenInOrgChart: body.hidden } });
  return NextResponse.json(updated);
}
