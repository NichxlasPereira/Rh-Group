"use client";

import { ThemeToggle } from "./ThemeToggle";

export interface AuthFeature {
  title: string;
  text: string;
  icon: (props: { className?: string }) => React.ReactNode;
}

interface AuthLayoutProps {
  /** Frase de apresentação do módulo, no painel da esquerda. */
  headline: string;
  features: AuthFeature[];
  children: React.ReactNode;
}

/** Tela de entrada dos módulos: apresentação à esquerda, formulário à direita. */
export function AuthLayout({ headline, features, children }: AuthLayoutProps) {
  return (
    <main className="flex flex-1 flex-col lg:flex-row">
      <section className="flex flex-col justify-between gap-8 border-b border-border bg-surface px-6 py-6 sm:px-10 lg:w-[46%] lg:border-b-0 lg:border-r lg:px-14 lg:py-12">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-accent font-display text-base font-bold text-accent-ink">
              C
            </span>
            <span className="font-display text-base font-bold text-ink">cffgroup</span>
          </span>
          <ThemeToggle />
        </div>

        <div className="hidden max-w-[470px] flex-col gap-7 lg:flex">
          <h1 className="font-display text-[44px] font-bold leading-[1.05] tracking-tight text-ink">{headline}</h1>
          <ul className="flex flex-col gap-[18px]">
            {features.map((f) => (
              <li key={f.title} className="flex items-start gap-3.5">
                <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] bg-accent-soft text-accent-strong">
                  <f.icon className="h-[18px] w-[18px]" />
                </span>
                <span className="flex flex-col gap-0.5 leading-snug">
                  <span className="font-extrabold text-ink">{f.title}</span>
                  <span className="text-[13px] text-muted">{f.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="hidden text-xs text-muted lg:block">
          Acesso restrito à equipe autorizada da CFFGROUP.
        </p>
      </section>

      <section className="flex flex-1 items-center justify-center px-6 py-10 sm:px-8">
        <div className="w-full max-w-[380px]">{children}</div>
      </section>
    </main>
  );
}
