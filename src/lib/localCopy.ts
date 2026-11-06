import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { NextRequest } from "next/server";
import { prisma } from "./prisma";

/**
 * Cópia no computador do RH: um programa nos Macs do RH (integrations/copia-local)
 * confere a cada poucos segundos quais documentos de onboardings concluídos
 * existem e baixa os que ainda não tem, para uma pasta local. Cada computador
 * entra com a sua chave, gerada por um administrador no RHGroup — sem login nem
 * senha do site. O banco guarda só o hash da chave.
 */

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

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const newToken = () => randomBytes(24).toString("base64url");

/** Computador dono da chave do cabeçalho "Authorization: Bearer …" (nunca no endereço); null se não houver. */
export async function localCopyDevice(request: NextRequest): Promise<{ id: string } | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  return prisma.localCopyDevice.findUnique({ where: { tokenHash: hashToken(token) }, select: { id: true } });
}

/** O computador confere a cada poucos segundos: grava o "último contato" no máximo uma vez por minuto. */
const lastSeenWrite = new Map<string, number>();
export async function markLocalCopySeen(deviceId: string): Promise<void> {
  const now = Date.now();
  if (now - (lastSeenWrite.get(deviceId) ?? 0) < 60_000) return;
  lastSeenWrite.set(deviceId, now);
  await prisma.localCopyDevice.update({ where: { id: deviceId }, data: { lastSeenAt: new Date(now) } }).catch(() => undefined);
}

export async function listLocalCopyDevices() {
  return prisma.localCopyDevice.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, createdBy: true, createdAt: true, keyAt: true, lastSeenAt: true },
  });
}

/** Novo computador: devolve a chave (mostrada uma vez só). */
export async function addLocalCopyDevice(name: string, createdBy: string): Promise<string> {
  const token = newToken();
  await prisma.localCopyDevice.create({ data: { name, createdBy, tokenHash: hashToken(token) } });
  return token;
}

/** Nova chave para um computador: a anterior dele para de funcionar; os outros não mudam. */
export async function rotateLocalCopyDevice(id: string): Promise<string | null> {
  const token = newToken();
  const updated = await prisma.localCopyDevice.updateMany({
    where: { id },
    data: { tokenHash: hashToken(token), keyAt: new Date(), lastSeenAt: null },
  });
  return updated.count ? token : null;
}

export async function removeLocalCopyDevice(id: string): Promise<boolean> {
  return (await prisma.localCopyDevice.deleteMany({ where: { id } })).count > 0;
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

/**
 * A mesma lista em texto, uma linha por arquivo: "id<TAB>pasta<TAB>arquivo".
 * É o que o programa do Mac lê — só com o que já vem no macOS, sem instalar nada.
 * Os nomes nunca têm TAB nem quebra de linha (cleanFileName tira).
 */
export function localCopyTsv(admissions: LocalCopyAdmission[]): string {
  return admissions.flatMap((a) => a.files.map((f) => `${f.id}\t${a.folder}\t${f.name}\n`)).join("");
}
