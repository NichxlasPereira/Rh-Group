import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { parseJob, toJobInfo } from "@/lib/selecao";

/** Nova vaga. */
export async function POST(request: NextRequest) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const parsed = parseJob(await request.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json(parsed, { status: 400 });
  const job = await prisma.jobOpening.create({ data: { ...parsed.data, createdBy: auth.user.name } });
  return NextResponse.json(toJobInfo(job), { status: 201 });
}
