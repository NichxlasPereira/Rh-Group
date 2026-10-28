"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Button } from "@/components/Button";
import {
  IconCake,
  IconCalendarPlus,
  IconCalendarX,
  IconArrowUpTray,
  IconChart,
  IconKey,
  IconPlus,
  IconSearch,
  IconUserPlus,
  IconUsers,
} from "@/components/icons";
import { RhShell, RhSection } from "@/components/attendance/RhShell";
import { AttendanceStats } from "@/components/attendance/AttendanceStats";
import { ALL_MONTHS, AttendanceFilters, AttendanceTabKey, TeamView } from "@/components/attendance/AttendanceFilters";
import { OccurrencesTable } from "@/components/attendance/OccurrencesTable";
import { EmployeesTable } from "@/components/attendance/EmployeesTable";
import { OrgChart } from "@/components/attendance/OrgChart";
import { BirthdaysPanel } from "@/components/attendance/BirthdaysPanel";
import { AreasModal } from "@/components/attendance/AreasModal";
import { CompanyBrandModal } from "@/components/attendance/CompanyBrandModal";
import { EmployeeImportModal } from "@/components/attendance/EmployeeImportModal";
import { AttendanceReports } from "@/components/attendance/AttendanceReports";
import { EmployeeModal, EmployeeFormValues } from "@/components/attendance/EmployeeModal";
import { AttachmentChanges, OccurrenceModal, OccurrenceFormValues } from "@/components/attendance/OccurrenceModal";
import { ConfirmDeleteModal } from "@/components/attendance/ConfirmDeleteModal";
import {
  CompanyArea,
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
import { PHOTO_DOCUMENT_NAME } from "@/lib/employeeProfile";
import { Birthday, isBirthdayOn } from "@/lib/birthdays";
import { endOtherModuleSession, redirectIfSessionExpired } from "@/lib/sessionClient";
import { AccessPanel, ChangeOwnPasswordModal } from "@/components/attendance/AccessPanel";
import { AdmissionsPanel } from "@/components/admission/AdmissionsPanel";
import { EmployeeProfile } from "@/components/attendance/EmployeeProfile";
import { SkeletonRows } from "@/components/attendance/formControls";
import {
  AdmissionInfo,
  ContractingCompanyInfo,
  admissionProgress,
  companySectors,
  fieldsProgress,
  sectorName,
} from "@/lib/admission";

interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "member";
  pendingRequests: number;
}

