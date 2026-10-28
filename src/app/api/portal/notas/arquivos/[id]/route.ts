import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalEmployee } from "@/lib/portalAccess";
import { invoiceFileResponse } from "@/lib/invoicesServer";

/** Arquivo de uma nota do próprio colaborador. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalEmployee();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const file = await prisma.serviceInvoiceFile.findUnique({
    where: { id },
    include: { invoice: { select: { employeeId: true } } },
  });
  if (!file || file.invoice.employeeId !== auth.employee.id) {
    return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  }
  return invoiceFileResponse(file);
}
