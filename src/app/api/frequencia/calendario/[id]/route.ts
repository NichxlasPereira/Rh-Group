import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { parseEvent, toEventInfo } from "@/lib/calendar";

/** Edita um evento do calendário. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const input = parseEvent(await request.json().catch(() => null));
  if ("error" in input) return NextResponse.json(input, { status: 400 });
  const found = await prisma.calendarEvent.findUnique({ where: { id }, select: { id: true } });
  if (!found) return NextResponse.json({ error: "Evento não encontrado." }, { status: 404 });
  const event = await prisma.calendarEvent.update({ where: { id }, data: input });
  return NextResponse.json(toEventInfo(event));
}

/** Exclui um evento do calendário. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const deleted = await prisma.calendarEvent.deleteMany({ where: { id } });
  if (deleted.count === 0) return NextResponse.json({ error: "Evento não encontrado." }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