const SECTION_COPY: Record<AttendanceTabKey, { title: string; description: string }> = {
  ocorrencias: { title: "Ocorrências", description: "Faltas, atestados e folgas da equipe, com anexos e saldo de folgas." },
  colaboradores: { title: "Colaboradores", description: "Cadastro da equipe: setores, cargos e saldo de folgas de cada pessoa." },
  aniversariantes: {
    title: "Aniversariantes",
    description: "Quem faz aniversário em cada mês: só o dia e o mês, sem ano nem idade.",
  },
  relatorios: { title: "Relatórios", description: "Indicadores do mês por tipo de ocorrência e por setor." },
  admissoes: {
    title: "Onboarding",
    description: "Admissões digitais: dados, documentos e termos assinados pelo candidato.",
  },
  acessos: { title: "Acessos", description: "Quem pode entrar no RHGroup e os pedidos de cadastro aguardando aprovação." },
};

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
  // Ficha aberta (aba Colaboradores) e o desligamento aguardando confirmação.
  const [profileId, setProfileId] = useState<string | null>(null);
  const [togglingEmployee, setTogglingEmployee] = useState<Employee | null>(null);
  // Aba Colaboradores: lista ou organograma, e a empresa com as áreas em edição.
  const [teamView, setTeamView] = useState<TeamView>("lista");
  const [areas, setAreas] = useState<CompanyArea[]>([]);
  const [areasCompany, setAreasCompany] = useState<ContractingCompanyInfo | null>(null);
  const [brandCompany, setBrandCompany] = useState<ContractingCompanyInfo | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [birthdays, setBirthdays] = useState<Birthday[]>([]);

  const [occurrenceModalOpen, setOccurrenceModalOpen] = useState(false);
  const [editingOccurrence, setEditingOccurrence] = useState<Occurrence | null>(null);
  const [occurrencePreselect, setOccurrencePreselect] = useState<Employee | null>(null);
  const [deletingOccurrence, setDeletingOccurrence] = useState<Occurrence | null>(null);

  const [admissions, setAdmissions] = useState<AdmissionInfo[] | null>(null);
  const [companies, setCompanies] = useState<ContractingCompanyInfo[]>([]);
  const [admissionSearch, setAdmissionSearch] = useState("");
  const [createSignal, setCreateSignal] = useState(0);

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

  const fetchAdmissions = useCallback(async () => {
    const res = await fetch("/api/admissions");
    if (sessionExpired(res) || !res.ok) return;
    setAdmissions(await res.json());
  }, []);

  // Setores = empresas com CNPJ no onboarding (nome curto).
  const fetchCompanies = useCallback(async () => {
    const res = await fetch("/api/frequencia/companies");
    if (sessionExpired(res) || !res.ok) return;
    setCompanies(await res.json());
  }, []);

  const fetchAreas = useCallback(async () => {
    const res = await fetch("/api/frequencia/areas");
    if (sessionExpired(res) || !res.ok) return;
    setAreas(await res.json());
  }, []);

  // Aniversariantes: só dia e mês de nascimento.
  const fetchBirthdays = useCallback(async () => {
    const res = await fetch("/api/employees/aniversarios");
    if (sessionExpired(res) || !res.ok) return;
    setBirthdays(await res.json());
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchEmployees(),
      fetchOccurrences(),
      fetchMe(),
      fetchAdmissions(),
      fetchCompanies(),
      fetchAreas(),
      fetchBirthdays(),
    ]).finally(() => setLoading(false));
    endOtherModuleSession("frequencia");
  }, [fetchEmployees, fetchOccurrences, fetchMe, fetchAdmissions, fetchCompanies, fetchAreas, fetchBirthdays]);

  // Onboardings: indicador do topo e contador de documentos para analisar na barra lateral.
  const onboardingSummary = useMemo(() => {
    if (!admissions) return null;
    const open = admissions.filter((a) => a.status === "em_andamento");
    const ready = open.filter((a) => {
      const p = admissionProgress(a.documents);
      const d = fieldsProgress(a.fields);
      return p.approved >= p.required && d.filled >= d.required && !!a.candidateName;
    }).length;
    const toReview = open.reduce((n, a) => n + admissionProgress(a.documents).inReview, 0);
    return { open: open.length, ready, toReview };
  }, [admissions]);

  // Aniversariantes de hoje (colaboradores ativos): contador na barra lateral.
  const birthdaysToday = useMemo(() => {
    const now = new Date();
    const active = new Set(employees.filter((e) => e.active).map((e) => e.id));
    return birthdays.filter((b) => active.has(b.employeeId) && isBirthdayOn(b, now)).length;
  }, [birthdays, employees]);

  const sections = useMemo<RhSection<AttendanceTabKey>[]>(() => {
    const list: RhSection<AttendanceTabKey>[] = [
      { key: "ocorrencias", label: "Ocorrências", icon: IconCalendarX },
      { key: "colaboradores", label: "Colaboradores", icon: IconUsers },
      { key: "aniversariantes", label: "Aniversariantes", icon: IconCake, badge: birthdaysToday },
      { key: "admissoes", label: "Onboarding", icon: IconUserPlus, badge: onboardingSummary?.toReview },
      { key: "relatorios", label: "Relatórios", icon: IconChart },
    ];
    if (me?.role === "admin") list.push({ key: "acessos", label: "Acessos", icon: IconKey, badge: me.pendingRequests });
    return list;
  }, [me, onboardingSummary, birthdaysToday]);

  const recentOccurrences = useMemo(
    () =>
      [...occurrences]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 4)
        .map((o) => ({
          id: o.id,
          type: OCCURRENCE_LABEL[o.type],
          who: o.employeeName,
          note: [
            o.employeeDepartment,
            o.type === "folga" ? (o.approvedBy ? `concedida por ${o.approvedBy}` : null) : o.justified ? "justificada" : "sem justificativa",
          ]
            .filter(Boolean)
            .join(" · "),
          when: formatDateBR(o.date).slice(0, 5),
        })),
    [occurrences]
  );

  const months = useMemo(() => availableMonths(occurrences), [occurrences]);
  const allPeriod = month === ALL_MONTHS;
  // Relatórios sempre olham para um mês específico.
  const reportMonth = allPeriod ? currentMonthKey() : month;
  const periodLabel = allPeriod ? "todo o período" : monthKeyLabel(month);

  // Só as empresas com CNPJ cadastrado no onboarding aparecem como setor.
  const departments = useMemo(() => companySectors(companies), [companies]);

  const areasBySector = useMemo(() => {
    const map = new Map<string, CompanyArea[]>();
    for (const c of companies) {
      const sector = sectorName(c);
      if (!c.cnpj || map.has(sector)) continue;
      map.set(
        sector,
        areas.filter((a) => a.companyId === c.id).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      );
    }
    return map;
  }, [companies, areas]);

  const areaNameById = useMemo(() => new Map(areas.map((a) => [a.id, a.name])), [areas]);

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
    const saveRecord = (id: string) =>
      requestJson(
        `/api/employees/${id}/cadastro`,
        { method: "PATCH", body: JSON.stringify(values.record) },
        "Não foi possível salvar a ficha cadastral."
      );
    try {
      // Na edição, a ficha cadastral vai primeiro: um CPF inválido segura o formulário aberto.
      if (isEdit && values.recordDirty) await saveRecord(editingEmployee!.id);
      const saved: Employee = await requestJson(
        isEdit ? `/api/employees/${editingEmployee!.id}` : "/api/employees",
        {
          method: isEdit ? "PATCH" : "POST",
          body: JSON.stringify({
            name: values.name.trim(),
            department: values.department.trim() || null,
            role: values.role.trim() || null,
            active: values.active,
            folgaAllowance: Number(values.folgaAllowance || 0),
            startDate: values.startDate || null,
            contractType: values.contractType || null,
            contractEnd: values.contractEnd || null,
            areaId: values.areaId || null,
            areaLead: values.areaLead,
          }),
        },
        "Não foi possível salvar o colaborador."
      );
      let recordFailure: string | null = null;
      if (!isEdit && values.recordDirty) {
        await saveRecord(saved.id).catch((err) => {
          recordFailure = err instanceof Error ? err.message : "erro inesperado.";
        });
      }
      // A foto vai como documento da ficha ("Foto para crachá"), depois do cadastro salvo.
      let photoFailure: string | null = null;
      if (values.photo) {
        const form = new FormData();
        form.append("name", PHOTO_DOCUMENT_NAME);
        form.append("file", values.photo);
        const res = await fetch(`/api/employees/${saved.id}/documents`, { method: "POST", body: form });
        if (!res.ok) photoFailure = (await res.json().catch(() => ({}))).error || "não foi possível enviar.";
      }
      // A data de nascimento e a foto podem ter mudado: atualiza os aniversariantes.
      await Promise.all([fetchEmployees(), isEdit ? fetchOccurrences() : null, fetchBirthdays()]);
      setEmployeeModalOpen(false);
      if (recordFailure) toast.error(`Colaborador cadastrado, mas a ficha cadastral não foi salva: ${recordFailure}`, { duration: 8000 });
      if (photoFailure) toast.error(`Cadastro salvo, mas a foto não foi enviada: ${photoFailure}`, { duration: 8000 });
      if (!recordFailure && !photoFailure) toast.success(isEdit ? "Colaborador atualizado." : "Colaborador cadastrado.");
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

  async function handleToggleActive() {
    const emp = togglingEmployee;
    if (!emp) return;
    try {
      await requestJson(
        `/api/employees/${emp.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            name: emp.name,
            department: emp.department,
            role: emp.role,
            active: !emp.active,
            folgaAllowance: emp.folgaAllowance,
          }),
        },
        "Não foi possível atualizar o colaborador."
      );
      await fetchEmployees();
      setTogglingEmployee(null);
      toast.success(emp.active ? `${emp.name} foi desligado(a). O histórico continua na ficha.` : `${emp.name} foi reativado(a).`);
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

  // Cada aba começa com a busca e o filtro de setor limpos.
  function changeTab(next: AttendanceTabKey) {
    setTab(next);
    setProfileId(null);
    setSearch("");
    setDepartment("");
  }

  // A ficha abre por cima da aba Colaboradores ou Aniversariantes; "Voltar" retorna a ela.
  const showingProfile = !!profileId && (tab === "colaboradores" || tab === "aniversariantes");
  const copy = SECTION_COPY[tab];
  const actions =
    tab === "admissoes" ? (
      <>
        <label className="flex h-10 items-center gap-2 rounded-[10px] border border-border bg-surface px-3 text-muted focus-within:border-accent">
          <IconSearch className="h-4 w-4 shrink-0" />
          <input
            type="search"
            value={admissionSearch}
            onChange={(e) => setAdmissionSearch(e.target.value)}
            placeholder="Buscar candidato, empresa ou cargo"
            aria-label="Buscar onboarding"
            className="w-56 bg-transparent text-[13px] text-ink placeholder:text-muted focus:outline-none"
          />
        </label>
        <Button onClick={() => setCreateSignal((n) => n + 1)} className="!h-10 !rounded-[10px] !px-4 !py-0 text-[13px]">
          <IconPlus className="h-4 w-4" />
          Novo onboarding
        </Button>
      </>
    ) : tab === "acessos" ? null : (
      <>
        {tab === "colaboradores" && me?.role === "admin" && (
          <Button variant="ghost" onClick={() => setImportOpen(true)} className="!h-10 !rounded-[10px] !px-4 !py-0 text-[13px]">
            <IconArrowUpTray className="h-4 w-4" />
            Importar planilha
          </Button>
        )}
        {/* Em destaque (branco), menos em Ocorrências, onde o destaque é registrar ocorrência. */}
        {tab !== "aniversariantes" && (
          <Button
            variant={tab === "ocorrencias" ? "ghost" : "primary"}
            onClick={openNewEmployee}
            className="!h-10 !rounded-[10px] !px-4 !py-0 text-[13px]"
          >
            <IconPlus className="h-4 w-4" />
            Novo colaborador
          </Button>
        )}
        {tab === "ocorrencias" && (
          <Button onClick={() => openNewOccurrence(null)} className="!h-10 !rounded-[10px] !px-4 !py-0 text-[13px]">
            <IconCalendarPlus className="h-4 w-4" />
            Registrar ocorrência
          </Button>
        )}
      </>
    );

  return (
    <>
      <RhShell
        sections={sections}
        active={tab}
        onChange={changeTab}
        user={me}
        onChangePassword={() => setChangingPassword(true)}
        onLogout={logout}
        title={copy.title}
        description={copy.description}
        actions={actions}
        hideHeader={showingProfile}
        busy={loading}
      >
        {!showingProfile && tab !== "aniversariantes" && (
          <AttendanceStats
            activeEmployees={employees.filter((e) => e.active && (!department || e.department === department)).length}
            totals={totals}
            periodLabel={periodLabel}
            onboardings={onboardingSummary}
          />
        )}

        {showingProfile && profileId ? (
          <EmployeeProfile
            employeeId={profileId}
            occurrences={occurrences}
            employees={employees}
            folgaRemaining={folgaRemaining.get(profileId) ?? 0}
            areaNameById={areaNameById}
            onBack={() => setProfileId(null)}
            backLabel={tab === "aniversariantes" ? "Aniversariantes" : "Colaboradores"}
            onEdit={(e) => {
              setEditingEmployee(e);
              setEmployeeModalOpen(true);
            }}
            onRegister={(e) => openNewOccurrence(e)}
            onToggleActive={setTogglingEmployee}
            onEditOccurrence={(o) => {
              setEditingOccurrence(o);
              setOccurrencePreselect(null);
              setOccurrenceModalOpen(true);
            }}
            onDeleteOccurrence={setDeletingOccurrence}
          />
        ) : tab === "acessos" && me?.role === "admin" ? (
          <AccessPanel currentUserId={me.id} onChanged={fetchMe} />
        ) : tab === "admissoes" ? (
          <AdmissionsPanel
            departments={departments}
            isAdmin={me?.role === "admin"}
            onEmployeesChanged={fetchEmployees}
            search={admissionSearch}
            createSignal={createSignal}
            onAdmissionsChange={setAdmissions}
            recentOccurrences={recentOccurrences}
            onSeeOccurrences={() => changeTab("ocorrencias")}
          />
        ) : (
          <div className="flex flex-col gap-4">
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
              teamView={teamView}
              onTeamViewChange={setTeamView}
              onExport={exportCsv}
              exportDisabled={filteredOccurrences.length === 0}
            />

            <div className="min-w-0">
              {loading ? (
                <div className="rounded-[14px] border border-border bg-surface">
                  <SkeletonRows />
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
              ) : tab === "colaboradores" && teamView === "organograma" ? (
                <OrgChart
                  employees={filteredEmployees}
                  companies={companies}
                  areas={areas}
                  occurrences={occurrences}
                  focus={department}
                  birthdays={birthdays}
                  onOpen={(e) => setProfileId(e.id)}
                  onManageAreas={setAreasCompany}
                  onBrand={setBrandCompany}
                />
              ) : tab === "aniversariantes" ? (
                <BirthdaysPanel
                  employees={filteredEmployees}
                  birthdays={birthdays}
                  companies={companies}
                  areaNameById={areaNameById}
                  onOpen={(e) => setProfileId(e.id)}
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
                  onOpen={(e) => setProfileId(e.id)}
                />
              ) : (
                <AttendanceReports occurrences={reportOccurrences} month={reportMonth} months={months} />
              )}
            </div>
          </div>
        )}
      </RhShell>

      <ChangeOwnPasswordModal open={changingPassword} onClose={() => setChangingPassword(false)} />

      <EmployeeModal
        open={employeeModalOpen}
        onClose={() => setEmployeeModalOpen(false)}
        onSubmit={handleEmployeeSubmit}
        employee={editingEmployee}
        existingDepartments={departments}
        areasBySector={areasBySector}
      />

      <EmployeeImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={async () => {
          await Promise.all([fetchEmployees(), fetchAreas(), fetchOccurrences(), fetchBirthdays()]);
        }}
      />

      <CompanyBrandModal
        key={brandCompany?.id ?? "nenhuma"}
        company={brandCompany}
        onClose={() => setBrandCompany(null)}
        onChanged={(updated) => {
          setCompanies((list) => list.map((c) => (c.id === updated.id ? updated : c)));
          setBrandCompany(updated);
        }}
      />

      <AreasModal
        company={areasCompany}
        areas={areas}
        employees={employees}
        onClose={() => setAreasCompany(null)}
        onChanged={async () => {
          await Promise.all([fetchAreas(), fetchEmployees()]);
        }}
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
        open={!!togglingEmployee}
        title={togglingEmployee?.active ? "Desligar colaborador" : "Reativar colaborador"}
        confirmLabel={togglingEmployee?.active ? "Desligar" : "Reativar"}
        message={
          <>
            {togglingEmployee?.active ? "Desligar" : "Reativar"} <strong>{togglingEmployee?.name}</strong>?
          </>
        }
        detail={
          togglingEmployee?.active
            ? "A pessoa sai da lista de ativos e não aparece mais ao registrar ocorrências. A ficha e o histórico continuam guardados."
            : "A pessoa volta para a lista de colaboradores ativos."
        }
        onClose={() => setTogglingEmployee(null)}
        onConfirm={handleToggleActive}
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
