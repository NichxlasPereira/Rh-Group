import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { parseEvent, toEventInfo } from "@/lib/calendar";

/** Eventos do calendário do RH (todos: a tabela é pequena e os anuais se repetem). */
export async function GET() {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const events = await prisma.calendarEvent.findMany({ orderBy: { startDate: "asc" } });
  return NextResponse.json(events.map(toEventInfo));
}

/** Cadastra um evento (todo o RH pode). */
export async function POST(request: NextRequest) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const input = parseEvent(await request.json().catch(() => null));
  if ("error" in input) return NextResponse.json(input, { status: 400 });
  const event = await prisma.calendarEvent.create({ data: { ...input, createdBy: auth.user.name } });
  return NextResponse.json(toEventInfo(event), { status: 201 });
}
