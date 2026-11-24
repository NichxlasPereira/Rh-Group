import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { toEventInfo } from "@/lib/calendar";
import { alreadyAdded, suggestionsFor } from "@/lib/campaigns";

/**
 * Adiciona campanhas e datas sugeridas ({ year, keys }): só as que existem
 * na lista daquele ano e ainda não estão no calendário.
 */
export async function POST(request: NextRequest) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => null);
  const year = Number(body?.year);
  const keys = Array.isArray(body?.keys) ? body.keys.filter((k: unknown): k is string => typeof k === "string") : [];
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !keys.length) {
    return NextResponse.json({ error: "Escolha o que adicionar." }, { status: 400 });
  }
  const events = (await prisma.calendarEvent.findMany()).map(toEventInfo);
  const chosen = suggestionsFor(year).filter((s) => keys.includes(s.key) && !alreadyAdded(s, events, year));
  for (const s of chosen) {
    await prisma.calendarEvent.create({
      data: {
        title: s.title,
        type: s.type,
        startDate: new Date(`${s.startDate}T00:00:00Z`),
        endDate: new Date(`${s.endDate}T00:00:00Z`),
        yearly: s.yearly,
        notes: s.notes || null,
        createdBy: auth.user.name,
      },
    });
  }
  return NextResponse.json({ added: chosen.length }, { status: chosen.length ? 201 : 200 });
}
