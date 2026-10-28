import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { ServiceInvoiceRow } from "@/lib/invoices";
import { INVOICE_FILES_SELECT, toInvoice } from "@/lib/invoicesServer";

/** Todas as notas enviadas pelo portal, para o RH conferir. */
export async function GET() {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const rows = await prisma.serviceInvoice.findMany({
    orderBy: [{ createdAt: "desc" }],
    include: { ...INVOICE_FILES_SELECT, employee: { select: { name: true, department: true } } },
  });
  const invoices: ServiceInvoiceRow[] = rows.map((r) => ({
    ...toInvoice(r),
    employeeName: r.employee.name,
    employeeDepartment: r.employee.department,
  }));
  return NextResponse.json(invoices);
}
