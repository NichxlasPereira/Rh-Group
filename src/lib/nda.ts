import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, PDFFont, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { prisma } from "./prisma";

/**
 * Acordo de confidencialidade (NDA) do onboarding: o sistema gera o PDF já
 * preenchido com os dados do candidato e da empresa contratante; o candidato
 * assina no gov.br e envia o PDF assinado de volta.
 *
 * O PDF reproduz o modelo do RH (Times 10, texto justificado, margens de 1 cm,
 * faixas cinza nas cláusulas). O texto usa marcadores {{...}} e esta marcação,
 * uma instrução por linha:
 *   **texto**      negrito (em qualquer parte da linha)
 *   # texto        bloco do título, no alto à direita
 *   ## texto       título de cláusula, com faixa cinza
 *   > texto        alinhado à direita (a data)
 *   a) / I.        itens de lista, com recuo
 *   [ASSINATURAS]  as linhas seguintes são o quadro de assinaturas; "|" separa
 *                  a coluna da empresa da do candidato
 *   linha vazia    espaço de uma linha
 * O RH pode trocar o texto (fica no banco); sem isso, vale o modelo padrão.
 */

export const NDA_TEMPLATE_KEY = "nda_template";

export const NDA_PLACEHOLDERS: { key: string; description: string }[] = [
  { key: "EMPRESA_QUALIFICACAO", description: "parágrafo de qualificação da empresa contratante" },
  { key: "EMPRESA_NOME", description: "nome da empresa contratante" },
  { key: "ASSINANTE_NOME", description: "quem assina pela empresa" },
  { key: "ASSINANTE_CARGO", description: "cargo de quem assina pela empresa" },
  { key: "ASSINANTE_CPF", description: "CPF de quem assina pela empresa" },
  { key: "NOME", description: "nome completo do candidato (em maiúsculas)" },
  { key: "NASCIMENTO", description: "data de nascimento do candidato" },
  { key: "RG", description: "RG do candidato" },
  { key: "CPF", description: "CPF do candidato" },
  { key: "ENDERECO", description: "endereço do candidato" },
  { key: "DATA_EXTENSO", description: "data de hoje por extenso, ex.: 13 de outubro de 2026" },
];

export const NDA_MARKUP_HELP: { syntax: string; description: string }[] = [
  { syntax: "**texto**", description: "negrito" },
  { syntax: "# texto", description: "título no alto, à direita" },
  { syntax: "## texto", description: "título de cláusula, com faixa cinza" },
  { syntax: "> texto", description: "alinhado à direita (a data)" },
  { syntax: "a) / I.", description: "item de lista, com recuo" },
  { syntax: "[ASSINATURAS]", description: "quadro de assinaturas; | separa as duas colunas" },
];

