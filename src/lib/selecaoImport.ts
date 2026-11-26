import { XlsxSheet, excelDate } from "./xlsx";
import { FeedbackTemplate, FeedbackType, JobStatus, Stage } from "./selecao";

/**
 * Importação da planilha "Acompanhamento de vagas" (abas Vagas, Candidatos, Banco de
 * Talentos e Devolutivas). Lê pelos títulos das colunas, então a ordem pode mudar.
 * Os dados ficam só no banco do sistema; nada disto vai para o código.
 */

export interface ImportedJob {
  key: string;
  title: string;
  department: string | null;
  priority: number;
  status: JobStatus;
  openedAt: Date;
  filledAt: Date | null;
  positions: number;
  extraPhase1: number;
  extraHired: number;
  notes: string | null;
}

export interface ImportedCandidate {
  jobKey: string | null;
  jobTitle: string | null;
  name: string;
  contact: string | null;
  stage: Stage;
  phase1Date: Date | null;
  phase2Date: Date | null;
  phase3Date: Date | null;
  notes: string | null;
  feedbackDue: Date | null;
  feedbackAt: Date | null;
  feedbackBy: string | null;
  feedbackType: FeedbackType | null;
  feedbackNote: string | null;
}

export interface ImportPlan {
  jobs: ImportedJob[];
  candidates: ImportedCandidate[];
  templates: FeedbackTemplate[];
  warnings: string[];
}

/** Chave para comparar nomes e vagas: sem acento, sem caixa, espaços únicos. */
export const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const cell = (row: string[] | undefined, i: number) => (i >= 0 && row ? (row[i] ?? "").trim() : "");

/** Linha de títulos: a primeira cuja célula A é um dos nomes esperados. */
function header(sheet: XlsxSheet, first: string[]): { index: number; cols: string[] } | null {
  const wanted = first.map(norm);
  const index = sheet.rows.findIndex((r) => wanted.includes(norm(r?.[0] ?? "")));
  return index < 0 ? null : { index, cols: sheet.rows[index].map((c) => norm(c ?? "")) };
}
const colOf = (cols: string[], ...names: string[]) => {
  for (const n of names.map(norm)) {
    const i = cols.indexOf(n);
    if (i >= 0) return i;
  }
  return -1;
};
const sheetNamed = (sheets: XlsxSheet[], name: string) => sheets.find((s) => norm(s.name) === norm(name));

const STAGE_FROM: Record<string, Stage> = {
  "fase 1": "fase1",
  "fase 2": "fase2",
  "fase 3": "fase3",
  contratado: "contratado",
  contratada: "contratado",
  reprovado: "reprovado",
  reprovada: "reprovado",
  desistiu: "desistiu",
  "banco de talentos": "banco",
};
const stageFrom = (s: string): Stage | null => STAGE_FROM[norm(s)] ?? null;

function feedbackTypeFrom(s: string): FeedbackType | null {
  const n = norm(s);
  if (!n) return null;
  if (n.includes("reprov")) return "reprovacao";
  if (n.includes("banco")) return "banco";
  if (n.includes("teste") || n.includes("3")) return "teste";
  if (n.includes("2")) return "fase2";
  return null;
}

const statusFrom = (s: string): JobStatus => {
  const n = norm(s);
  return n.startsWith("pausad") ? "pausada" : n.startsWith("preenchid") ? "preenchida" : n.startsWith("cancelad") ? "cancelada" : "aberta";
};

