import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { Occurrence, OccurrenceType, monthKeyLabel } from "@/lib/attendance";
import { occurrenceReportPdf, sectorsForMonth } from "@/lib/occurrenceReportPdf";

/** PDF do resumo mensal de ocorrências, separado por setor (empresa). ?mes=AAAA-MM */
export async function GET(request: NextRequest) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;

  const month = request.nextUrl.searchParams.get("mes") ?? "";
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!m) return NextResponse.json({ error: "Informe o mês (AAAA-MM)." }, { status: 400 });
  const start = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  const end = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0, 23, 59, 59, 999));

  const [rows, companies] = await Promise.all([
    prisma.attendanceOccurrence.findMany({
      // Atrasos foram retirados do sistema; ficam fora como no resto do RH.
      where: { type: { not: "atraso" }, date: { lte: end }, endDate: { gte: start } },
      orderBy: [{ date: "asc" }],
    }),
    prisma.contractingCompany.findMany({ select: { name: true, shortName: true, brandColor: true } }),
  ]);

  const occurrences: Occurrence[] = rows.map((o) => ({
    id: o.id,
    employeeId: o.employeeId,
    employeeName: o.employeeName,
    employeeDepartment: o.employeeDepartment,
    type: o.type as OccurrenceType,
    date: o.date.toISOString(),
    endDate: o.endDate.toISOString(),
    justified: o.justified,
    approvedBy: o.approvedBy,
    startTime: o.startTime,
    endTime: o.endTime,
    notes: null, // observações não vão para o resumo
    attachments: [],
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  }));

  const brandColors = new Map<string, string>();
  for (const c of companies) {
    if (!c.brandColor) continue;
    brandColors.set(c.shortName || c.name, c.brandColor);
    brandColors.set(c.name, c.brandColor);
  }

  const pdf = await occurrenceReportPdf({
    month,
    sectors: sectorsForMonth(occurrences, month, brandColors),
    generatedBy: auth.user.name,
    generatedAt: new Date(),
  });

  const fileName = `Resumo de ocorrências – ${monthKeyLabel(month)}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(pdf.byteLength),
      "Content-Disposition": `attachment; filename="resumo-ocorrencias-${month}.pdf"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
