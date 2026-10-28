import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, validateNewPassword } from "@/lib/frequenciaAccess";
import { startPortalSession, tokenHash } from "@/lib/portalAccess";

async function accountForToken(token: unknown) {
  if (typeof token !== "string" || token.length < 20 || token.length > 200) return null;
  const account = await prisma.portalAccount.findUnique({
    where: { inviteTokenHash: tokenHash(token) },
    include: { employee: { select: { name: true, corporateEmail: true, active: true } } },
  });
  if (!account || !account.inviteExpiresAt || account.inviteExpiresAt < new Date() || !account.employee.active) return null;
  return account;
}

/** Confere o convite: devolve o primeiro nome e o e-mail de acesso. */
export async function GET(request: NextRequest) {
  const account = await accountForToken(request.nextUrl.searchParams.get("token"));
  if (!account) {
    return NextResponse.json({ error: "Este convite não vale mais. Peça um novo ao RH." }, { status: 404 });
  }
  return NextResponse.json({
    firstName: account.employee.name.trim().split(/\s+/)[0],
    email: account.employee.corporateEmail,
  });
}

/** Cria (ou troca) a senha pelo convite e já entra no portal. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const account = await accountForToken(body?.token);
  if (!account) {
    return NextResponse.json({ error: "Este convite não vale mais. Peça um novo ao RH." }, { status: 404 });
  }
  if (!account.employee.corporateEmail) {
    return NextResponse.json({ error: "Seu e-mail corporativo não está na ficha. Fale com o RH." }, { status: 409 });
  }
  const passwordError = validateNewPassword(body?.password);
  if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });

  // O convite vale uma vez; sessões antigas caem junto (troca de senha).
  await prisma.$transaction([
    prisma.portalSession.deleteMany({ where: { accountId: account.id } }),
    prisma.portalAccount.update({
      where: { id: account.id },
      data: { passwordHash: await hashPassword(body.password), inviteTokenHash: null, inviteExpiresAt: null },
    }),
  ]);
  const response = NextResponse.json({ ok: true });
  await startPortalSession(account.id, response);
  return response;
}