const num = (s: string) => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export function planImport(sheets: XlsxSheet[]): ImportPlan {
  const warnings: string[] = [];
  const jobs: ImportedJob[] = [];
  const jobByTitle = new Map<string, ImportedJob>();
  const hiredNames = new Map<string, Set<string>>(); // vaga → nomes contratados
  const extraCounts = new Map<string, { phase1: number; hired: number }>();

  // ------------------------------------------------------------ Vagas
  const vagas = sheetNamed(sheets, "Vagas");
  const hv = vagas && header(vagas, ["Vaga"]);
  if (!vagas || !hv) warnings.push("Aba “Vagas” não encontrada: as vagas serão criadas a partir dos candidatos.");
  else {
    const c = {
      title: colOf(hv.cols, "Vaga"),
      priority: colOf(hv.cols, "Prioridade"),
      department: colOf(hv.cols, "Departamento"),
      status: colOf(hv.cols, "Status da vaga", "Status"),
      opened: colOf(hv.cols, "Data de abertura"),
      positions: colOf(hv.cols, "Posições necessárias"),
      hired: colOf(hv.cols, "Contratados"),
      hiredNames: colOf(hv.cols, "Quem foi contratado"),
      notes: colOf(hv.cols, "Observações"),
      fillDays: colOf(hv.cols, "Dias até preencher"),
      phase1: colOf(hv.cols, "Fizeram a Fase 1"),
    };
    for (const row of vagas.rows.slice(hv.index + 1)) {
      const title = cell(row, c.title);
      // Linhas de soma da planilha ("Total", "Totais") não são vagas.
      if (!title || /^(total|totais)( geral)?$/.test(norm(title))) continue;
      const openedAt = excelDate(cell(row, c.opened)) ?? new Date();
      const status = statusFrom(cell(row, c.status));
      const fillDays = num(cell(row, c.fillDays));
      const job: ImportedJob = {
        key: norm(title),
        title,
        department: cell(row, c.department) || null,
        priority: [1, 2, 3].includes(num(cell(row, c.priority)) ?? 0) ? num(cell(row, c.priority))! : 2,
        status,
        openedAt,
        filledAt: status === "preenchida" && fillDays !== null ? new Date(openedAt.getTime() + Math.round(fillDays) * 86_400_000) : null,
        positions: Math.max(1, Math.round(num(cell(row, c.positions)) ?? 1)),
        extraPhase1: 0,
        extraHired: 0,
        notes: cell(row, c.notes) || null,
      };
      if (jobByTitle.has(job.key)) continue;
      jobs.push(job);
      jobByTitle.set(job.key, job);
      hiredNames.set(job.key, new Set(cell(row, c.hiredNames).split(/[,;\n]/).map(norm).filter(Boolean)));
      extraCounts.set(job.key, { phase1: Math.round(num(cell(row, c.phase1)) ?? 0), hired: Math.round(num(cell(row, c.hired)) ?? 0) });
    }
  }

  const jobFor = (title: string): ImportedJob | null => {
    const key = norm(title);
    if (!key) return null;
    let job = jobByTitle.get(key);
    if (!job) {
      job = {
        key,
        title: title.trim(),
        department: null,
        priority: 2,
        status: "aberta",
        openedAt: new Date(),
        filledAt: null,
        positions: 1,
        extraPhase1: 0,
        extraHired: 0,
        notes: null,
      };
      jobs.push(job);
      jobByTitle.set(key, job);
      warnings.push(`Vaga “${job.title}” não estava na aba Vagas e foi criada.`);
    }
    return job;
  };

  // ------------------------------------------------------------ Candidatos
  const candidates: ImportedCandidate[] = [];
  const byKey = new Map<string, ImportedCandidate>(); // nome|vaga
  const byName = new Map<string, ImportedCandidate[]>();
  const add = (c: ImportedCandidate) => {
    candidates.push(c);
    byKey.set(`${norm(c.name)}|${c.jobKey ?? ""}`, c);
    byName.set(norm(c.name), [...(byName.get(norm(c.name)) ?? []), c]);
  };
  const find = (name: string, jobTitle: string) =>
    byKey.get(`${norm(name)}|${norm(jobTitle)}`) ?? (byName.get(norm(name))?.length === 1 ? byName.get(norm(name))![0] : undefined);
  const blank = (name: string, jobTitle: string, stage: Stage): ImportedCandidate => {
    const job = jobFor(jobTitle);
    return {
      jobKey: job?.key ?? null,
      jobTitle: job?.title ?? (jobTitle.trim() || null),
      name: name.trim(),
      contact: null,
      stage,
      phase1Date: null,
      phase2Date: null,
      phase3Date: null,
      notes: null,
      feedbackDue: null,
      feedbackAt: null,
      feedbackBy: null,
      feedbackType: null,
      feedbackNote: null,
    };
  };

  const cand = sheetNamed(sheets, "Candidatos");
  const hc = cand && header(cand, ["Nome do candidato", "Candidato", "Nome"]);
  if (!cand || !hc) warnings.push("Aba “Candidatos” não encontrada.");
  else {
    const c = {
      name: 0,
      job: colOf(hc.cols, "Vaga"),
      stage: colOf(hc.cols, "Situação atual", "Situação"),
      d1: colOf(hc.cols, "Data da Fase 1"),
      d2: colOf(hc.cols, "Data da Fase 2"),
      d3: colOf(hc.cols, "Data da Fase 3 (início na empresa)", "Data da Fase 3"),
      notes: colOf(hc.cols, "Observações"),
    };
    for (const row of cand.rows.slice(hc.index + 1)) {
      const name = cell(row, c.name);
      if (!name) continue;
      const jobTitle = cell(row, c.job);
      let stage = stageFrom(cell(row, c.stage)) ?? "fase1";
      const job = jobFor(jobTitle);
      if (job && hiredNames.get(job.key)?.has(norm(name))) stage = "contratado";
      const item = blank(name, jobTitle, stage);
      item.phase1Date = excelDate(cell(row, c.d1));
      item.phase2Date = excelDate(cell(row, c.d2));
      item.phase3Date = excelDate(cell(row, c.d3));
      item.notes = cell(row, c.notes) || null;
      add(item);
    }
  }

  // ------------------------------------------------------------ Banco de talentos
  const pool = sheetNamed(sheets, "Banco de Talentos");
  if (pool) {
    const hp = header(pool, ["Nome do candidato", "Candidato", "Nome"]);
    const cols = hp?.cols ?? [];
    const c = {
      job: hp ? colOf(cols, "Vaga") : 1,
      d1: hp ? colOf(cols, "Data da Fase 1") : 2,
      d2: hp ? colOf(cols, "Data da Fase 2") : 3,
      contact: hp ? colOf(cols, "Contato", "Telefone") : 4,
    };
    for (const row of pool.rows.slice(hp ? hp.index + 1 : 0)) {
      const name = cell(row, 0);
      if (!name || norm(name) === "nome do candidato") continue;
      const jobTitle = cell(row, c.job);
      let item = find(name, jobTitle);
      if (!item) {
        item = blank(name, jobTitle, "banco");
        item.phase1Date = excelDate(cell(row, c.d1));
        item.phase2Date = excelDate(cell(row, c.d2));
        add(item);
      }
      item.stage = "banco";
      item.contact = cell(row, c.contact) || item.contact;
    }
  }

  // ------------------------------------------------------------ Devolutivas e modelos
  const templates: FeedbackTemplate[] = [];
  const dev = sheetNamed(sheets, "Devolutivas");
  const hd = dev && header(dev, ["Candidato", "Nome do candidato"]);
  if (dev && hd) {
    const c = {
      job: colOf(hd.cols, "Vaga de origem", "Vaga"),
      stage: colOf(hd.cols, "Situação atual", "Situação"),
      due: colOf(hd.cols, "Data máxima da devolutiva"),
      given: colOf(hd.cols, "Devolutiva dada?"),
      type: colOf(hd.cols, "Tipo"),
      note: colOf(hd.cols, "Ponderações"),
      at: colOf(hd.cols, "Data da devolutiva"),
      by: colOf(hd.cols, "Quem deu a devolutiva"),
    };
    for (const row of dev.rows.slice(hd.index + 1)) {
      const name = cell(row, 0);
      if (!name) continue;
      const jobTitle = cell(row, c.job);
      let item = find(name, jobTitle);
      if (!item) {
        item = blank(name, jobTitle, stageFrom(cell(row, c.stage)) ?? "fase1");
        add(item);
      }
      item.feedbackDue = excelDate(cell(row, c.due)) ?? item.feedbackDue;
      const at = excelDate(cell(row, c.at));
      if (at || norm(cell(row, c.given)) === "sim") item.feedbackAt = at ?? item.feedbackDue ?? new Date();
      item.feedbackBy = cell(row, c.by) || item.feedbackBy;
      item.feedbackType = feedbackTypeFrom(cell(row, c.type)) ?? item.feedbackType;
      item.feedbackNote = cell(row, c.note) || item.feedbackNote;
    }
    // Modelos: coluna com o título "PADROES DE DEVOLUTIVA" seguida de pares título / texto.
    const tCol = dev.rows.reduce((found, r) => (found >= 0 ? found : (r ?? []).findIndex((v) => norm(v ?? "").startsWith("padroes de devolutiva"))), -1);
    if (tCol >= 0) {
      const values = dev.rows.map((r) => cell(r, tCol)).filter(Boolean);
      const start = values.findIndex((v) => norm(v).startsWith("padroes de devolutiva"));
      // Título curto seguido do texto (longo ou com quebra de linha); títulos sem texto são só avisos.
      const isText = (v: string) => v.includes("\n") || v.length > 140;
      let title: string | null = null;
      for (const v of values.slice(start + 1)) {
        if (isText(v)) {
          if (title) templates.push({ title: title.slice(0, 120), text: v.slice(0, 4000) });
          title = null;
        } else title = v;
      }
    }
  }

  // Números de antes do sistema: o que a aba Vagas conta além dos candidatos listados.
  for (const job of jobs) {
    const extra = extraCounts.get(job.key);
    if (!extra) continue;
    const mine = candidates.filter((c) => c.jobKey === job.key);
    job.extraPhase1 = Math.max(0, extra.phase1 - mine.length);
    job.extraHired = Math.max(0, extra.hired - mine.filter((c) => c.stage === "contratado").length);
  }

  return { jobs, candidates, templates, warnings };
}
