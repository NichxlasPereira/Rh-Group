"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "../Button";
import { IconCalendarPlus, IconFile, IconPaperclip } from "../icons";
import { BrandArt, BrandDot } from "../brand";
import { DocumentStatusBadge } from "../admission/DocumentStatusBadge";
import { OccurrencesTable } from "./OccurrencesTable";
import { EmployeeDocuments, UploadedDocument } from "./EmployeeDocuments";
import { DocumentStatus } from "@/lib/admission";
import { Employee, Occurrence, formatFileSize, occurrenceDays } from "@/lib/attendance";
import { formatDateBR } from "@/lib/format";
import { DISPLAYABLE_IMAGE, isPhotoDocument } from "@/lib/employeeProfile";

interface FichaField {
  key: string;
  label: string;
  type: string;
  sensitive: boolean;
  value: string | null;
}

interface FichaDocument {
  id: string;
  kind: string;
  name: string;
  status: DocumentStatus;
  reviewedAt: string | null;
  reviewedBy: string | null;
  files: { id: string; fileName: string; mimeType: string; size: number; createdAt: string }[];
}

interface Ficha {
  employee: Employee;
  views: { viewedBy: string; createdAt: string }[];
  /** Enviados pelo RH direto na ficha (mais recentes primeiro). */
  documents: UploadedDocument[];
  admission: {
    id: string;
    status: string;
    startDate: string | null;
    createdAt: string;
    submittedAt: string | null;
    companyName: string | null;
    photoFileId: string | null;
    masked: boolean;
    fields: FichaField[];
    documents: FichaDocument[];
  } | null;
}

type ProfileTab = "resumo" | "documentos" | "ocorrencias" | "historico";

const DAY = 86_400_000;

