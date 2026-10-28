import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { invoiceFileResponse } from "@/lib/invoicesServer";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const file = await prisma.serviceInvoiceFile.findUnique({ where: { id } });
  if (!file) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  return invoiceFileResponse(file);
}
