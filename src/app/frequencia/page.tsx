"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Header } from "@/components/Header";
import { Tabs, TabItem } from "@/components/Tabs";
import { Button } from "@/components/Button";
import { IconCalendarPlus, IconPlus } from "@/components/icons";
import { AttendanceStats } from "@/components/attendance/AttendanceStats";
import { ALL_MONTHS, AttendanceFilters, AttendanceTabKey } from "@/components/attendance/AttendanceFilters";
import { OccurrencesTable } from "@/components/attendance/OccurrencesTable";
import { EmployeesTable } from "@/components/attendance/EmployeesTable";
import { AttendanceReports } from "@/components/attendance/AttendanceReports";
import { EmployeeModal, EmployeeFormValues } from "@/components/attendance/EmployeeModal";
import { AttachmentChanges, OccurrenceModal, OccurrenceFormValues } from "@/components/attendance/OccurrenceModal";
import { ConfirmDeleteModal } from "@/components/attendance/ConfirmDeleteModal";
import {
  Employee,
  OCCURRENCE_LABEL,
  Occurrence,
  OccurrenceType,
  availableMonths,
  addTotals,
  currentMonthKey,
  emptyTotals,
  folgaDaysUsed,
  isMultiDay,
  monthKeyLabel,
  occurrenceDays,
  overlapsMonth,
  summarizeByEmployee,
} from "@/lib/attendance";
import { formatDateBR } from "@/lib/format";
import { endOtherModuleSession, redirectIfSessionExpired } from "@/lib/sessionClient";
import { AccessPanel, ChangeOwnPasswordModal } from "@/components/attendance/AccessPanel";
import { AdmissionsPanel } from "@/components/admission/AdmissionsPanel";

interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "member";
  pendingRequests: number;
}

const ATTENDANCE_TABS: TabItem<AttendanceTabKey>[] = [
  { key: "ocorrencias", label: "ocorrências" },
  { key: "colaboradores", label: "colaboradores" },
  { key: "relatorios", label: "relatórios" },
  { key: "admissoes", label: "onboarding" },
];

function adminTabs(pendingRequests: number): TabItem<AttendanceTabKey>[] {
  return [...ATTENDANCE_TABS, { key: "acessos", label: pendingRequests > 0 ? `acessos · ${pendingRequests}` : "acessos" }];
}

/** Sessão da frequência expirou (12h): volta para a tela de senha. */
function sessionExpired(res: Response): boolean {
  return redirectIfSessionExpired(res, "/frequencia/entrar", "/frequencia");
}

async function requestJson(url: string, init: RequestInit, fallbackError: string) {
  const res = await fetch(url, {
    ...init,
    headers: init.body ? { "Content-Type": "application/json" } : undefined,
  });
  if (sessionExpired(res)) throw new Error("Sessão expirada. Entre novamente.");
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || fallbackError);
  }
  return res.json();
}