/** Dias úteis (seg. a sex.) entre duas datas, inclusive. Não desconta feriados. */
function workdaysBetween(from: Date, to: Date): number {
  let count = 0;
  const day = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  while (day.getTime() <= end) {
    const weekday = day.getUTCDay();
    if (weekday !== 0 && weekday !== 6) count++;
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return count;
}

/** Dias de falta e atestado dentro do ano. */
function absentDaysInYear(occurrences: Occurrence[], year: number): number {
  let total = 0;
  for (const o of occurrences) {
    if (o.type === "folga" || !o.date.startsWith(String(year))) continue;
    total += o.type === "falta" ? 1 : occurrenceDays(o);
  }
  return total;
}

/** "1 ano e 3 meses", "11 meses", "20 dias". */
function tenure(start: string): string {
  const from = new Date(start);
  const now = new Date();
  let months = (now.getFullYear() - from.getFullYear()) * 12 + (now.getMonth() - from.getMonth());
  if (now.getDate() < from.getDate()) months--;
  if (months < 1) {
    const days = Math.max(0, Math.floor((now.getTime() - from.getTime()) / DAY));
    return `${days} dia${days === 1 ? "" : "s"}`;
  }
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts = [years ? `${years} ano${years === 1 ? "" : "s"}` : "", rest ? `${rest} ${rest === 1 ? "mês" : "meses"}` : ""];
  return parts.filter(Boolean).join(" e ");
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function ageFrom(birth: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth)) return null;
  const [y, m, d] = birth.split("-").map(Number);
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--;
  return age;
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

interface EmployeeProfileProps {
  employeeId: string;
  /** Todas as ocorrências (a ficha filtra as da pessoa e compara com a empresa). */
  occurrences: Occurrence[];
  employees: Employee[];
  folgaRemaining: number;
  /** Nome das áreas (organograma), para mostrar a da pessoa. */
  areaNameById: Map<string, string>;
  onBack: () => void;
  onEdit: (employee: Employee) => void;
  onRegister: (employee: Employee) => void;
  onToggleActive: (employee: Employee) => void;
  onEditOccurrence: (occurrence: Occurrence) => void;
  onDeleteOccurrence: (occurrence: Occurrence) => void;
}

/** Ficha do colaborador: cadastro, onboarding, documentos, ocorrências e contrato. */
export function EmployeeProfile({
  employeeId,
  occurrences,
  employees,
  folgaRemaining,
  areaNameById,
  onBack,
  onEdit,
  onRegister,
  onToggleActive,
  onEditOccurrence,
  onDeleteOccurrence,
}: EmployeeProfileProps) {
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [tab, setTab] = useState<ProfileTab>("resumo");
  const [revealing, setRevealing] = useState(false);

  const load = useCallback(
    async (full = false) => {
      const res = await fetch(`/api/employees/${employeeId}/ficha${full ? "?completo=1" : ""}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "Não foi possível abrir a ficha.");
        return;
      }
      setFicha(body);
    },
    [employeeId]
  );

  // Recarrega quando o cadastro muda (edição, desligamento).
  const listed = employees.find((e) => e.id === employeeId);
  const listedUpdatedAt = listed?.updatedAt ?? null;
  const entryDate = listed?.startDate ?? null;
  useEffect(() => {
    load();
  }, [load, listedUpdatedAt]);

  const mine = useMemo(
    () => occurrences.filter((o) => o.employeeId === employeeId).sort((a, b) => b.date.localeCompare(a.date)),
    [occurrences, employeeId]
  );

  const year = new Date().getFullYear();
  // Conta barata (as ocorrências de uma pessoa): calculada a cada render.
  const stats = (() => {
    const yearOccurrences = mine.filter((o) => o.date.startsWith(String(year)));
    const months = MONTHS.map((label, i) => {
      const inMonth = yearOccurrences.filter((o) => Number(o.date.slice(5, 7)) === i + 1);
      return {
        label,
        faltas: inMonth.filter((o) => o.type === "falta").length,
        atestados: inMonth.filter((o) => o.type === "atestado").length,
        folgas: inMonth.filter((o) => o.type === "folga").length,
      };
    });
    const peak = Math.max(1, ...months.map((m) => m.faltas + m.atestados + m.folgas));
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const today = new Date();
    const entry = entryDate ? new Date(entryDate) : null;
    const from = entry && entry > yearStart ? entry : yearStart;
    const workdays = workdaysBetween(from, today);
    const absent = absentDaysInYear(mine, year);
    const activeCount = employees.filter((e) => e.active).length || 1;
    const companyWorkdays = workdaysBetween(yearStart, today);
    const companyRate = (absentDaysInYear(occurrences, year) / (activeCount * companyWorkdays || 1)) * 100;
    return {
      months,
      peak,
      totals: {
        faltas: yearOccurrences.filter((o) => o.type === "falta").length,
        atestados: yearOccurrences.filter((o) => o.type === "atestado").length,
        diasAtestado: yearOccurrences.filter((o) => o.type === "atestado").reduce((n, o) => n + occurrenceDays(o), 0),
        folgas: yearOccurrences.filter((o) => o.type === "folga").length,
      },
      rate: workdays ? (absent / workdays) * 100 : 0,
      companyRate,
    };
  })();

  if (!ficha || !listed) {
    return (
      <div className="flex flex-col gap-4">
        <button type="button" onClick={onBack} className="self-start text-sm text-muted hover:text-ink">
          ← Colaboradores
        </button>
        <div className="rounded-[16px] border border-border bg-surface px-6 py-16 text-center text-sm text-muted">
          Carregando a ficha...
        </div>
      </div>
    );
  }

  const employee = listed;
  const admission = ficha.admission;
  const field = (key: string) => admission?.fields.find((f) => f.key === key)?.value ?? null;
  const birth = field("nascimento");
  const age = birth ? ageFrom(birth) : null;
  const companyName = admission?.companyName ?? null;
  const uploaded = ficha.documents;
  // Foto para crachá: a última enviada na ficha ou, sem ela, a do onboarding.
  const uploadedPhoto = uploaded.find((d) => isPhotoDocument(d.name) && DISPLAYABLE_IMAGE.test(d.mimeType));
  const photoKey = uploadedPhoto?.id ?? admission?.photoFileId ?? null;
  const photoUrl = photoKey ? `/api/employees/${employee.id}/photo?v=${photoKey}` : null;
  const setUploaded = (documents: UploadedDocument[]) => setFicha((f) => (f ? { ...f, documents } : f));
  const contractDaysLeft = employee.contractEnd
    ? Math.ceil((new Date(employee.contractEnd).getTime() - Date.now()) / DAY)
    : null;

  // Linha do tempo: onboarding, cadastro e ocorrências, do mais recente para o mais antigo.
  const events: { when: string; title: string; detail: string }[] = [
    ...mine.map((o) => ({
      when: o.date,
      title: o.type === "folga" ? "Folga concedida" : o.type === "atestado" ? "Atestado registrado" : "Falta registrada",
      detail: [
        `${formatDateBR(o.date)}${o.endDate !== o.date ? ` a ${formatDateBR(o.endDate)}` : ""}`,
        o.type === "falta" ? (o.justified ? "justificada" : "sem justificativa") : `${occurrenceDays(o)} dia(s)`,
        o.approvedBy ? `por ${o.approvedBy}` : "",
      ]
        .filter(Boolean)
        .join(" · "),
    })),
    ...uploaded.map((d) => ({
      when: d.createdAt,
      title: `${d.name} enviado na ficha`,
      detail: d.uploadedBy ? `por ${d.uploadedBy}` : "",
    })),
    ...(admission
      ? [
          { when: admission.createdAt, title: "Onboarding iniciado", detail: "Link enviado pelo RH" },
          ...(admission.submittedAt
            ? [{ when: admission.submittedAt, title: "Dados enviados", detail: "Pelo próprio candidato, no onboarding digital" }]
            : []),
          ...admission.documents
            .filter((d) => d.kind !== "upload" && d.status === "aprovado" && d.reviewedAt)
            .map((d) => ({ when: d.reviewedAt!, title: `${d.name} aprovado`, detail: d.reviewedBy ? `por ${d.reviewedBy}` : "" })),
        ]
      : []),
    {
      when: employee.createdAt,
      title: admission?.status === "concluida" ? "Admissão concluída" : "Cadastrado no RHGroup",
      detail: admission?.status === "concluida" ? "Onboarding digital concluído" : "Cadastro feito pelo RH",
    },
  ].sort((a, b) => b.when.localeCompare(a.when));

  async function revealData() {
    setRevealing(true);
    await load(true);
    setRevealing(false);
  }

  const tabs: { key: ProfileTab; label: string; count?: number }[] = [
    { key: "resumo", label: "Resumo" },
    { key: "documentos", label: "Documentos", count: (admission?.documents.length ?? 0) + uploaded.length },
    { key: "ocorrencias", label: "Ocorrências", count: mine.length },
    { key: "historico", label: "Histórico" },
  ];

  const ringLength = 2 * Math.PI * 40;
  const ringPct = employee.folgaAllowance ? Math.max(0, Math.min(1, folgaRemaining / employee.folgaAllowance)) : 0;

  return (
    <div className="flex flex-col gap-5">
      <button type="button" onClick={onBack} className="self-start text-sm text-muted hover:text-ink">
        ← Colaboradores
      </button>

      {/* Cabeçalho da ficha: faixa grafite do cartão, sempre no tema escuro. */}
      <header
        data-theme="dark"
        className="brand-band relative flex flex-wrap items-center justify-between gap-5 overflow-clip rounded-[18px] px-5 py-6 text-ink shadow-[0_18px_40px_-24px_rgba(0,0,0,0.6)] sm:px-7"
      >
        <BrandArt variant="band" className="pointer-events-none absolute right-0 top-0 hidden h-full w-[380px] text-white/[0.12] sm:block" />
        <div className="relative flex min-w-0 items-center gap-5">
          <div className="relative shrink-0">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt={`Foto para crachá de ${employee.name}`}
                className="h-[104px] w-[104px] rounded-[22px] border-[3px] border-white/85 object-cover"
              />
            ) : (
              <div
                role="img"
                aria-label={`Sem foto: iniciais de ${employee.name}`}
                className="flex h-[104px] w-[104px] items-center justify-center rounded-[22px] border-[3px] border-white/85 bg-gradient-to-b from-[#8a8c90] to-[#3a3b3f] font-display text-[38px] font-semibold text-white"
              >
                {initials(employee.name)}
              </div>
            )}
            <span
              aria-hidden="true"
              className={`absolute -bottom-1 -right-1 h-[22px] w-[22px] rounded-full border-[3px] border-[#4b4d51] ${employee.active ? "bg-ok" : "bg-[#8f9196]"}`}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <span className="font-display text-[11.5px] font-medium uppercase tracking-[0.2em] text-white/80">
              Colaborador{employee.department ? ` · ${employee.department}` : ""}
              {employee.areaId && areaNameById.has(employee.areaId)
                ? ` · ${areaNameById.get(employee.areaId)}${employee.areaLead ? " (responsável)" : ""}`
                : ""}
            </span>
            <h1 className="font-display text-[32px] font-semibold uppercase leading-none tracking-[0.02em] text-white sm:text-[38px]">
              {employee.name}
              <BrandDot className="ml-1 h-2.5 w-2.5 align-baseline" />
            </h1>
            <span className="text-sm text-white/90">
              {employee.role || "Cargo não informado"}
              {employee.startDate ? (
                <>
                  {" · na empresa há "}
                  <strong className="text-white">{tenure(employee.startDate)}</strong>
                </>
              ) : (
                " · entrada não informada"
              )}
            </span>
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${employee.active ? "bg-ok/20 text-[#9ff0c9]" : "bg-white/10 text-white/80"}`}
              >
                {employee.active ? "Ativo" : "Desligado"}
              </span>
              {(employee.contractType || companyName) && (
                <span className="rounded-full border border-white/25 bg-white/10 px-2.5 py-0.5 text-xs font-semibold text-white">
                  {[employee.contractType, companyName].filter(Boolean).join(" · ")}
                </span>
              )}
              {employee.startDate && (
                <span className="rounded-full border border-white/25 bg-white/10 px-2.5 py-0.5 text-xs font-semibold text-white">
                  Entrada {formatDateBR(employee.startDate)}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="relative flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onEdit(employee)}
            className="h-10 rounded-[10px] border border-white/35 px-3.5 text-[13px] font-semibold text-white transition hover:bg-white/10"
          >
            Editar ficha
          </button>
          <button
            type="button"
            onClick={() => onToggleActive(employee)}
            className="h-10 rounded-[10px] border border-white/35 px-3.5 text-[13px] font-semibold text-white transition hover:bg-white/10"
          >
            {employee.active ? "Desligar" : "Reativar"}
          </button>
          {employee.active && (
            <Button onClick={() => onRegister(employee)} className="!h-10 !rounded-[10px] !px-4 !py-0 text-[13px]">
              <IconCalendarPlus className="h-4 w-4" />
              Registrar ocorrência
            </Button>
          )}
        </div>
      </header>

      <nav aria-label="Seções da ficha" className="flex gap-6 overflow-x-auto border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-current={tab === t.key ? "page" : undefined}
            className={`-mb-px shrink-0 border-b-2 pb-3 text-sm transition ${
              tab === t.key ? "border-ink font-bold text-ink" : "border-transparent font-semibold text-muted hover:text-ink"
            }`}
          >
            {t.label}
            {t.count !== undefined && <span className="ml-1.5 font-medium text-muted">{t.count}</span>}
          </button>
        ))}
      </nav>

      {tab === "resumo" && (
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
            <Card title="Dados pessoais">
              {admission ? (
                <>
                  <div className="-mt-1 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted">Do onboarding digital.</p>
                    {admission.masked && admission.fields.some((f) => f.sensitive && f.value) && (
                      <button
                        type="button"
                        onClick={revealData}
                        disabled={revealing}
                        className="text-[12.5px] font-semibold text-muted underline-offset-2 transition hover:text-ink hover:underline"
                      >
                        {revealing ? "Abrindo..." : "Mostrar dados completos"}
                      </button>
                    )}
                  </div>
                  <dl className="grid grid-cols-1 gap-x-6 gap-y-3.5 sm:grid-cols-2">
                    {admission.fields
                      .filter((f) => f.value)
                      .map((f) => (
                        <div key={f.key} className="flex min-w-0 flex-col gap-0.5">
                          <dt className="text-[11.5px] font-semibold text-muted">{f.label.replace(/\s*\(.*\)$/, "")}</dt>
                          <dd className="break-words text-sm text-ink">
                            {f.type === "date" && f.value ? formatDateBR(f.value) : f.value}
                            {f.key === "nascimento" && age !== null ? ` · ${age} anos` : ""}
                          </dd>
                        </div>
                      ))}
                  </dl>
                  <p className="text-xs text-muted">
                    {admission.masked
                      ? "CPF, RG, telefone, chave Pix e endereço aparecem mascarados. Ver completos fica registrado com o seu nome (LGPD)."
                      : "Dados completos à vista: este acesso foi registrado com o seu nome."}
                    {ficha.views.length > 0 && (
                      <>
                        {" "}
                        Último acesso: {ficha.views[0].viewedBy} em {formatDateBR(ficha.views[0].createdAt)}.
                      </>
                    )}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted">
                  Este colaborador não passou pelo onboarding digital, então a ficha ainda não tem os dados pessoais.
                </p>
              )}
            </Card>

            <Card title={`Ocorrências em ${year}`}>
              <div className="-mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                <Legend color="bg-critical" label={`Faltas ${stats.totals.faltas}`} />
                <Legend
                  color="bg-warn"
                  label={`Atestados ${stats.totals.atestados}${stats.totals.diasAtestado ? ` (${stats.totals.diasAtestado} dias)` : ""}`}
                />
                <Legend color="bg-ok" label={`Folgas ${stats.totals.folgas}`} />
              </div>
              <div className="grid h-[120px] grid-cols-12 items-end gap-2 border-b border-border pb-1">
                {stats.months.map((m) => (
                  <div
                    key={m.label}
                    className="flex h-full flex-col-reverse gap-[2px]"
                    title={`${m.label}: ${m.faltas} falta(s), ${m.atestados} atestado(s), ${m.folgas} folga(s)`}
                  >
                    <span className="block rounded-[2px] bg-critical" style={{ height: `${(m.faltas / stats.peak) * 100}%` }} />
                    <span className="block rounded-[2px] bg-warn" style={{ height: `${(m.atestados / stats.peak) * 100}%` }} />
                    <span className="block rounded-[2px] bg-ok" style={{ height: `${(m.folgas / stats.peak) * 100}%` }} />
                  </div>
                ))}
              </div>
              <div className="-mt-2 grid grid-cols-12 gap-2">
                {stats.months.map((m) => (
                  <span key={m.label} className="text-center font-mono text-[11px] text-muted">
                    {m.label}
                  </span>
                ))}
              </div>
              <p className="text-[12.5px] text-muted">
                Absenteísmo no ano: <strong className="text-ink">{stats.rate.toFixed(1).replace(".", ",")}%</strong> dos dias
                úteis · média da empresa: {stats.companyRate.toFixed(1).replace(".", ",")}%
              </p>
            </Card>

            <Card title="Linha do tempo">
              <Timeline events={events.slice(0, 6)} />
              {events.length > 6 && (
                <button
                  type="button"
                  onClick={() => setTab("historico")}
                  className="self-start text-[12.5px] font-semibold text-muted underline-offset-2 hover:text-ink hover:underline"
                >
                  Ver histórico completo
                </button>
              )}
            </Card>
          </div>

          <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
            <section aria-label="Saldo de folgas" className="flex items-center gap-4 rounded-[16px] border border-border bg-surface p-5">
              <svg width="92" height="92" viewBox="0 0 100 100" role="img" aria-label={`${folgaRemaining} de ${employee.folgaAllowance} dias de folga disponíveis`}>
                <circle cx="50" cy="50" r="40" fill="none" stroke="var(--surface-2)" strokeWidth="10" />
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={`${ringLength * ringPct} ${ringLength}`}
                  transform="rotate(-90 50 50)"
                />
                <text x="50" y="57" textAnchor="middle" fill="var(--ink)" fontFamily="var(--font-barlow)" fontSize="24" fontWeight="600">
                  {folgaRemaining}/{employee.folgaAllowance}
                </text>
              </svg>
              <div className="flex flex-col gap-1">
                <h2 className="font-display text-[17px] font-semibold uppercase tracking-[0.06em] text-ink">Saldo de folgas</h2>
                <span className="text-sm text-ink">
                  <strong>{folgaRemaining} dia(s)</strong> disponível(is)
                </span>
                <span className="text-xs text-muted">{stats.totals.folgas} folga(s) em {year}</span>
              </div>
            </section>

            <Card
              title="Contrato"
              badge={
                contractDaysLeft === null ? null : contractDaysLeft < 0 ? (
                  <span className="rounded-full bg-critical-soft px-2.5 py-0.5 text-[11.5px] font-bold text-critical">Vencido</span>
                ) : contractDaysLeft <= 30 ? (
                  <span className="rounded-full bg-warn-soft px-2.5 py-0.5 text-[11.5px] font-bold text-warn">
                    Renova em {contractDaysLeft} dia(s)
                  </span>
                ) : null
              }
            >
              <dl className="flex flex-col gap-2.5">
                <Row label="Tipo" value={employee.contractType === "PJ" ? "Prestação de serviços (PJ)" : employee.contractType || "Não informado"} />
                <Row label="Contratante" value={companyName ?? "—"} />
                <Row label="Entrada" value={employee.startDate ? formatDateBR(employee.startDate) : "Não informada"} />
                <Row label="Vigência até" value={employee.contractEnd ? formatDateBR(employee.contractEnd) : "Sem data"} />
              </dl>
              <button
                type="button"
                onClick={() => onEdit(employee)}
                className="h-10 rounded-[10px] border border-border-strong text-[13px] font-bold text-ink transition hover:bg-surface-2"
              >
                Editar contrato
              </button>
            </Card>

            <Card
              title="Documentos"
              action={{ label: admission || uploaded.length ? "Ver todos" : "Enviar", onClick: () => setTab("documentos") }}
            >
              {uploaded.length > 0 && (
                <ul className="flex flex-col gap-1.5">
                  {uploaded.slice(0, 5).map((d) => (
                    <li key={d.id} className="flex items-center gap-2.5 text-[13px] font-semibold text-ink">
                      <IconFile className="h-4 w-4 shrink-0 text-muted" />
                      <span className="truncate">{d.name}</span>
                    </li>
                  ))}
                </ul>
              )}
              {admission ? (
                <DocumentList documents={admission.documents.slice(0, 5)} compact />
              ) : (
                uploaded.length === 0 && (
                  <p className="text-sm text-muted">
                    Sem documentos ainda. Quem entrou antes do onboarding digital pode ter os documentos enviados
                    aqui pelo RH.
                  </p>
                )
              )}
            </Card>
          </div>
        </div>
      )}

      {tab === "documentos" && (
        <div className="flex flex-col gap-4">
          <Card title="Documentos enviados pelo RH">
            <EmployeeDocuments employeeId={employee.id} documents={uploaded} onChange={setUploaded} />
          </Card>
          <Card title="Documentos do onboarding">
            {admission ? (
              <DocumentList documents={admission.documents} />
            ) : (
              <p className="text-sm text-muted">Este colaborador não passou pelo onboarding digital.</p>
            )}
          </Card>
        </div>
      )}

      {tab === "ocorrencias" && (
        <OccurrencesTable occurrences={mine} hasAny={mine.length > 0} onEdit={onEditOccurrence} onDelete={onDeleteOccurrence} />
      )}

      {tab === "historico" && (
        <Card title="Histórico">
          <Timeline events={events} />
        </Card>
      )}
    </div>
  );
}

function Card({
  title,
  badge,
  action,
  children,
}: {
  title: string;
  badge?: React.ReactNode;
  action?: { label: string; onClick: () => void };
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-3.5 rounded-[16px] border border-border bg-surface p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-[17px] font-semibold uppercase tracking-[0.06em] text-ink">{title}</h2>
        {badge}
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="text-[12.5px] font-bold text-accent-strong underline-offset-2 hover:underline"
          >
            {action.label}
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-[2px] ${color}`} aria-hidden="true" />
      {label}
    </span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-[13px]">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-semibold text-ink">{value}</dd>
    </div>
  );
}

function Timeline({ events }: { events: { when: string; title: string; detail: string }[] }) {
  return (
    <ol className="flex flex-col">
      {events.map((e, i) => (
        <li key={`${e.when}-${i}`} className="grid grid-cols-[76px_14px_minmax(0,1fr)] items-baseline gap-3 py-1.5">
          <span className="text-right font-mono text-xs text-muted">{formatDateBR(e.when)}</span>
          <span className="h-2 w-2 translate-y-[1px] rounded-full bg-border-strong" aria-hidden="true" />
          <span className="flex flex-col leading-snug">
            <span className="text-[13.5px] font-semibold text-ink">{e.title}</span>
            {e.detail && <span className="text-xs text-muted">{e.detail}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

function DocumentList({ documents, compact = false }: { documents: FichaDocument[]; compact?: boolean }) {
  return (
    <ul className="flex flex-col">
      {documents.map((d) => (
        <li key={d.id} className="flex flex-col gap-2 border-t border-border py-2.5 first:border-t-0 first:pt-0">
          <div className="flex items-center gap-2.5">
            <IconFile className="h-4 w-4 shrink-0 text-muted" />
            <span className="flex min-w-0 flex-1 flex-col leading-snug">
              <span className="text-[13px] font-semibold text-ink">{d.name}</span>
              {d.reviewedAt && d.status === "aprovado" && (
                <span className="text-[11.5px] text-muted">
                  Aprovado em {formatDateBR(d.reviewedAt)}
                  {d.reviewedBy ? ` por ${d.reviewedBy}` : ""}
                </span>
              )}
            </span>
            <DocumentStatusBadge status={d.status} />
          </div>
          {!compact && d.files.length > 0 && (
            <div className="flex flex-wrap gap-2 pl-6">
              {d.files.map((f) => (
                <a
                  key={f.id}
                  href={`/api/admission-files/${f.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex max-w-[16rem] items-center gap-1.5 rounded-[8px] bg-surface-2 px-3 py-1.5 text-xs text-ink hover:underline"
                >
                  <IconPaperclip className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{f.fileName}</span>
                  <span className="shrink-0 text-muted">{formatFileSize(f.size)}</span>
                </a>
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
