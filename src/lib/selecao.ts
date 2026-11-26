/**
 * Processos seletivos: vagas, candidatos em fases (funil), devolutivas e banco de talentos.
 * Datas sem hora são "AAAA-MM-DD" (no banco, meia-noite UTC).
 */

export type JobStatus = "aberta" | "pausada" | "preenchida" | "cancelada";
export const JOB_STATUSES: JobStatus[] = ["aberta", "pausada", "preenchida", "cancelada"];
export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  aberta: "Aberta",
  pausada: "Pausada",
  preenchida: "Preenchida",
  cancelada: "Cancelada",
};

export const PRIORITY_LABEL: Record<number, string> = { 1: "Alta", 2: "Média", 3: "Baixa" };

export type Stage = "fase1" | "fase2" | "fase3" | "contratado" | "reprovado" | "desistiu" | "banco";
/** Fases em andamento (colunas do quadro), na ordem. */
export const ACTIVE_STAGES: Stage[] = ["fase1", "fase2", "fase3", "contratado"];
/** Saídas do processo. */
export const CLOSED_STAGES: Stage[] = ["reprovado", "desistiu", "banco"];
export const STAGES: Stage[] = [...ACTIVE_STAGES, ...CLOSED_STAGES];
export const STAGE_LABEL: Record<Stage, string> = {
  fase1: "Fase 1 · entrevista RH",
  fase2: "Fase 2 · coordenadores",
  fase3: "Fase 3 · período de teste",
  contratado: "Contratado",
  reprovado: "Reprovado",
  desistiu: "Desistiu",
  banco: "Banco de talentos",
};
export const STAGE_SHORT: Record<Stage, string> = {
  fase1: "Fase 1",
  fase2: "Fase 2",
  fase3: "Fase 3",
  contratado: "Contratado",
  reprovado: "Reprovado",
  desistiu: "Desistiu",
  banco: "Banco de talentos",
};

export type FeedbackType = "fase2" | "teste" | "reprovacao" | "banco";
export const FEEDBACK_TYPES: FeedbackType[] = ["fase2", "teste", "reprovacao", "banco"];
export const FEEDBACK_LABEL: Record<FeedbackType, string> = {
  fase2: "Aprovação para a fase 2",
  teste: "Aprovação para o período de teste",
  reprovacao: "Reprovação",
  banco: "Banco de talentos",
};
/** Devolutiva que a mudança de fase pede (null: nenhuma). */
export function feedbackFor(stage: Stage): FeedbackType | null {
  return stage === "fase2" ? "fase2" : stage === "fase3" ? "teste" : stage === "reprovado" ? "reprovacao" : stage === "banco" ? "banco" : null;
}
/** Prazo padrão para dar a devolutiva (dias corridos depois da decisão). */
export const FEEDBACK_DAYS = 2;

export interface JobInfo {
  id: string;
  title: string;
  department: string | null;
  priority: number;
  status: JobStatus;
  openedAt: string;
  filledAt: string | null;
  positions: number;
  extraPhase1: number;
  extraHired: number;
  notes: string | null;
}

export interface CandidateInfo {
  id: string;
  jobId: string | null;
  jobTitle: string | null;
  name: string;
  contact: string | null;
  stage: Stage;
  phase1Date: string | null;
  phase2Date: string | null;
  phase3Date: string | null;
  notes: string | null;
  feedbackDue: string | null;
  feedbackAt: string | null;
  feedbackBy: string | null;
  feedbackType: FeedbackType | null;
  feedbackNote: string | null;
}

export interface FeedbackTemplate {
  title: string;
  text: string;
}

// ---------------------------------------------------------------- datas

const DAY = 86_400_000;
export const isoDay = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
export const addDaysKey = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
export const brDate = (day: string | null) => (day ? `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}` : "—");

// ---------------------------------------------------------------- funil

export interface Funnel {
  phase1: number;
  phase2: number;
  phase3: number;
  hired: number;
  rejected: number;
  gaveUp: number;
  pool: number;
  /** Ainda em processo (fases 1 a 3). */
  inProcess: number;
}

