"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { IconChevronLeft, IconChevronRight, IconInfo, IconX } from "../icons";
import type { AttendanceTabKey } from "./AttendanceFilters";

/**
 * Guia da DEMONSTRAÇÃO (só no pacote de demo, NEXT_PUBLIC_DEMO=1): passo a passo
 * por cada parte do RHGroup — para que serve, como funciona e o que significa
 * cada campo. Cada passo abre a seção e destaca o ponto da tela de que fala.
 */

interface Step {
  /** Seção que o passo abre (opcional). */
  tab?: AttendanceTabKey;
  /** Onde destacar na tela. */
  target?: () => Element | null;
  title: string;
  purpose: string;
  fields?: [string, string][];
  tip?: string;
}

const menuItem = (key: string) => () =>
  [...document.querySelectorAll(`[data-secao="${key}"]`)].find((el) => (el as HTMLElement).offsetParent) ?? null;
/** Cartão (section) cujo título tem este texto. */
const card = (text: string) => () =>
  [...document.querySelectorAll("main section")].find((s) =>
    [...s.querySelectorAll("h2, h3")].some((h) => h.textContent?.trim().startsWith(text))
  ) ?? null;
const query = (selector: string) => () =>
  [...document.querySelectorAll(selector)].find((el) => (el as HTMLElement).offsetParent) ?? null;

