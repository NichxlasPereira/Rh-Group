import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFFont, PDFPage, rgb, RGB } from "pdf-lib";
import {
  EmployeeSummary,
  MonthTotals,
  OCCURRENCE_LABEL,
  Occurrence,
  addTotals,
  daysInMonth,
  emptyTotals,
  formatDuration,
  minutesBetween,
  monthKeyLabel,
  overlapsMonth,
  pluralDias,
  summarizeByEmployee,
} from "./attendance";

/**
 * Resumo mensal de ocorrências em PDF, separado por setor (empresa): visão
 * geral do mês, e para cada empresa os totais por colaborador e a lista das
 * ocorrências. Observações ficam de fora (podem ter dado de saúde).
 */

export const NO_SECTOR = "Sem setor";

export interface SectorBlock {
  name: string;
  brandColor: string | null;
  people: EmployeeSummary[];
  totals: MonthTotals;
  occurrences: Occurrence[];
}

/** Agrupa as ocorrências do mês por setor (empresa gravada na ocorrência). */
export function sectorsForMonth(occurrences: Occurrence[], month: string, brandColors: Map<string, string>): SectorBlock[] {
  const inMonth = occurrences.filter((o) => overlapsMonth(o, month));
  const groups = new Map<string, Occurrence[]>();
  for (const o of inMonth) {
    const key = o.employeeDepartment?.trim() || NO_SECTOR;
    groups.set(key, [...(groups.get(key) ?? []), o]);
  }
  return [...groups]
    .map(([name, list]) => {
      const people = summarizeByEmployee(list, month).sort(
        (a, b) =>
          b.faltasInjustificadas - a.faltasInjustificadas ||
          b.faltas - a.faltas ||
          b.diasAtestado - a.diasAtestado ||
          b.diasFolga - a.diasFolga ||
          a.name.localeCompare(b.name, "pt")
      );
      const totals = emptyTotals();
      for (const p of people) addTotals(totals, p);
      const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date) || a.employeeName.localeCompare(b.employeeName, "pt"));
      return { name, brandColor: brandColors.get(name) ?? null, people, totals, occurrences: sorted };
    })
    .sort((a, b) => (a.name === NO_SECTOR ? 1 : b.name === NO_SECTOR ? -1 : a.name.localeCompare(b.name, "pt")));
}

// ---------------------------------------------------------------- desenho

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 40;
const BOTTOM = 52; // espaço do rodapé
const WIDTH = A4[0] - MARGIN * 2;

const INK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.42, 0.42, 0.42);
const LINE = rgb(0.88, 0.88, 0.88);
const FILL = rgb(0.955, 0.955, 0.955);
const CRITICAL = rgb(0.7, 0.15, 0.12);

function hexColor(hex: string | null): RGB {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex ?? "");
  return m ? rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255) : INK;
}

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function period(o: Occurrence): string {
  const a = o.date.slice(0, 10);
  const b = o.endDate.slice(0, 10);
  return a === b ? ddmm(a) : `${ddmm(a)} – ${ddmm(b)}`;
}

function detail(o: Occurrence, month: string): string {
  if (o.type === "falta") return o.justified ? "Justificada" : "Não justificada";
  if (o.type === "horas") {
    const mins = minutesBetween(o.startTime, o.endTime);
    return o.startTime && o.endTime ? `${o.startTime}–${o.endTime} (${formatDuration(mins)})` : "Horário não informado";
  }
  const days = daysInMonth(o, month);
  const base = `${pluralDias(days)} no mês`;
  return o.type === "folga" && o.approvedBy ? `${base} · aprovada por ${o.approvedBy}` : base;
}

interface Col {
  title: string;
  width: number;
  align?: "right";
}

class Doc {
  page!: PDFPage;
  y = 0;
  constructor(
    private pdf: PDFDocument,
    private regular: PDFFont,
    private bold: PDFFont
  ) {
    this.newPage();
  }

  newPage() {
    this.page = this.pdf.addPage(A4);
    this.y = A4[1] - MARGIN;
  }

  /** Garante espaço; senão, página nova. Devolve true se trocou de página. */
  room(height: number): boolean {
    if (this.y - height >= BOTTOM) return false;
    this.newPage();
    return true;
  }

  fit(text: string, size: number, maxWidth: number, font = this.regular): string {
    if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
    let t = text;
    while (t.length > 1 && font.widthOfTextAtSize(t + "…", size) > maxWidth) t = t.slice(0, -1);
    return t.trimEnd() + "…";
  }

