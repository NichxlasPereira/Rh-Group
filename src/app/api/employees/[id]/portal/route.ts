import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { INVITE_DAYS, newToken, tokenHash } from "@/lib/portalAccess";

/** Situação do acesso do colaborador ao portal (sem dados de senha). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const account = await prisma.portalAccount.findUnique({ where: { employeeId: id } });
  return NextResponse.json({
    hasPassword: !!account?.passwordHash,
    inviteExpiresAt: account?.inviteExpiresAt && account.inviteExpiresAt > new Date() ? account.inviteExpiresAt : null,
    lastLoginAt: account?.lastLoginAt ?? null,
  });
}

/**
 * Gera o convite de acesso (primeiro acesso ou nova senha). O link só aparece
 * agora: o banco guarda o hash. Um convite novo invalida o anterior.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const employee = await prisma.employee.findUnique({ where: { id }, select: { active: true, corporateEmail: true } });
  if (!employee) return NextResponse.json({ error: "Colaborador não encontrado." }, { status: 404 });
  if (!employee.active) return NextResponse.json({ error: "Colaborador inativo não acessa o portal." }, { status: 409 });
  if (!employee.corporateEmail?.trim()) {
    return NextResponse.json(
      { error: "Preencha o e-mail corporativo na ficha: é com ele que o colaborador entra." },
      { status: 409 }
    );
  }

  const token = newToken();
  const inviteExpiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000);
  const data = { inviteTokenHash: tokenHash(token), inviteExpiresAt, invitedBy: auth.user.name };
  await prisma.portalAccount.upsert({ where: { employeeId: id }, create: { employeeId: id, ...data }, update: data });

  // Atrás do proxy do Railway, o host público vem nos cabeçalhos encaminhados (como no onboarding).
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  const link = `${proto}://${host}/portal/convite/${token}`;
  return NextResponse.json({ link, inviteExpiresAt });
}