const STEPS: Step[] = [
  {
    title: "Bem-vindo(a) ao RHGroup",
    purpose:
      "O RHGroup reúne num só lugar a rotina do RH do grupo: frequência, cadastro da equipe, admissões, desligamentos, prestadores e o calendário. Este guia passa por cada parte e explica para que serve e como funciona.",
    fields: [
      ["Dados da demonstração", "Todos os nomes, fotos, empresas e números são fictícios. Pode criar, editar e excluir à vontade."],
      ["Como navegar", "Use Próximo e Anterior. O guia abre cada seção e destaca na tela o ponto explicado."],
    ],
    tip: "Dá para fechar o guia a qualquer momento e reabrir pelo botão (i), ao lado do tema.",
  },
  {
    tab: "mural",
    target: menuItem("mural"),
    title: "Menu de seções",
    purpose:
      "Cada ícone é uma parte do sistema. A seção aberta fica destacada, com o nome logo abaixo. Um pontinho vermelho no ícone avisa que há algo pendente ali.",
    fields: [
      ["Menu lateral ou no topo", "Cada pessoa escolhe onde prefere o menu, no menu das iniciais."],
      ["Tema", "O botão redondo com meia-lua alterna entre claro, escuro e automático (claro de dia, escuro à noite)."],
    ],
  },
  {
    tab: "mural",
    target: query('section[aria-label="Indicadores do mês"]'),
    title: "Mural · indicadores do mês",
    purpose: "A primeira tela do RH: um resumo do mês, comparado com o mês anterior.",
    fields: [
      ["Colaboradores ativos", "Quantas pessoas estão no quadro hoje e quantas entraram neste mês."],
      ["Faltas e atestados no mês", "Total do mês e a diferença para o mês passado (a seta mostra se subiu ou caiu)."],
      ["Onboardings", "Admissões em andamento e quantas começam nos próximos 7 dias."],
    ],
  },
  {
    tab: "mural",
    target: card("Precisa de você"),
    title: "Mural · Precisa de você",
    purpose: "A lista do que está esperando uma ação do RH, em ordem de urgência. Clicar num item leva direto à tela certa.",
    fields: [
      ["Documentos do onboarding", "Arquivos que candidatos enviaram e ainda não foram aprovados ou recusados."],
      ["Contratos", "Prestadores e colaboradores com contrato vencido ou vencendo em até 30 dias."],
      ["Offboarding", "Desligamentos com pedidos (acessos, equipamentos) ainda em aberto."],
      ["Pedidos de acesso", "Pessoas que pediram para entrar no sistema e aguardam aprovação."],
    ],
  },
  {
    tab: "mural",
    target: card("Agenda da semana"),
    title: "Mural · agenda, campanha e recados",
    purpose: "Os próximos 7 dias de relance, a campanha do mês e os avisos do RH para a equipe.",
    fields: [
      ["Agenda da semana", "Aniversários, primeiros e últimos dias, tempo de casa, feriados e eventos. “Ver mês” abre o calendário completo."],
      ["Contagem regressiva", "Quantos dias faltam para o próximo feriado e o próximo recesso."],
      ["Campanha do mês", "A faixa colorida mostra a campanha em andamento (ex.: Novembro Azul)."],
      ["Recados do RH", "Avisos curtos com data de validade: somem sozinhos depois do último dia. Use “Publicar recado”."],
    ],
  },
  {
    tab: "calendario",
    target: menuItem("calendario"),
    title: "Calendário",
    purpose: "O ano do RH num só lugar: feriados, recessos, comemorações, campanhas, treinamentos e as datas da equipe.",
    fields: [
      ["Feriados automáticos", "Nacionais, do estado de SP e da capital entram sozinhos, inclusive os móveis (Carnaval, Sexta-feira Santa, Corpus Christi)."],
      ["Novo evento", "Nome, tipo, início e término, horário e local, para quais empresas vale e se repete todo ano."],
      ["Filtros", "Ligue e desligue cada tipo (feriados, recessos, campanhas...) e escolha a empresa."],
      ["Painel do dia", "Clique num dia para ver tudo dele; dois cliques num dia criam um evento ali."],
      ["Sugestões", "Meses de conscientização (Janeiro Branco, Outubro Rosa...) e datas comemorativas, com um clique."],
      ["Avisos no Slack", "Resumo da semana e lembretes de feriados e eventos por mensagem direta (desligado na demo)."],
    ],
  },
  {
    tab: "ocorrencias",
    target: menuItem("ocorrencias"),
    title: "Ocorrências",
    purpose: "O registro de frequência: tudo o que afeta a presença de cada pessoa, com documentos anexados.",
    fields: [
      ["Falta", "Dia não trabalhado; marque se foi justificada."],
      ["Atestado", "Período coberto por atestado médico, com a foto ou o PDF anexado."],
      ["Folga", "Dias de folga concedidos e quem aprovou; descontam do saldo de folgas da pessoa."],
      ["Comprovante de horas", "Ausência de algumas horas no dia (ex.: consulta), com horário de saída e volta."],
      ["Mês e setor", "Os filtros no alto mostram só o período e a empresa escolhidos."],
    ],
    tip: "“Registrar ocorrência” no alto da tela faz um lançamento em poucos segundos.",
  },
  {
    tab: "colaboradores",
    target: menuItem("colaboradores"),
    title: "Colaboradores",
    purpose: "O cadastro da equipe de todas as empresas do grupo.",
    fields: [
      ["Faixa de empresas", "Escolha uma empresa para ver só a equipe dela; “Todos” agrupa por empresa. No celular, arraste para os lados."],
      ["Lista ou organograma", "A lista mostra cargo, setor e ocorrências do mês; o organograma mostra as áreas, os responsáveis e a equipe com foto."],
      ["Novo colaborador", "Nome, empresa, área, cargo, gestor, data de entrada, tipo de contrato e saldo de folgas."],
      ["Importar planilha e enviar fotos", "Cadastro em lote a partir de uma planilha e fotos de crachá de várias pessoas de uma vez."],
    ],
  },
  {
    tab: "colaboradores",
    // A primeira pessoa da lista (não a tabela inteira, que cobria a tela toda).
    target: () =>
      [...document.querySelectorAll("main table tbody tr")].find((tr) => tr.querySelector("td + td") && (tr as HTMLElement).offsetParent) ??
      query('[role="tablist"][aria-label="Setores"]')(),
    title: "Ficha do colaborador",
    purpose: "Clicar em uma pessoa (como a destacada) abre a ficha completa dela.",
    fields: [
      ["Dados pessoais protegidos", "CPF, RG, telefone, endereço e dados bancários aparecem mascarados. Ver completos fica registrado com o nome de quem viu (LGPD)."],
      ["Documentos", "Contrato, documentos pessoais e a foto de crachá, guardados na ficha."],
      ["Frequência", "Histórico de faltas, atestados e folgas e o saldo de folgas da pessoa."],
      ["Contrato", "Tipo (CLT, PJ, estágio) e data de término, para o RH ser avisado antes de vencer."],
    ],
  },
  {
    tab: "prestadores",
    target: menuItem("prestadores"),
    title: "Prestadores",
    purpose: "Pessoas jurídicas com contrato temporário, fora do quadro de colaboradores.",
    fields: [
      ["Cadastro", "Empresa, cargo ou serviço, área, início e validade do contrato."],
      ["Vencimento", "Contratos vencidos ou vencendo em até 30 dias ficam em destaque e entram no “Precisa de você”."],
      ["Documentos", "Contrato assinado, cartão CNPJ e outros arquivos do prestador."],
    ],
  },
  {
    tab: "aniversariantes",
    target: menuItem("aniversariantes"),
    title: "Aniversariantes",
    purpose: "Quem faz aniversário em cada mês, para o RH preparar as comemorações.",
    fields: [
      ["Só dia e mês", "O sistema mostra o dia e o mês, nunca o ano nem a idade."],
      ["Hoje", "Os aniversariantes do dia aparecem em destaque e ganham um bolinho no organograma."],
    ],
  },
  {
    tab: "admissoes",
    target: menuItem("admissoes"),
    title: "Onboarding (admissão digital)",
    purpose: "A admissão sem papel: o candidato envia dados e documentos por um link e o RH confere tudo aqui.",
    fields: [
      ["Novo onboarding", "Cargo, empresa, área e data de início. O sistema gera um link privado para o candidato (sem senha)."],
      ["Dados e documentos", "O RH escolhe o que pedir (CPF, endereço, RG, comprovante...). Cada documento é aprovado ou recusado com um motivo."],
      ["Termos", "Acordo de confidencialidade e termo de uso de imagem saem preenchidos para o candidato assinar no gov.br."],
      ["Concluir", "Cria o colaborador com os dados e documentos e dispara o kit de início."],
    ],
  },
  {
    tab: "offboarding",
    target: menuItem("offboarding"),
    title: "Offboarding (desligamento)",
    purpose: "O desligamento organizado: ninguém esquece de cortar um acesso ou recolher um equipamento.",
    fields: [
      ["Desligar colaborador", "Escolha a pessoa e o último dia. Cada responsável recebe só os pedidos dele (TI, RH, gestor)."],
      ["Andamento", "Cada pedido mostra quem já resolveu e o que falta; um lembrete sai um dia depois para o que ainda estiver aberto."],
    ],
  },
  {
    tab: "relatorios",
    target: menuItem("relatorios"),
    title: "Relatórios",
    purpose: "Os números do mês para acompanhar e apresentar.",
    fields: [
      ["Por tipo e por setor", "Faltas, atestados, folgas e horas de cada empresa no mês."],
      ["Por colaborador", "Quem teve mais ocorrências no período."],
      ["Baixar PDF do mês", "Relatório pronto para enviar ou imprimir."],
    ],
  },
  {
    target: query('[aria-haspopup="menu"][aria-label^="Conta"]'),
    title: "Menu das iniciais e configurações",
    purpose: "As iniciais (no canto do menu) abrem a sua conta e as configurações do sistema.",
    fields: [
      ["Acessos", "Quem pode entrar no RHGroup, quem é administrador e os pedidos de cadastro para aprovar."],
      ["Onboarding", "Os itens do kit de boas-vindas (e-mail, notebook, crachá...) e quem cuida de cada um, avisado pelo Slack."],
      ["Offboarding", "Os pedidos de desligamento (desativar e-mail, recolher notebook...) e o responsável por cada um."],
      ["Trocar senha, menu e sair", "Sua senha, menu lateral ou no topo, e sair do sistema."],
    ],
    tip: "Fim do guia. Explore à vontade; para recomeçar com os dados iniciais, use “Restaurar dados da demo”.",
  },
];

