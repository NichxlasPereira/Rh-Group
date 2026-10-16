import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { removeAttachmentFiles } from "@/lib/attachmentStorage";
import { isAgreementKind } from "@/lib/agreements";

async function findDocument(admissionId: string, docId: string) {
  const document = await prisma.admissionDocument.findUnique({ where: { id: docId }, include: { files: true } });
  return document && document.admissionId === admissionId ? document : null;
}

/**
 * Avaliação do RH: { status: "aprovado" } ou { status: "recusado", reviewNote }.
 * Também aceita { required } para tornar o documento obrigatório ou opcional.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const { id, docId } = await params;

  const document = await findDocument(id, docId);
  if (!document) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const data: { status?: string; reviewNote?: string | null; reviewedBy?: string; reviewedAt?: Date; required?: boolean } = {};

  if (typeof body?.required === "boolean") data.required = body.required;

  if (body?.status === "aprovado" || body?.status === "recusado") {
    if (document.files.length === 0) {
      return NextResponse.json({ error: "Nenhum arquivo foi enviado para este documento." }, { status: 409 });
    }
    if (body.status === "aprovado" && isAgreementKind(document.kind) && !document.companySignedAt) {
      return NextResponse.json(
        { error: "Falta a assinatura da empresa: envie o PDF assinado pelo representante antes de aprovar." },
        { status: 409 }
      );
    }
    const note = typeof body.reviewNote === "string" ? body.reviewNote.trim() : "";
    if (body.status === "recusado" && !note) {
      return NextResponse.json({ error: "Explique o motivo da recusa — o candidato vai ver." }, { status: 400 });
    }
    data.status = body.status;
    data.reviewNote = body.status === "recusado" ? note.slice(0, 500) : null;
    data.reviewedBy = auth.user.name;
    data.reviewedAt = new Date();
  }

  const updated = await prisma.admissionDocument.update({
    where: { id: docId },
    data,
    include: { files: { select: { id: true, fileName: true, mimeType: true, size: true, origin: true, createdAt: true } } },
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const { id, docId } = await params;

  const document = await findDocument(id, docId);
  if (!document) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });

  await prisma.admissionDocument.delete({ where: { id: docId } });
  await removeAttachmentFiles(document.files.map((f) => f.storedName), "admissoes");
  return NextResponse.json({ ok: true });
}