export const DEFAULT_NDA_TEMPLATE = `# **ACORDO DE CONFIDENCIALIDADE E NÃO CONCORRÊNCIA**, que entre si fazem, de um lado

{{EMPRESA_QUALIFICACAO}}, e, de outro lado,

**SR(A). {{NOME}}**, brasileiro(a), maior, nascido(a) em {{NASCIMENTO}}, portador(a) do RG nº {{RG}} e do CPF nº {{CPF}}, residente e domiciliado(a) em {{ENDERECO}}, doravante denominado(a) **PRESTADORA DE SERVIÇO**.

As partes acima qualificadas têm entre si justo e acordado o presente **ACORDO DE CONFIDENCIALIDADE (NDA)**, que será regido pelas seguintes cláusulas e condições a seguir:

## **CLÁUSULA PRIMEIRA** – DO OBJETO
1.1. O presente Acordo tem por objeto assegurar a confidencialidade, integridade e proteção de todas as informações a que o **PRESTADORA DE SERVIÇOS** tiver acesso no exercício de suas atividades junto à **EMPRESA**, abrangendo dados estratégicos, operacionais, financeiros, comerciais, jurídicos, de clientes, fornecedores e quaisquer outros considerados sensíveis.
1.2. **O PRESTADOR DE SERVIÇOS** reconhece que terá acesso a informações sigilosas, comprometendo-se a não utilizá-las para qualquer finalidade alheia à execução dos serviços contratados, sob pena das sanções previstas neste instrumento e na legislação aplicável.
## **CLÁUSULA SEGUNDA** – DA DEFINIÇÃO DE INFORMAÇÕES CONFIDENCIAIS
2.1. Consideram-se informações confidenciais todas aquelas obtidas pelo **PRESTADORA DE SERVIÇOS** durante a execução dos serviços, independentemente do formato ou meio de acesso, incluindo informações verbais, escritas, digitais, eletrônicas ou armazenadas em qualquer suporte físico ou virtual.
2.2. São abrangidas por este Acordo, sem prejuízo de outras que possam ser qualificadas como sigilosas:

a) **Informações Operacionais e Comerciais**: processos internos, metodologias, estratégias de mercado, dados de clientes, fornecedores, parceiros e informações comerciais sensíveis;
b) **Informações Financeiras**: dados contábeis, relatórios financeiros, faturamento, precificação, negociações e planos de investimento;
c) **Informações Tecnológicas e Digitais**: softwares, plataformas, bancos de dados, ferramentas digitais, códigos-fonte, acessos a sistemas internos e credenciais de segurança;
d) **Informações Jurídicas e Regulatórias**: contratos, pareceres, processos judiciais, administrativos ou arbitrais, bem como documentos protegidos por sigilo legal ou contratual;
e) **Dados Pessoais e Sensíveis**: informações de funcionários, clientes ou terceiros, nos termos da Lei Geral de Proteção de Dados LGPD (Lei nº 13.709/2018).

2.3. Não serão consideradas confidenciais as informações que:
a) Já se encontravam em domínio público à época de sua divulgação, desde que tal publicidade não tenha decorrido de ação ou omissão **do PRESTADOR DE SERVIÇOS**;
b) Venham a ser legitimamente obtidas de terceiros sem obrigação de confidencialidade.

## **CLÁUSULA TERCEIRA** – DO DEVER DE SIGILO E RESTRIÇÕES DE USO
3.1. O **PRESTADOR DE SERVIÇOS** compromete-se a não divulgar, reproduzir, compartilhar ou utilizar informações confidenciais para qualquer fim alheio à execução dos serviços contratados.

3.2. É vedado ao **PRESTADOR DE SERVIÇOS**:
a) Armazenar informações da EMPRESA em dispositivos pessoais, salvo autorização formal e expressa;
b) Compartilhar credenciais de acesso a sistemas, plataformas ou bancos de dados da **EMPRESA**;
c) Utilizar informações confidenciais para benefício próprio ou de terceiros, incluindo concorrentes;
d) Acessar informações confidenciais fora das dependências físicas ou digitais da **EMPRESA**, salvo se expressamente autorizado.

3.3. O descumprimento desta cláusula ensejará responsabilização nas esferas civil, trabalhista e criminal, conforme previsto neste instrumento e na legislação vigente.

## **CLÁUSULA QUINTA** – PENALIDADES POR VIOLAÇÃO
4.1. O inadimplemento das obrigações assumidas neste Acordo sujeitará o PRESTADOR DE SERVIÇOS às seguintes penalidades, sem prejuízo da reparação por perdas e danos:

I. Rescisão imediata do contrato de prestação de serviços, independentemente de aviso prévio ou indenização rescisória;
II. Responsabilidade civil, com obrigação de indenizar danos materiais e/ou morais efetivamente comprovados;
III. Responsabilidade criminal, nos termos da legislação aplicável, incluindo, mas não se limitando, às seguintes hipóteses:

a) Violação de Segredo Profissional – Art. 154 do Código Penal;
b) Divulgação de Segredo – Art. 153 do Código Penal;
c) Invasão de Dispositivo Informático – Art. 154-A do Código Penal;
d) Violação de Segredos Comerciais – Art. 195, XI, da Lei nº 9.279/1996 (Lei da Propriedade Industrial)

4.2. As penalidades poderão ser aplicadas cumulativamente, considerando-se a gravidade da infração, a extensão do dano e o nexo causal entre a conduta e o prejuízo.

## **CLÁUSULA QUINTA** – DO TRATAMENTO DE DADOS PESSOAIS
5.1. O PRESTADOR DE SERVIÇOS deverá tratar dados pessoais em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).
5.2. O uso indevido de dados pessoais acarretará, além da responsabilidade civil e criminal, a aplicação de sanções administrativas previstas na LGPD.

## **CLÁUSULA SEXTA** – DISPOSIÇÕES GERAIS
6.1. O presente Acordo não gera vínculo empregatício entre as partes, constituindo instrumento autônomo, ainda que vinculado ao contrato de prestação de serviços principal.

## **CLÁUSULA SÉTIMA** – DO FORO
7.1. Para dirimir controvérsias decorrentes deste Acordo, as partes elegem o foro da Comarca de São Paulo/SP, renunciando a qualquer outro, por mais privilegiado que seja.
> **São Paulo, {{DATA_EXTENSO}}.**

[ASSINATURAS]
**CONTRATANTE** | **CONTRATADO**
**{{EMPRESA_NOME}}** | **{{NOME}}**
**{{ASSINANTE_NOME}}** – {{ASSINANTE_CARGO}} | CPF: {{CPF}}
CPF {{ASSINANTE_CPF}} |`;

