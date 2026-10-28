import { NextResponse } from "next/server";
import { requirePortalEmployee } from "@/lib/portalAccess";

export async function GET() {
  const auth = await requirePortalEmployee();
  if ("response" in auth) return auth.response;
  return NextResponse.json(auth.employee);
}
