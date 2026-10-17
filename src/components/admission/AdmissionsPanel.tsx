"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "../Button";
import { Modal } from "../Modal";
import { IconCheckCircle, IconFile, IconLink, IconPaperclip, IconPlus, IconTrash, IconUsers } from "../icons";
import { EmptyState, Field, inputClass } from "../attendance/formControls";
import {
  ADMISSION_STATUS_LABEL,
  AdmissionDocumentInfo,
  AdmissionInfo,
  AdmissionStatus,
  AdmissionFieldInfo,
  ContractingCompanyInfo,
  DEFAULT_FIELDS,
  admissionProgress,
  isGeneratedDocument,
  fieldsProgress,
} from "@/lib/admission";
import { formatFileSize } from "@/lib/attendance";
import { formatDateBR } from "@/lib/format";
import { DocumentStatusBadge } from "./DocumentStatusBadge";
import { TermsSettingsModal, companyIncomplete } from "./TermsSettingsModal";

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    window.location.replace("/frequencia/entrar");
    throw new Error("Sessão expirada.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Não foi possível concluir.");
  return data;
}

/** Antes de o candidato preencher, o onboarding ainda não tem nome. */
const displayName = (a: Pick<AdmissionInfo, "candidateName">) => a.candidateName ?? "Aguardando o candidato";

const errorToast = (err: unknown) => toast.error(err instanceof Error ? err.message : "Erro inesperado.");

const STATUS_STYLE: Record<AdmissionStatus, string> = {
  em_andamento: "bg-accent-soft text-accent-strong",
  concluida: "bg-ok-soft text-ok",
  cancelada: "border border-border-strong text-muted",
};

interface AdmissionsPanelProps {
  departments: string[];
  /** Administradores cadastram as empresas e editam o texto dos termos. */
  isAdmin: boolean;
  /** Concluir cria um colaborador: a página recarrega a lista dela. */
  onEmployeesChanged: () => void;
  /** Busca do cabeçalho da página (nome, empresa ou cargo). */
  search: string;
  /** Cada vez que muda, cria um onboarding (botão "Novo onboarding" do cabeçalho). */
  createSignal: number;
  /** Lista atualizada: a página usa nos indicadores e no contador da barra lateral. */
  onAdmissionsChange?: (admissions: AdmissionInfo[]) => void;
  /** Últimas ocorrências, mostradas ao lado da lista. */
  recentOccurrences: { id: string; type: string; who: string; note: string; when: string }[];
  onSeeOccurrences: () => void;
}

type Tone = "ok" | "warn" | "accent" | "muted";

const TONE_PILL: Record<Tone, string> = {
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  accent: "bg-accent-soft text-accent-strong",
  muted: "border border-border-strong text-muted",
};
const TONE_DOT: Record<Tone, string> = { ok: "bg-ok", warn: "bg-warn", accent: "bg-accent", muted: "bg-border-strong" };

/** Pode concluir: dados obrigatórios preenchidos e documentos obrigatórios aprovados. */
function readyToConclude(a: AdmissionInfo): boolean {
  const p = admissionProgress(a.documents);
  const d = fieldsProgress(a.fields);
  return a.status === "em_andamento" && p.approved >= p.required && d.filled >= d.required && !!a.candidateName;
}

/** Situação resumida de um onboarding, para a lista. */
function admissionSituation(a: AdmissionInfo): { label: string; tone: Tone } {
  if (a.status === "concluida") return { label: "Concluído", tone: "ok" };
  if (a.status === "cancelada") return { label: "Cancelado", tone: "muted" };
  const p = admissionProgress(a.documents);
  const d = fieldsProgress(a.fields);
  if (readyToConclude(a)) return { label: "Pronto para concluir", tone: "ok" };
  if (p.inReview > 0) return { label: "Para analisar", tone: "warn" };
  if (p.refused > 0) return { label: "Aguardando reenvio", tone: "warn" };
  if (d.filled === 0 && a.documents.every((doc) => doc.files.length === 0)) return { label: "Link enviado", tone: "accent" };
  return { label: "Preenchendo", tone: "accent" };
}

/** Situação dos termos gerados (acordo, uso de imagem). */
function termsSituation(a: AdmissionInfo): { label: string; tone: Tone } {
  const terms = a.documents.filter((d) => isGeneratedDocument(d.kind));
  if (terms.length === 0) return { label: "Sem termos", tone: "muted" };
  if (terms.every((d) => d.status === "aprovado")) return { label: "Aprovados", tone: "ok" };
  if (terms.every((d) => d.status === "enviado" || d.status === "aprovado")) return { label: "Assinados", tone: "ok" };
  if (terms.some((d) => d.status === "recusado")) return { label: "Para reenviar", tone: "warn" };
  return { label: "Com o candidato", tone: "warn" };
}

