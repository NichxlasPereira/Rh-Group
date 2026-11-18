import { NextResponse } from "next/server";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { exitKitsAll } from "@/lib/startKit";

/** Offboardings enviados (aba Offboarding): quem saiu, último dia e o andamento de cada pedido. */
export async function GET() {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  return NextResponse.json(await exitKitsAll());
}