export default function FrequenciaPage() {
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<AttendanceTabKey>("ocorrencias");
  const [me, setMe] = useState<SessionUser | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);

  const [month, setMonth] = useState(currentMonthKey());
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<OccurrenceType | "">("");
  const [department, setDepartment] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const [employeeModalOpen, setEmployeeModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [deletingEmployee, setDeletingEmployee] = useState<Employee | null>(null);

  const [occurrenceModalOpen, setOccurrenceModalOpen] = useState(false);
  const [editingOccurrence, setEditingOccurrence] = useState<Occurrence | null>(null);
  const [occurrencePreselect, setOccurrencePreselect] = useState<Employee | null>(null);
  const [deletingOccurrence, setDeletingOccurrence] = useState<Occurrence | null>(null);

  const fetchEmployees = useCallback(async () => {
    const res = await fetch("/api/employees");
    if (sessionExpired(res)) return;
    setEmployees(await res.json());
  }, []);

  const fetchMe = useCallback(async () => {
    const res = await fetch("/api/frequencia/me");
    if (sessionExpired(res)) return;
    setMe(await res.json());
  }, []);

  const fetchOccurrences = useCallback(async () => {
    const res = await fetch("/api/occurrences");
    if (sessionExpired(res)) return;
    setOccurrences(await res.json());
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchEmployees(), fetchOccurrences(), fetchMe()]).finally(() => setLoading(false));
    endOtherModuleSession("frequencia");
  }, [fetchEmployees, fetchOccurrences, fetchMe]);

  const months = useMemo(() => availableMonths(occurrences), [occurrences]);
  const allPeriod = month === ALL_MONTHS;
  // Relatórios sempre olham para um mês específico.
  const reportMonth = allPeriod ? currentMonthKey() : month;
  const periodLabel = allPeriod ? "todo o período" : monthKeyLabel(month);

  const departments = useMemo(() => {
    const set = new Set<string>();
    for (const e of employees) if (e.department) set.add(e.department);
    for (const o of occurrences) if (o.employeeDepartment) set.add(o.employeeDepartment);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [employees, occurrences]);

  const periodSummaries = useMemo(
    () => summarizeByEmployee(occurrences, allPeriod ? undefined : month),
    [occurrences, month, allPeriod]
  );

  const totals = useMemo(() => {
    const t = emptyTotals();
    for (const s of periodSummaries) {
      if (department && s.department !== department) continue;
      addTotals(t, s);
    }
    return t;
  }, [periodSummaries, department]);

  const summaryByEmployeeId = useMemo(() => {
    const map = new Map<string, (typeof periodSummaries)[number]>();
    for (const s of periodSummaries) if (s.employeeId) map.set(s.employeeId, s);
    return map;
  }, [periodSummaries]);

  // Saldo de folgas é acumulado (não por mês): total a que tem direito menos o já usado.
  const folgaRemaining = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of employees) map.set(e.id, e.folgaAllowance - folgaDaysUsed(occurrences, e.id));
    return map;
  }, [employees, occurrences]);

  const filteredOccurrences = useMemo(() => {
    const term = search.trim().toLowerCase();
    return occurrences.filter(
      (o) =>
        (allPeriod || overlapsMonth(o, month)) &&
        (!typeFilter || o.type === typeFilter) &&
        (!department || o.employeeDepartment === department) &&
        (!term ||
          o.employeeName.toLowerCase().includes(term) ||
          (o.notes ?? "").toLowerCase().includes(term) ||
          (o.approvedBy ?? "").toLowerCase().includes(term))
    );
  }, [occurrences, month, allPeriod, typeFilter, department, search]);

  const filteredEmployees = useMemo(() => {
    const term = search.trim().toLowerCase();
    return employees
      .filter(
        (e) =>
          (showInactive || e.active) &&
          (!department || e.department === department) &&
          (!term || e.name.toLowerCase().includes(term) || (e.role ?? "").toLowerCase().includes(term))
      )
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [employees, showInactive, department, search]);

  const reportOccurrences = useMemo(
    () => (department ? occurrences.filter((o) => o.employeeDepartment === department) : occurrences),
    [occurrences, department]
  );

  function openNewEmployee() {
    setEditingEmployee(null);
    setEmployeeModalOpen(true);
  }

  function openNewOccurrence(employee: Employee | null = null) {
    setEditingOccurrence(null);
    setOccurrencePreselect(employee);
    setOccurrenceModalOpen(true);
  }

  async function handleEmployeeSubmit(values: EmployeeFormValues) {
    const isEdit = !!editingEmployee;
    try {
      await requestJson(
        isEdit ? `/api/employees/${editingEmployee!.id}` : "/api/employees",
        {
          method: isEdit ? "PATCH" : "POST",
          body: JSON.stringify({
            name: values.name.trim(),
            department: values.department.trim() || null,
            role: values.role.trim() || null,
            active: values.active,
            folgaAllowance: Number(values.folgaAllowance || 0),
          }),
        },
        "Não foi possível salvar o colaborador."
      );
      await Promise.all([fetchEmployees(), isEdit ? fetchOccurrences() : null]);
      setEmployeeModalOpen(false);
      toast.success(isEdit ? "Colaborador atualizado." : "Colaborador cadastrado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro inesperado.");
    }
  }

  async function handleEmployeeDelete() {
    if (!deletingEmployee) return;
    try {
      await requestJson(`/api/employees/${deletingEmployee.id}`, { method: "DELETE" }, "Não foi possível excluir o colaborador.");
      await Promise.all([fetchEmployees(), fetchOccurrences()]);
      setDeletingEmployee(null);
      toast.success("Colaborador excluído. O histórico foi preservado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro inesperado.");
    }
  }

  async function handleOccurrenceSubmit(values: OccurrenceFormValues, attachments: AttachmentChanges) {
    const isEdit = !!editingOccurrence;
    let saved: Occurrence;
    try {
      saved = await requestJson(
        isEdit ? `/api/occurrences/${editingOccurrence!.id}` : "/api/occurrences",
        {
          method: isEdit ? "PATCH" : "POST",
          body: JSON.stringify({
            employeeId: values.employeeId,
            type: values.type,
            date: values.date,
            endDate: isMultiDay(values.type) ? values.endDate : values.date,
            justified: values.justified,
            approvedBy: values.type === "folga" ? values.approvedBy.trim() : null,
            notes: values.notes.trim() || null,
          }),
        },
        "Não foi possível salvar a ocorrência."
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro inesperado.");
      return;
    }

    // A ocorrência já está salva: falhas de anexo são avisadas sem desfazê-la.
    const failures: string[] = [];
    for (const id of attachments.removedIds) {
      try {
        await requestJson(`/api/attachments/${id}`, { method: "DELETE" }, "Não foi possível remover um anexo.");
      } catch (err) {
        failures.push(err instanceof Error ? err.message : "Não foi possível remover um anexo.");
      }
    }
    for (const file of attachments.newFiles) {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/occurrences/${saved.id}/attachments`, { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        failures.push(`${file.name}: ${body.error || "não foi possível enviar."}`);
      }
    }

    await fetchOccurrences();
    setOccurrenceModalOpen(false);
    if (failures.length > 0) {
      toast.error(`Ocorrência salva, mas houve problema com anexos. ${failures.join(" ")}`, { duration: 8000 });
    } else {
      toast.success(isEdit ? "Ocorrência atualizada." : "Ocorrência registrada.");
    }
  }

  async function handleOccurrenceDelete() {
    if (!deletingOccurrence) return;
    try {
      await requestJson(`/api/occurrences/${deletingOccurrence.id}`, { method: "DELETE" }, "Não foi possível excluir a ocorrência.");
      await fetchOccurrences();
      setDeletingOccurrence(null);
      toast.success("Ocorrência excluída.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro inesperado.");
    }
  }

  async function logout() {
    await fetch("/api/frequencia/logout", { method: "POST" }).catch(() => undefined);
    router.push("/");
  }

  function exportCsv() {
    const header = ["Data inicial", "Data final", "Colaborador", "Setor", "Tipo", "Dias", "Justificada", "Gestor (folga)", "Anexos", "Observações"];
    const rows = filteredOccurrences.map((o) => [
      formatDateBR(o.date),
      formatDateBR(o.endDate),
      o.employeeName,
      o.employeeDepartment ?? "",
      OCCURRENCE_LABEL[o.type],
      String(occurrenceDays(o)),
      o.justified ? "Sim" : "Não",
      o.approvedBy ?? "",
      String(o.attachments.length),
      o.notes ?? "",
    ]);
    const escape = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    // `;` e BOM para o Excel em pt-BR abrir com acentos e colunas certas.
    const csv = "﻿" + [header, ...rows].map((r) => r.map(escape).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `ocorrencias-${allPeriod ? "todas" : month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Header
        module="frequencia"
        title={
          <>
            quem faltou,
            <br />
            quem folgou,
            <br />
            quem justificou —
          </>
        }
        description="Registre faltas, atestados e folgas da equipe CFFGROUP e acompanhe a frequência de cada colaborador mês a mês."
        actions={
          <>
            <Button variant="ghost" onClick={openNewEmployee} className="!px-4 !py-2 text-xs">
              <IconPlus className="h-3.5 w-3.5" />
              Novo colaborador
            </Button>
            <Button variant="dark" onClick={() => openNewOccurrence(null)} className="!px-4 !py-2 text-xs">
              <IconCalendarPlus className="h-3.5 w-3.5" />
              registrar ocorrência
            </Button>
            {me && (
              <span className="flex items-center gap-2 text-xs text-muted">
                <span className="hidden font-semibold text-ink sm:inline">{me.name}</span>
                <button
                  type="button"
                  onClick={() => setChangingPassword(true)}
                  className="font-semibold underline-offset-2 transition hover:text-ink hover:underline"
                >
                  minha senha
                </button>
                ·
                <button
                  type="button"
                  onClick={logout}
                  className="font-semibold underline-offset-2 transition hover:text-ink hover:underline"
                >
                  sair
                </button>
              </span>
            )}
          </>
        }
        tabs={
          <Tabs tabs={me?.role === "admin" ? adminTabs(me.pendingRequests) : ATTENDANCE_TABS} active={tab} onChange={setTab} />
        }
      />

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-6 py-8">
        <AttendanceStats
          activeEmployees={employees.filter((e) => e.active && (!department || e.department === department)).length}
          totals={totals}
          periodLabel={periodLabel}
        />

        {tab === "acessos" && me?.role === "admin" ? (
          <AccessPanel currentUserId={me.id} onChanged={fetchMe} />
        ) : tab === "admissoes" ? (
          <AdmissionsPanel departments={departments} isAdmin={me?.role === "admin"} onEmployeesChanged={fetchEmployees} />
        ) : (
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <AttendanceFilters
              tab={tab}
              months={months}
              month={tab === "relatorios" ? reportMonth : month}
              onMonthChange={setMonth}
              search={search}
              onSearchChange={setSearch}
              type={typeFilter}
              onTypeChange={setTypeFilter}
              departments={departments}
              department={department}
              onDepartmentChange={setDepartment}
              showInactive={showInactive}
              onShowInactiveChange={setShowInactive}
              onExport={exportCsv}
              exportDisabled={filteredOccurrences.length === 0}
            />

            <div className="min-w-0 flex-1">
              {loading ? (
                <div className="rounded-[14px] border border-border bg-surface px-6 py-16 text-center text-sm text-muted">
                  Carregando...
                </div>
              ) : tab === "ocorrencias" ? (
                <OccurrencesTable
                  occurrences={filteredOccurrences}
                  hasAny={occurrences.length > 0}
                  onEdit={(o) => {
                    setEditingOccurrence(o);
                    setOccurrencePreselect(null);
                    setOccurrenceModalOpen(true);
                  }}
                  onDelete={setDeletingOccurrence}
                />
              ) : tab === "colaboradores" ? (
                <EmployeesTable
                  employees={filteredEmployees}
                  hasAny={employees.length > 0}
                  summaries={summaryByEmployeeId}
                  folgaRemaining={folgaRemaining}
                  periodLabel={periodLabel}
                  onRegister={(e) => openNewOccurrence(e)}
                  onEdit={(e) => {
                    setEditingEmployee(e);
                    setEmployeeModalOpen(true);
                  }}
                  onDelete={setDeletingEmployee}
                />
              ) : (
                <AttendanceReports occurrences={reportOccurrences} month={reportMonth} months={months} />
              )}
            </div>
          </div>
        )}
      </main>

      <ChangeOwnPasswordModal open={changingPassword} onClose={() => setChangingPassword(false)} />

      <EmployeeModal
        open={employeeModalOpen}
        onClose={() => setEmployeeModalOpen(false)}
        onSubmit={handleEmployeeSubmit}
        employee={editingEmployee}
        existingDepartments={departments}
      />

      <OccurrenceModal
        open={occurrenceModalOpen}
        onClose={() => setOccurrenceModalOpen(false)}
        onSubmit={handleOccurrenceSubmit}
        employees={employees}
        occurrences={occurrences}
        occurrence={editingOccurrence}
        preselectedEmployee={occurrencePreselect}
      />

      <ConfirmDeleteModal
        open={!!deletingEmployee}
        title="Excluir colaborador"
        confirmLabel="Excluir colaborador"
        message={
          <>
            Tem certeza que deseja excluir <strong>{deletingEmployee?.name}</strong>?
          </>
        }
        detail="As ocorrências já registradas continuam no histórico. Se a pessoa apenas saiu da empresa, prefira editar e desmarcar “Colaborador ativo”."
        onClose={() => setDeletingEmployee(null)}
        onConfirm={handleEmployeeDelete}
      />

      <ConfirmDeleteModal
        open={!!deletingOccurrence}
        title="Excluir ocorrência"
        confirmLabel="Excluir ocorrência"
        message={
          deletingOccurrence && (
            <>
              Excluir {OCCURRENCE_LABEL[deletingOccurrence.type].toLowerCase()} de{" "}
              <strong>{deletingOccurrence.employeeName}</strong> em {formatDateBR(deletingOccurrence.date)}?
            </>
          )
        }
        detail="Essa ação não pode ser desfeita."
        onClose={() => setDeletingOccurrence(null)}
        onConfirm={handleOccurrenceDelete}
      />
    </>
  );
}
