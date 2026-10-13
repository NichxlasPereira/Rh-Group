import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";
import { prisma } from "./prisma";

/**
 * Acordo de confidencialidade (NDA) do onboarding: o sistema gera o PDF já
 * preenchido com os dados do candidato e da empresa contratante; o candidato
 * assina no gov.br e envia o PDF assinado de volta.
 *
 * O modelo usa marcadores {{...}} e uma marcação mínima: linha entre ** **
 * sai em negrito; linha vazia separa parágrafos. O RH pode trocar o texto
 * (fica no banco); sem isso, vale o modelo padrão abaixo.
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

export const DEFAULT_NDA_TEMPLATE = `**ACORDO DE CONFIDENCIALIDADE E NÃO CONCORRÊNCIA**

ACORDO DE CONFIDENCIALIDADE E NÃO CONCORRÊNCIA, que entre si fazem, de um lado {{EMPRESA_QUALIFICACAO}}, e, de outro lado, {{NOME}}, brasileiro(a), maior, nascido(a) em {{NASCIMENTO}}, portador(a) do RG nº {{RG}} e do CPF nº {{CPF}}, residente e domiciliado(a) em {{ENDERECO}}, doravante denominado(a) PRESTADORA DE SERVIÇO.

As partes acima qualificadas têm entre si justo e acordado o presente ACORDO DE CONFIDENCIALIDADE (NDA), que será regido pelas seguintes cláusulas e condições a seguir:

**CLÁUSULA PRIMEIRA – DO OBJETO**
1.1. O presente Acordo tem por objeto assegurar a confidencialidade, integridade e proteção de todas as informações a que o PRESTADORA DE SERVIÇOS tiver acesso no exercício de suas atividades junto à EMPRESA, abrangendo dados estratégicos, operacionais, financeiros, comerciais, jurídicos, de clientes, fornecedores e quaisquer outros considerados sensíveis.
1.2. O PRESTADOR DE SERVIÇOS reconhece que terá acesso a informações sigilosas, comprometendo-se a não utilizá-las para qualquer finalidade alheia à execução dos serviços contratados, sob pena das sanções previstas neste instrumento e na legislação aplicável.

**CLÁUSULA SEGUNDA – DA DEFINIÇÃO DE INFORMAÇÕES CONFIDENCIAIS**
2.1. Consideram-se informações confidenciais todas aquelas obtidas pelo PRESTADORA DE SERVIÇOS durante a execução dos serviços, independentemente do formato ou meio de acesso, incluindo informações verbais, escritas, digitais, eletrônicas ou armazenadas em qualquer suporte físico ou virtual.
2.2. São abrangidas por este Acordo, sem prejuízo de outras que possam ser qualificadas como sigilosas:
a) Informações Operacionais e Comerciais: processos internos, metodologias, estratégias de mercado, dados de clientes, fornecedores, parceiros e informações comerciais sensíveis;
b) Informações Financeiras: dados contábeis, relatórios financeiros, faturamento, precificação, negociações e planos de investimento;
c) Informações Tecnológicas e Digitais: softwares, plataformas, bancos de dados, ferramentas digitais, códigos-fonte, acessos a sistemas internos e credenciais de segurança;
d) Informações Jurídicas e Regulatórias: contratos, pareceres, processos judiciais, administrativos ou arbitrais, bem como documentos protegidos por sigilo legal ou contratual;
e) Dados Pessoais e Sensíveis: informações de funcionários, clientes ou terceiros, nos termos da Lei Geral de Proteção de Dados – LGPD (Lei nº 13.709/2018).
2.3. Não serão consideradas confidenciais as informações que:
a) Já se encontravam em domínio público à época de sua divulgação, desde que tal publicidade não tenha decorrido de ação ou omissão do PRESTADOR DE SERVIÇOS;
b) Venham a ser legitimamente obtidas de terceiros sem obrigação de confidencialidade.

**CLÁUSULA TERCEIRA – DO DEVER DE SIGILO E RESTRIÇÕES DE USO**
3.1. O PRESTADOR DE SERVIÇOS compromete-se a não divulgar, reproduzir, compartilhar ou utilizar informações confidenciais para qualquer fim alheio à execução dos serviços contratados.
3.2. É vedado ao PRESTADOR DE SERVIÇOS:
a) Armazenar informações da EMPRESA em dispositivos pessoais, salvo autorização formal e expressa;
b) Compartilhar credenciais de acesso a sistemas, plataformas ou bancos de dados da EMPRESA;
c) Utilizar informações confidenciais para benefício próprio ou de terceiros, incluindo concorrentes;
d) Acessar informações confidenciais fora das dependências físicas ou digitais da EMPRESA, salvo se expressamente autorizado.
3.3. O descumprimento desta cláusula ensejará responsabilização nas esferas civil, trabalhista e criminal, conforme previsto neste instrumento e na legislação vigente.

**CLÁUSULA QUINTA – PENALIDADES POR VIOLAÇÃO**
4.1. O inadimplemento das obrigações assumidas neste Acordo sujeitará o PRESTADOR DE SERVIÇOS às seguintes penalidades, sem prejuízo da reparação por perdas e danos:
I. Rescisão imediata do contrato de prestação de serviços, independentemente de aviso prévio ou indenização rescisória;
II. Responsabilidade civil, com obrigação de indenizar danos materiais e/ou morais efetivamente comprovados;
III. Responsabilidade criminal, nos termos da legislação aplicável, incluindo, mas não se limitando, às seguintes hipóteses:
a) Violação de Segredo Profissional – Art. 154 do Código Penal;
b) Divulgação de Segredo – Art. 153 do Código Penal;
c) Invasão de Dispositivo Informático – Art. 154-A do Código Penal;
d) Violação de Segredos Comerciais – Art. 195, XI, da Lei nº 9.279/1996 (Lei da Propriedade Industrial).
4.2. As penalidades poderão ser aplicadas cumulativamente, considerando-se a gravidade da infração, a extensão do dano e o nexo causal entre a conduta e o prejuízo.

**CLÁUSULA QUINTA – DO TRATAMENTO DE DADOS PESSOAIS**
5.1. O PRESTADOR DE SERVIÇOS deverá tratar dados pessoais em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).
5.2. O uso indevido de dados pessoais acarretará, além da responsabilidade civil e criminal, a aplicação de sanções administrativas previstas na LGPD.

**CLÁUSULA SEXTA – DISPOSIÇÕES GERAIS**
6.1. O presente Acordo não gera vínculo empregatício entre as partes, constituindo instrumento autônomo, ainda que vinculado ao contrato de prestação de serviços principal.

**CLÁUSULA SÉTIMA – DO FORO**
7.1. Para dirimir controvérsias decorrentes deste Acordo, as partes elegem o foro da Comarca de São Paulo/SP, renunciando a qualquer outro, por mais privilegiado que seja.

São Paulo, {{DATA_EXTENSO}}.

**CONTRATANTE**
{{EMPRESA_NOME}}
{{ASSINANTE_NOME}} – {{ASSINANTE_CARGO}}
CPF {{ASSINANTE_CPF}}

**CONTRATADO**
{{NOME}}
CPF: {{CPF}}`;

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
  const values: Record<string, string> = {
    EMPRESA_QUALIFICACAO: data.company.qualification.trim().replace(/[.,;\s]+$/, ""),
    EMPRESA_NOME: data.company.name,
    ASSINANTE_NOME: data.company.signerName,
    ASSINANTE_CARGO: data.company.signerRole,
    ASSINANTE_CPF: data.company.signerCpf,
    NOME: data.candidate.nome.toUpperCase(),
    NASCIMENTO: d ? `${d}/${m}/${y}` : data.candidate.nascimento,
    RG: data.candidate.rg,
    CPF: data.candidate.cpf,
    ENDERECO: data.candidate.endereco.replace(/\s*\n\s*/g, ", "),
    DATA_EXTENSO: dateByExtension(today),
  };
  return template.replace(/\{\{\s*([A-Z_]+)\s*\}\}/g, (all, key: string) => values[key] ?? all);
}

