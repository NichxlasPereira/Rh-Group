/**
 * Campanhas e datas comemorativas sugeridas para o calendário do RH (meses de
 * conscientização e datas que costumam ter ação com a equipe). O RH adiciona
 * com um clique; as de data fixa entram como "repetir todo ano".
 */
import { CalendarEventInfo, EventType, eventSpans, ymd } from "./calendar";

export interface CampaignSuggestion {
  key: string;
  title: string;
  type: EventType;
  startDate: string;
  endDate: string;
  yearly: boolean;
  notes: string;
}

function monthLength(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** N-ésimo domingo do mês (Dia das Mães e Dia dos Pais). */
function nthSunday(year: number, month: number, n: number): string {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return ymd(year, month, 1 + ((7 - first) % 7) + (n - 1) * 7);
}

const MONTHS: [number, string, string][] = [
  [1, "Janeiro Branco", "Saúde mental e emocional."],
  [2, "Fevereiro Laranja", "Conscientização sobre a leucemia e incentivo à doação de medula óssea."],
  [3, "Março Lilás", "Prevenção ao câncer do colo do útero."],
  [4, "Abril Verde", "Segurança e saúde no trabalho."],
  [5, "Maio Amarelo", "Segurança no trânsito."],
  [6, "Junho Vermelho", "Incentivo à doação de sangue."],
  [7, "Julho Amarelo", "Prevenção às hepatites virais."],
  [8, "Agosto Lilás", "Enfrentamento à violência contra a mulher."],
  [9, "Setembro Amarelo", "Prevenção ao suicídio e valorização da vida."],
  [10, "Outubro Rosa", "Prevenção ao câncer de mama."],
  [11, "Novembro Azul", "Saúde do homem e prevenção ao câncer de próstata."],
  [12, "Dezembro Vermelho", "Prevenção ao HIV/aids e outras ISTs."],
];

/** Sugestões do ano, em ordem de data. */
export function suggestionsFor(year: number): CampaignSuggestion[] {
  const list: CampaignSuggestion[] = MONTHS.map(([m, title, notes]) => ({
    key: `mes-${m}`,
    title,
    type: "campanha",
    startDate: ymd(year, m, 1),
    endDate: ymd(year, m, m === 2 ? 28 : monthLength(year, m)), // fevereiro sempre até 28, para repetir igual todo ano
    yearly: true,
    notes,
  }));
  const mothers = nthSunday(year, 5, 2);
  const fathers = nthSunday(year, 8, 2);
  list.push(
    {
      key: "mulher",
      title: "Dia Internacional da Mulher",
      type: "comemoracao",
      startDate: ymd(year, 3, 8),
      endDate: ymd(year, 3, 8),
      yearly: true,
      notes: "",
    },
    {
      key: "maes",
      title: "Dia das Mães",
      type: "comemoracao",
      startDate: mothers,
      endDate: mothers,
      yearly: false,
      notes: "Segundo domingo de maio.",
    },
    {
      key: "junina",
      title: "Festa junina",
      type: "comemoracao",
      startDate: ymd(year, 6, 24),
      endDate: ymd(year, 6, 24),
      yearly: false,
      notes: "Ajuste a data da festa.",
    },
    {
      key: "pais",
      title: "Dia dos Pais",
      type: "comemoracao",
      startDate: fathers,
      endDate: fathers,
      yearly: false,
      notes: "Segundo domingo de agosto.",
    },
    {
      key: "rh",
      title: "Dia do Profissional de RH",
      type: "comemoracao",
      startDate: ymd(year, 6, 3),
      endDate: ymd(year, 6, 3),
      yearly: true,
      notes: "",
    }
  );
  return list.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.type.localeCompare(b.type));
}

/** A sugestão já está no calendário (mesmo nome, acontecendo naquele ano). */
export function alreadyAdded(s: CampaignSuggestion, events: CalendarEventInfo[], year: number): boolean {
  const name = s.title.toLocaleLowerCase("pt-BR");
  return events.some(
    (e) => e.title.toLocaleLowerCase("pt-BR") === name && eventSpans(e, `${year}-01-01`, `${year}-12-31`).length > 0
  );
}

const COLORS: [RegExp, string][] = [
  [/\bbranc[oa]\b/i, "#94a3b8"],
  [/\blaranja\b/i, "#f97316"],
  [/\blil[aá]s\b/i, "#a78bfa"],
  [/\bverde\b/i, "#22c55e"],
  [/\bamarel[oa]\b/i, "#eab308"],
  [/\bvermelh[oa]\b/i, "#ef4444"],
  [/\brosa\b/i, "#ec4899"],
  [/\bazul\b/i, "#3b82f6"],
  [/\broxo\b/i, "#8b5cf6"],
  [/\bdourad[oa]\b/i, "#d4a017"],
];

/** Cor da campanha pelo nome (Outubro Rosa, Novembro Azul…), ou null. */
export function campaignColor(title: string): string | null {
  return COLORS.find(([re]) => re.test(title))?.[1] ?? null;
}
