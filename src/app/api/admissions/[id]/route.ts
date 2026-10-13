import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { removeAttachmentFiles } from "@/lib/attachmentStorage";
import { ADMISSION_INCLUDE, publicAdmission, syncNdaDocument } from "@/lib/admissionServer";
import { parseAdmissionFields } from "@/lib/admissionValidation";
import { admissionProgress, fieldsProgress } from "@/lib/admission";
import { exportAdmissionToDrive } from "@/lib/admissionDrive";
import { syncAdmissionToSheet } from "@/lib/admissionSheet";

function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Edita os dados ou muda a situação da admissão:
 * { action: "concluir" } — exige todos os documentos obrigatórios aprovados e
 *   cria (ou reativa) o colaborador;
 * { action: "cancelar" } / { action: "reabrir" }.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const admission = await prisma.admission.findUnique({ where: { id }, include: ADMISSION_INCLUDE });
  if (!admission) return NextResponse.json({ error: "Onboarding não encontrado." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const action = body?.action;

  if (action === "cancelar" || action === "reabrir") {
    if (admission.status === "concluida") {
      return NextResponse.json({ error: "Um onboarding concluído não pode ser alterado." }, { status: 409 });
    }
    await prisma.admission.update({
      where: { id },
      data: { status: action === "cancelar" ? "cancelada" : "em_andamento" },
    });
    await syncAdmissionToSheet(id);
    const updated = await prisma.admission.findUnique({ where: { id }, include: ADMISSION_INCLUDE });
    return NextResponse.json(publicAdmission(updated!));
  }

  if (action === "concluir") {
    if (admission.status !== "em_andamento") {
      return NextResponse.json({ error: "Só onboardings em andamento podem ser concluídos." }, { status: 409 });
    }
    const progress = admissionProgress(admission.documents.map((d) => ({ required: d.required, status: d.status as never })));
    if (progress.approved < progress.required) {
      return NextResponse.json(
        { error: `Ainda faltam ${progress.required - progress.approved} documento(s) obrigatório(s) aprovado(s).` },
        { status: 409 }
      );
    }
    const data = fieldsProgress(admission.fields);
    if (data.filled < data.required) {
      return NextResponse.json(
        { error: `O candidato ainda não preencheu ${data.required - data.filled} dado(s) obrigatório(s).` },
        { status: 409 }
      );
    }
    const candidateName = admission.candidateName?.trim().replace(/\s+/g, " ");
    if (!candidateName) {
      return NextResponse.json({ error: "O nome do candidato ainda não foi preenchido." }, { status: 409 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Se já existe colaborador com o mesmo nome, reaproveita em vez de duplicar.
      const employees = await tx.employee.findMany({ select: { id: true, name: true } });
      const existing = employees.find((e) => nameKey(e.name) === nameKey(candidateName));
      const employeeId = existing
        ? (await tx.employee.update({ where: { id: existing.id }, data: { active: true } })).id
        : (
            await tx.employee.create({
              data: {
                name: candidateName,
                department: admission.department,
                role: admission.role,
                active: true,
              },
            })
          ).id;
      return tx.admission.update({ where: { id }, data: { status: "concluida", employeeId } });
    });
    // Copia os documentos aprovados para o Google Drive. Se falhar, a conclusão
    // continua valendo — o erro fica na admissão e o RH pode tentar de novo.
    await exportAdmissionToDrive(updated.id);
    // Depois do Drive, para a planilha já levar o link da pasta.
    await syncAdmissionToSheet(updated.id);
    const withDrive = await prisma.admission.findUnique({ where: { id }, include: ADMISSION_INCLUDE });
    return NextResponse.json(publicAdmission(withDrive!));
  }

  const fields = parseAdmissionFields(body);
  if ("error" in fields) return NextResponse.json({ error: fields.error }, { status: 400 });

  // Empresa contratante: undefined = não mexe; "" ou null = nenhuma.
  let contractingCompanyId: string | null | undefined;
  if (body && "contractingCompanyId" in body) {
    contractingCompanyId = typeof body.contractingCompanyId === "string" && body.contractingCompanyId ? body.contractingCompanyId : null;
    if (contractingCompanyId && !(await prisma.contractingCompany.findUnique({ where: { id: contractingCompanyId } }))) {
      return NextResponse.json({ error: "Empresa contratante não encontrada." }, { status: 400 });
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.admission.update({
      where: { id },
      data: { ...fields.data, ...(contractingCompanyId !== undefined ? { contractingCompanyId } : {}) },
    });
    if (contractingCompanyId !== undefined) await syncNdaDocument(tx, id, !!contractingCompanyId);
  });
  const updated = await prisma.admission.findUnique({ where: { id }, include: ADMISSION_INCLUDE });
  return NextResponse.json(publicAdmission(updated!));
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const admission = await prisma.admission.findUnique({
    where: { id },
    include: { documents: { include: { files: { select: { storedName: true } } } } },
  });
  if (!admission) return NextResponse.json({ error: "Onboarding não encontrado." }, { status: 404 });

  // Documentos e arquivos saem em cascata no banco; os arquivos em disco, aqui.
  await prisma.admission.delete({ where: { id } });
  await removeAttachmentFiles(
    admission.documents.flatMap((d) => d.files.map((f) => f.storedName)),
    "admissoes"
  );
  return NextResponse.json({ ok: true });
}
