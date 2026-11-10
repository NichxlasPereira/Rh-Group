import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { validateStartKitItem } from "@/lib/startKitInput";

/** Novo item do kit de início. */
export async function POST(request: NextRequest) {
  const auth = await requireFrequenciaUser({ admin: true });
  if ("response" in auth) return auth.response;
  const result = validateStartKitItem(await request.json().catch(() => null));
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  const last = await prisma.startKitItem.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  const item = await prisma.startKitItem.create({ data: { ...result.data, sortOrder: (last?.sortOrder ?? -1) + 1 } });
  return NextResponse.json(item, { status: 201 });
}