const SEEN_KEY = "demoGuiaVisto";

/** Botão redondo do guia, ao lado do tema (mesmo tamanho). */
export function DemoTourButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Guia da demo"
      title="Guia da demo"
      className="flex h-10 w-10 items-center justify-center rounded-full border border-border-strong text-ink transition-colors hover:bg-surface-2"
    >
      <IconInfo className="h-[18px] w-[18px]" />
    </button>
  );
}

export function DemoTour({
  open,
  onOpenChange,
  onNavigate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (tab: AttendanceTabKey) => void;
}) {
  const [index, setIndex] = useState(0);
  // Lado do cartão: à direita, ou à esquerda quando o destaque está à direita (não cobre o ponto explicado).
  const [side, setSide] = useState<"right" | "left">("right");
  // Em cima quando o destaque está na parte de baixo da tela.
  const [atTop, setAtTop] = useState(false);
  const spotRef = useRef<HTMLSpanElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const step = STEPS[index];

  // Abre sozinho na primeira visita deste navegador; reaberto pelo botão, começa do início.
  useEffect(() => {
    try {
      if (!localStorage.getItem(SEEN_KEY)) onOpenChange(true);
    } catch {
      onOpenChange(true);
    }
    // Só ao montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  const close = useCallback(() => {
    onOpenChange(false);
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {}
  }, [onOpenChange]);

  // Abre a seção do passo e volta o texto do cartão para o início.
  useEffect(() => {
    if (open && step.tab) onNavigate(step.tab);
    bodyRef.current?.scrollTo({ top: 0 });
    // Só quando o passo muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index]);

  // Destaque: some na troca de passo, espera o ponto aparecer na tela (a seção pode estar
  // montando), leva até ele sem rolagem animada e reaparece já no lugar. Depois acompanha o
  // elemento a cada quadro, direto no estilo (sem transição de posição, que ficava para trás).
  useLayoutEffect(() => {
    const spot = spotRef.current;
    if (!open || !spot) return;
    spot.style.opacity = "0";
    if (!step.target) return;
    let frame = 0;
    let found = false;
    const started = performance.now();
    const place = (el: Element) => {
      const r = el.getBoundingClientRect();
      spot.style.transform = `translate(${r.left - 6}px, ${r.top - 6}px)`;
      spot.style.width = `${r.width + 12}px`;
      spot.style.height = `${r.height + 12}px`;
      return r;
    };
    const track = () => {
      const el = step.target?.();
      if (el && !found) {
        found = true;
        const r0 = el.getBoundingClientRect();
        // Só rola se o ponto não estiver inteiro à vista.
        if (r0.top < 72 || r0.bottom > window.innerHeight - 16) el.scrollIntoView({ block: "center" });
        const r = place(el);
        setSide(r.left + r.width / 2 > window.innerWidth * 0.55 && r.width < window.innerWidth * 0.6 ? "left" : "right");
        setAtTop(r.width >= window.innerWidth * 0.6 && r.top + r.height / 2 > window.innerHeight * 0.55);
        spot.style.opacity = "1";
      } else if (el) place(el);
      if (found || performance.now() - started < 2000) frame = requestAnimationFrame(track);
    };
    frame = requestAnimationFrame(track);
    return () => cancelAnimationFrame(frame);
  }, [open, step]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") setIndex((i) => Math.min(STEPS.length - 1, i + 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;

  const last = index === STEPS.length - 1;
  return (
    <>
      {/* Destaque do ponto explicado: escurece o resto, sem bloquear a tela. */}
      <span
        ref={spotRef}
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-[65] rounded-[14px] opacity-0 transition-opacity duration-150 ease-out"
        style={{ boxShadow: "0 0 0 2px var(--neon-cinza), 0 0 0 9999px rgba(0,0,0,0.38)" }}
      />
      {/* Altura fixa: o cartão não muda de tamanho de um passo para o outro. */}
      <div
        role="dialog"
        aria-label="Guia da demonstração"
        className={`fixed z-[70] flex ${atTop ? "top-4" : "bottom-4"} h-[min(480px,calc(100vh-2rem))] w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[16px] neon-cinza border bg-surface shadow-[0_24px_60px_-24px_rgba(0,0,0,0.7)] ${
          side === "left" ? "left-4 lg:left-[112px]" : "right-4"
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <span className="font-display text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
            Guia da demo · {index + 1} de {STEPS.length}
          </span>
          <button type="button" onClick={close} aria-label="Fechar o guia" className="rounded-[8px] p-1 text-muted hover:bg-surface-2 hover:text-ink">
            <IconX className="h-4 w-4" />
          </button>
        </div>
        <div ref={bodyRef} key={index} className="rh-fade flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4 text-sm">
          <h2 className="font-display text-[19px] font-semibold leading-tight text-ink">{step.title}</h2>
          <p className="text-muted">{step.purpose}</p>
          {step.fields && (
            <dl className="flex flex-col gap-2.5">
              {step.fields.map(([label, text]) => (
                <div key={label} className="rounded-[10px] bg-surface-2 px-3 py-2">
                  <dt className="text-[13px] font-bold text-ink">{label}</dt>
                  <dd className="text-[13px] text-muted">{text}</dd>
                </div>
              ))}
            </dl>
          )}
          {step.tip && <p className="rounded-[10px] border border-dashed border-border-strong px-3 py-2 text-[13px] text-ink">{step.tip}</p>}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
          <div className="flex gap-1" aria-hidden="true">
            {STEPS.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === index ? "w-4 bg-ink" : "w-1.5 bg-border-strong"}`} />
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={index === 0}
              onClick={() => setIndex((i) => i - 1)}
              className="flex items-center gap-1 rounded-[10px] px-3 py-1.5 text-[13px] font-semibold text-muted transition hover:bg-surface-2 hover:text-ink disabled:opacity-40"
            >
              <IconChevronLeft className="h-4 w-4" />
              Anterior
            </button>
            <button
              type="button"
              onClick={() => (last ? close() : setIndex((i) => i + 1))}
              className="flex items-center gap-1 rounded-[10px] bg-ink px-3 py-1.5 text-[13px] font-bold text-bg transition hover:brightness-110"
            >
              {last ? "Concluir" : "Próximo"}
              {!last && <IconChevronRight className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