function initialsOf(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

const DAY = 86_400_000;

/** Aba "onboarding": admissão 100% digital, do envio dos documentos à aprovação. */
export function AdmissionsPanel({
  departments,
  isAdmin,
  onEmployeesChanged,
  search,
  createSignal,
  onAdmissionsChange,
  recentOccurrences,
  onSeeOccurrences,
}: AdmissionsPanelProps) {
  const [companies, setCompanies] = useState<ContractingCompanyInfo[]>([]);
  const [termsSettings, setTermsSettings] = useState(false);
  const [choosingCompany, setChoosingCompany] = useState(false);
  const [admissions, setAdmissions] = useState<AdmissionInfo[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [link, setLink] = useState<{ url: string; admission: AdmissionInfo } | null>(null);
  // Abre mostrando todos: um filtro escondido fazia onboardings concluídos "sumirem".
  const [statusFilter, setStatusFilter] = useState<AdmissionStatus | "">("");

  const load = useCallback(async () => {
    try {
      const list: AdmissionInfo[] = await send("/api/admissions", "GET");
      setAdmissions(list);
      onAdmissionsChange?.(list);
    } catch (err) {
      errorToast(err);
    }
  }, [onAdmissionsChange]);

  const loadCompanies = useCallback(async () => {
    try {
      setCompanies(await send("/api/frequencia/companies", "GET"));
    } catch (err) {
      errorToast(err);
    }
  }, []);

  useEffect(() => {
    load();
    loadCompanies();
  }, [load, loadCompanies]);

  const companyName = useCallback(
    (id: string | null) => companies.find((c) => c.id === id)?.name ?? "—",
    [companies]
  );
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (admissions ?? []).filter(
      (a) =>
        (!statusFilter || a.status === statusFilter) &&
        (!term ||
          [a.candidateName, a.role, a.department, companyName(a.contractingCompanyId)]
            .filter(Boolean)
            .some((v) => v!.toLowerCase().includes(term)))
    );
  }, [admissions, statusFilter, search, companyName]);
  const selected = admissions?.find((a) => a.id === selectedId) ?? null;
  const count = (status: AdmissionStatus) => (admissions ?? []).filter((a) => a.status === status).length;

  // Pendências do RH, a partir dos onboardings em andamento.
  const todo = useMemo(() => {
    const open = (admissions ?? []).filter((a) => a.status === "em_andamento");
    const items: { key: string; icon: (p: { className?: string }) => React.ReactNode; title: string; detail: string; action: string; target: string }[] = [];
    const toReview = open.filter((a) => admissionProgress(a.documents).inReview > 0);
    if (toReview.length) {
      const docs = toReview.reduce((n, a) => n + admissionProgress(a.documents).inReview, 0);
      items.push({
        key: "analisar",
        icon: IconFile,
        title: docs === 1 ? "1 documento para analisar" : `${docs} documentos para analisar`,
        detail: toReview.map((a) => displayName(a)).slice(0, 2).join(", ") + (toReview.length > 2 ? ` e mais ${toReview.length - 2}` : ""),
        action: "Analisar",
        target: toReview[0].id,
      });
    }
    const ready = open.filter(readyToConclude);
    if (ready.length) {
      items.push({
        key: "concluir",
        icon: IconCheckCircle,
        title: ready.length === 1 ? "1 onboarding pronto para concluir" : `${ready.length} onboardings prontos para concluir`,
        detail: ready.map((a) => displayName(a)).slice(0, 2).join(", "),
        action: "Concluir",
        target: ready[0].id,
      });
    }
    const expiring = open.filter((a) => {
      const left = new Date(a.tokenExpiresAt).getTime() - Date.now();
      return left < 5 * DAY;
    });
    for (const a of expiring.slice(0, 2)) {
      const days = Math.max(0, Math.ceil((new Date(a.tokenExpiresAt).getTime() - Date.now()) / DAY));
      items.push({
        key: `link-${a.id}`,
        icon: IconLink,
        title: days === 0 ? "Link do candidato expirado" : `Link expira em ${days} dia(s)`,
        detail: displayName(a),
        action: "Gerar novo",
        target: a.id,
      });
    }
    return items;
  }, [admissions]);

  // O botão "Novo onboarding" fica no cabeçalho da página.
  const lastSignal = useRef(createSignal);
  useEffect(() => {
    if (createSignal === lastSignal.current) return;
    lastSignal.current = createSignal;
    setSelectedId(null);
    create();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createSignal]);

  // Um clique: cria com os dados e documentos padrão e já mostra o link. Com
  // mais de uma empresa, antes pergunta com qual serão os termos (confidencialidade e imagem).
  async function create(contractingCompanyId?: string) {
    if (contractingCompanyId === undefined && companies.length > 1) {
      setChoosingCompany(true);
      return;
    }
    setChoosingCompany(false);
    setCreating(true);
    try {
      const result = await send("/api/admissions", "POST", contractingCompanyId === undefined ? {} : { contractingCompanyId });
      await load();
      setLink({ url: result.link, admission: result.admission });
    } catch (err) {
      errorToast(err);
    } finally {
      setCreating(false);
    }
  }

  if (selected) {
    return (
      <AdmissionDetail
        admission={selected}
        departments={departments}
        companies={companies}
        onBack={() => setSelectedId(null)}
        onChanged={load}
        onShowLink={(url) => setLink({ url, admission: selected })}
        onEmployeesChanged={onEmployeesChanged}
        linkModal={link && <LinkModal link={link} onClose={() => setLink(null)} />}
      />
    );
  }

  const filters: { value: AdmissionStatus | ""; label: string; n: number }[] = [
    { value: "", label: "Todos", n: admissions?.length ?? 0 },
    { value: "em_andamento", label: "Em andamento", n: count("em_andamento") },
    { value: "concluida", label: "Concluídos", n: count("concluida") },
    { value: "cancelada", label: "Cancelados", n: count("cancelada") },
  ];

  return (
    <div className="flex flex-wrap items-start gap-4">
      <section aria-label="Onboardings" className="min-w-0 flex-[999_1_640px] overflow-hidden rounded-[16px] border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por situação">
            {filters.map((f) => (
              <button
                key={f.value || "todos"}
                type="button"
                onClick={() => setStatusFilter(f.value)}
                aria-pressed={statusFilter === f.value}
                className={`rounded-full px-3 py-1.5 text-[12.5px] transition ${
                  statusFilter === f.value
                    ? "bg-ink font-bold text-bg"
                    : "border border-border-strong font-semibold text-muted hover:text-ink"
                }`}
              >
                {f.label} · <span className="tabular-nums">{f.n}</span>
              </button>
            ))}
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setTermsSettings(true)}
              className="text-xs font-semibold text-muted underline-offset-2 transition hover:text-ink hover:underline"
            >
              Empresas e termos
            </button>
          )}
        </div>

        {admissions === null ? (
          <p className="px-6 py-16 text-center text-sm text-muted">Carregando...</p>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<IconUsers className="h-6 w-6" />}
            title={admissions.length === 0 ? "Nenhum onboarding ainda" : "Nenhum onboarding encontrado"}
            text={
              admissions.length === 0
                ? "Clique em “Novo onboarding” para gerar o link do candidato."
                : "Troque o filtro ou a busca para ver os outros."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[780px]">
              <div className="grid grid-cols-[2.1fr_1.5fr_1.6fr_1.3fr_0.8fr_1.2fr] gap-3 border-b border-border px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                <span>Candidato</span>
                <span>Empresa</span>
                <span>Progresso</span>
                <span>Termos</span>
                <span>Início</span>
                <span>Situação</span>
              </div>
              <ul>
                {visible.map((a) => {
                  const p = admissionProgress(a.documents);
                  const d = fieldsProgress(a.fields);
                  const sent = p.approved + p.inReview;
                  const situation = admissionSituation(a);
                  const terms = termsSituation(a);
                  return (
                    <li key={a.id} className="border-b border-border last:border-0">
                      <button
                        type="button"
                        onClick={() => setSelectedId(a.id)}
                        className="grid w-full grid-cols-[2.1fr_1.5fr_1.6fr_1.3fr_0.8fr_1.2fr] items-center gap-3 px-4 py-3.5 text-left transition hover:bg-surface-2/50"
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-extrabold text-accent-strong">
                            {initialsOf(a.candidateName)}
                          </span>
                          <span className="flex min-w-0 flex-col leading-snug">
                            <span className={`truncate font-bold ${a.candidateName ? "text-ink" : "italic text-muted"}`}>
                              {a.candidateName ?? "Novo candidato"}
                            </span>
                            <span className="truncate text-xs text-muted">{a.role || "Cargo não informado"}</span>
                          </span>
                        </span>
                        <span className="text-[12.5px] leading-snug text-ink/80">{companyName(a.contractingCompanyId)}</span>
                        <span className="flex flex-col gap-1.5 text-[11.5px] text-muted">
                          <ProgressLine label="Dados" value={d.filled} total={d.required} barClass="bg-accent" />
                          <ProgressLine label="Docs" value={sent} total={p.required} barClass="bg-ok" />
                        </span>
                        <span className="flex items-center gap-2 text-[12.5px] text-ink/80">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${TONE_DOT[terms.tone]}`} aria-hidden="true" />
                          {terms.label}
                        </span>
                        <span className="font-mono text-xs text-ink/80">
                          {a.startDate ? formatDateBR(a.startDate).slice(0, 5) : "—"}
                        </span>
                        <span>
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${TONE_PILL[situation.tone]}`}>
                            {situation.label}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}
      </section>

      <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
        <section aria-label="Pendências" className="flex flex-col gap-3 rounded-[16px] border border-border bg-surface p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-[17px] font-bold text-ink">Pendências</h2>
            <span className="text-xs text-muted">{todo.length === 0 ? "nada agora" : `${todo.length} ${todo.length === 1 ? "item" : "itens"}`}</span>
          </div>
          {todo.length === 0 ? (
            <p className="rounded-[12px] bg-surface-2 px-3 py-4 text-center text-sm text-muted">Tudo em dia por aqui.</p>
          ) : (
            todo.map((t) => (
              <div key={t.key} className="flex items-start gap-3 rounded-[12px] bg-surface-2 p-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-warn-soft text-warn">
                  <t.icon className="h-4 w-4" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5 leading-snug">
                  <span className="text-[13px] font-bold text-ink">{t.title}</span>
                  <span className="truncate text-xs text-muted">{t.detail}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedId(t.target)}
                  className="whitespace-nowrap text-[12.5px] font-bold text-accent-strong underline-offset-2 hover:underline"
                >
                  {t.action}
                </button>
              </div>
            ))
          )}
        </section>

        <section aria-label="Ocorrências recentes" className="flex flex-col rounded-[16px] border border-border bg-surface p-4">
          <div className="flex items-baseline justify-between pb-2">
            <h2 className="font-display text-[17px] font-bold text-ink">Ocorrências recentes</h2>
            <button
              type="button"
              onClick={onSeeOccurrences}
              className="text-[12.5px] font-bold text-accent-strong underline-offset-2 hover:underline"
            >
              Ver todas
            </button>
          </div>
          {recentOccurrences.length === 0 ? (
            <p className="py-3 text-sm text-muted">Nenhuma ocorrência registrada.</p>
          ) : (
            recentOccurrences.map((o) => (
              <div key={o.id} className="flex items-center gap-2.5 border-t border-border py-2.5">
                <span className="w-[74px] shrink-0 rounded-[6px] bg-surface-2 py-0.5 text-center text-[11.5px] font-bold text-ink/80">
                  {o.type}
                </span>
                <span className="flex min-w-0 flex-1 flex-col leading-snug">
                  <span className="truncate text-[13px] font-semibold text-ink">{o.who}</span>
                  <span className="truncate text-[11.5px] text-muted">{o.note}</span>
                </span>
                <span className="font-mono text-[11.5px] text-muted">{o.when}</span>
              </div>
            ))
          )}
        </section>
      </div>

      {link && <LinkModal link={link} onClose={() => setLink(null)} />}
      <CompanyChoiceModal
        open={choosingCompany}
        companies={companies}
        busy={creating}
        onClose={() => setChoosingCompany(false)}
        onConfirm={(companyId) => create(companyId)}
      />
      {isAdmin && (
        <TermsSettingsModal
          open={termsSettings}
          onClose={() => setTermsSettings(false)}
          companies={companies}
          onCompaniesChanged={async () => {
            await loadCompanies();
            await load();
          }}
        />
      )}
    </div>
  );
}

function AdmissionDetail({
  admission,
  departments,
  companies,
  onBack,
  onChanged,
  onShowLink,
  onEmployeesChanged,
  linkModal,
}: {
  admission: AdmissionInfo;
  departments: string[];
  companies: ContractingCompanyInfo[];
  onBack: () => void;
  onChanged: () => Promise<void>;
  onShowLink: (url: string) => void;
  onEmployeesChanged: () => void;
  linkModal: React.ReactNode;
}) {
  const [refusing, setRefusing] = useState<AdmissionDocumentInfo | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newDoc, setNewDoc] = useState("");
  const p = admissionProgress(admission.documents);
  const d = fieldsProgress(admission.fields);
  const ready = p.approved >= p.required && d.filled >= d.required && !!admission.candidateName;
  const open = admission.status === "em_andamento";
  const base = `/api/admissions/${admission.id}`;

  async function act(fn: () => Promise<unknown>, message: string) {
    try {
      await fn();
      await onChanged();
      toast.success(message);
    } catch (err) {
      errorToast(err);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onBack} className="self-start text-sm text-muted hover:text-ink">
        ← Todos os onboardings
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4 rounded-[14px] border border-border bg-surface p-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className={`font-display text-2xl font-bold ${admission.candidateName ? "text-ink" : "italic text-muted"}`}>
              {displayName(admission)}
            </h2>
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[admission.status]}`}>
              {ADMISSION_STATUS_LABEL[admission.status]}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">
            {[admission.role, admission.department].filter(Boolean).join(" · ") || "Cargo não informado"}
            {admission.startDate && ` · início previsto ${formatDateBR(admission.startDate)}`}
          </p>
          <p className="text-xs text-muted">
            {[admission.email, admission.phone].filter(Boolean).join(" · ")}
            {admission.createdBy && ` · criado por ${admission.createdBy} em ${formatDateBR(admission.createdAt)}`}
          </p>
          <p className="mt-3 text-sm text-ink">
            Dados: <strong className="font-mono">{d.filled}</strong> de <strong className="font-mono">{d.required}</strong>{" "}
            obrigatórios preenchidos
          </p>
          <p className="text-sm text-ink">
            Documentos: <strong className="font-mono">{p.approved}</strong> de <strong className="font-mono">{p.required}</strong>{" "}
            obrigatórios aprovados
            {p.inReview > 0 && <span className="text-warn"> · {p.inReview} para analisar</span>}
            {p.refused > 0 && <span className="text-critical"> · {p.refused} recusado(s)</span>}
            {p.missing > 0 && <span className="text-muted"> · {p.missing} não enviado(s)</span>}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {open && (
            <>
              <Button
                variant="ghost"
                className="!px-4 !py-2 text-xs"
                onClick={async () => {
                  try {
                    const r = await send(`${base}/link`, "POST");
                    onShowLink(r.link);
                    await onChanged();
                  } catch (err) {
                    errorToast(err);
                  }
                }}
              >
                Gerar link do candidato
              </Button>
              <Button
                className="!px-4 !py-2 text-xs"
                disabled={!ready}
                title={ready ? undefined : "O candidato precisa preencher os dados e você aprovar os documentos obrigatórios"}
                onClick={() =>
                  act(async () => {
                    await send(base, "PATCH", { action: "concluir" });
                    onEmployeesChanged();
                  }, `${displayName(admission)} agora é colaborador ativo.`)
                }
              >
                Concluir onboarding
              </Button>
            </>
          )}
          {admission.status !== "concluida" && (
            <Button
              variant="ghost"
              className="!px-4 !py-2 text-xs"
              onClick={() =>
                act(
                  () => send(base, "PATCH", { action: open ? "cancelar" : "reabrir" }),
                  open ? "Onboarding cancelado." : "Onboarding reaberto."
                )
              }
            >
              {open ? "Cancelar onboarding" : "Reabrir"}
            </Button>
          )}
          {admission.documents.some((doc) => doc.files.length > 0) && (
            <a
              href={`${base}/zip`}
              className="inline-flex items-center gap-2 rounded-full border border-border-strong px-4 py-2 text-xs font-semibold text-ink transition hover:bg-ink hover:text-bg"
            >
              Baixar documentos (.zip)
            </a>
          )}
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            title="Excluir onboarding e documentos"
            className="rounded-[8px] p-2 text-muted transition hover:bg-surface-2 hover:text-critical"
          >
            <IconTrash className="h-4 w-4" />
          </button>
        </div>
      </div>

      <CandidateDataCard
        fields={admission.fields}
        editable={open}
        onAdd={(body) => act(() => send(`${base}/fields`, "POST", body), "Dado incluído. O candidato já vê no link dele.")}
        onToggle={(f) =>
          act(
            () => send(`${base}/fields/${f.id}`, "PATCH", { required: !f.required }),
            f.required ? "Agora é opcional." : "Agora é obrigatório."
          )
        }
        onRemove={(f) => act(() => send(`${base}/fields/${f.id}`, "DELETE"), "Dado retirado do pedido.")}
      />

      <InternalInfoCard
        admission={admission}
        departments={departments}
        editable={admission.status !== "concluida"}
        onSave={(body) => act(() => send(base, "PATCH", body), "Dados internos salvos.")}
      />

      <h3 className="mt-2 font-display text-lg font-semibold text-ink">Documentos</h3>
      <NdaCompanyCard
        admission={admission}
        companies={companies}
        editable={open}
        onChange={(contractingCompanyId) =>
          act(
            () => send(base, "PATCH", { action: "empresa", contractingCompanyId }),
            contractingCompanyId
              ? "Empresa definida. O candidato já vê os termos no link dele."
              : "Termos retirados deste onboarding."
          )
        }
      />
      <ul className="flex flex-col gap-3">
        {admission.documents.map((doc) => (
          <li key={doc.id} className="rounded-[14px] border border-border bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-ink">
                  {doc.name}
                  {!doc.required && <span className="ml-1.5 text-xs font-normal text-muted">(opcional)</span>}
                </p>
                {doc.description && <p className="text-xs text-muted">{doc.description}</p>}
                {doc.reviewedBy && doc.reviewedAt && doc.status !== "enviado" && (
                  <p className="text-xs text-muted">
                    {doc.status === "aprovado" ? "Aprovado" : "Recusado"} por {doc.reviewedBy} em{" "}
                    {formatDateBR(doc.reviewedAt)}
                  </p>
                )}
              </div>
              <DocumentStatusBadge status={doc.status} />
            </div>

            {isGeneratedDocument(doc.kind) && doc.files.length > 0 && doc.status === "enviado" && (
              <p className="mt-2 text-xs text-muted">
                Antes de aprovar, confira a assinatura gov.br do PDF em{" "}
                <a
                  href="https://validar.iti.gov.br"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-accent-strong underline"
                >
                  validar.iti.gov.br
                </a>
                .
              </p>
            )}

            {doc.status === "recusado" && doc.reviewNote && (
              <p className="mt-2 rounded-[10px] bg-critical-soft px-3 py-2 text-sm text-ink">Motivo: {doc.reviewNote}</p>
            )}

            {doc.files.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-2">
                {doc.files.map((f) => (
                  <li key={f.id}>
                    <a
                      href={`/api/admission-files/${f.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex max-w-[16rem] items-center gap-1.5 rounded-[8px] bg-surface-2 px-3 py-1.5 text-xs text-accent-strong hover:underline"
                    >
                      <IconPaperclip className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{f.fileName}</span>
                      <span className="shrink-0 text-muted">{formatFileSize(f.size)}</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-muted">O candidato ainda não enviou este documento.</p>
            )}

            {open && (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                {doc.files.length > 0 && doc.status !== "aprovado" && (
                  <Button
                    className="!px-3 !py-1.5 text-xs"
                    onClick={() => act(() => send(`${base}/documents/${doc.id}`, "PATCH", { status: "aprovado" }), "Documento aprovado.")}
                  >
                    Aprovar
                  </Button>
                )}
                {doc.files.length > 0 && doc.status !== "recusado" && (
                  <Button variant="ghost" className="!px-3 !py-1.5 text-xs" onClick={() => setRefusing(doc)}>
                    Recusar
                  </Button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    act(
                      () => send(`${base}/documents/${doc.id}`, "PATCH", { required: !doc.required }),
                      doc.required ? "Agora é opcional." : "Agora é obrigatório."
                    )
                  }
                  className="text-xs font-semibold text-muted underline-offset-2 hover:text-ink hover:underline"
                >
                  {doc.required ? "tornar opcional" : "tornar obrigatório"}
                </button>
                <button
                  type="button"
                  onClick={() => act(() => send(`${base}/documents/${doc.id}`, "DELETE"), "Documento retirado da lista.")}
                  className="ml-auto text-xs font-semibold text-muted underline-offset-2 hover:text-critical hover:underline"
                >
                  retirar da lista
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {open && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const name = newDoc.trim();
            if (!name) return;
            act(async () => {
              await send(`${base}/documents`, "POST", { name, required: true });
              setNewDoc("");
            }, "Documento incluído. O candidato já vê no link dele.");
          }}
        >
          <input
            value={newDoc}
            onChange={(e) => setNewDoc(e.target.value)}
            placeholder="Pedir outro documento"
            className={inputClass(false)}
          />
          <Button type="submit" variant="ghost" className="!px-4 shrink-0 text-xs">
            <IconPlus className="h-3.5 w-3.5" />
            Incluir
          </Button>
        </form>
      )}

      <RefuseModal
        document={refusing}
        onClose={() => setRefusing(null)}
        onConfirm={(note) =>
          act(async () => {
            await send(`${base}/documents/${refusing!.id}`, "PATCH", { status: "recusado", reviewNote: note });
            setRefusing(null);
          }, "Documento recusado. O candidato vai ver o motivo.")
        }
      />

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Excluir onboarding"
        maxWidthClassName="max-w-md"
        footer={
          <>
            <Button variant="ghost" type="button" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              type="button"
              onClick={async () => {
                try {
                  await send(base, "DELETE");
                  setConfirmDelete(false);
                  await onChanged();
                  onBack();
                  toast.success("Onboarding excluído.");
                } catch (err) {
                  errorToast(err);
                }
              }}
            >
              Excluir
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink">
          O onboarding de <strong>{displayName(admission)}</strong> e todos os documentos enviados serão apagados
          definitivamente. O link do candidato deixa de funcionar.
        </p>
      </Modal>

      {linkModal}
    </div>
  );
}

