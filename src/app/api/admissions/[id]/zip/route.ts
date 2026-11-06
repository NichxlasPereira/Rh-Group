import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { readAttachment } from "@/lib/attachmentStorage";
import { buildZip } from "@/lib/zip";
import { admissionFileName, admissionFolderName } from "@/lib/localCopy";

/**
 * Baixa os documentos do onboarding num .zip: uma pasta com o nome da pessoa e
 * os arquivos com o nome do documento — pronto para arrastar para o Drive.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const admission = await prisma.admission.findUnique({
    where: { id },
    include: { documents: { orderBy: { sortOrder: "asc" }, include: { files: { orderBy: { createdAt: "asc" } } } } },
  });
  if (!admission) return NextResponse.json({ error: "Onboarding não encontrado." }, { status: 404 });

  const folder = admissionFolderName(admission);
  const entries: { name: string; data: Buffer }[] = [];
  for (const doc of admission.documents) {
    for (const [index, file] of doc.files.entries()) {
      const data = await readAttachment(file.storedName, "admissoes");
      if (!data) continue;
      entries.push({ name: `${folder}/${admissionFileName(doc.name, index, doc.files.length, file.storedName)}`, data });
    }
  }
  if (entries.length === 0) {
    return NextResponse.json({ error: "Este onboarding ainda não tem documentos enviados." }, { status: 404 });
  }

  const zip = buildZip(entries);
  return new NextResponse(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(zip.length),
      "Content-Disposition": `attachment; filename="onboarding.zip"; filename*=UTF-8''${encodeURIComponent(folder)}.zip`,
      "Cache-Control": "private, no-store",
    },
  });
}
