import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "./prisma";
import { normalizeEmail } from "./frequenciaAccess";
import { PORTAL_COOKIE } from "./portalCookie";

/**
 * Portal do colaborador: cada pessoa entra com o e-mail corporativo da ficha e
 * a senha que criou pelo convite do RH. Sessão e cookie próprios, separados
 * do RH; o proxy só confere o cookie, a validação de verdade é aqui.
 */

export { PORTAL_COOKIE };
export const PORTAL_SESSION_SECONDS = 7 * 24 * 60 * 60;
export const INVITE_DAYS = 7;

export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Colaborador ativo dono deste e-mail corporativo (sem diferenciar maiúsculas). */
export async function employeeByCorporateEmail(value: unknown) {
  const email = normalizeEmail(value);
  if (!email) return null;
  const candidates = await prisma.employee.findMany({
    where: { corporateEmail: { not: null }, active: true },
    select: { id: true, corporateEmail: true },
  });
  const match = candidates.find((e) => normalizeEmail(e.corporateEmail) === email);
  return match ? match.id : null;
}

export async function startPortalSession(accountId: string, response: NextResponse): Promise<void> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + PORTAL_SESSION_SECONDS * 1000);
  await prisma.$transaction([
    // Aproveita para limpar sessões vencidas.
    prisma.portalSession.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
    prisma.portalSession.create({ data: { id: tokenHash(token), accountId, expiresAt } }),
    prisma.portalAccount.update({ where: { id: accountId }, data: { lastLoginAt: new Date() } }),
  ]);
  response.cookies.set(PORTAL_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PORTAL_SESSION_SECONDS,
  });
}

export async function endPortalSession(response: NextResponse): Promise<void> {
  const token = (await cookies()).get(PORTAL_COOKIE)?.value;
  if (token) await prisma.portalSession.deleteMany({ where: { id: tokenHash(token) } });
  response.cookies.delete(PORTAL_COOKIE);
}

export interface PortalEmployee {
  id: string;
  name: string;
  role: string | null;
  department: string | null;
  contractType: string | null;
  corporateEmail: string | null;
}

/** Colaborador da sessão atual, ou null (sessão vencida, removida ou pessoa inativa). */
export async function currentPortalEmployee(): Promise<PortalEmployee | null> {
  const token = (await cookies()).get(PORTAL_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.portalSession.findUnique({
    where: { id: tokenHash(token) },
    include: {
      account: {
        include: {
          employee: {
            select: { id: true, name: true, role: true, department: true, contractType: true, corporateEmail: true, active: true },
          },
        },
      },
    },
  });
  if (!session || session.expiresAt < new Date() || !session.account.employee.active) return null;
  const { id, name, role, department, contractType, corporateEmail } = session.account.employee;
  return { id, name, role, department, contractType, corporateEmail };
}

/**
 * Use no começo de toda rota do portal:
 *   const auth = await requirePortalEmployee();
 *   if ("response" in auth) return auth.response;
 */
export async function requirePortalEmployee(): Promise<{ employee: PortalEmployee } | { response: NextResponse }> {
  const employee = await currentPortalEmployee();
  if (!employee) {
    return { response: NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 }) };
  }
  return { employee };
}