export async function ndaTemplate(): Promise<{ text: string; custom: boolean }> {
  const setting = await prisma.appSetting.findUnique({ where: { key: NDA_TEMPLATE_KEY } });
  return setting ? { text: setting.value, custom: true } : { text: DEFAULT_NDA_TEMPLATE, custom: false };
}

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function dateByExtension(date = new Date()): string {
  // Data de São Paulo (o servidor pode estar em outro fuso).
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(date).split("-").map(Number);
  return `${d} de ${MONTHS[m - 1]} de ${y}`;
}

export interface NdaData {
  company: { name: string; qualification: string; signerName: string; signerRole: string; signerCpf: string };
  candidate: { nome: string; nascimento: string; rg: string; cpf: string; endereco: string };
}

export function fillNdaTemplate(template: string, data: NdaData, today = new Date()): string {
  const [y, m, d] = data.candidate.nascimento.split("-");
  // O candidato não pode mexer na formatação: tira os asteriscos e o "|" do que ele digitou.
  const plain = (v: string) => v.replace(/[*|]/g, "").replace(/\s+/g, " ").trim();
  const values: Record<string, string> = {
    EMPRESA_QUALIFICACAO: data.company.qualification.trim().replace(/[.,;\s]+$/, ""),
    EMPRESA_NOME: data.company.name,
    ASSINANTE_NOME: data.company.signerName,
    ASSINANTE_CARGO: data.company.signerRole,
    ASSINANTE_CPF: data.company.signerCpf,
    NOME: plain(data.candidate.nome).toUpperCase(),
    NASCIMENTO: d ? `${d}/${m}/${y}` : data.candidate.nascimento,
    RG: plain(data.candidate.rg),
    CPF: plain(data.candidate.cpf),
    ENDERECO: plain(data.candidate.endereco.replace(/\s*\n\s*/g, ", ")),
    DATA_EXTENSO: dateByExtension(today),
  };
  return template.replace(/\{\{\s*([A-Z_]+)\s*\}\}/g, (all, key: string) => values[key] ?? all);
}

/** Troca caracteres que a fonte não tem. */
function safeText(font: PDFFont, text: string): string {
  const supported = new Set(font.getCharacterSet());
  const mapped = text.replace(/[⁰°]/g, "º").replace(/\u00a0/g, " ");
  let out = "";
  for (const ch of mapped) out += supported.has(ch.codePointAt(0)!) ? ch : "?";
  return out;
}

