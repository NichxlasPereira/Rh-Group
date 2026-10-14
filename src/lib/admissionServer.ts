import { createHash, randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { prisma } from "./prisma";
import { LINK_VALID_DAYS } from "./admission";
import { AGREEMENTS, AGREEMENT_KINDS } from "./agreements";

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

/** Termos gerados que entram na lista quando o onboarding tem empresa contratante. */
export const AGREEMENT_DOCUMENTS = AGREEMENT_KINDS.map((kind) => ({
  kind,
  name: AGREEMENTS[kind].name,
  description: AGREEMENTS[kind].description,
  required: true,
}));

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Com empresa contratante, o onboarding pede o acordo de confidencialidade e o
 * termo de uso de imagem; sem ela, os itens saem (se o candidato ainda não
 * enviou nada neles).
 */
export async function syncAgreementDocuments(tx: Tx, admissionId: string, hasCompany: boolean): Promise<void> {
  const existing = await tx.admissionDocument.findMany({
    where: { admissionId, kind: { in: AGREEMENT_KINDS } },
    include: { files: true },
  });
  if (hasCompany) {
    const last = await tx.admissionDocument.aggregate({ where: { admissionId }, _max: { sortOrder: true } });
    let sortOrder = (last._max.sortOrder ?? -1) + 1;
    for (const doc of AGREEMENT_DOCUMENTS) {
      if (existing.some((d) => d.kind === doc.kind)) continue;
      await tx.admissionDocument.create({ data: { ...doc, admissionId, sortOrder: sortOrder++ } });
    }
  } else {
    const removable = existing.filter((d) => d.files.length === 0).map((d) => d.id);
    if (removable.length) await tx.admissionDocument.deleteMany({ where: { id: { in: removable } } });
  }
}
