import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { parseNotice, startOfDayUTC, toNoticeInfo } from "@/lib/mural";

/** Recados do Mural ainda válidos (até hoje ou sem data), os mais novos primeiro. */
export async function GET() {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const notices = await prisma.muralNotice.findMany({
    where: { OR: [{ until: null }, { until: { gte: startOfDayUTC(new Date()) } }] },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return NextResponse.json(notices.map(toNoticeInfo));
}

/** Publica um recado no Mural (todo o RH pode). */
export async function POST(request: NextRequest) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const input = parseNotice(await request.json().catch(() => null), new Date());
  if ("error" in input) return NextResponse.json(input, { status: 400 });
  const notice = await prisma.muralNotice.create({ data: { ...input, createdBy: auth.user.name } });
  return NextResponse.json(toNoticeInfo(notice), { status: 201 });
}
