import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { validateProviderInput } from "@/lib/providers";
import { getProvider, listProviders } from "@/lib/providersServer";

export async function GET() {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  return NextResponse.json(await listProviders());
}

export async function POST(request: NextRequest) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const result = validateProviderInput(await request.json().catch(() => null));
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  const created = await prisma.serviceProvider.create({ data: { ...result.data, createdBy: auth.user.name } });
  return NextResponse.json(await getProvider(created.id), { status: 201 });
}
