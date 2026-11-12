import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { removeAttachmentFiles } from "@/lib/attachmentStorage";
import { ADMISSION_INCLUDE, publicAdmission, syncAgreementDocuments } from "@/lib/admissionServer";
import { parseAdmissionFields } from "@/lib/admissionValidation";
import { admissionProgress, fieldsProgress } from "@/lib/admission";
import { exportAdmissionToDrive } from "@/lib/admissionDrive";
import { syncAdmissionToSheet } from "@/lib/admissionSheet";
import { createStartKit } from "@/lib/startKit";

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

    // Já existe alguém com o mesmo nome? O RH decide: é a mesma pessoa (atualiza
    // o cadastro com os dados deste onboarding) ou outra (cria um novo).
    const mode = body?.employeeMode === "novo" || body?.employeeMode === "atualizar" ? body.employeeMode : null;
    const sameName = (
      await prisma.employee.findMany({ select: { id: true, name: true, department: true, role: true, active: true, areaId: true } })
    ).filter((e) => nameKey(e.name) === nameKey(candidateName));
    if (sameName.length > 0 && !mode) {
      return NextResponse.json(
        {
          error: `Já existe ${sameName.length === 1 ? "um colaborador" : `${sameName.length} colaboradores`} com o nome ${candidateName}.`,
          conflict: sameName.map((e) => ({ id: e.id, name: e.name, department: e.department, role: e.role, active: e.active })),
        },
        { status: 409 }
      );
    }
    const target = mode === "atualizar" ? sameName.find((e) => e.id === body?.employeeId) : null;
    if (mode === "atualizar" && !target) {
      return NextResponse.json({ error: "Escolha qual cadastro atualizar." }, { status: 400 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      let employeeId: string;
      if (target) {
        // Mesma pessoa: reativa e traz os dados deste onboarding. Mudou de empresa:
        // a área e o gestor da empresa anterior saem.
        const department = admission.department ?? target.department;
        const changedCompany = department !== target.department;
        await tx.employee.update({
          where: { id: target.id },
          data: {
            active: true,
            department,
            role: admission.role ?? target.role,
            ...(admission.startDate ? { startDate: admission.startDate } : {}),
            ...(changedCompany ? { areaId: null, areaLead: false, managerId: null } : {}),
          },
        });
        if (changedCompany) {
          await tx.attendanceOccurrence.updateMany({ where: { employeeId: target.id }, data: { employeeDepartment: department } });
        }
        employeeId = target.id;
      } else {
        employeeId = (
          await tx.employee.create({
            data: {
              name: candidateName,
              department: admission.department,
              role: admission.role,
              active: true,
              startDate: admission.startDate,
            },
          })
        ).id;
      }
      return tx.admission.update({ where: { id }, data: { status: "concluida", employeeId } });
    });
    // Copia os documentos aprovados para o Google Drive. Se falhar, a conclusão
    // continua valendo — o erro fica na admissão e o RH pode tentar de novo.
    await exportAdmissionToDrive(updated.id);
    // Depois do Drive, para a planilha já levar o link da pasta.
    await syncAdmissionToSheet(updated.id);
    // Kit de início: lista de ferramentas, acessos e equipamentos no Slack. Se o
    // Slack falhar, o pedido fica na ficha com o motivo e dá para reenviar.
    if (updated.employeeId) {
      await createStartKit(updated.employeeId, {
        admissionId: updated.id,
        startDate: admission.startDate,
        createdBy: auth.user.name,
      }).catch((err) => console.error("Kit de início:", err));
    }
    const withDrive = await prisma.admission.findUnique({ where: { id }, include: ADMISSION_INCLUDE });
    return NextResponse.json(publicAdmission(withDrive!));
  }

  // Empresa contratante: undefined = não mexe; "" ou null = nenhuma.
  let contractingCompanyId: string | null | undefined;
  if (body && "contractingCompanyId" in body) {
    contractingCompanyId = typeof body.contractingCompanyId === "string" && body.contractingCompanyId ? body.contractingCompanyId : null;
    if (contractingCompanyId && !(await prisma.contractingCompany.findUnique({ where: { id: contractingCompanyId } }))) {
      return NextResponse.json({ error: "Empresa contratante não encontrada." }, { status: 400 });
    }
  }

  // "empresa" troca só a contratante do acordo (seletor ao lado dos documentos);
  // sem ação, a rota grava o registro inteiro (cartão "Dados internos").
  const fields = body?.action === "empresa" ? null : parseAdmissionFields(body);
  if (fields && "error" in fields) return NextResponse.json({ error: fields.error }, { status: 400 });
  if (!fields && contractingCompanyId === undefined) {
    return NextResponse.json({ error: "Escolha a empresa." }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.admission.update({
      where: { id },
      data: { ...(fields ? fields.data : {}), ...(contractingCompanyId !== undefined ? { contractingCompanyId } : {}) },
    });
    if (contractingCompanyId !== undefined) await syncAgreementDocuments(tx, id, !!contractingCompanyId);
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
