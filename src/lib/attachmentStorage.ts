import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const ALLOWED: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "image/heif": ".heif",
};

/** Pastas de arquivos: anexos de atestado, documentos de admissão e documentos da ficha. */
export type StorageFolder = "atestados" | "admissoes" | "colaboradores";

/**
 * Pasta dos arquivos: uma subpasta ao lado do arquivo SQLite. Assim, em
 * produção os arquivos ficam no mesmo volume persistente do banco (/data)
 * sem configuração extra. `ATTACHMENTS_DIR` substitui a pasta dos atestados.
 */
function storageDir(folder: StorageFolder = "atestados"): string {
  if (folder === "atestados" && process.env.ATTACHMENTS_DIR) return process.env.ATTACHMENTS_DIR;
  const prismaDir = path.join(process.cwd(), "prisma");
  const url = process.env.DATABASE_URL ?? "";
  if (url.startsWith("file:")) {
    const dbPath = url.slice("file:".length).split("?")[0];
    // Caminhos relativos do Prisma são resolvidos a partir da pasta do schema.
    const absolute = path.isAbsolute(dbPath) ? dbPath : path.join(prismaDir, dbPath);
    return path.join(path.dirname(absolute), folder);
  }
  return path.join(prismaDir, folder);
}

/** Confere a assinatura do arquivo — o tipo informado pelo navegador não basta. */
function detectMimeType(bytes: Uint8Array): string | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (ascii(0, 5) === "%PDF-") return "application/pdf";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (ascii(4, 8) === "ftyp") {
    const brand = ascii(8, 12);
    if (["heic", "heix", "hevc", "hevx"].includes(brand)) return "image/heic";
    if (["mif1", "msf1", "heim", "heis"].includes(brand)) return "image/heif";
  }
  return null;
}

export type SaveResult =
  | { storedName: string; mimeType: string; size: number }
  | { error: string };

export async function saveAttachment(file: File, folder: StorageFolder = "atestados"): Promise<SaveResult> {
  if (file.size === 0) return { error: "O arquivo está vazio." };
  if (file.size > MAX_ATTACHMENT_BYTES) return { error: "O arquivo passa do limite de 10 MB." };

  const bytes = new Uint8Array(await file.arrayBuffer());
  // Protege contra corpo truncado (ex.: limite de buffer do proxy).
  if (bytes.byteLength !== file.size) return { error: "O envio do arquivo foi interrompido. Tente novamente." };

  const mimeType = detectMimeType(bytes);
  if (!mimeType || !ALLOWED[mimeType]) {
    return { error: "Formato não aceito. Envie PDF ou imagem (JPG, PNG, WEBP ou HEIC)." };
  }

  const dir = storageDir(folder);
  await mkdir(dir, { recursive: true });
  const storedName = `${randomUUID()}${ALLOWED[mimeType]}`;
  await writeFile(path.join(dir, storedName), bytes);
  return { storedName, mimeType, size: bytes.byteLength };
}

function safePath(storedName: string, folder: StorageFolder): string {
  // storedName é sempre gerado por nós, mas nunca deixe sair da pasta.
  return path.join(storageDir(folder), path.basename(storedName));
}

export async function readAttachment(storedName: string, folder: StorageFolder = "atestados"): Promise<Buffer | null> {
  try {
    return await readFile(safePath(storedName, folder));
  } catch {
    return null;
  }
}

export async function removeAttachmentFiles(storedNames: string[], folder: StorageFolder = "atestados"): Promise<void> {
  await Promise.all(storedNames.map((name) => unlink(safePath(name, folder)).catch(() => undefined)));
}
