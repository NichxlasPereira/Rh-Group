"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ThemeToggle } from "../ThemeToggle";
import { CffLogo } from "../brand";

/** Agradecimento depois que o candidato envia tudo o que era obrigatório. */
export function AdmissionThanks({ token }: { token: string }) {
  const [firstName, setFirstName] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admissao/${token}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setFirstName(data?.candidateName?.split(" ")[0] ?? null))
      .catch(() => undefined);
  }, [token]);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-8 sm:py-12">
      <div className="flex items-center justify-between">
        <CffLogo className="h-9 w-auto text-ink" />
        <ThemeToggle />
      </div>

      <div className="flex flex-col items-center gap-5 rounded-[18px] border border-border bg-surface px-6 py-10 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-ok-soft text-ok">
          <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1 className="font-display text-3xl font-bold leading-tight text-ink">
          Obrigado{firstName ? `, ${firstName}` : ""}!
        </h1>
        <p className="max-w-md text-base text-ink">
          Recebemos seus dados e documentos. A equipe de RH da CFFGROUP vai analisar tudo para a possível aprovação
          do seu onboarding.
        </p>
        <p className="max-w-md text-sm text-muted">
          Se algum documento precisar ser reenviado, avisaremos você. Pelo mesmo link você acompanha a análise de cada
          item.
        </p>
        <Link
          href={`/admissao/${token}`}
          className="rounded-full border border-border-strong px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-ink hover:text-bg"
        >
          Ver meus envios
        </Link>
      </div>

      <p className="text-center text-xs text-muted">Você já pode fechar esta página.</p>
    </main>
  );
}
