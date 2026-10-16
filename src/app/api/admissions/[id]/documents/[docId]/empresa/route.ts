import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { readAttachment, removeAttachmentFiles, saveAttachment } from "@/lib/attachmentStorage";
import { isAgreementKind, signatureCount } from "@/lib/agreements";

type Params = { params: Promise<{ id: string; docId: string }> };

async function findTerm(admissionId: string, docId: string) {
  const document = await prisma.admissionDocument.findUnique({ where: { id: docId }, include: { files: true } });
  if (!document || document.admissionId !== admissionId || !isAgreementKind(document.kind)) return null;
  return document;
}

/**
 * O RH envia o termo assinado também pelo representante da empresa. Precisa
 * ser o mesmo PDF que o candidato assinou, com a assinatura da empresa por
 * cima: a assinatura digital acrescenta ao fim do arquivo, então o PDF do
 * candidato continua intacto no começo do novo.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const { id, docId } = await params;

  const document = await findTerm(id, docId);
  if (!document) return NextResponse.json({ error: "Termo não encontrado." }, { status: 404 });
  if (document.status === "aprovado") {
    return NextResponse.json({ error: "Este termo já foi aprovado." }, { status: 409 });
  }
  const candidateFile = document.files.filter((f) => f.origin === "candidato").at(-1);
  if (!candidateFile) {
    return NextResponse.json({ error: "O candidato ainda não enviou o termo assinado." }, { status: 409 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Selecione o PDF assinado pela empresa." }, { status: 400 });
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return NextResponse.json({ error: "Envie o termo em PDF." }, { status: 400 });
  }
  const original = await readAttachment(candidateFile.storedName, "admissoes");
  if (original && !bytes.subarray(0, original.length).equals(original)) {
    return NextResponse.json(
      { error: "Este PDF não é o que o candidato assinou. Baixe a versão do candidato, assine por cima no gov.br e envie de novo." },
      { status: 400 }
    );
  }
  if (signatureCount(bytes) < 2) {
    return NextResponse.json(
      { error: "Falta a assinatura da empresa neste PDF. Assine a versão do candidato no gov.br (assinador.iti.br) e envie o arquivo assinado." },
      { status: 400 }
    );
  }

  const saved = await saveAttachment(file, "admissoes");
  if ("error" in saved) return NextResponse.json({ error: saved.error }, { status: 400 });
  const previous = document.files.filter((f) => f.origin === "empresa");
  try {
    await prisma.$transaction([
      prisma.admissionFile.deleteMany({ where: { id: { in: previous.map((f) => f.id) } } }),
      prisma.admissionFile.create({
        data: {
          documentId: docId,
          origin: "empresa",
          fileName: file.name.slice(0, 200) || "termo-assinado.pdf",
          mimeType: saved.mimeType,
          size: saved.size,
          storedName: saved.storedName,
        },
      }),
      prisma.admissionDocument.update({
        where: { id: docId },
        data: { companySignedAt: new Date(), companySignedBy: auth.user.name },
      }),
    ]);
  } catch (err) {
    await removeAttachmentFiles([saved.storedName], "admissoes");
    throw err;
  }
  await removeAttachmentFiles(previous.map((f) => f.storedName), "admissoes");
  return NextResponse.json({ ok: true }, { status: 201 });
}

/** Desfaz o envio da versão assinada pela empresa (enviada errada). */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const { id, docId } = await params;

  const document = await findTerm(id, docId);
  if (!document) return NextResponse.json({ error: "Termo não encontrado." }, { status: 404 });
  if (document.status === "aprovado") {
    return NextResponse.json({ error: "Este termo já foi aprovado." }, { status: 409 });
  }
  const companyFiles = document.files.filter((f) => f.origin === "empresa");
  await prisma.$transaction([
    prisma.admissionFile.deleteMany({ where: { id: { in: companyFiles.map((f) => f.id) } } }),
    prisma.admissionDocument.update({ where: { id: docId }, data: { companySignedAt: null, companySignedBy: null } }),
  ]);
  await removeAttachmentFiles(companyFiles.map((f) => f.storedName), "admissoes");
  return NextResponse.json({ ok: true });
}
