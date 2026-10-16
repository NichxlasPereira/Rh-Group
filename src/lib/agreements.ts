import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, PDFFont, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { prisma } from "./prisma";

/**
 * Termos que o onboarding gera já preenchidos (acordo de confidencialidade e
 * termo de uso de imagem): o candidato baixa o PDF com os dados dele e da
 * empresa contratante, assina no gov.br e envia o PDF assinado de volta.
 *
 * Cada PDF reproduz o modelo do RH (fonte, margens, espaçamentos). O texto usa
 * marcadores {{...}} e esta marcação, uma instrução por linha:
 *   **texto**      negrito (em qualquer parte da linha)
 *   # texto        bloco do título, no alto à direita
 *   ## texto       título de cláusula, com faixa cinza
 *   ^ texto        centralizado (linhas ^ seguidas ficam juntas)
 *   > texto        alinhado à direita (a data)
 *   a) / I.        itens de lista, com recuo
 *   [ASSINATURAS]  as linhas seguintes são o quadro de assinaturas; "|" separa
 *                  a coluna da empresa da do candidato
 *   linha vazia    espaço maior entre blocos
 * O RH pode trocar o texto de cada termo (fica no banco); sem isso, vale o padrão.
 */

export type AgreementKind = "nda" | "imagem";
export const AGREEMENT_KINDS: AgreementKind[] = ["nda", "imagem"];

export function isAgreementKind(kind: string): kind is AgreementKind {
  return (AGREEMENT_KINDS as string[]).includes(kind);
}

export const AGREEMENT_PLACEHOLDERS: { key: string; description: string }[] = [
  { key: "EMPRESA_NOME", description: "razão social da empresa contratante" },
  { key: "EMPRESA_QUALIFICACAO", description: "parágrafo de qualificação da empresa (do cadastro)" },
  { key: "EMPRESA_NATUREZA", description: "natureza jurídica, ex.: sociedade empresária limitada" },
  { key: "EMPRESA_CNPJ", description: "CNPJ da empresa" },
  { key: "EMPRESA_ENDERECO", description: "logradouro, número e complemento da sede" },
  { key: "EMPRESA_BAIRRO", description: "bairro da sede" },
  { key: "EMPRESA_CIDADE", description: "cidade da sede" },
  { key: "EMPRESA_UF", description: "UF da sede" },
  { key: "EMPRESA_CEP", description: "CEP da sede" },
  { key: "ASSINANTE_NOME", description: "quem assina pela empresa" },
  { key: "ASSINANTE_CARGO", description: "cargo de quem assina pela empresa" },
  { key: "ASSINANTE_CPF", description: "CPF de quem assina pela empresa" },
  { key: "NOME", description: "nome completo do candidato (em maiúsculas)" },
  { key: "NACIONALIDADE", description: "nacionalidade do candidato" },
  { key: "ESTADO_CIVIL", description: "estado civil do candidato" },
  { key: "NASCIMENTO", description: "data de nascimento do candidato" },
  { key: "RG", description: "RG do candidato" },
  { key: "CPF", description: "CPF do candidato" },
  { key: "EMAIL", description: "e-mail do candidato" },
  { key: "ENDERECO", description: "endereço do candidato, como ele digitou (com CEP)" },
  { key: "ENDERECO_SEM_CEP", description: "endereço do candidato sem o CEP" },
  { key: "CEP", description: "CEP do candidato (tirado do endereço)" },
  { key: "DATA_EXTENSO", description: "data de hoje por extenso, ex.: 14 de outubro de 2026" },
];

export const AGREEMENT_MARKUP_HELP: { syntax: string; description: string }[] = [
  { syntax: "**texto**", description: "negrito" },
  { syntax: "^ texto", description: "centralizado (título, assinatura)" },
  { syntax: "> texto", description: "alinhado à direita (a data)" },
  { syntax: "# texto", description: "título no alto, à direita" },
  { syntax: "## texto", description: "título de cláusula, com faixa cinza" },
  { syntax: "a) / I.", description: "item de lista, com recuo" },
  { syntax: "[ASSINATURAS]", description: "quadro de assinaturas; | separa as duas colunas" },
];

