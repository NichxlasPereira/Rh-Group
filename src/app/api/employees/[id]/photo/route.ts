import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { readAttachment } from "@/lib/attachmentStorage";
import { DISPLAYABLE_IMAGE, isPhotoDocument } from "@/lib/employeeProfile";

/**
 * Foto para crachá do colaborador: a última enviada pelo RH na ficha ou,
 * sem ela, a do onboarding digital. 404 quando não há foto.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;

  let source: { storedName: string; mimeType: string; folder: "colaboradores" | "admissoes" } | null = null;

  const uploads = await prisma.employeeDocument.findMany({
    where: { employeeId: id },
    orderBy: { createdAt: "desc" },
    select: { name: true, storedName: true, mimeType: true },
  });
  const upload = uploads.find((d) => isPhotoDocument(d.name) && DISPLAYABLE_IMAGE.test(d.mimeType));
  if (upload) source = { ...upload, folder: "colaboradores" };

  if (!source) {
    const files = await prisma.admissionFile.findMany({
      where: { document: { admission: { employeeId: id } } },
      orderBy: { createdAt: "desc" },
      select: { storedName: true, mimeType: true, document: { select: { name: true } } },
    });
    const file = files.find((f) => isPhotoDocument(f.document.name) && DISPLAYABLE_IMAGE.test(f.mimeType));
    if (file) source = { storedName: file.storedName, mimeType: file.mimeType, folder: "admissoes" };
  }

  const data = source && (await readAttachment(source.storedName, source.folder));
  if (!source || !data) return NextResponse.json({ error: "Sem foto." }, { status: 404 });

  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": source.mimeType,
      "Content-Length": String(data.byteLength),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
