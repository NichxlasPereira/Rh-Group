import { NextResponse } from "next/server";
import { endPortalSession } from "@/lib/portalAccess";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  await endPortalSession(response);
  return response;
}
