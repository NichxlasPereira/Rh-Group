import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dummyPasswordHash, verifyPassword } from "@/lib/frequenciaAccess";
import { employeeByCorporateEmail, startPortalSession } from "@/lib/portalAccess";

/** Entrada no portal: e-mail corporativo da ficha + senha criada pelo convite. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";

  const employeeId = await employeeByCorporateEmail(body?.email);
  const account = employeeId ? await prisma.portalAccount.findUnique({ where: { employeeId } }) : null;
  // Compara mesmo sem conta, para não revelar quem tem acesso.
  const ok = await verifyPassword(password, account?.passwordHash ?? (await dummyPasswordHash()));

  if (!account?.passwordHash || !ok) {
    // Atraso fixo: torna tentativa e erro em massa bem mais lenta.
    await new Promise((r) => setTimeout(r, 800));
    return NextResponse.json({ error: "E-mail ou senha incorretos." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  await startPortalSession(account.id, response);
  return response;
}
