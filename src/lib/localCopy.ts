import path from "node:path";
import { NextRequest } from "next/server";
import { prisma } from "./prisma";
import { settingToken } from "./settingToken";

/**
 * Cópia no computador do RH: um programa no Mac (integrations/copia-local)
 * pergunta de tempos em tempos quais documentos de onboardings concluídos
 * existem e baixa os que ainda não tem, para uma pasta local. Entra com uma
 * chave gerada pelo administrador no RHGroup — sem login nem senha do site.
 */

export const localCopyToken = settingToken("copia_local_token");
const LAST_SEEN_KEY = "copia_local_visto";

/** Nome seguro para pasta/arquivo no Windows, no Mac e no Drive. */
export function cleanFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/\s+/g, " ").trim().slice(0, 120) || "documento";
}

/**
 * Pasta de cada colaborador: "Nome – AAAA-MM-DD" — o nome do cadastro (ou o que
 * o candidato preencheu) e o dia em que ele fez o onboarding (enviou os dados).
 */
export function admissionFolderName(
  a: { candidateName: string | null; submittedAt: Date | null; createdAt: Date },
  employeeName?: string | null
): string {
  const day = a.submittedAt ?? a.createdAt;
  // Dia no fuso de São Paulo: um envio às 22h não vira o dia seguinte.
  const date = day.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return cleanFileName(`${employeeName || a.candidateName || "Candidato"} – ${date}`);
}

/** Nome no cadastro do colaborador criado ao concluir cada onboarding. */
export async function employeeNames(employeeIds: (string | null)[]): Promise<Map<string, string>> {
  const ids = [...new Set(employeeIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return new Map();
  const people = await prisma.employee.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  return new Map(people.map((p) => [p.id, p.name]));
}

/** Arquivo com o nome do documento; numerado quando o documento tem mais de um. */
export function admissionFileName(docName: string, index: number, count: number, storedName: string): string {
  const suffix = count > 1 ? ` (${index + 1})` : "";
  return `${cleanFileName(docName + suffix)}${path.extname(storedName)}`;
}

/** A chave vem no cabeçalho "Authorization: Bearer …" — nunca no endereço. */
export async function isLocalCopyRequest(request: NextRequest): Promise<boolean> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
  return localCopyToken.isValid(token);
}

export async function markLocalCopySeen(): Promise<void> {
  const value = new Date().toISOString();
  await prisma.appSetting.upsert({ where: { key: LAST_SEEN_KEY }, create: { key: LAST_SEEN_KEY, value }, update: { value } });
}

export async function localCopyInfo(): Promise<{ active: boolean; createdAt: Date | null; lastSeenAt: string | null }> {
  const [info, seen] = await Promise.all([
    localCopyToken.info(),
    prisma.appSetting.findUnique({ where: { key: LAST_SEEN_KEY } }),
  ]);
  // Último acesso só conta se veio depois da chave atual.
  const lastSeenAt = info.active && seen && info.updatedAt && new Date(seen.value) >= info.updatedAt ? seen.value : null;
  return { active: info.active, createdAt: info.updatedAt, lastSeenAt };
}

export interface LocalCopyFile {
  id: string;
  name: string;
  size: number;
}

export interface LocalCopyAdmission {
  id: string;
  folder: string;
  files: LocalCopyFile[];
}

/** Onboardings concluídos e seus documentos aprovados (o mesmo que ia para o Drive). */
export async function localCopyList(): Promise<LocalCopyAdmission[]> {
  const admissions = await prisma.admission.findMany({
    where: { status: "concluida" },
    orderBy: { createdAt: "asc" },
    include: {
      documents: {
        where: { status: "aprovado" },
        orderBy: { sortOrder: "asc" },
        include: { files: { orderBy: { createdAt: "asc" }, select: { id: true, size: true, storedName: true } } },
      },
    },
  });
  const names = await employeeNames(admissions.map((a) => a.employeeId));
  return admissions
    .map((a) => ({
      id: a.id,
      folder: admissionFolderName(a, a.employeeId ? names.get(a.employeeId) : null),
      files: a.documents.flatMap((d) =>
        d.files.map((f, i) => ({ id: f.id, name: admissionFileName(d.name, i, d.files.length, f.storedName), size: f.size }))
      ),
    }))
    .filter((a) => a.files.length > 0);
}

/** Arquivo de um documento aprovado de um onboarding concluído; null para o resto. */
export async function localCopyFile(fileId: string) {
  return prisma.admissionFile.findFirst({
    where: { id: fileId, document: { status: "aprovado", admission: { status: "concluida" } } },
    select: { storedName: true, mimeType: true },
  });
}