function RefuseModal({
  document,
  onClose,
  onConfirm,
}: {
  document: AdmissionDocumentInfo | null;
  onClose: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  useEffect(() => setNote(""), [document]);

  return (
    <Modal
      open={!!document}
      onClose={onClose}
      title="Recusar documento"
      maxWidthClassName="max-w-md"
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" type="button" disabled={!note.trim()} onClick={() => onConfirm(note.trim())}>
            Recusar
          </Button>
        </>
      }
    >
      <Field label={`Por que “${document?.name ?? ""}” foi recusado?`} hint="O candidato vê esta mensagem e reenvia.">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          autoFocus
          className={inputClass(false) + " resize-y"}
          placeholder="Ex.: a foto está cortada, envie frente e verso inteiros."
        />
      </Field>
    </Modal>
  );
}

function LinkModal({ link, onClose }: { link: { url: string; admission: AdmissionInfo }; onClose: () => void }) {
  const { url, admission } = link;
  const firstName = admission.candidateName?.split(" ")[0];
  const message = `Olá${firstName ? `, ${firstName}` : ""}! Para o seu onboarding na CFFGROUP, preencha seus dados e envie seus documentos por este link pessoal: ${url}`;
  const phone = admission.phone?.replace(/\D/g, "");
  const whatsapp = `https://wa.me/${phone ? (phone.length <= 11 ? `55${phone}` : phone) : ""}?text=${encodeURIComponent(message)}`;

  return (
    <Modal
      open
      onClose={onClose}
      title="Link do candidato"
      maxWidthClassName="max-w-lg"
      footer={
        <Button type="button" onClick={onClose}>
          Pronto
        </Button>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-muted">
          Envie este link para {admission.candidateName ? <strong className="text-ink">{admission.candidateName}</strong> : "o candidato"}. Ele
          preenche os dados e envia os documentos por lá, sem senha. O link vale por 30 dias. <strong className="text-ink">Por segurança, ele só é mostrado agora</strong> — se
          perder, gere um novo (o antigo para de funcionar).
        </p>
        <input readOnly value={url} onFocus={(e) => e.target.select()} className={inputClass(false) + " font-mono text-xs"} />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="ghost"
            className="!px-4 !py-2 text-xs"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
                toast.success("Link copiado.");
              } catch {
                toast.error("Não foi possível copiar. Selecione o link e copie.");
              }
            }}
          >
            Copiar link
          </Button>
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-full border border-border-strong px-4 py-2 text-xs font-semibold text-ink transition hover:bg-ink hover:text-bg"
          >
            Enviar pelo WhatsApp
          </a>
          {admission.email && (
            <a
              href={`mailto:${admission.email}?subject=${encodeURIComponent("Documentos para o onboarding — CFFGROUP")}&body=${encodeURIComponent(message)}`}
              className="inline-flex items-center rounded-full border border-border-strong px-4 py-2 text-xs font-semibold text-ink transition hover:bg-ink hover:text-bg"
            >
              Enviar por e-mail
            </a>
          )}
        </div>
      </div>
    </Modal>
  );
}