/** Até onde o candidato chegou (para o funil, quem foi reprovado na fase 2 conta na fase 2). */
function reached(c: CandidateInfo): number {
  if (c.stage === "contratado") return 4;
  if (c.stage === "fase3" || c.phase3Date) return 3;
  if (c.stage === "fase2" || c.phase2Date) return 2;
  return 1;
}

export function funnelOf(candidates: CandidateInfo[], jobs: Pick<JobInfo, "extraPhase1" | "extraHired">[] = []): Funnel {
  const extra1 = jobs.reduce((n, j) => n + j.extraPhase1, 0);
  const extraHired = jobs.reduce((n, j) => n + j.extraHired, 0);
  const f: Funnel = { phase1: extra1, phase2: 0, phase3: 0, hired: extraHired, rejected: 0, gaveUp: 0, pool: 0, inProcess: 0 };
  for (const c of candidates) {
    const r = reached(c);
    f.phase1++;
    if (r >= 2) f.phase2++;
    if (r >= 3) f.phase3++;
    if (r >= 4) f.hired++;
    if (c.stage === "reprovado") f.rejected++;
    if (c.stage === "desistiu") f.gaveUp++;
    if (c.stage === "banco") f.pool++;
    if (c.stage === "fase1" || c.stage === "fase2" || c.stage === "fase3") f.inProcess++;
  }
  // Contratados fora da lista também passaram pelas fases.
  f.phase3 = Math.max(f.phase3, f.hired);
  f.phase2 = Math.max(f.phase2, f.phase3);
  f.phase1 = Math.max(f.phase1, f.phase2);
  return f;
}

export const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

export function jobHired(job: JobInfo, candidates: CandidateInfo[]): number {
  return job.extraHired + candidates.filter((c) => c.jobId === job.id && c.stage === "contratado").length;
}

/** Dias em aberto (até hoje, ou até preencher). */
export function jobDaysOpen(job: JobInfo, today: string): number {
  return Math.max(0, daysBetween(job.openedAt, job.filledAt ?? today));
}

// ---------------------------------------------------------------- devolutivas

export type FeedbackStatus = "pendente" | "atrasada" | "no_prazo" | "com_atraso";
export const FEEDBACK_STATUS_LABEL: Record<FeedbackStatus, string> = {
  pendente: "Pendente",
  atrasada: "Atrasada",
  no_prazo: "Dada no prazo",
  com_atraso: "Dada com atraso",
};

/** Situação da devolutiva (null: o candidato não tem devolutiva a dar). */
export function feedbackStatus(c: CandidateInfo, today: string): FeedbackStatus | null {
  if (!c.feedbackDue && !c.feedbackAt) return null;
  if (c.feedbackAt) return c.feedbackDue && c.feedbackAt > c.feedbackDue ? "com_atraso" : "no_prazo";
  return c.feedbackDue && c.feedbackDue < today ? "atrasada" : "pendente";
}

// ---------------------------------------------------------------- validação

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
const cleanText = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
function day(v: unknown): Date | null {
  const s = typeof v === "string" ? v.trim() : "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === s ? d : null;
}

export function parseJob(body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  const title = clean(b.title, 120);
  if (!title) return { error: "Escreva o nome da vaga." } as const;
  const openedAt = day(b.openedAt);
  if (!openedAt) return { error: "Informe a data de abertura." } as const;
  const status = JOB_STATUSES.includes(b.status as JobStatus) ? (b.status as JobStatus) : "aberta";
  const priority = [1, 2, 3].includes(Number(b.priority)) ? Number(b.priority) : 2;
  const positions = Math.min(500, Math.max(1, Math.floor(Number(b.positions) || 1)));
  return {
    data: {
      title,
      department: clean(b.department, 80) || null,
      priority,
      status,
      openedAt,
      filledAt: status === "preenchida" ? (day(b.filledAt) ?? new Date(`${todayKey()}T00:00:00Z`)) : null,
      positions,
      notes: cleanText(b.notes, 1000) || null,
    },
  } as const;
}