/**
 * Tinos: fonte livre com as mesmas medidas da Times New Roman do modelo. Fica
 * embutida no PDF, então o texto sai igual em qualquer leitor.
 */
const FONT_DIR = path.join(process.cwd(), "node_modules", "@fontsource", "tinos", "files");

interface Segment {
  text: string;
  bold: boolean;
}
type Word = Segment[];

/** Divide uma linha em palavras, cada uma com trechos normais e em negrito (**...**). */
function parseWords(line: string): Word[] {
  const words: Word[] = [];
  let word: Word = [];
  let bold = false;
  for (const [i, part] of line.split("**").entries()) {
    if (i > 0) bold = !bold;
    const pieces = part.split(/\s+/);
    pieces.forEach((piece, j) => {
      if (j > 0 && word.length) {
        words.push(word);
        word = [];
      }
      if (piece) word.push({ text: piece, bold });
    });
  }
  if (word.length) words.push(word);
  return words;
}

// Medidas do modelo do RH (em pontos; A4 = 595,28 × 841,89).
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 28.35; // 1 cm
const SIZE = 10;
const LEADING = 11.5;
const FIRST_BASELINE = MARGIN + 9.35;
const TITLE_X = 347.1;
const LIST_LABEL_X = MARGIN + 18;
const LIST_TEXT_X = MARGIN + 36;
// O modelo (Google Docs) quebra as linhas ~3% antes da margem e depois
// estica os espaços até ela; medido pelas quebras do PDF original.
const WRAP_FACTOR = 0.972;
const BAND_COLOR = rgb(0.8353, 0.8627, 0.8941);
const SIGN_SIZE = 8;
const SIGN_LEADING = 9.2;
const SIGN_GAP = 65; // espaço para os carimbos de assinatura do gov.br

