import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { removeAttachmentFiles, saveAttachment } from "@/lib/attachmentStorage";
import { OccurrenceType, acceptsAttachments } from "@/lib/attendance";

const ATTACHMENT_SELECT = { id: true, fileName: true, mimeType: true, size: true, createdAt: true } as const;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const occurrence = await prisma.attendanceOccurrence.findUnique({ where: { id } });
  if (!occurrence) {
    return NextResponse.json({ error: "Ocorrência não encontrada." }, { status: 404 });
  }
  if (!acceptsAttachments(occurrence.type as OccurrenceType)) {
    return NextResponse.json(
      { error: "Só é possível anexar documentos a atestados e comprovantes de horas." },
      { status: 400 }
    );
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Selecione um arquivo." }, { status: 400 });
  }

  const saved = await saveAttachment(file);
  if ("error" in saved) {
    return NextResponse.json({ error: saved.error }, { status: 400 });
  }

  try {
    const attachment = await prisma.attendanceAttachment.create({
      data: {
        occurrenceId: id,
        fileName: file.name.slice(0, 200) || "documento",
        mimeType: saved.mimeType,
        size: saved.size,
        storedName: saved.storedName,
      },
      select: ATTACHMENT_SELECT,
    });
    return NextResponse.json(attachment, { status: 201 });
  } catch (err) {
    // A ocorrência pode ter sido excluída enquanto o arquivo subia.
    await removeAttachmentFiles([saved.storedName]);
    throw err;
  }
}
