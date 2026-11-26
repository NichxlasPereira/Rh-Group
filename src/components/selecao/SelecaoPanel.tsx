"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Modal } from "../Modal";
import { Button } from "../Button";
import { EmptyState, Field, SkeletonRows, inputClass } from "../attendance/formControls";
import { SectorSlider } from "../attendance/SectorSlider";
import {
  IconArrowUpTray,
  IconCalendar,
  IconCheck,
  IconCheckCircle,
  IconChevronDown,
  IconChevronRight,
  IconClock,
  IconCollapse,
  IconCopy,
  IconDots,
  IconEdit,
  IconFunnel,
  IconPhone,
  IconPlus,
  IconSearch,
  IconText,
  IconTrash,
  IconUsers,
  IconX,
} from "../icons";
import {
  CLOSED_STAGES,
  CandidateInfo,
  FEEDBACK_LABEL,
  FEEDBACK_STATUS_LABEL,
  FEEDBACK_TYPES,
  FeedbackStatus,
  FeedbackTemplate,
  FeedbackType,
  JOB_STATUSES,
  JOB_STATUS_LABEL,
  JobInfo,
  JobStatus,
  PRIORITY_LABEL,
  STAGES,
  STAGE_LABEL,
  STAGE_SHORT,
  Stage,
  brDate,
  daysBetween,
  feedbackStatus,
  funnelOf,
  jobDaysOpen,
  jobHired,
  moveCandidate,
  nextStage,
  pct,
  todayKey,
} from "@/lib/selecao";
import { redirectIfSessionExpired } from "@/lib/sessionClient";
import { Select } from "../Select";

type View = "quadro" | "funil" | "devolutivas" | "banco";

const cardClass = "overflow-hidden rounded-[14px] neon-cinza border bg-surface";

const STATUS_TONE: Record<JobStatus, string> = {
  aberta: "bg-ok-soft text-ok",
  pausada: "bg-warn-soft text-warn",
  preenchida: "bg-surface-2 text-muted",
  cancelada: "bg-surface-2 text-muted",
};
const PRIORITY_TONE: Record<number, string> = {
  1: "bg-critical-soft text-critical",
  2: "bg-warn-soft text-warn",
  3: "bg-surface-2 text-muted",
};
const FEEDBACK_TONE: Record<FeedbackStatus, string> = {
  pendente: "bg-warn-soft text-warn",
  atrasada: "bg-critical-soft text-critical",
  no_prazo: "bg-ok-soft text-ok",
  com_atraso: "bg-surface-2 text-muted",
};

async function call<T = unknown>(url: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : undefined,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  if (redirectIfSessionExpired(res, "/frequencia/entrar", "/frequencia")) throw new Error("Sessão expirada.");
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Não foi possível concluir.");
  return data as T;
}
const errorToast = (err: unknown) => toast.error(err instanceof Error ? err.message : "Erro inesperado.");

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Mensagem copiada.");
  } catch {
    toast.error("Não foi possível copiar. Selecione o texto e copie.");
  }
}

interface Props {
  departments: string[];
  /** Botões do cabeçalho (mudam a cada clique). */
  newJobSignal: number;
  newCandidateSignal: number;
  importSignal: number;
  /** Devolutivas atrasadas (número no menu). */
  onAttentionChange?: (count: number) => void;
}

