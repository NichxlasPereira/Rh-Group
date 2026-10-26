/**
 * Aniversariantes: só dia e mês de nascimento (sem ano nem idade), para a lista
 * do mês e o bolinho do organograma.
 */

export interface Birthday {
  employeeId: string;
  /** 1 a 12. */
  month: number;
  day: number;
  /** Versão da foto para crachá (para a URL), ou null sem foto. */
  photo: string | null;
}

export const MONTH_NAMES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** "AAAA-MM-DD" (ou ISO completo) → { month, day }, ou null se não der para ler. */
export function monthDayOf(value: string | null | undefined): { month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? "");
  if (!m) return null;
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { month, day };
}

/** Quem faz aniversário na data (29/02 comemora em 28/02 nos anos que não são bissextos). */
export function isBirthdayOn(b: { month: number; day: number }, date: Date): boolean {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  if (b.month === month && b.day === day) return true;
  const leap = new Date(date.getFullYear(), 1, 29).getMonth() === 1;
  return !leap && b.month === 2 && b.day === 29 && month === 2 && day === 28;
}
