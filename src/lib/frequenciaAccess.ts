import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "./prisma";

/**
 * Acesso individual ao módulo de frequência (dados de RH). O proxy só confere
 * se existe o cookie; a verificação de verdade — sessão válida no banco,
 * pessoa ativa, perfil — acontece aqui, junto dos dados, em cada rota da API.
 */

import { FREQ_USER_COOKIE } from "./frequenciaCookie";

export { FREQ_USER_COOKIE };
export const SESSION_SECONDS = 12 * 60 * 60;
export const MIN_PASSWORD_LENGTH = 8;

export type FrequenciaRole = "admin" | "member";

/** Campos de uma conta que podem ir para o navegador (nunca o hash da senha). */
export const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  pending: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

export interface FrequenciaUserInfo {
  id: string;
  name: string;
  email: string;
  role: FrequenciaRole;
}

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scryptAsync(password, Buffer.from(saltB64, "base64"), expected.length);
  return timingSafeEqual(actual, expected);
}

/** Hash fixo para comparar quando o e-mail não existe — mesmo tempo de resposta. */
let dummyHash: Promise<string> | null = null;
export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
  return dummyHash;
}

export function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function validateNewPassword(value: unknown): string | null {
  if (typeof value !== "string" || value.length < MIN_PASSWORD_LENGTH) {
    return `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  if (value.length > 200) return "A senha é longa demais.";
  return null;
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Cria a sessão no banco e grava o cookie na resposta. */
export async function startSession(userId: string, response: NextResponse): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000);
  await prisma.$transaction([
    // Aproveita para limpar sessões vencidas.
    prisma.frequenciaSession.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
    prisma.frequenciaSession.create({ data: { id: tokenHash(token), userId, expiresAt } }),
    prisma.frequenciaUser.update({ where: { id: userId }, data: { lastLoginAt: new Date() } }),
  ]);
  response.cookies.set(FREQ_USER_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
}

export async function endSession(response: NextResponse): Promise<void> {
  const token = (await cookies()).get(FREQ_USER_COOKIE)?.value;
  if (token) await prisma.frequenciaSession.deleteMany({ where: { id: tokenHash(token) } });
  response.cookies.delete(FREQ_USER_COOKIE);
}

/** Pessoa da sessão atual, ou null se a sessão não vale (vencida, removida, bloqueada). */
export async function currentFrequenciaUser(): Promise<FrequenciaUserInfo | null> {
  const token = (await cookies()).get(FREQ_USER_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.frequenciaSession.findUnique({
    where: { id: tokenHash(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date() || !session.user.active || session.user.pending) return null;
  const { id, name, email, role } = session.user;
  return { id, name, email, role: role === "admin" ? "admin" : "member" };
}

/**
 * Use no começo de toda rota da frequência:
 *   const auth = await requireFrequenciaUser();
 *   if ("response" in auth) return auth.response;
 */
export async function requireFrequenciaUser(
  options: { admin?: boolean } = {}
): Promise<{ user: FrequenciaUserInfo } | { response: NextResponse }> {
  const user = await currentFrequenciaUser();
  if (!user) {
    return {
      response: NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 }),
    };
  }
  if (options.admin && user.role !== "admin") {
    return {
      response: NextResponse.json({ error: "Só administradores podem fazer isso." }, { status: 403 }),
    };
  }
  return { user };
}

/** Chave de primeiro acesso: FREQUENCIA_PASSWORD, usada só para criar o primeiro administrador. */
export function setupKey(): string | null {
  const value = process.env.FREQUENCIA_PASSWORD;
  return value && value.length > 0 ? value : null;
}

export function safeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  const same = bufA.length === bufB.length;
  return timingSafeEqual(same ? bufA : bufB, bufB) && same;
}