  text(text: string, x: number, y: number, opts: { size?: number; bold?: boolean; color?: RGB; maxWidth?: number; align?: "right"; width?: number } = {}) {
    const size = opts.size ?? 9;
    const font = opts.bold ? this.bold : this.regular;
    const t = opts.maxWidth ? this.fit(text, size, opts.maxWidth, font) : text;
    const dx = opts.align === "right" && opts.width ? opts.width - font.widthOfTextAtSize(t, size) : 0;
    this.page.drawText(t, { x: x + dx, y, size, font, color: opts.color ?? INK });
  }

  line(y: number, color = LINE, thickness = 0.6) {
    this.page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + WIDTH, y }, thickness, color });
  }

  /** Tabela com cabeçalho repetido quando muda de página. */
  table(cols: Col[], rows: { cells: string[]; bold?: boolean; fill?: boolean; colors?: (RGB | undefined)[] }[]) {
    const rowH = 17;
    const header = () => {
      this.page.drawRectangle({ x: MARGIN, y: this.y - rowH + 4, width: WIDTH, height: rowH, color: FILL });
      let x = MARGIN + 6;
      for (const c of cols) {
        this.text(c.title, x, this.y - 8, { size: 7.5, bold: true, color: MUTED, align: c.align, width: c.width - 12, maxWidth: c.width - 12 });
        x += c.width;
      }
      this.y -= rowH;
    };
    this.room(rowH * 2);
    header();
    for (const r of rows) {
      if (this.room(rowH)) header();
      if (r.fill) this.page.drawRectangle({ x: MARGIN, y: this.y - rowH + 4, width: WIDTH, height: rowH, color: FILL });
      let x = MARGIN + 6;
      r.cells.forEach((cell, i) => {
        const c = cols[i];
        this.text(cell, x, this.y - 8, {
          size: 8.5,
          bold: r.bold,
          color: r.colors?.[i] ?? (cell === "0" || cell === "–" ? MUTED : INK),
          align: c.align,
          width: c.width - 12,
          maxWidth: c.width - 12,
        });
        x += c.width;
      });
      this.y -= rowH;
      this.line(this.y + 4);
    }
  }
}

const NUM = 56;
const numCols = (): Col[] => [
  { title: "Faltas", width: NUM, align: "right" },
  { title: "Não just.", width: NUM, align: "right" },
  { title: "Dias atest.", width: NUM, align: "right" },
  { title: "Dias folga", width: NUM, align: "right" },
  { title: "Horas", width: NUM, align: "right" },
];

const nums = (t: MonthTotals): string[] => [
  String(t.faltas),
  String(t.faltasInjustificadas),
  String(t.diasAtestado),
  String(t.diasFolga),
  t.horas ? formatDuration(t.minutosHoras) : "0",
];

const numColors = (t: MonthTotals): (RGB | undefined)[] => [undefined, t.faltasInjustificadas > 0 ? CRITICAL : undefined];

const FONTS_DIR = path.join(process.cwd(), "node_modules", "@fontsource", "arimo", "files");