function CandidateDataCard({
  fields,
  editable,
  onAdd,
  onToggle,
  onRemove,
}: {
  fields: AdmissionFieldInfo[];
  editable: boolean;
  onAdd: (body: { key?: string; label?: string }) => Promise<void>;
  onToggle: (field: AdmissionFieldInfo) => void;
  onRemove: (field: AdmissionFieldInfo) => void;
}) {
  const [extra, setExtra] = useState("");
  const missingPresets = DEFAULT_FIELDS.filter((preset) => !fields.some((f) => f.key === preset.key));

  return (
    <section className="rounded-[14px] border border-border bg-surface p-5">
      <h3 className="font-display text-lg font-semibold text-ink">Dados do candidato</h3>
      <p className="mb-3 text-xs text-muted">Preenchidos pelo próprio candidato no link.</p>
      {fields.length === 0 ? (
        <p className="text-sm text-muted">Nenhum dado pedido neste onboarding.</p>
      ) : (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.id} className="min-w-0 border-b border-border pb-2">
              <dt className="flex items-center gap-2 text-xs text-muted">
                {f.label}
                {!f.required && <span>(opcional)</span>}
                {editable && f.key !== "nome" && (
                  <span className="ml-auto flex gap-2">
                    <button type="button" onClick={() => onToggle(f)} className="font-semibold hover:text-ink">
                      {f.required ? "tornar opcional" : "tornar obrigatório"}
                    </button>
                    <button type="button" onClick={() => onRemove(f)} className="font-semibold hover:text-critical">
                      retirar
                    </button>
                  </span>
                )}
              </dt>
              <dd className={`mt-0.5 whitespace-pre-line break-words text-sm ${f.value ? "text-ink" : "italic text-muted"}`}>
                {f.value ? (f.type === "date" ? formatDateBR(f.value) : f.value) : "não preenchido"}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {editable && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {missingPresets.map((preset) => (
            <button
              key={preset.key}
              type="button"
              onClick={() => onAdd({ key: preset.key })}
              className="rounded-full border border-border-strong px-3 py-1 text-xs font-semibold text-muted hover:text-ink"
            >
              + {preset.label}
            </button>
          ))}
          <form
            className="flex min-w-[16rem] flex-1 gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const label = extra.trim();
              if (!label) return;
              await onAdd({ label });
              setExtra("");
            }}
          >
            <input
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder="Pedir outro dado (ex.: Tamanho da camiseta)"
              className={inputClass(false)}
            />
            <Button type="submit" variant="ghost" className="!px-4 shrink-0 text-xs">
              <IconPlus className="h-3.5 w-3.5" />
              Pedir
            </Button>
          </form>
        </div>
      )}
    </section>
  );
}