/** Campo de "Seus dados" (pela chave) que alimenta cada marcador do candidato. */
export const CANDIDATE_PLACEHOLDER_FIELD: Record<string, string> = {
  NOME: "nome",
  NACIONALIDADE: "nacionalidade",
  ESTADO_CIVIL: "estadocivil",
  NASCIMENTO: "nascimento",
  RG: "rg",
  CPF: "cpf",
  EMAIL: "email",
  ENDERECO: "endereco",
  ENDERECO_SEM_CEP: "endereco",
  CEP: "endereco",
};

/** Marcadores da empresa que dependem do cadastro completo (CNPJ e endereço). */
export const COMPANY_ADDRESS_PLACEHOLDERS = [
  "EMPRESA_NATUREZA",
  "EMPRESA_CNPJ",
  "EMPRESA_ENDERECO",
  "EMPRESA_BAIRRO",
  "EMPRESA_CIDADE",
  "EMPRESA_UF",
  "EMPRESA_CEP",
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

export const DEFAULT_IMAGE_TEMPLATE = `^ **TERMO DE AUTORIZAÇÃO DE USO DE IMAGEM**
^ **{{EMPRESA_NOME}}**

Pelo presente instrumento particular:
**{{NOME}}**, {{NACIONALIDADE}}, {{ESTADO_CIVIL}}, inscrito(a) no CPF sob o nº {{CPF}}, residente e domiciliado(a) na {{ENDERECO_SEM_CEP}}, CEP {{CEP}}, com endereço de e-mail {{EMAIL}} (“Titular”);
**{{EMPRESA_NOME}}**, {{EMPRESA_NATUREZA}} inscrita no CNPJ sob o nº {{EMPRESA_CNPJ}}, com sede na {{EMPRESA_ENDERECO}}, {{EMPRESA_BAIRRO}}, {{EMPRESA_CIDADE}} - {{EMPRESA_UF}}, CEP {{EMPRESA_CEP}}, neste ato representada na forma de seu contrato social (“Autorizada”);
Resolvem celebrar o presente Termo de Autorização de Uso de Imagem, que se regerá pelas cláusulas seguintes.

^ **1. DO OBJETO**
1.1. **Autorização.** O Titular autoriza a Autorizada a utilizar, para fins comerciais, publicitários e institucionais, sua imagem, voz e nome, bem como suas manifestações e depoimentos, registrados em gravações audiovisuais e fotográficas realizadas em eventos de que participe ou conteúdos e materiais que venham a ser gravados para os fins expressos nesta cláusula.
1.2. **Abrangência.** A autorização compreende editar, reproduzir, publicar e veicular o material, integral ou parcialmente, em qualquer meio, físico ou digital, no Brasil e no exterior, sem limite de veiculações, diretamente ou por meio de sociedades controladas, agências, produtoras e plataformas contratadas pela Autorizada, vedado o uso que ofenda a honra do Titular ou o associe a conteúdo ilícito, discriminatório ou político-partidário.
1.3. **Gratuidade.** A autorização é concedida a título gratuito e irretratável, sem contrapartida financeira de qualquer natureza, cachê, royalties ou participação em receita, nada tendo o Titular a reclamar a esse título, presente ou futuramente.
1.4. **Prazo.** A autorização vigora por 5 (cinco) anos contados da assinatura, alcançando as gravações realizadas nesse período; encerrado o prazo, cessam novas veiculações, permanecendo lícita a manutenção do material já publicado, sem obrigação de remoção.

^ **2. DAS DISPOSIÇÕES FINAIS**
2.1. **Proteção de dados.** O tratamento dos dados pessoais do Titular observará a Lei nº 13.709/2018, tendo por base legal o consentimento ora manifestado e limitando-se às finalidades previstas neste Termo.
2.2. **Assinatura eletrônica e foro.** As Partes reconhecem a validade da assinatura eletrônica deste instrumento, nos termos do Art. 10, Parágrafo 2º, da MP 2.200-2/2001, e elegem o foro da Comarca de {{EMPRESA_CIDADE}} - {{EMPRESA_UF}} para dirimir as controvérsias dele decorrentes.

E, por estarem justas e contratadas, as Partes assinam o presente instrumento em 2 (duas) vias de igual teor e efeito.

> {{EMPRESA_CIDADE}}, {{DATA_EXTENSO}}.

^ ________________________________________
^ **{{NOME}}**

^ ________________________________________
^ **{{EMPRESA_NOME}}**`;

interface DocStyle {
  page: [number, number];
  margin: number;
  font: "tinos" | "arimo";
  size: number;
  leading: number;
  /** Espaço depois de cada parágrafo. */
  paragraphAfter: number;
  /** Espaço de uma linha vazia no texto. */
  blankLine: number;
  /** O Google Docs quebra a linha um pouco antes da margem e estica os espaços até ela. */
  wrapFactor: number;
  /** Onde começa o bloco "# título" (acordo). */
  titleX: number;
}

export const AGREEMENTS: Record<
  AgreementKind,
  { name: string; description: string; settingKey: string; defaultTemplate: string; fileName: string; style: DocStyle }
> = {
  nda: {
    name: "Acordo de confidencialidade (NDA)",
    description: "Baixe o acordo já preenchido, assine no gov.br e envie aqui o PDF assinado.",
    settingKey: "nda_template",
    defaultTemplate: DEFAULT_NDA_TEMPLATE,
    fileName: "Acordo de confidencialidade",
    // Modelo do RH: A4, Times 10, margens de 1 cm.
    style: {
      page: [595.28, 841.89],
      margin: 28.35,
      font: "tinos",
      size: 10,
      leading: 11.5,
      paragraphAfter: 0,
      blankLine: 11.5,
      wrapFactor: 0.972,
      titleX: 347.1,
    },
  },
  imagem: {
    name: "Termo de autorização de uso de imagem",
    description: "Baixe o termo já preenchido, assine no gov.br e envie aqui o PDF assinado.",
    settingKey: "imagem_template",
    defaultTemplate: DEFAULT_IMAGE_TEMPLATE,
    fileName: "Termo de uso de imagem",
    // Modelo do RH: Carta, Arial 12, margens de 1 polegada, 6 pt entre parágrafos.
    style: {
      page: [612, 792],
      margin: 72,
      font: "arimo",
      size: 12,
      leading: 17.25,
      paragraphAfter: 6,
      blankLine: 12,
      wrapFactor: 1,
      titleX: 306,
    },
  },
};

export async function agreementTemplate(kind: AgreementKind): Promise<{ text: string; custom: boolean }> {
  const setting = await prisma.appSetting.findUnique({ where: { key: AGREEMENTS[kind].settingKey } });
  return setting ? { text: setting.value, custom: true } : { text: AGREEMENTS[kind].defaultTemplate, custom: false };
}

/** Marcadores {{...}} que o texto usa. */
export function templatePlaceholders(template: string): Set<string> {
  return new Set([...template.matchAll(/\{\{\s*([A-Z_]+)\s*\}\}/g)].map((m) => m[1]));
}

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function dateByExtension(date = new Date()): string {
  // Data de São Paulo (o servidor pode estar em outro fuso).
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(date).split("-").map(Number);
  return `${d} de ${MONTHS[m - 1]} de ${y}`;
}

const CEP_PATTERN = /\b(?:CEP:?\s*)?(\d{5})-?(\d{3})\b/i;

/** Separa o CEP do endereço digitado ("Rua X, 10 - Bairro, CEP 01000-000"). */
export function splitCep(address: string): { address: string; cep: string | null } {
  const match = address.match(CEP_PATTERN);
  if (!match) return { address, cep: null };
  const rest = address.replace(match[0], "").replace(/\s*[-–,;]\s*$/, "").replace(/\s*[-–,;]\s*([-–,;])/, "$1").replace(/\s{2,}/g, " ").trim();
  return { address: rest.replace(/[\s,;-]+$/, ""), cep: `${match[1]}-${match[2]}` };
}

export interface AgreementCompany {
  name: string;
  qualification: string;
  signerName: string;
  signerRole: string;
  signerCpf: string;
  cnpj: string | null;
  legalNature: string | null;
  address: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  cep: string | null;
}

export interface AgreementData {
  company: AgreementCompany;
  /** Respostas do candidato pela chave do campo (nome, cpf, endereco...). */
  candidate: Record<string, string>;
}

const BLANK = "________________";

export function fillAgreementTemplate(template: string, data: AgreementData, today = new Date()): string {
  // O candidato não pode mexer na formatação: tira os asteriscos e o "|" do que ele digitou.
  const plain = (v: string | undefined) => (v ? v.replace(/[*|]/g, "").replace(/\s+/g, " ").trim() : "") || BLANK;
  const c = data.candidate;
  const [y, m, d] = (c.nascimento ?? "").split("-");
  const address = (c.endereco ?? "").replace(/\s*\n\s*/g, ", ");
  const split = splitCep(address);
  const company = data.company;
  const values: Record<string, string> = {
    EMPRESA_NOME: company.name,
    EMPRESA_QUALIFICACAO: company.qualification.trim().replace(/[.,;\s]+$/, ""),
    EMPRESA_NATUREZA: company.legalNature ?? BLANK,
    EMPRESA_CNPJ: company.cnpj ?? BLANK,
    EMPRESA_ENDERECO: company.address ?? BLANK,
    EMPRESA_BAIRRO: company.district ?? BLANK,
    EMPRESA_CIDADE: company.city ?? BLANK,
    EMPRESA_UF: company.state ?? BLANK,
    EMPRESA_CEP: company.cep ?? BLANK,
    ASSINANTE_NOME: company.signerName,
    ASSINANTE_CARGO: company.signerRole,
    ASSINANTE_CPF: company.signerCpf,
    NOME: plain(c.nome).toUpperCase(),
    NACIONALIDADE: plain(c.nacionalidade).toLowerCase(),
    ESTADO_CIVIL: plain(c.estadocivil).toLowerCase(),
    NASCIMENTO: d ? `${d}/${m}/${y}` : plain(c.nascimento),
    RG: plain(c.rg),
    CPF: plain(c.cpf),
    EMAIL: plain(c.email),
    ENDERECO: plain(address),
    ENDERECO_SEM_CEP: plain(split.address),
    CEP: split.cep ?? BLANK,
    DATA_EXTENSO: dateByExtension(today),
  };
  return template.replace(/\{\{\s*([A-Z_]+)\s*\}\}/g, (all, key: string) => values[key] ?? all);
}

/** Troca caracteres que a fonte não tem. */
function safeText(font: PDFFont, text: string): string {
  const supported = new Set(font.getCharacterSet());
  const mapped = text.replace(/[⁰°]/g, "º").replace(/ /g, " ");
  let out = "";
  for (const ch of mapped) out += supported.has(ch.codePointAt(0)!) ? ch : "?";
  return out;
}

/**
 * Fontes livres com as mesmas medidas das usadas nos modelos: Tinos (Times
 * New Roman) e Arimo (Arial). Ficam embutidas no PDF, então o texto sai igual
 * em qualquer leitor.
 */
const FONTS_DIR = path.join(process.cwd(), "node_modules", "@fontsource");

async function embedFonts(pdf: PDFDocument, family: DocStyle["font"]) {
  pdf.registerFontkit(fontkit);
  const file = (weight: number) => path.join(FONTS_DIR, family, "files", `${family}-latin-${weight}-normal.woff`);
  const [regularBytes, boldBytes] = await Promise.all([readFile(file(400)), readFile(file(700))]);
  return {
    regular: await pdf.embedFont(regularBytes, { subset: true }),
    bold: await pdf.embedFont(boldBytes, { subset: true }),
  };
}

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

// Detalhes do acordo (A4): faixa das cláusulas, listas e quadro de assinaturas.
const BAND_COLOR = rgb(0.8353, 0.8627, 0.8941);
const LIST_LABEL_OFFSET = 18;
const LIST_TEXT_OFFSET = 36;
const SIGN_SIZE = 8;
const SIGN_LEADING = 9.2;
const SIGN_GAP = 65; // espaço para os carimbos de assinatura do gov.br

/** Gera o PDF do termo no formato do modelo do RH. */
export async function renderAgreementPdf(kind: AgreementKind, filledText: string, title: string): Promise<Uint8Array> {
  const style = AGREEMENTS[kind].style;
  const [PAGE_W, PAGE_H] = style.page;
  const { margin: MARGIN, size: SIZE, leading: LEADING } = style;
  const FIRST_BASELINE = MARGIN + SIZE * 0.935;

  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setLanguage("pt-BR");
  const { regular, bold } = await embedFonts(pdf, style.font);
  const fontOf = (s: Segment) => (s.bold ? bold : regular);
  const right = PAGE_W - MARGIN;

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  // Distância do topo até a linha de base da próxima linha.
  let cursor = FIRST_BASELINE;
  let atPageTop = true;
  const ensure = (height: number) => {
    if (cursor + height > PAGE_H - MARGIN) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      cursor = FIRST_BASELINE;
      atPageTop = true;
    }
  };
  const space = (amount: number) => {
    // Espaços não se acumulam no alto de uma página nova.
    if (!atPageTop) cursor += amount;
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

  type Align = "justify" | "left" | "right" | "center";

  /** Parágrafo (no justificado, a última linha fica alinhada à esquerda). */
  function paragraph(text: string, x: number, width: number, align: Align = "justify", before?: () => void) {
    const lines = wrap(parseWords(text).map(prepared), width * style.wrapFactor, SIZE);
    lines.forEach((line, i) => {
      ensure(LEADING);
      if (i === 0) before?.();
      const natural = line.reduce((w, word) => w + wordWidth(word, SIZE), 0);
      const gaps = line.length - 1;
      let gap = spaceWidth(SIZE);
      let startX = x;
      if (align === "justify" && i < lines.length - 1 && gaps > 0) gap = (width - natural) / gaps;
      if (align === "right") startX = x + width - natural - gap * gaps;
      if (align === "center") startX = x + (width - natural - gap * gaps) / 2;
      drawWords(line, startX, cursor, SIZE, gap);
      cursor += LEADING;
      atPageTop = false;
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
    atPageTop = false;
  }

  const lines = filledText.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const next = lines[i + 1]?.trim() ?? "";
    if (!line) {
      space(style.blankLine);
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
      paragraph(line.slice(3), MARGIN, right - MARGIN, "left", () => {
        const top = cursor - SIZE * 0.97;
        page.drawRectangle({ x: MARGIN - 0.35, y: PAGE_H - top - 13, width: right - MARGIN, height: 13, color: BAND_COLOR });
      });
    } else if (line.startsWith("# ")) {
      paragraph(line.slice(2), style.titleX, right - style.titleX);
    } else if (line.startsWith("^ ")) {
      // Título centralizado: não deixa sozinho no pé da página.
      if (/^\^ \*\*/.test(line) && next && !next.startsWith("^ ")) ensure(LEADING * 3);
      // Linha de assinatura e nome embaixo ficam na mesma página.
      if (/^\^ _/.test(line)) ensure(LEADING * 2);
      paragraph(line.slice(2), MARGIN, right - MARGIN, "center");
      // Linhas centralizadas seguidas (título, assinatura) ficam juntas.
      if (next.startsWith("^ ")) continue;
    } else if (line.startsWith("> ")) {
      paragraph(line.slice(2), MARGIN, right - MARGIN, "right");
    } else {
      const item = line.match(/^([a-z]\)|[IVXLC]+\.)\s+(.*)$/);
      if (item) {
        const label = safeText(regular, item[1]);
        const labelX = /\.$/.test(item[1])
          ? MARGIN + LIST_LABEL_OFFSET + 0.6 - regular.widthOfTextAtSize(label, SIZE)
          : MARGIN + LIST_LABEL_OFFSET;
        paragraph(item[2], MARGIN + LIST_TEXT_OFFSET, right - MARGIN - LIST_TEXT_OFFSET, "justify", () =>
          page.drawText(label, { x: labelX, y: PAGE_H - cursor, size: SIZE, font: regular, color: rgb(0, 0, 0) })
        );
      } else {
        paragraph(line, MARGIN, right - MARGIN);
      }
    }
    space(style.paragraphAfter);
  }
  return pdf.save();
}

/**
 * Confere se o PDF tem assinatura digital embutida (como a do gov.br). Não
 * valida a cadeia de certificados — isso o RH confere em validar.iti.gov.br.
 */
export function looksDigitallySigned(data: Buffer): boolean {
  return signatureCount(data) > 0;
}

/** Quantas assinaturas digitais o PDF tem (cada uma traz o seu /ByteRange com os trechos assinados). */
export function signatureCount(data: Buffer): number {
  const text = data.toString("latin1");
  if (!/\/Type\s*\/Sig\b|\/SubFilter\s*\/(adbe\.pkcs7|ETSI\.CAdES)/.test(text)) return 0;
  const ranges = new Set([...text.matchAll(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g)].map((m) => m.slice(1).join(" ")));
  return ranges.size;
}