export async function occurrenceReportPdf(input: {
  month: string;
  sectors: SectorBlock[];
  generatedBy: string;
  generatedAt: Date;
}): Promise<Uint8Array> {
  const { month, sectors } = input;
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const [r, b] = await Promise.all([
    readFile(path.join(FONTS_DIR, "arimo-latin-400-normal.woff")),
    readFile(path.join(FONTS_DIR, "arimo-latin-700-normal.woff")),
  ]);
  const regular = await pdf.embedFont(r, { subset: true });
  const bold = await pdf.embedFont(b, { subset: true });
  const title = `Resumo de ocorrências — ${monthKeyLabel(month)}`;
  pdf.setTitle(title);
  pdf.setAuthor("RHGroup · CFFGROUP");
  pdf.setCreationDate(input.generatedAt);

  const doc = new Doc(pdf, regular, bold);
  const when = input.generatedAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

  // Cabeçalho
  doc.text("RHGROUP · CFFGROUP", MARGIN, doc.y - 8, { size: 8, bold: true, color: MUTED });
  doc.text("Resumo mensal de ocorrências", MARGIN, doc.y - 30, { size: 20, bold: true });
  doc.text(monthKeyLabel(month), MARGIN, doc.y - 50, { size: 12, color: MUTED });
  doc.text(`Gerado em ${when} por ${input.generatedBy}`, MARGIN, doc.y - 50, { size: 8, color: MUTED, align: "right", width: WIDTH });
  doc.y -= 64;
  doc.line(doc.y, INK, 1);
  doc.y -= 18;

  const all = emptyTotals();
  let people = 0;
  let count = 0;
  for (const s of sectors) {
    addTotals(all, s.totals);
    people += s.people.length;
    count += s.occurrences.length;
  }

  if (sectors.length === 0) {
    doc.text(`Nenhuma ocorrência registrada em ${monthKeyLabel(month)}.`, MARGIN, doc.y - 10, { size: 11, color: MUTED });
  } else {
    // Números do mês
    const stats: [string, string][] = [
      ["Ocorrências", String(count)],
      ["Colaboradores", String(people)],
      ["Faltas", `${all.faltas}`],
      ["Não justificadas", `${all.faltasInjustificadas}`],
      ["Dias de atestado", `${all.diasAtestado}`],
      ["Dias de folga", `${all.diasFolga}`],
      ["Horas (comprov.)", all.horas ? formatDuration(all.minutosHoras) : "0"],
    ];
    const w = WIDTH / stats.length;
    stats.forEach(([label, value], i) => {
      const x = MARGIN + i * w;
      doc.text(value, x, doc.y - 16, { size: 16, bold: true, color: label === "Não justificadas" && all.faltasInjustificadas > 0 ? CRITICAL : INK });
      doc.text(label, x, doc.y - 30, { size: 7.5, color: MUTED, maxWidth: w - 6 });
    });
    doc.y -= 48;

    doc.text("Por setor", MARGIN, doc.y - 12, { size: 12, bold: true });
    doc.y -= 22;
    doc.table(
      [{ title: "Setor (empresa)", width: WIDTH - NUM * 6 }, { title: "Colab.", width: NUM, align: "right" }, ...numCols()],
      [
        ...sectors.map((s) => ({
          cells: [s.name, String(s.people.length), ...nums(s.totals)],
          colors: [undefined, undefined, ...numColors(s.totals)],
        })),
        { cells: ["Total", String(people), ...nums(all)], bold: true, fill: true, colors: [undefined, undefined, ...numColors(all)] },
      ]
    );

    doc.y -= 6;
    doc.text(
      "Setor = empresa do colaborador quando a ocorrência foi registrada. Atestados e folgas que atravessam meses contam só os dias deste mês.",
      MARGIN,
      doc.y - 8,
      { size: 7.5, color: MUTED, maxWidth: WIDTH }
    );
    doc.y -= 8;

    // Um bloco por setor
    for (const s of sectors) {
      doc.y -= 26;
      if (doc.room(110)) doc.y -= 4;
      doc.page.drawRectangle({ x: MARGIN, y: doc.y - 16, width: 4, height: 18, color: hexColor(s.brandColor) });
      doc.text(s.name, MARGIN + 12, doc.y - 12, { size: 14, bold: true, maxWidth: WIDTH - 160 });
      const sub = `${s.occurrences.length} ${s.occurrences.length === 1 ? "ocorrência" : "ocorrências"} · ${s.people.length} ${
        s.people.length === 1 ? "colaborador" : "colaboradores"
      }`;
      doc.text(sub, MARGIN, doc.y - 12, { size: 8.5, color: MUTED, align: "right", width: WIDTH });
      doc.y -= 26;

      doc.table(
        [{ title: "Colaborador", width: WIDTH - NUM * 5 }, ...numCols()],
        [
          ...s.people.map((p) => ({ cells: [p.name, ...nums(p)], colors: [undefined, ...numColors(p)] })),
          { cells: ["Total do setor", ...nums(s.totals)], bold: true, fill: true, colors: [undefined, ...numColors(s.totals)] },
        ]
      );

      doc.y -= 14;
      if (doc.room(60)) doc.y -= 4;
      doc.text("Ocorrências do mês", MARGIN, doc.y - 10, { size: 9.5, bold: true });
      doc.y -= 16;
      doc.table(
        [
          { title: "Data", width: 72 },
          { title: "Colaborador", width: 158 },
          { title: "Tipo", width: 108 },
          { title: "Detalhe", width: WIDTH - 72 - 158 - 108 },
        ],
        s.occurrences.map((o) => ({
          cells: [period(o), o.employeeName, OCCURRENCE_LABEL[o.type] ?? o.type, detail(o, month)],
          colors: [undefined, undefined, undefined, o.type === "falta" && !o.justified ? CRITICAL : MUTED],
        }))
      );
    }

  }

  // Rodapé com numeração
  const pages = pdf.getPages();
  pages.forEach((page, i) => {
    page.drawLine({ start: { x: MARGIN, y: 34 }, end: { x: MARGIN + WIDTH, y: 34 }, thickness: 0.6, color: LINE });
    page.drawText(title, { x: MARGIN, y: 22, size: 7.5, font: regular, color: MUTED });
    const label = `Página ${i + 1} de ${pages.length}`;
    page.drawText(label, { x: MARGIN + WIDTH - regular.widthOfTextAtSize(label, 7.5), y: 22, size: 7.5, font: regular, color: MUTED });
  });

  return pdf.save();
}