/** Gera o PDF do acordo no formato do modelo do RH. */
export async function renderNdaPdf(filledText: string, title: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setLanguage("pt-BR");
  pdf.registerFontkit(fontkit);
  const [regularBytes, boldBytes] = await Promise.all([
    readFile(path.join(FONT_DIR, "tinos-latin-400-normal.woff")),
    readFile(path.join(FONT_DIR, "tinos-latin-700-normal.woff")),
  ]);
  const regular = await pdf.embedFont(regularBytes, { subset: true });
  const bold = await pdf.embedFont(boldBytes, { subset: true });
  const fontOf = (s: Segment) => (s.bold ? bold : regular);
  const right = PAGE_W - MARGIN;

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  // Distância do topo até a linha de base da próxima linha.
  let cursor = FIRST_BASELINE;
  const ensure = (height: number) => {
    if (cursor + height > PAGE_H - MARGIN) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      cursor = FIRST_BASELINE;
    }
  };

  const prepared = (word: Word): Word => word.map((s) => ({ ...s, text: safeText(fontOf(s), s.text) }));
  const wordWidth = (word: Word, size: number) => word.reduce((w, s) => w + fontOf(s).widthOfTextAtSize(s.text, size), 0);
  const spaceWidth = (size: number) => regular.widthOfTextAtSize(" ", size);

  function wrap(words: Word[], width: number, size: number): Word[][] {
    const lines: Word[][] = [];
    let line: Word[] = [];
    let used = 0;
    for (const word of words) {
      const w = wordWidth(word, size);
      const next = line.length ? used + spaceWidth(size) + w : w;
      if (line.length && next > width) {
        lines.push(line);
        line = [word];
        used = w;
      } else {
        line.push(word);
        used = next;
      }
    }
    if (line.length) lines.push(line);
    return lines;
  }

  function drawWords(line: Word[], x: number, baseline: number, size: number, gap: number) {
    for (const word of line) {
      for (const s of word) {
        const font = fontOf(s);
        page.drawText(s.text, { x, y: PAGE_H - baseline, size, font, color: rgb(0, 0, 0) });
        x += font.widthOfTextAtSize(s.text, size);
      }
      x += gap;
    }
  }

  /** Parágrafo justificado (a última linha fica alinhada à esquerda). */
  function paragraph(text: string, x: number, width: number, align: "justify" | "left" | "right" = "justify") {
    const lines = wrap(parseWords(text).map(prepared), width * WRAP_FACTOR, SIZE);
    lines.forEach((line, i) => {
      ensure(LEADING);
      const natural = line.reduce((w, word) => w + wordWidth(word, SIZE), 0);
      const gaps = line.length - 1;
      let gap = spaceWidth(SIZE);
      let startX = x;
      if (align === "justify" && i < lines.length - 1 && gaps > 0) gap = (width - natural) / gaps;
      if (align === "right") startX = x + width - natural - gap * gaps;
      drawWords(line, startX, cursor, SIZE, gap);
      cursor += LEADING;
    });
  }

  function signatures(rows: string[]) {
    ensure(SIGN_GAP + rows.length * SIGN_LEADING);
    cursor += SIGN_GAP - LEADING;
    const columns = [
      { x: MARGIN, width: (PAGE_W - 2 * MARGIN) / 2 },
      { x: PAGE_W / 2, width: (PAGE_W - 2 * MARGIN) / 2 },
    ];
    for (const row of rows) {
      row.split("|").slice(0, 2).forEach((cell, i) => {
        const words = parseWords(cell.trim()).map(prepared);
        if (!words.length) return;
        const width = wordWidth(words.flat(), SIGN_SIZE) + spaceWidth(SIGN_SIZE) * (words.length - 1);
        const col = columns[i];
        drawWords(words, col.x + Math.max(0, (col.width - width) / 2), cursor, SIGN_SIZE, spaceWidth(SIGN_SIZE));
      });
      cursor += SIGN_LEADING;
    }
  }

  const lines = filledText.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      cursor += LEADING;
      continue;
    }
    if (line === "[ASSINATURAS]") {
      const rows: string[] = [];
      while (i + 1 < lines.length && lines[i + 1].trim()) rows.push(lines[++i]);
      signatures(rows);
      continue;
    }
    if (line.startsWith("## ")) {
      // Título de cláusula: não deixa sozinho no pé da página.
      ensure(LEADING * 3);
      const top = cursor - 9.7;
      page.drawRectangle({ x: MARGIN - 0.35, y: PAGE_H - top - 13, width: right - MARGIN, height: 13, color: BAND_COLOR });
      paragraph(line.slice(3), MARGIN, right - MARGIN, "left");
      continue;
    }
    if (line.startsWith("# ")) {
      paragraph(line.slice(2), TITLE_X, right - TITLE_X);
      continue;
    }
    if (line.startsWith("> ")) {
      paragraph(line.slice(2), MARGIN, right - MARGIN, "right");
      continue;
    }
    const item = line.match(/^([a-z]\)|[IVXLC]+\.)\s+(.*)$/);
    if (item) {
      const label = safeText(regular, item[1]);
      const labelX = /\.$/.test(item[1]) ? LIST_LABEL_X + 0.6 - regular.widthOfTextAtSize(label, SIZE) : LIST_LABEL_X;
      ensure(LEADING);
      page.drawText(label, { x: labelX, y: PAGE_H - cursor, size: SIZE, font: regular, color: rgb(0, 0, 0) });
      paragraph(item[2], LIST_TEXT_X, right - LIST_TEXT_X);
      continue;
    }
    paragraph(line, MARGIN, right - MARGIN);
  }
  return pdf.save();
}

/**
 * Confere se o PDF tem assinatura digital embutida (como a do gov.br). Não
 * valida a cadeia de certificados — isso o RH confere em validar.iti.gov.br.
 */
export function looksDigitallySigned(data: Buffer): boolean {
  const text = data.toString("latin1");
  return /\/ByteRange\s*\[/.test(text) && /\/Type\s*\/Sig\b|\/SubFilter\s*\/(adbe\.pkcs7|ETSI\.CAdES)/.test(text);
}