export function parseCandidate(body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = clean(b.name, 120);
  if (!name) return { error: "Escreva o nome do candidato." } as const;
  const stage = STAGES.includes(b.stage as Stage) ? (b.stage as Stage) : "fase1";
  const fbType = FEEDBACK_TYPES.includes(b.feedbackType as FeedbackType) ? (b.feedbackType as FeedbackType) : null;
  return {
    data: {
      jobId: typeof b.jobId === "string" && b.jobId ? b.jobId : null,
      name,
      contact: clean(b.contact, 80) || null,
      stage,
      phase1Date: day(b.phase1Date),
      phase2Date: day(b.phase2Date),
      phase3Date: day(b.phase3Date),
      notes: cleanText(b.notes, 1000) || null,
      feedbackDue: day(b.feedbackDue),
      feedbackAt: day(b.feedbackAt),
      feedbackBy: clean(b.feedbackBy, 80) || null,
      feedbackType: fbType,
      feedbackNote: cleanText(b.feedbackNote, 1000) || null,
    },
  } as const;
}

export function parseTemplates(body: unknown): FeedbackTemplate[] | null {
  const list = (body as { templates?: unknown })?.templates;
  if (!Array.isArray(list)) return null;
  return list
    .slice(0, 20)
    .map((t) => ({ title: clean((t as FeedbackTemplate)?.title, 120), text: cleanText((t as FeedbackTemplate)?.text, 4000) }))
    .filter((t) => t.title && t.text);
}

// ---------------------------------------------------------------- conversão do banco

type JobRow = {
  id: string;
  title: string;
  department: string | null;
  priority: number;
  status: string;
  openedAt: Date;
  filledAt: Date | null;
  positions: number;
  extraPhase1: number;
  extraHired: number;
  notes: string | null;
};
export function toJobInfo(j: JobRow): JobInfo {
  return {
    ...j,
    status: JOB_STATUSES.includes(j.status as JobStatus) ? (j.status as JobStatus) : "aberta",
    openedAt: isoDay(j.openedAt)!,
    filledAt: isoDay(j.filledAt),
  };
}

type CandidateRow = {
  id: string;
  jobId: string | null;
  jobTitle: string | null;
  name: string;
  contact: string | null;
  stage: string;
  phase1Date: Date | null;
  phase2Date: Date | null;
  phase3Date: Date | null;
  notes: string | null;
  feedbackDue: Date | null;
  feedbackAt: Date | null;
  feedbackBy: string | null;
  feedbackType: string | null;
  feedbackNote: string | null;
};
export function toCandidateInfo(c: CandidateRow): CandidateInfo {
  return {
    id: c.id,
    jobId: c.jobId,
    jobTitle: c.jobTitle,
    name: c.name,
    contact: c.contact,
    stage: STAGES.includes(c.stage as Stage) ? (c.stage as Stage) : "fase1",
    phase1Date: isoDay(c.phase1Date),
    phase2Date: isoDay(c.phase2Date),
    phase3Date: isoDay(c.phase3Date),
    notes: c.notes,
    feedbackDue: isoDay(c.feedbackDue),
    feedbackAt: isoDay(c.feedbackAt),
    feedbackBy: c.feedbackBy,
    feedbackType: FEEDBACK_TYPES.includes(c.feedbackType as FeedbackType) ? (c.feedbackType as FeedbackType) : null,
    feedbackNote: c.feedbackNote,
  };
}

/** Move o candidato de fase: marca a data da fase (se faltar) e abre a devolutiva que a decisão pede. */
export function moveCandidate(c: CandidateInfo, stage: Stage, today: string): CandidateInfo {
  const next: CandidateInfo = { ...c, stage };
  if (stage === "fase1" && !c.phase1Date) next.phase1Date = today;
  if (stage === "fase2" && !c.phase2Date) next.phase2Date = today;
  if ((stage === "fase3" || stage === "contratado") && !c.phase3Date) next.phase3Date = today;
  const fb = feedbackFor(stage);
  if (fb) {
    next.feedbackType = fb;
    next.feedbackDue = addDaysKey(today, FEEDBACK_DAYS);
    next.feedbackAt = null;
    next.feedbackBy = null;
  }
  return next;
}

/** Próxima fase do quadro (null: já está na última). */
export function nextStage(stage: Stage): Stage | null {
  const i = ACTIVE_STAGES.indexOf(stage);
  return i >= 0 && i < ACTIVE_STAGES.length - 1 ? ACTIVE_STAGES[i + 1] : null;
}