/** Informações que só o RH preenche (o candidato não vê). */
function InternalInfoCard({
  admission,
  departments,
  editable,
  onSave,
}: {
  admission: AdmissionInfo;
  departments: string[];
  editable: boolean;
  onSave: (body: Record<string, string>) => Promise<void>;
}) {
  const initial = () => ({
    role: admission.role ?? "",
    department: admission.department ?? "",
    startDate: admission.startDate ? admission.startDate.slice(0, 10) : "",
    notes: admission.notes ?? "",
  });
  const [values, setValues] = useState(initial);
  const [editing, setEditing] = useState(false);
  const set = (key: keyof ReturnType<typeof initial>, value: string) => setValues((v) => ({ ...v, [key]: value }));

  if (!editing) {
    return (
      <section className="flex flex-wrap items-start justify-between gap-3 rounded-[14px] border border-border bg-surface p-5">
        <div className="min-w-0">
          <h3 className="font-display text-lg font-semibold text-ink">Dados internos</h3>
          <p className="text-sm text-muted">
            {[admission.role && `Cargo: ${admission.role}`, admission.department && `Setor: ${admission.department}`, admission.startDate && `Início: ${formatDateBR(admission.startDate)}`]
              .filter(Boolean)
              .join(" · ") || "Cargo, setor e início ainda não informados."}
          </p>
          {admission.notes && <p className="mt-1 whitespace-pre-line text-sm text-ink">{admission.notes}</p>}
          <p className="mt-1 text-xs text-muted">Só o RH vê. Cargo e setor vão para o cadastro do colaborador ao concluir.</p>
        </div>
        {editable && (
          <Button
            variant="ghost"
            className="!px-4 !py-1.5 text-xs"
            onClick={() => {
              setValues(initial());
              setEditing(true);
            }}
          >
            Editar
          </Button>
        )}
      </section>
    );
  }

  return (
    <form
      className="grid grid-cols-1 gap-4 rounded-[14px] border border-border bg-surface p-5 sm:grid-cols-3"
      onSubmit={async (e) => {
        e.preventDefault();
        // A rota grava o registro inteiro: manda junto o que o candidato preencheu.
        await onSave({
          ...values,
          candidateName: admission.candidateName ?? "",
          email: admission.email ?? "",
          phone: admission.phone ?? "",
        });
        setEditing(false);
      }}
    >
      <h3 className="font-display text-lg font-semibold text-ink sm:col-span-3">Dados internos</h3>
      <Field label="Cargo">
        <input value={values.role} onChange={(e) => set("role", e.target.value)} className={inputClass(false)} autoFocus />
      </Field>
      <Field label="Setor">
        <input
          value={values.department}
          onChange={(e) => set("department", e.target.value)}
          className={inputClass(false)}
          list="admission-departments"
        />
        <datalist id="admission-departments">
          {departments.map((dep) => (
            <option key={dep} value={dep} />
          ))}
        </datalist>
      </Field>
      <Field label="Início previsto">
        <input
          type="date"
          value={values.startDate}
          onChange={(e) => set("startDate", e.target.value)}
          className={inputClass(false) + " font-mono"}
        />
      </Field>
      <Field label="Observações (só o RH vê)" className="sm:col-span-3">
        <textarea value={values.notes} onChange={(e) => set("notes", e.target.value)} rows={2} className={inputClass(false) + " resize-y"} />
      </Field>
      <div className="flex gap-2 sm:col-span-3">
        <Button type="submit" className="!px-4 !py-1.5 text-xs">
          Salvar
        </Button>
        <Button type="button" variant="ghost" className="!px-4 !py-1.5 text-xs" onClick={() => setEditing(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

/** Escolhe a empresa do acordo de confidencialidade antes de gerar o link. */
function CompanyChoiceModal({
  open,
  companies,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  companies: ContractingCompanyInfo[];
  busy: boolean;
  onClose: () => void;
  onConfirm: (companyId: string) => void;
}) {
  const [companyId, setCompanyId] = useState<string | null>(null);
  useEffect(() => {
    if (open) setCompanyId(null);
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Novo onboarding"
      maxWidthClassName="max-w-md"
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" disabled={companyId === null || busy} onClick={() => onConfirm(companyId!)}>
            {busy ? "Gerando link..." : "Gerar link"}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-muted">
        Em qual empresa a pessoa vai trabalhar? O acordo de confidencialidade e o termo de uso de imagem saem
        preenchidos com ela, junto com os documentos pedidos.
      </p>
      <div className="flex flex-col gap-2">
        {companies.map((c) => (
          <label
            key={c.id}
            className={`flex cursor-pointer items-center gap-3 rounded-[10px] border px-3 py-2.5 text-sm transition ${
              companyId === c.id ? "border-accent bg-accent-soft text-ink" : "border-border text-ink hover:bg-surface-2"
            }`}
          >
            <input type="radio" name="nda-company" checked={companyId === c.id} onChange={() => setCompanyId(c.id)} />
            {c.name}
          </label>
        ))}
        <label
          className={`flex cursor-pointer items-center gap-3 rounded-[10px] border px-3 py-2.5 text-sm transition ${
            companyId === "" ? "border-accent bg-accent-soft text-ink" : "border-border text-muted hover:bg-surface-2"
          }`}
        >
          <input type="radio" name="nda-company" checked={companyId === ""} onChange={() => setCompanyId("")} />
          Sem termos (confidencialidade e uso de imagem)
        </label>
      </div>
    </Modal>
  );
}

/** Empresa dos termos (confidencialidade e uso de imagem), logo acima da lista de documentos. */
function NdaCompanyCard({
  admission,
  companies,
  editable,
  onChange,
}: {
  admission: AdmissionInfo;
  companies: ContractingCompanyInfo[];
  editable: boolean;
  onChange: (companyId: string) => void;
}) {
  const current = admission.contractingCompanyId ?? "";
  const company = companies.find((c) => c.id === current);
  const signed = admission.documents.filter((d) => isGeneratedDocument(d.kind) && d.files.length > 0);

  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-border bg-surface p-4">
      <div className="min-w-0">
        <p className="font-medium text-ink">Empresa contratante</p>
        <p className="text-xs text-muted">
          {company
            ? "O candidato baixa o acordo de confidencialidade e o termo de uso de imagem já preenchidos com esta empresa, assina no gov.br e envia junto com os documentos."
            : "Escolha a empresa para o candidato receber o acordo de confidencialidade e o termo de uso de imagem."}
        </p>
        {company && companyIncomplete(company) && (
          <p className="mt-1 text-xs font-semibold text-warn">
            O cadastro desta empresa está sem CNPJ ou endereço da sede: o termo de uso de imagem só pode ser gerado depois
            de completar em “Termos do onboarding”.
          </p>
        )}
      </div>
      {editable && companies.length > 0 ? (
        <select
          value={current}
          onChange={(e) => {
            const next = e.target.value;
            if (
              signed.length > 0 &&
              !window.confirm(
                "O candidato já enviou termo assinado com a empresa atual. Trocar a empresa não apaga esse arquivo: recuse-o para ele baixar e assinar o novo. Continuar?"
              )
            ) {
              return;
            }
            onChange(next);
          }}
          className="min-w-[16rem] rounded-[10px] border border-border bg-surface-2 px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
          aria-label="Empresa contratante"
        >
          <option value="">Sem termos</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      ) : (
        <span className="text-sm text-ink">{company?.name ?? "Sem termos"}</span>
      )}
    </section>
  );
}

function ProgressLine({ label, value, total, barClass }: { label: string; value: number; total: number; barClass: string }) {
  const pct = total ? Math.round((Math.min(value, total) / total) * 100) : 0;
  return (
    <span className="flex items-center gap-2">
      <span className="w-[38px]">{label}</span>
      <span className="h-[5px] flex-1 overflow-hidden rounded-full bg-surface-2">
        <span className={`block h-full rounded-full ${barClass}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="font-mono text-[11px] tabular-nums text-ink/80">
        {value}/{total}
      </span>
    </span>
  );
}