export function SelecaoPanel({ departments, newJobSignal, newCandidateSignal, importSignal, onAttentionChange }: Props) {
  const [jobs, setJobs] = useState<JobInfo[] | null>(null);
  const [candidates, setCandidates] = useState<CandidateInfo[]>([]);
  const [templates, setTemplates] = useState<FeedbackTemplate[]>([]);
  const [view, setView] = useState<View>("quadro");
  const [jobFilter, setJobFilter] = useState<string>("");
  const [editingJob, setEditingJob] = useState<JobInfo | "new" | null>(null);
  const [editingCandidate, setEditingCandidate] = useState<CandidateInfo | "new" | null>(null);
  const [feedbackFor, setFeedbackFor] = useState<CandidateInfo | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const today = todayKey();

  const load = useCallback(async () => {
    try {
      const data = await call<{ jobs: JobInfo[]; candidates: CandidateInfo[]; templates: FeedbackTemplate[] }>("/api/frequencia/selecao");
      setJobs(data.jobs);
      setCandidates(data.candidates);
      setTemplates(data.templates);
    } catch (err) {
      errorToast(err);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  // Botões do cabeçalho (0 = nada pedido ainda).
  const first = useRef({ job: newJobSignal, cand: newCandidateSignal, imp: importSignal });
  useEffect(() => {
    if (newJobSignal !== first.current.job) setEditingJob("new");
  }, [newJobSignal]);
  useEffect(() => {
    if (newCandidateSignal !== first.current.cand) setEditingCandidate("new");
  }, [newCandidateSignal]);
  useEffect(() => {
    if (importSignal !== first.current.imp) setImportOpen(true);
  }, [importSignal]);

  const overdue = useMemo(() => candidates.filter((c) => feedbackStatus(c, today) === "atrasada").length, [candidates, today]);
  useEffect(() => {
    onAttentionChange?.(overdue);
  }, [overdue, onAttentionChange]);

  async function saveCandidate(c: CandidateInfo) {
    try {
      const saved = await call<CandidateInfo>(`/api/frequencia/selecao/candidatos/${c.id}`, "PATCH", c);
      setCandidates((list) => list.map((x) => (x.id === saved.id ? saved : x)));
      return saved;
    } catch (err) {
      errorToast(err);
      return null;
    }
  }

  async function move(c: CandidateInfo, stage: Stage) {
    const saved = await saveCandidate(moveCandidate(c, stage, today));
    if (saved) toast.success(`${c.name}: ${STAGE_SHORT[stage]}.`);
  }

  /** "Adicionar um cartão": cria o candidato direto na lista (vaga do filtro, se houver). */
  async function quickAdd(name: string, stage: Stage) {
    const job = jobs?.find((j) => j.id === jobFilter);
    const dates = {
      phase1Date: today,
      phase2Date: stage === "fase1" ? null : today,
      phase3Date: stage === "fase1" || stage === "fase2" ? null : today,
    };
    try {
      const saved = await call<CandidateInfo>("/api/frequencia/selecao/candidatos", "POST", { name, stage, jobId: job?.id ?? null, ...dates });
      setCandidates((list) => [saved, ...list]);
      return true;
    } catch (err) {
      errorToast(err);
      return false;
    }
  }

  async function removeCandidate(c: CandidateInfo) {
    if (!window.confirm(`Excluir ${c.name} do processo seletivo?`)) return;
    try {
      await call(`/api/frequencia/selecao/candidatos/${c.id}`, "DELETE");
      setCandidates((list) => list.filter((x) => x.id !== c.id));
    } catch (err) {
      errorToast(err);
    }
  }

  async function removeJob(j: JobInfo) {
    if (!window.confirm(`Excluir a vaga “${j.title}”? Os candidatos continuam, com a vaga de origem.`)) return;
    try {
      await call(`/api/frequencia/selecao/vagas/${j.id}`, "DELETE");
      await load();
    } catch (err) {
      errorToast(err);
    }
  }

  const pending = candidates.filter((c) => {
    const s = feedbackStatus(c, today);
    return s === "pendente" || s === "atrasada";
  }).length;
  const pool = candidates.filter((c) => c.stage === "banco").length;
  const inProcess = candidates.filter((c) => c.stage === "fase1" || c.stage === "fase2" || c.stage === "fase3").length;
  const openJobs = (jobs ?? []).filter((j) => j.status === "aberta").length;

  if (jobs === null) {
    return (
      <div className={cardClass}>
        <SkeletonRows rows={5} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SectorSlider
        options={[
          { key: "quadro", label: "Quadro", count: inProcess },
          { key: "funil", label: "Funil das vagas", count: openJobs },
          { key: "devolutivas", label: "Devolutivas", count: pending },
          { key: "banco", label: "Banco de talentos", count: pool },
        ]}
        value={view}
        onChange={(k) => setView(k as View)}
      />

      {jobs.length === 0 && candidates.length === 0 ? (
        <div className={cardClass}>
          <EmptyState
            icon={<IconFunnel className="h-6 w-6" />}
            title="Nenhum processo seletivo ainda"
            text="Importe a planilha de acompanhamento de vagas ou cadastre a primeira vaga pelo botão “Nova vaga”."
          />
          <div className="flex justify-center pb-6">
            <Button type="button" variant="ghost" onClick={() => setImportOpen(true)}>
              <IconArrowUpTray className="h-4 w-4" />
              Importar planilha
            </Button>
          </div>
        </div>
      ) : view === "funil" ? (
        <FunnelView
          jobs={jobs}
          candidates={candidates}
          today={today}
          overdue={overdue}
          onOpenJob={(id) => {
            setJobFilter(id);
            setView("quadro");
          }}
          onEditJob={setEditingJob}
          onRemoveJob={removeJob}
        />
      ) : view === "quadro" ? (
        <BoardView
          jobs={jobs}
          candidates={candidates}
          today={today}
          jobFilter={jobFilter}
          onJobFilter={setJobFilter}
          onMove={move}
          onEdit={setEditingCandidate}
          onRemove={removeCandidate}
          onFeedback={setFeedbackFor}
          onQuickAdd={quickAdd}
        />
      ) : view === "devolutivas" ? (
        <FeedbackView
          candidates={candidates}
          templates={templates}
          today={today}
          onRegister={setFeedbackFor}
          onEditTemplates={() => setTemplatesOpen(true)}
        />
      ) : (
        <PoolView
          jobs={jobs}
          candidates={candidates}
          onCall={async (c, jobId) => {
            const job = jobs.find((j) => j.id === jobId);
            const saved = await saveCandidate({ ...moveCandidate(c, "fase1", today), jobId, jobTitle: job?.title ?? c.jobTitle, phase1Date: today });
            if (saved) toast.success(`${c.name} chamado(a) para ${job?.title ?? "a vaga"}.`);
          }}
          onEdit={setEditingCandidate}
          onRemove={removeCandidate}
        />
      )}

      <JobModal
        editing={editingJob}
        departments={departments}
        onClose={() => setEditingJob(null)}
        onSaved={async () => {
          setEditingJob(null);
          await load();
        }}
      />
      <CandidateModal
        editing={editingCandidate}
        jobs={jobs}
        defaultJobId={jobFilter}
        onClose={() => setEditingCandidate(null)}
        onSaved={(saved, isNew) => {
          setEditingCandidate(null);
          setCandidates((list) => (isNew ? [saved, ...list] : list.map((x) => (x.id === saved.id ? saved : x))));
        }}
      />
      <FeedbackModal
        candidate={feedbackFor}
        templates={templates}
        today={today}
        onClose={() => setFeedbackFor(null)}
        onSave={async (c) => {
          const saved = await saveCandidate(c);
          if (saved) {
            setFeedbackFor(null);
            toast.success("Devolutiva registrada.");
          }
        }}
      />
      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={async () => {
          setImportOpen(false);
          await load();
        }}
      />
      <TemplatesModal
        open={templatesOpen}
        templates={templates}
        onClose={() => setTemplatesOpen(false)}
        onSaved={(list) => {
          setTemplates(list);
          setTemplatesOpen(false);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------- funil

function FunnelBars({ f, compact = false }: { f: ReturnType<typeof funnelOf>; compact?: boolean }) {
  const steps = [
    { label: "Fase 1 · entrevista RH", value: f.phase1 },
    { label: "Fase 2 · coordenadores", value: f.phase2 },
    { label: "Fase 3 · período de teste", value: f.phase3 },
    { label: "Contratados", value: f.hired },
  ];
  const max = Math.max(1, f.phase1);
  if (compact) {
    return (
      <div className="flex items-end gap-1" aria-label={steps.map((s) => `${s.label}: ${s.value}`).join(", ")}>
        {steps.map((s, i) => (
          <div key={s.label} className="flex flex-col items-center gap-0.5">
            <span className="font-mono text-[11px] font-bold tabular-nums text-ink">{s.value}</span>
            <span
              className={`w-7 rounded-[4px] ${i === 3 ? "bg-ok" : "bg-ink/70"}`}
              style={{ height: `${Math.max(3, Math.round((s.value / max) * 28))}px`, opacity: 1 - i * 0.15 }}
            />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-2">
      {steps.map((s, i) => {
        const width = Math.max(14, Math.round((s.value / max) * 100));
        return (
          <div key={s.label} className="flex w-full items-center gap-3">
            <span className="w-40 shrink-0 text-right text-[13px] font-semibold text-muted max-sm:w-28 max-sm:text-xs">{s.label}</span>
            <div className="flex flex-1 justify-center">
              <div
                className={`flex h-10 items-center justify-center rounded-[10px] font-display text-[17px] font-bold tabular-nums transition-[width] duration-500 ${
                  i === 3 ? "bg-ok text-white" : "bg-ink text-bg"
                }`}
                style={{ width: `${width}%`, opacity: i === 3 ? 1 : 1 - i * 0.18 }}
              >
                {s.value}
              </div>
            </div>
            <span className="w-14 shrink-0 font-mono text-xs tabular-nums text-muted">
              {i === 0 ? "100%" : `${pct(s.value, steps[i - 1].value)}%`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Stat({ label, value, detail, tone = "text-muted" }: { label: string; value: string | number; detail: string; tone?: string }) {
  return (
    <div className={`flex flex-col gap-2 p-4 ${cardClass}`}>
      <span className="text-[12.5px] font-semibold text-muted">{label}</span>
      <span className="font-display text-[28px] font-bold leading-none tabular-nums text-ink">{value}</span>
      <span className={`truncate text-xs ${tone}`}>{detail}</span>
    </div>
  );
}

function FunnelView({
  jobs,
  candidates,
  today,
  overdue,
  onOpenJob,
  onEditJob,
  onRemoveJob,
}: {
  jobs: JobInfo[];
  candidates: CandidateInfo[];
  today: string;
  overdue: number;
  onOpenJob: (id: string) => void;
  onEditJob: (j: JobInfo) => void;
  onRemoveJob: (j: JobInfo) => void;
}) {
  const [status, setStatus] = useState<JobStatus | "">("aberta");
  const shown = jobs.filter((j) => !status || j.status === status);
  const scope = status ? shown : jobs;
  const scopeIds = new Set(scope.map((j) => j.id));
  const f = funnelOf(
    candidates.filter((c) => c.jobId && scopeIds.has(c.jobId)),
    scope
  );
  const open = jobs.filter((j) => j.status === "aberta");
  const remaining = open.reduce((n, j) => n + Math.max(0, j.positions - jobHired(j, candidates)), 0);
  const filled = jobs.filter((j) => j.status === "preenchida" && j.filledAt);
  const avgFill = filled.length ? Math.round(filled.reduce((n, j) => n + daysBetween(j.openedAt, j.filledAt!), 0) / filled.length) : null;
  const avgOpen = open.length ? Math.round(open.reduce((n, j) => n + jobDaysOpen(j, today), 0) / open.length) : 0;

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Resumo" className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        <Stat label="Vagas abertas" value={open.length} detail={`em média há ${avgOpen} dias`} />
        <Stat label="Posições a preencher" value={remaining} detail="nas vagas abertas" />
        <Stat label="Candidatos em processo" value={f.inProcess} detail="nas fases 1 a 3" />
        <Stat
          label="Devolutivas atrasadas"
          value={overdue}
          detail={overdue ? "passaram do prazo" : "tudo no prazo"}
          tone={overdue ? "text-critical" : "text-ok"}
        />
        <Stat label="Tempo até preencher" value={avgFill === null ? "—" : `${avgFill}d`} detail="média das vagas preenchidas" />
      </section>

      <div className="flex flex-wrap gap-1.5">
        {(["aberta", "pausada", "preenchida", ""] as const).map((s) => (
          <button
            key={s || "todas"}
            type="button"
            aria-pressed={status === s}
            onClick={() => setStatus(s)}
            className={`rounded-full px-3 py-1.5 text-[12.5px] transition ${
              status === s ? "bg-ink font-bold text-bg" : "border border-border-strong font-semibold text-muted hover:text-ink"
            }`}
          >
            {s ? `${JOB_STATUS_LABEL[s]}s` : "Todas"} · <span className="tabular-nums">{s ? jobs.filter((j) => j.status === s).length : jobs.length}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <section className={`${cardClass} flex flex-col gap-4 p-5`}>
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-display text-[17px] font-semibold text-ink">Funil {status ? `· vagas ${JOB_STATUS_LABEL[status].toLowerCase()}s` : "geral"}</h2>
            <span className="text-xs text-muted">% = passou da fase anterior</span>
          </div>
          <FunnelBars f={f} />
          <div className="grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
            {[
              ["Reprovados", f.rejected],
              ["Desistências", f.gaveUp],
              ["Banco de talentos", f.pool],
            ].map(([label, n]) => (
              <div key={label} className="flex flex-col">
                <span className="font-display text-lg font-bold tabular-nums text-ink">{n}</span>
                <span className="text-[11.5px] text-muted">{label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className={cardClass}>
          <header className="border-b border-border px-4 py-3">
            <h2 className="font-display text-[17px] font-semibold text-ink">Vagas</h2>
          </header>
          {shown.length === 0 ? (
            <EmptyState icon={<IconFunnel className="h-6 w-6" />} title="Nenhuma vaga aqui" text="Escolha outro filtro ou cadastre uma vaga." />
          ) : (
            <ul className="flex flex-col">
              {shown.map((j) => {
                const mine = candidates.filter((c) => c.jobId === j.id);
                const jf = funnelOf(mine, [j]);
                const hired = jobHired(j, candidates);
                const days = jobDaysOpen(j, today);
                return (
                  <li key={j.id} className="group flex items-center gap-3 border-t border-border px-4 py-3 first:border-t-0">
                    <button type="button" onClick={() => onOpenJob(j.id)} className="flex min-w-0 flex-1 flex-col gap-1 text-left">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-ink">{j.title}</span>
                        <span className={`rounded-full px-2 py-px text-[10.5px] font-bold ${PRIORITY_TONE[j.priority] ?? PRIORITY_TONE[2]}`}>
                          {PRIORITY_LABEL[j.priority] ?? "Média"}
                        </span>
                        <span className={`rounded-full px-2 py-px text-[10.5px] font-bold ${STATUS_TONE[j.status]}`}>{JOB_STATUS_LABEL[j.status]}</span>
                      </span>
                      <span className="truncate text-xs text-muted">
                        {[
                          j.department,
                          j.status === "preenchida" ? `preenchida em ${days} dias` : `aberta há ${days} dias`,
                          `${hired} de ${j.positions} ${j.positions === 1 ? "contratado" : "contratados"}`,
                          jf.inProcess ? `${jf.inProcess} em processo` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </button>
                    <FunnelBars f={jf} compact />
                    <span className="flex shrink-0 items-center opacity-60 transition group-hover:opacity-100">
                      <button type="button" onClick={() => onEditJob(j)} aria-label={`Editar ${j.title}`} className="rounded-[8px] p-1.5 text-muted hover:bg-surface-2 hover:text-ink">
                        <IconEdit className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => onRemoveJob(j)} aria-label={`Excluir ${j.title}`} className="rounded-[8px] p-1.5 text-muted hover:bg-surface-2 hover:text-critical">
                        <IconTrash className="h-4 w-4" />
                      </button>
                      <IconChevronRight className="h-4 w-4 text-muted" />
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- candidatos por fase

/** Cor das etiquetas de candidato sem vaga (vaga excluída). */
const NO_JOB_COLOR = "#8590a2";

/**
 * Cores das vagas, escolhidas para serem bem diferentes entre si (inclusive no tema claro e no
 * escuro), na ordem em que se distinguem melhor: as primeiras vagas ficam com as mais distintas.
 */
const JOB_PALETTE = [
  "#e6194b", // vermelho
  "#3cb44b", // verde
  "#4363d8", // azul
  "#f58231", // laranja
  "#911eb4", // roxo
  "#42d4f4", // ciano
  "#f032e6", // magenta
  "#bfef45", // limão
  "#ffe119", // amarelo
  "#469990", // verde-azulado
  "#9a6324", // marrom
  "#fabed4", // rosa
  "#dcbeff", // lavanda
  "#800000", // vinho
  "#808000", // oliva
  "#aaffc3", // menta
  "#ffd8b1", // pêssego
  "#000075", // azul-marinho
  "#fffac8", // creme
];

/** Cor de cada vaga, sem repetir: as vagas na ordem de cadastro recebem as cores da paleta. */
function jobColors(jobs: JobInfo[]): Map<string, string> {
  const ordered = [...jobs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return new Map(
    ordered.map((j, i) => [
      j.id,
      // Mais vagas do que a paleta: tons espaçados pela roda de cores.
      JOB_PALETTE[i] ?? `hsl(${Math.round((i - JOB_PALETTE.length) * 137.5) % 360} 65% ${i % 2 ? 45 : 70}%)`,
    ])
  );
}

/** Texto legível sobre a cor da etiqueta (escuro nas cores claras, branco nas escuras). */
function labelText(color: string) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (!m) return Number(/(\d+)%\)$/.exec(color)?.[1] ?? 70) < 55 ? "#ffffff" : "#1d2125";
  const [r, g, b] = m.slice(1).map((h) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.25 ? "#1d2125" : "#ffffff";
}

/** Data em que o candidato entrou na fase atual. */
function stageDate(c: CandidateInfo) {
  if (c.stage === "fase1") return c.phase1Date;
  if (c.stage === "fase2") return c.phase2Date ?? c.phase1Date;
  return c.phase3Date ?? c.phase2Date ?? c.phase1Date;
}

const COLUMN_HINT: Record<Stage, string> = {
  fase1: "Entrevista com o RH",
  fase2: "Entrevista com coordenadores",
  fase3: "Período de teste",
  contratado: "Entraram na empresa",
  reprovado: "Não seguiram no processo",
  desistiu: "Saíram por conta própria",
  banco: "Para chamar em outra vaga",
};

function BoardView({
  jobs,
  candidates,
  today,
  jobFilter,
  onJobFilter,
  onMove,
  onEdit,
  onRemove,
  onFeedback,
  onQuickAdd,
}: {
  jobs: JobInfo[];
  candidates: CandidateInfo[];
  today: string;
  jobFilter: string;
  onJobFilter: (id: string) => void;
  onMove: (c: CandidateInfo, stage: Stage) => void;
  onEdit: (c: CandidateInfo) => void;
  onRemove: (c: CandidateInfo) => void;
  onFeedback: (c: CandidateInfo) => void;
  onQuickAdd: (name: string, stage: Stage) => Promise<boolean>;
}) {
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<Stage>>(() => new Set(CLOSED_STAGES));
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<Stage | null>(null);
  const term = search.trim().toLowerCase();
  const list = candidates.filter((c) => (!jobFilter || c.jobId === jobFilter) && (!term || c.name.toLowerCase().includes(term)));
  const colors = useMemo(() => jobColors(jobs), [jobs]);

  const toggle = (s: Stage) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  function drop(stage: Stage) {
    const c = candidates.find((x) => x.id === dragId);
    setDragId(null);
    setOver(null);
    if (c && c.stage !== stage) onMove(c, stage);
  }

  const dropProps = (stage: Stage) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!dragId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (over !== stage) setOver(stage);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((o) => (o === stage ? null : o));
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      drop(stage);
    },
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <JobPicker jobs={jobs} colors={colors} candidates={candidates} value={jobFilter} onChange={onJobFilter} />
        <label className="relative flex min-w-[13rem] flex-1 sm:max-w-[18rem]">
          <span className="sr-only">Buscar candidato</span>
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar candidato" className={`${inputClass(false)} h-10 pl-9`} />
        </label>
        <span className="ml-auto hidden text-xs text-muted md:inline">Arraste os cartões entre as listas para mudar de fase.</span>
      </div>

      <div className="rh-quadro -mx-1 flex items-start gap-3 overflow-x-auto px-1 pb-3">
        {STAGES.map((stage) => {
          const col = list.filter((c) => c.stage === stage);
          const isOver = over === stage;
          if (collapsed.has(stage)) {
            return (
              <button
                key={stage}
                type="button"
                onClick={() => toggle(stage)}
                {...dropProps(stage)}
                aria-label={`Abrir a lista ${STAGE_SHORT[stage]} (${col.length})`}
                title={`Abrir a lista ${STAGE_SHORT[stage]}`}
                className={`flex w-11 shrink-0 flex-col items-center gap-3 rounded-[14px] border bg-surface-2 py-3 transition hover:border-border-strong ${
                  isOver ? "border-brand ring-2 ring-brand/30" : "border-border"
                }`}
              >
                <IconCollapse className="h-4 w-4 text-muted" />
                <span className="text-[13px] font-bold text-ink [writing-mode:vertical-rl]">{STAGE_SHORT[stage]}</span>
                <span className="font-mono text-[11px] font-bold tabular-nums text-muted">{col.length}</span>
              </button>
            );
          }
          return (
            <section
              key={stage}
              {...dropProps(stage)}
              aria-label={STAGE_SHORT[stage]}
              className={`flex max-h-[calc(100vh-15rem)] min-h-[9rem] w-[272px] shrink-0 flex-col rounded-[14px] border bg-surface-2 transition ${
                isOver ? "border-brand ring-2 ring-brand/30" : "border-border"
              }`}
            >
              <header className="flex items-start gap-2 px-3 pb-1.5 pt-3">
                <div className="flex min-w-0 flex-1 flex-col">
                  <h3 className="truncate text-[14px] font-bold text-ink">{STAGE_SHORT[stage]}</h3>
                  <span className="truncate text-[11.5px] text-muted">{COLUMN_HINT[stage]}</span>
                </div>
                <span className="mt-0.5 font-mono text-[12px] font-bold tabular-nums text-muted">{col.length}</span>
                <button
                  type="button"
                  onClick={() => toggle(stage)}
                  aria-label={`Recolher a lista ${STAGE_SHORT[stage]}`}
                  title="Recolher lista"
                  className="-mr-1 rounded-[8px] p-1 text-muted transition hover:bg-surface hover:text-ink"
                >
                  <IconCollapse className="h-4 w-4" />
                </button>
              </header>
              <ul className="flex min-h-[2.5rem] flex-1 flex-col gap-2 overflow-y-auto px-2 py-1.5">
                {col.map((c) => (
                  <CandidateCard
                    key={c.id}
                    c={c}
                    color={(c.jobId && colors.get(c.jobId)) || NO_JOB_COLOR}
                    today={today}
                    showJob={!jobFilter}
                    dragging={dragId === c.id}
                    onDragStart={() => setDragId(c.id)}
                    onDragEnd={() => {
                      setDragId(null);
                      setOver(null);
                    }}
                    onMove={onMove}
                    onEdit={onEdit}
                    onRemove={onRemove}
                    onFeedback={onFeedback}
                  />
                ))}
                {col.length === 0 && dragId && <li className="h-14 rounded-[10px] border border-dashed border-border-strong" aria-hidden="true" />}
              </ul>
              <QuickAdd stage={stage} onAdd={onQuickAdd} />
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** Seletor de vaga do quadro: lista própria (no lugar da lista do sistema), agrupada por situação. */
function JobPicker({
  jobs,
  colors,
  candidates,
  value,
  onChange,
}: {
  jobs: JobInfo[];
  colors: Map<string, string>;
  candidates: CandidateInfo[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const current = jobs.find((j) => j.id === value) ?? null;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const inProcess = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of candidates) {
      if (c.jobId && (c.stage === "fase1" || c.stage === "fase2" || c.stage === "fase3")) m.set(c.jobId, (m.get(c.jobId) ?? 0) + 1);
    }
    return m;
  }, [candidates]);

  const term = query.trim().toLowerCase();
  const groups = JOB_STATUSES.map((status) => ({
    status,
    items: jobs.filter((j) => j.status === status && (!term || j.title.toLowerCase().includes(term))),
  })).filter((g) => g.items.length > 0);

  function pick(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...(listRef.current?.querySelectorAll<HTMLButtonElement>("[role=option]") ?? [])];
    if (!items.length) return;
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === "ArrowDown" ? (i < 0 ? 0 : Math.min(items.length - 1, i + 1)) : i <= 0 ? -1 : i - 1;
    if (next < 0) rootRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    else items[next].focus();
  }

  const option = (id: string, label: string, color: string, right?: React.ReactNode) => {
    const selected = value === id;
    return (
      <button
        key={id || "todas"}
        type="button"
        role="option"
        aria-selected={selected}
        onClick={() => pick(id)}
        className={`flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left text-[13.5px] outline-none transition hover:bg-surface-2 focus-visible:bg-surface-2 ${
          selected ? "bg-surface-2 font-semibold text-ink" : "text-ink"
        }`}
      >
        <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {right}
        <IconCheck className={`h-4 w-4 shrink-0 text-brand ${selected ? "" : "invisible"}`} />
      </button>
    );
  };

  return (
    <div ref={rootRef} className="relative min-w-[15rem] flex-1 sm:w-[20rem] sm:flex-none" onKeyDown={onKeyDown}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Vaga: ${current?.title ?? "Todas as vagas"}`}
        className={`${inputClass(false)} flex h-10 w-full items-center gap-3 text-left ${open ? "border-brand" : ""}`}
      >
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: current ? colors.get(current.id) : "var(--color-border-strong)" }}
        />
        <span className="min-w-0 flex-1 truncate">{current?.title ?? "Todas as vagas"}</span>
        <IconChevronDown className={`h-4 w-4 shrink-0 text-muted transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-50 flex w-[max(100%,22rem)] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-[14px] border border-border bg-surface shadow-[0_18px_40px_-18px_rgba(0,0,0,0.6)]">
          {jobs.length > 6 && (
            <div className="border-b border-border p-2">
              <label className="relative flex">
                <span className="sr-only">Buscar vaga</span>
                <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar vaga"
                  className={`${inputClass(false)} h-9 pl-9`}
                />
              </label>
            </div>
          )}
          <div ref={listRef} role="listbox" aria-label="Vagas" className="flex max-h-[22rem] flex-col overflow-y-auto p-1.5">
            {!term && option("", "Todas as vagas", "var(--color-border-strong)")}
            {groups.map((g) => (
              <div key={g.status} className="flex flex-col">
                <span className="px-3 pb-1 pt-2.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted">
                  {JOB_STATUS_LABEL[g.status]}s · {g.items.length}
                </span>
                {g.items.map((j) => {
                  const n = inProcess.get(j.id) ?? 0;
                  return option(
                    j.id,
                    j.title,
                    colors.get(j.id) ?? NO_JOB_COLOR,
                    n > 0 ? (
                      <span title={`${n} em processo`} className="shrink-0 rounded-full bg-surface-2 px-1.5 py-px font-mono text-[11px] font-bold tabular-nums text-muted">
                        {n}
                      </span>
                    ) : null
                  );
                })}
              </div>
            ))}
            {groups.length === 0 && <span className="px-3 py-4 text-center text-sm text-muted">Nenhuma vaga com esse nome.</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function QuickAdd({ stage, onAdd }: { stage: Stage; onAdd: (name: string, stage: Stage) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  async function submit() {
    const value = name.trim();
    if (!value || busy) return;
    setBusy(true);
    const ok = await onAdd(value, stage);
    setBusy(false);
    if (ok) {
      setName("");
      ref.current?.focus();
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="m-2 mt-1 flex items-center gap-2 rounded-[10px] px-2 py-2 text-left text-[13px] font-semibold text-muted transition hover:bg-surface hover:text-ink"
      >
        <IconPlus className="h-4 w-4" />
        Adicionar um cartão
      </button>
    );
  }
  return (
    <form
      className="m-2 mt-1 flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <textarea
        ref={ref}
        autoFocus
        rows={2}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void submit();
          } else if (e.key === "Escape") {
            setOpen(false);
            setName("");
          }
        }}
        placeholder="Nome do candidato"
        aria-label="Nome do candidato"
        className="resize-none rounded-[10px] border border-border bg-surface px-3 py-2 text-[13.5px] text-ink shadow-[0_1px_1px_rgba(0,0,0,0.12)] outline-none focus:border-brand"
      />
      <div className="flex items-center gap-1.5">
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="rounded-[8px] bg-brand px-3 py-1.5 text-[13px] font-bold text-white transition hover:brightness-110 disabled:opacity-50"
        >
          Adicionar cartão
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setName("");
          }}
          aria-label="Cancelar"
          className="rounded-[8px] p-1.5 text-muted transition hover:bg-surface hover:text-ink"
        >
          <IconX className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}

function CandidateCard({
  c,
  color,
  today,
  showJob,
  dragging,
  onDragStart,
  onDragEnd,
  onMove,
  onEdit,
  onRemove,
  onFeedback,
}: {
  c: CandidateInfo;
  color: string;
  today: string;
  showJob: boolean;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: (c: CandidateInfo, stage: Stage) => void;
  onEdit: (c: CandidateInfo) => void;
  onRemove: (c: CandidateInfo) => void;
  onFeedback: (c: CandidateInfo) => void;
}) {
  const [menu, setMenu] = useState<{ top: number; left: number } | null>(null);
  const fb = feedbackStatus(c, today);
  const next = nextStage(c.stage);
  const since = stageDate(c);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const item = "flex w-full items-center rounded-[7px] px-2.5 py-1.5 text-left text-[12.5px] font-semibold text-ink hover:bg-surface-2";

  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", c.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={`group relative cursor-grab rounded-[10px] border border-border bg-surface shadow-[0_1px_1px_rgba(0,0,0,0.14)] transition hover:border-border-strong active:cursor-grabbing ${
        dragging ? "rotate-[2deg] opacity-40" : ""
      }`}
    >
      <button type="button" onClick={() => onEdit(c)} className="flex w-full flex-col gap-1.5 px-3 pb-2.5 pt-2.5 text-left">
        {showJob && c.jobTitle && (
          <span
            className="max-w-full self-start truncate rounded-[4px] px-1.5 py-px text-[10.5px] font-bold leading-4"
            style={{ background: color, color: labelText(color) }}
          >
            {c.jobTitle}
          </span>
        )}
        <span className="pr-6 text-[13.5px] font-medium leading-5 text-ink">{c.name}</span>
        {(since || c.notes || c.contact || fb === "pendente" || fb === "atrasada" || fb === "no_prazo") && (
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-muted">
            {(fb === "pendente" || fb === "atrasada") && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onFeedback(c);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onFeedback(c);
                  }
                }}
                title={fb === "atrasada" ? "Devolutiva atrasada: registrar" : "Devolutiva pendente: registrar"}
                className={`inline-flex items-center gap-1 rounded-[4px] px-1.5 py-px font-semibold ${FEEDBACK_TONE[fb]}`}
              >
                <IconClock className="h-3.5 w-3.5" />
                {brDate(c.feedbackDue).slice(0, 5)}
              </span>
            )}
            {fb === "no_prazo" && (
              <span title="Devolutiva dada no prazo" className={`inline-flex items-center gap-1 rounded-[4px] px-1.5 py-px font-semibold ${FEEDBACK_TONE[fb]}`}>
                <IconCheckCircle className="h-3.5 w-3.5" />
                Devolutiva
              </span>
            )}
            {since && (
              <span title={`Na fase desde ${brDate(since)}`} className="inline-flex items-center gap-1">
                <IconCalendar className="h-3.5 w-3.5" />
                {brDate(since).slice(0, 5)}
              </span>
            )}
            {c.notes && (
              <span title="Tem observações" className="inline-flex items-center">
                <IconText className="h-3.5 w-3.5" />
              </span>
            )}
            {c.contact && (
              <span title="Tem contato" className="inline-flex items-center">
                <IconPhone className="h-3.5 w-3.5" />
              </span>
            )}
          </span>
        )}
      </button>

      <button
        type="button"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          // Perto do fim da tela, o menu abre para cima.
          const top = r.bottom + 340 > window.innerHeight ? Math.max(8, r.top - 344) : r.bottom + 4;
          setMenu((m) => (m ? null : { top, left: Math.min(r.left, window.innerWidth - 216) }));
        }}
        aria-label={`Ações de ${c.name}`}
        aria-expanded={Boolean(menu)}
        className={`absolute right-1.5 top-1.5 rounded-[8px] p-1 text-muted transition hover:bg-surface-2 hover:text-ink focus-visible:opacity-100 ${
          menu ? "bg-surface-2 opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        <IconDots className="h-4 w-4" />
      </button>

      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} aria-hidden="true" />
          <div
            role="menu"
            style={{ top: menu.top, left: menu.left }}
            className="fixed z-50 flex w-52 flex-col rounded-[10px] border border-border bg-surface p-1 shadow-[0_12px_30px_-14px_rgba(0,0,0,0.5)]"
          >
            {next && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenu(null);
                  onMove(c, next);
                }}
                className={`${item} text-ok`}
              >
                {next === "contratado" ? "Contratar" : `Aprovar · ${STAGE_SHORT[next]}`}
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(null);
                onFeedback(c);
              }}
              className={item}
            >
              Registrar devolutiva
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(null);
                onEdit(c);
              }}
              className={item}
            >
              Abrir cartão
            </button>
            <span className="px-2.5 pb-1 pt-2 text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted">Mover para</span>
            {STAGES.filter((s) => s !== c.stage && s !== next).map((s) => (
              <button
                key={s}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenu(null);
                  onMove(c, s);
                }}
                className={item}
              >
                {STAGE_SHORT[s]}
              </button>
            ))}
            <span className="my-1 border-t border-border" />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(null);
                onRemove(c);
              }}
              className={`${item} text-critical`}
            >
              Excluir
            </button>
          </div>
        </>
      )}
    </li>
  );
}

// ---------------------------------------------------------------- devolutivas

function FeedbackView({
  candidates,
  templates,
  today,
  onRegister,
  onEditTemplates,
}: {
  candidates: CandidateInfo[];
  templates: FeedbackTemplate[];
  today: string;
  onRegister: (c: CandidateInfo) => void;
  onEditTemplates: () => void;
}) {
  const [filter, setFilter] = useState<"abertas" | "dadas" | "todas">("abertas");
  const rows = candidates
    .map((c) => ({ c, s: feedbackStatus(c, today) }))
    .filter(({ s }) => s && (filter === "todas" || (filter === "abertas" ? s === "pendente" || s === "atrasada" : s === "no_prazo" || s === "com_atraso")))
    .sort((a, b) => (a.c.feedbackDue ?? "").localeCompare(b.c.feedbackDue ?? ""));
  const given = candidates.filter((c) => c.feedbackAt);
  const onTime = given.filter((c) => !c.feedbackDue || c.feedbackAt! <= c.feedbackDue).length;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <section className={cardClass}>
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="font-display text-[17px] font-semibold text-ink">Devolutivas aos candidatos</h2>
          <div className="flex gap-1.5">
            {(["abertas", "dadas", "todas"] as const).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
                className={`rounded-full px-3 py-1 text-xs transition ${
                  filter === f ? "bg-ink font-bold text-bg" : "border border-border-strong font-semibold text-muted hover:text-ink"
                }`}
              >
                {f === "abertas" ? "A dar" : f === "dadas" ? "Dadas" : "Todas"}
              </button>
            ))}
          </div>
        </header>
        <p className="border-b border-border px-4 py-2 text-xs text-muted">
          {given.length ? `${pct(onTime, given.length)}% das devolutivas foram dadas no prazo (${onTime} de ${given.length}).` : "Nenhuma devolutiva registrada ainda."}
          {" "}Prazo padrão: 2 dias depois da decisão.
        </p>
        {rows.length === 0 ? (
          <EmptyState icon={<IconCheckCircle className="h-6 w-6" />} title="Nada por aqui" text="Nenhuma devolutiva neste filtro." />
        ) : (
          <ul className="flex flex-col">
            {rows.map(({ c, s }) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3 first:border-t-0">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-semibold text-ink">{c.name}</span>
                  <span className="truncate text-xs text-muted">
                    {[c.jobTitle, STAGE_SHORT[c.stage], c.feedbackType ? FEEDBACK_LABEL[c.feedbackType] : null].filter(Boolean).join(" · ")}
                  </span>
                  {c.feedbackNote && <span className="mt-0.5 line-clamp-2 text-xs text-muted">{c.feedbackNote}</span>}
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className={`rounded-full px-2 py-px text-[10.5px] font-bold ${FEEDBACK_TONE[s!]}`}>{FEEDBACK_STATUS_LABEL[s!]}</span>
                  <span className="font-mono text-[11px] text-muted">
                    {c.feedbackAt ? `dada ${brDate(c.feedbackAt).slice(0, 5)}${c.feedbackBy ? ` · ${c.feedbackBy}` : ""}` : `prazo ${brDate(c.feedbackDue).slice(0, 5)}`}
                  </span>
                </span>
                <Button type="button" variant="ghost" className="!px-3 !py-1.5 text-xs" onClick={() => onRegister(c)}>
                  {c.feedbackAt ? "Editar" : "Registrar"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={cardClass}>
        <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="font-display text-[17px] font-semibold text-ink">Modelos de mensagem</h2>
          <button type="button" onClick={onEditTemplates} className="text-xs font-semibold text-muted underline-offset-2 hover:text-ink hover:underline">
            Editar modelos
          </button>
        </header>
        {templates.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">Nenhum modelo ainda. Use “Editar modelos” ou importe a planilha.</p>
        ) : (
          <ul className="flex flex-col">
            {templates.map((t) => (
              <li key={t.title} className="flex flex-col gap-1.5 border-t border-border px-4 py-3 first:border-t-0">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-bold text-ink">{t.title}</span>
                  <button type="button" onClick={() => copy(t.text)} className="flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink">
                    <IconCopy className="h-3.5 w-3.5" />
                    Copiar
                  </button>
                </span>
                <span className="line-clamp-3 whitespace-pre-line text-xs text-muted">{t.text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- banco de talentos

function PoolView({
  jobs,
  candidates,
  onCall,
  onEdit,
  onRemove,
}: {
  jobs: JobInfo[];
  candidates: CandidateInfo[];
  onCall: (c: CandidateInfo, jobId: string) => void;
  onEdit: (c: CandidateInfo) => void;
  onRemove: (c: CandidateInfo) => void;
}) {
  const pool = candidates.filter((c) => c.stage === "banco");
  const open = jobs.filter((j) => j.status === "aberta");
  return (
    <section className={cardClass}>
      <header className="border-b border-border px-4 py-3">
        <h2 className="font-display text-[17px] font-semibold text-ink">Banco de talentos</h2>
        <p className="text-xs text-muted">Candidatos guardados para outras oportunidades. “Chamar” leva a pessoa para a fase 1 de uma vaga aberta.</p>
      </header>
      {pool.length === 0 ? (
        <EmptyState icon={<IconUsers className="h-6 w-6" />} title="Banco vazio" text="Quem for para o banco de talentos aparece aqui." />
      ) : (
        <ul className="flex flex-col">
          {pool.map((c) => (
            <li key={c.id} className="group flex flex-wrap items-center gap-3 border-t border-border px-4 py-3 first:border-t-0">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold text-ink">{c.name}</span>
                <span className="truncate text-xs text-muted">
                  {[c.jobTitle ? `veio de ${c.jobTitle}` : null, c.phase2Date ? `fase 2 em ${brDate(c.phase2Date)}` : c.phase1Date ? `fase 1 em ${brDate(c.phase1Date)}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {(c.feedbackNote || c.notes) && <span className="mt-0.5 line-clamp-2 text-xs text-muted">{c.feedbackNote || c.notes}</span>}
              </span>
              {c.contact && <span className="shrink-0 font-mono text-xs text-ink">{c.contact}</span>}
              <Select
                value=""
                onChange={(e) => e.target.value && onCall(c, e.target.value)}
                disabled={open.length === 0}
                className={`${inputClass(false)} h-9 w-44 shrink-0 text-xs disabled:opacity-50`}
                aria-label={`Chamar ${c.name} para uma vaga`}
              >
                <option value="">{open.length ? "Chamar para vaga…" : "Sem vagas abertas"}</option>
                {open.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title}
                  </option>
                ))}
              </Select>
              <span className="flex shrink-0 items-center opacity-60 transition group-hover:opacity-100">
                <button type="button" onClick={() => onEdit(c)} aria-label={`Editar ${c.name}`} className="rounded-[8px] p-1.5 text-muted hover:bg-surface-2 hover:text-ink">
                  <IconEdit className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => onRemove(c)} aria-label={`Excluir ${c.name}`} className="rounded-[8px] p-1.5 text-muted hover:bg-surface-2 hover:text-critical">
                  <IconTrash className="h-4 w-4" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- formulários

function JobModal({
  editing,
  departments,
  onClose,
  onSaved,
}: {
  editing: JobInfo | "new" | null;
  departments: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const blank = { title: "", department: "", priority: 2, status: "aberta" as JobStatus, openedAt: todayKey(), filledAt: "", positions: 1, notes: "" };
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const existing = editing && editing !== "new" ? editing : null;
  useEffect(() => {
    if (!editing) return;
    setForm(
      existing
        ? {
            title: existing.title,
            department: existing.department ?? "",
            priority: existing.priority,
            status: existing.status,
            openedAt: existing.openedAt,
            filledAt: existing.filledAt ?? "",
            positions: existing.positions,
            notes: existing.notes ?? "",
          }
        : blank
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await call(existing ? `/api/frequencia/selecao/vagas/${existing.id}` : "/api/frequencia/selecao/vagas", existing ? "PATCH" : "POST", form);
      toast.success(existing ? "Vaga salva." : "Vaga criada.");
      onSaved();
    } catch (err) {
      errorToast(err);
    } finally {
      setSaving(false);
    }
  }

  const select = `${inputClass(false)} h-10`;
  return (
    <Modal
      open={!!editing}
      onClose={onClose}
      title={existing ? "Editar vaga" : "Nova vaga"}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="selecao-vaga" disabled={saving}>
            {saving ? "Salvando…" : existing ? "Salvar" : "Criar vaga"}
          </Button>
        </>
      }
    >
      <form id="selecao-vaga" onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Vaga">
          <input autoFocus value={form.title} maxLength={120} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Analista de cobrança" className={inputClass(false)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Departamento ou empresa">
            <input list="selecao-deptos" value={form.department} maxLength={80} onChange={(e) => setForm({ ...form, department: e.target.value })} className={inputClass(false)} />
            <datalist id="selecao-deptos">
              {departments.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </Field>
          <Field label="Prioridade">
            <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} className={select}>
              {[1, 2, 3].map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as JobStatus })} className={select}>
              {JOB_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {JOB_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Posições">
            <input type="number" min={1} max={500} value={form.positions} onChange={(e) => setForm({ ...form, positions: Number(e.target.value) })} className={inputClass(false)} />
          </Field>
          <Field label="Data de abertura">
            <input type="date" value={form.openedAt} onChange={(e) => setForm({ ...form, openedAt: e.target.value })} className={inputClass(false)} />
          </Field>
          {form.status === "preenchida" && (
            <Field label="Preenchida em">
              <input type="date" value={form.filledAt} onChange={(e) => setForm({ ...form, filledAt: e.target.value })} className={inputClass(false)} />
            </Field>
          )}
        </div>
        <Field label="Observações (opcional)">
          <textarea rows={2} value={form.notes} maxLength={1000} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputClass(false)} />
        </Field>
      </form>
    </Modal>
  );
}

function CandidateModal({
  editing,
  jobs,
  defaultJobId,
  onClose,
  onSaved,
}: {
  editing: CandidateInfo | "new" | null;
  jobs: JobInfo[];
  defaultJobId: string;
  onClose: () => void;
  onSaved: (c: CandidateInfo, isNew: boolean) => void;
}) {
  const existing = editing && editing !== "new" ? editing : null;
  const empty = (): CandidateInfo => ({
    id: "",
    jobId: defaultJobId || jobs.find((j) => j.status === "aberta")?.id || null,
    jobTitle: null,
    name: "",
    contact: null,
    stage: "fase1",
    phase1Date: todayKey(),
    phase2Date: null,
    phase3Date: null,
    notes: null,
    feedbackDue: null,
    feedbackAt: null,
    feedbackBy: null,
    feedbackType: null,
    feedbackNote: null,
  });
  const [form, setForm] = useState<CandidateInfo>(empty);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (editing) setForm(existing ?? empty());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);
  const set = (patch: Partial<CandidateInfo>) => setForm((f) => ({ ...f, ...patch }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const saved = await call<CandidateInfo>(
        existing ? `/api/frequencia/selecao/candidatos/${existing.id}` : "/api/frequencia/selecao/candidatos",
        existing ? "PATCH" : "POST",
        form
      );
      toast.success(existing ? "Candidato salvo." : "Candidato incluído.");
      onSaved(saved, !existing);
    } catch (err) {
      errorToast(err);
    } finally {
      setSaving(false);
    }
  }

  const select = `${inputClass(false)} h-10`;
  const date = (key: "phase1Date" | "phase2Date" | "phase3Date" | "feedbackDue" | "feedbackAt", label: string) => (
    <Field label={label}>
      <input type="date" value={form[key] ?? ""} onChange={(e) => set({ [key]: e.target.value || null })} className={inputClass(false)} />
    </Field>
  );
  return (
    <Modal
      open={!!editing}
      onClose={onClose}
      title={existing ? "Editar candidato" : "Novo candidato"}
      maxWidthClassName="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="selecao-candidato" disabled={saving}>
            {saving ? "Salvando…" : existing ? "Salvar" : "Incluir"}
          </Button>
        </>
      }
    >
      <form id="selecao-candidato" onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome">
            <input autoFocus value={form.name} maxLength={120} onChange={(e) => set({ name: e.target.value })} className={inputClass(false)} />
          </Field>
          <Field label="Contato (opcional)">
            <input value={form.contact ?? ""} maxLength={80} onChange={(e) => set({ contact: e.target.value || null })} placeholder="Telefone ou e-mail" className={inputClass(false)} />
          </Field>
          <Field label="Vaga">
            <Select value={form.jobId ?? ""} onChange={(e) => set({ jobId: e.target.value || null })} className={select}>
              <option value="">{form.jobTitle ? `${form.jobTitle} (vaga excluída)` : "Sem vaga"}</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Situação">
            <Select value={form.stage} onChange={(e) => set({ stage: e.target.value as Stage })} className={select}>
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {date("phase1Date", "Fase 1")}
          {date("phase2Date", "Fase 2")}
          {date("phase3Date", "Fase 3 (início)")}
        </div>
        <Field label="Observações (opcional)">
          <textarea rows={2} value={form.notes ?? ""} maxLength={1000} onChange={(e) => set({ notes: e.target.value || null })} className={inputClass(false)} />
        </Field>
        <fieldset className="flex flex-col gap-3 rounded-[12px] border border-border p-3">
          <legend className="px-1 text-xs font-bold text-muted">Devolutiva</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tipo">
              <Select value={form.feedbackType ?? ""} onChange={(e) => set({ feedbackType: (e.target.value || null) as FeedbackType | null })} className={select}>
                <option value="">Nenhuma</option>
                {FEEDBACK_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {FEEDBACK_LABEL[t]}
                  </option>
                ))}
              </Select>
            </Field>
            {date("feedbackDue", "Prazo")}
            {date("feedbackAt", "Dada em")}
            <Field label="Quem deu">
              <input value={form.feedbackBy ?? ""} maxLength={80} onChange={(e) => set({ feedbackBy: e.target.value || null })} className={inputClass(false)} />
            </Field>
          </div>
          <Field label="Ponderações">
            <textarea rows={2} value={form.feedbackNote ?? ""} maxLength={1000} onChange={(e) => set({ feedbackNote: e.target.value || null })} className={inputClass(false)} />
          </Field>
        </fieldset>
      </form>
    </Modal>
  );
}

function FeedbackModal({
  candidate,
  templates,
  today,
  onClose,
  onSave,
}: {
  candidate: CandidateInfo | null;
  templates: FeedbackTemplate[];
  today: string;
  onClose: () => void;
  onSave: (c: CandidateInfo) => void;
}) {
  const [form, setForm] = useState({ at: today, by: "", type: "" as FeedbackType | "", note: "" });
  useEffect(() => {
    if (candidate)
      setForm({ at: candidate.feedbackAt ?? today, by: candidate.feedbackBy ?? "", type: candidate.feedbackType ?? "", note: candidate.feedbackNote ?? "" });
  }, [candidate, today]);
  if (!candidate) return null;
  const firstName = candidate.name.split(" ")[0];
  return (
    <Modal
      open
      onClose={onClose}
      title={`Devolutiva · ${candidate.name}`}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() =>
              onSave({ ...candidate, feedbackAt: form.at || today, feedbackBy: form.by || null, feedbackType: form.type || null, feedbackNote: form.note || null })
            }
          >
            Registrar devolutiva
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 text-sm">
        <p className="text-muted">
          {[candidate.jobTitle, STAGE_SHORT[candidate.stage]].filter(Boolean).join(" · ")}
          {candidate.feedbackDue ? ` · prazo ${brDate(candidate.feedbackDue)}` : ""}
        </p>
        {templates.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {templates.map((t) => (
              <button
                key={t.title}
                type="button"
                onClick={() => copy(t.text.replace(/\[Nome do Candidato\]|xxx/gi, firstName))}
                className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-muted hover:text-ink"
                title="Copia a mensagem com o primeiro nome do candidato"
              >
                <IconCopy className="h-3.5 w-3.5" />
                {t.title}
              </button>
            ))}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Dada em">
            <input type="date" value={form.at} onChange={(e) => setForm({ ...form, at: e.target.value })} className={inputClass(false)} />
          </Field>
          <Field label="Quem deu">
            <input value={form.by} maxLength={80} onChange={(e) => setForm({ ...form, by: e.target.value })} className={inputClass(false)} />
          </Field>
        </div>
        <Field label="Tipo">
          <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as FeedbackType | "" })} className={`${inputClass(false)} h-10`}>
            <option value="">—</option>
            {FEEDBACK_TYPES.map((t) => (
              <option key={t} value={t}>
                {FEEDBACK_LABEL[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Ponderações (opcional)">
          <textarea rows={3} value={form.note} maxLength={1000} onChange={(e) => setForm({ ...form, note: e.target.value })} className={inputClass(false)} />
        </Field>
      </div>
    </Modal>
  );
}

interface ImportSummary {
  jobs: number;
  candidates: number;
  stages: Record<string, number>;
  feedbacks: number;
  templates: number;
  warnings: string[];
  replaces: { jobs: number; candidates: number };
}

function ImportModal({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportSummary | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setFile(null);
      setPreview(null);
    }
  }, [open]);

  async function send(apply: boolean) {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      if (apply) form.set("apply", "1");
      const data = await call<{ preview?: ImportSummary; imported?: ImportSummary }>("/api/frequencia/selecao/importar", "POST", form);
      if (apply) {
        toast.success(`${data.imported!.jobs} vagas e ${data.imported!.candidates} candidatos importados.`);
        onImported();
      } else setPreview(data.preview!);
    } catch (err) {
      errorToast(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Importar planilha de vagas"
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancelar
          </Button>
          {preview ? (
            <Button type="button" disabled={busy} onClick={() => send(true)}>
              {busy ? "Importando…" : "Importar"}
            </Button>
          ) : (
            <Button type="button" disabled={busy || !file} onClick={() => send(false)}>
              {busy ? "Lendo…" : "Conferir"}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4 text-sm">
        <p className="text-muted">
          Use a planilha “Acompanhamento de vagas” baixada do Google como Excel (.xlsx). São lidas as abas Vagas, Candidatos, Banco de
          Talentos e Devolutivas, e os modelos de mensagem.
        </p>
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setPreview(null);
          }}
          className="text-sm text-ink file:mr-3 file:rounded-full file:border file:border-border-strong file:bg-surface file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-ink"
        />
        {preview && (
          <div className="flex flex-col gap-2 rounded-[12px] bg-surface-2 p-3">
            <p className="font-semibold text-ink">
              {preview.jobs} vagas e {preview.candidates} candidatos
            </p>
            <p className="text-xs text-muted">
              {Object.entries(preview.stages)
                .map(([s, n]) => `${STAGE_SHORT[s as Stage] ?? s}: ${n}`)
                .join(" · ")}
            </p>
            <p className="text-xs text-muted">
              {preview.feedbacks} devolutivas · {preview.templates} modelos de mensagem
            </p>
            {preview.warnings.map((w) => (
              <p key={w} className="text-xs text-warn">
                {w}
              </p>
            ))}
            {(preview.replaces.jobs > 0 || preview.replaces.candidates > 0) && (
              <p className="rounded-[8px] bg-warn-soft px-2.5 py-1.5 text-xs text-warn">
                Substitui o que já está no sistema ({preview.replaces.jobs} vagas e {preview.replaces.candidates} candidatos).
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function TemplatesModal({
  open,
  templates,
  onClose,
  onSaved,
}: {
  open: boolean;
  templates: FeedbackTemplate[];
  onClose: () => void;
  onSaved: (list: FeedbackTemplate[]) => void;
}) {
  const [list, setList] = useState<FeedbackTemplate[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setList(templates.length ? templates : [{ title: "", text: "" }]);
  }, [open, templates]);
  async function save() {
    setSaving(true);
    try {
      const data = await call<{ templates: FeedbackTemplate[] }>("/api/frequencia/selecao/modelos", "PUT", { templates: list });
      toast.success("Modelos salvos.");
      onSaved(data.templates);
    } catch (err) {
      errorToast(err);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Modelos de mensagem"
      maxWidthClassName="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" type="button" onClick={() => setList((l) => [...l, { title: "", text: "" }])}>
            Novo modelo
          </Button>
          <Button type="button" disabled={saving} onClick={save}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-xs text-muted">Ao copiar na devolutiva, “[Nome do Candidato]” e “xxx” viram o primeiro nome da pessoa.</p>
        {list.map((t, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-[12px] border border-border p-3">
            <div className="flex items-center gap-2">
              <input
                value={t.title}
                maxLength={120}
                placeholder="Título (ex.: Reprovação na fase 1)"
                onChange={(e) => setList((l) => l.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                className={inputClass(false)}
              />
              <button
                type="button"
                aria-label="Tirar modelo"
                onClick={() => setList((l) => l.filter((_, j) => j !== i))}
                className="rounded-[8px] p-2 text-muted hover:bg-surface-2 hover:text-critical"
              >
                <IconTrash className="h-4 w-4" />
              </button>
            </div>
            <textarea
              rows={5}
              value={t.text}
              maxLength={4000}
              onChange={(e) => setList((l) => l.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
              className={inputClass(false)}
            />
          </div>
        ))}
      </div>
    </Modal>
  );
}
