import { createHash, randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { prisma } from "./prisma";
import { LINK_VALID_DAYS } from "./admission";

/**
 * Link do candidato: um token aleatório na URL. O banco guarda só o hash, então
 * o RH precisa gerar um novo link se perder o anterior (o antigo deixa de valer).
 */
export function newAdmissionToken(): { token: string; tokenHash: string; tokenExpiresAt: Date } {
  const token = randomBytes(24).toString("base64url");
  return {
    token,
    tokenHash: hashAdmissionToken(token),
    tokenExpiresAt: new Date(Date.now() + LINK_VALID_DAYS * 24 * 60 * 60 * 1000),
  };
}

export function hashAdmissionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function admissionLink(request: NextRequest, token: string): string {
  // Atrás do proxy do Railway, o host público vem nos cabeçalhos encaminhados.
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  return `${proto}://${host}/admissao/${token}`;
}

/** Admissão do link, se o link ainda vale (não expirou, admissão em andamento). */
export async function admissionByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const admission = await prisma.admission.findUnique({
    where: { tokenHash: hashAdmissionToken(token) },
    include: {
      documents: {
        orderBy: { sortOrder: "asc" },
        include: { files: { orderBy: { createdAt: "asc" } } },
      },
      fields: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!admission || admission.status !== "em_andamento" || admission.tokenExpiresAt < new Date()) return null;
  return admission;
}

export const ADMISSION_INCLUDE = {
  fields: { orderBy: { sortOrder: "asc" as const } },
  documents: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      files: {
        orderBy: { createdAt: "asc" as const },
        select: { id: true, fileName: true, mimeType: true, size: true, createdAt: true },
      },
    },
  },
};

/** Remove o hash do token antes de mandar para o navegador. */
export function publicAdmission<T extends { tokenHash: string }>(admission: T): Omit<T, "tokenHash"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { tokenHash, ...rest } = admission;
  return rest;
}

export const NDA_DOCUMENT = {
  kind: "nda",
  name: "Acordo de confidencialidade (NDA)",
  description: "Baixe o acordo já preenchido, assine no gov.br e envie aqui o PDF assinado.",
  required: true,
};

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Com empresa contratante, o onboarding pede o acordo de confidencialidade;
 * sem ela, o item sai (se o candidato ainda não enviou nada nele).
 */
export async function syncNdaDocument(tx: Tx, admissionId: string, hasCompany: boolean): Promise<void> {
  const existing = await tx.admissionDocument.findFirst({ where: { admissionId, kind: "nda" }, include: { files: true } });
  if (hasCompany && !existing) {
    const last = await tx.admissionDocument.aggregate({ where: { admissionId }, _max: { sortOrder: true } });
    await tx.admissionDocument.create({
      data: { ...NDA_DOCUMENT, admissionId, sortOrder: (last._max.sortOrder ?? -1) + 1 },
    });
  } else if (!hasCompany && existing && existing.files.length === 0) {
    await tx.admissionDocument.delete({ where: { id: existing.id } });
  }
}