/** Troca caracteres que a fonte padrão do PDF (WinAnsi) não tem. */
function safeText(font: PDFFont, text: string): string {
  const mapped = text.replace(/[⁰°]/g, "º").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/ /g, " ");
  let out = "";
  for (const ch of mapped) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += "?";
    }
  }
  return out;
}

/** Gera o PDF do acordo (A4, texto corrido com quebra de linha e de página). */
export async function renderNdaPdf(filledText: string, title: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setLanguage("pt-BR");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const [W, H] = [595.28, 841.89];
  const margin = 64;
  const size = 10.5;
  const leading = 15;
  let page = pdf.addPage([W, H]);
  let y = H - margin;

  const newPageIfNeeded = (needed: number) => {
    if (y - needed < margin) {
      page = pdf.addPage([W, H]);
      y = H - margin;
    }
  };

  for (const rawLine of filledText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      y -= leading * 0.6;
      continue;
    }
    const isBold = /^\*\*.*\*\*$/.test(line);
    const font = isBold ? bold : regular;
    const text = safeText(font, isBold ? line.slice(2, -2) : line);
    // Quebra por palavras dentro da largura útil.
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > W - margin * 2 && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
    if (isBold) y -= 4;
    for (const l of lines) {
      newPageIfNeeded(leading);
      page.drawText(l, { x: margin, y, size, font, color: rgb(0.08, 0.08, 0.1) });
      y -= leading;
    }
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
