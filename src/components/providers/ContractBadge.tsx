import { Provider, contractStatus, contractStatusLabel } from "@/lib/providers";

const STYLE = {
  encerrado: "border border-border-strong text-muted",
  a_iniciar: "bg-accent-soft text-accent-strong",
  sem_termino: "border border-border-strong text-muted",
  vigente: "bg-ok-soft text-ok",
  vencendo: "bg-warn-soft text-warn",
  vencido: "bg-critical-soft text-critical",
} as const;

/** Situação do contrato: vigente, vence em N dias, vencido… */
export function ContractBadge({ provider }: { provider: Pick<Provider, "active" | "contractStart" | "contractEnd"> }) {
  const s = contractStatus(provider);
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${STYLE[s.kind]}`}>
      {contractStatusLabel(s)}
    </span>
  );
}
