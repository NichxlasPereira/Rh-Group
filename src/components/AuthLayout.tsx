"use client";

import { ThemeToggle } from "./ThemeToggle";
import { BrandArt, BrandDot, CffLogo } from "./brand";

export interface AuthFeature {
  title: string;
  text: string;
  icon: (props: { className?: string }) => React.ReactNode;
}

interface AuthLayoutProps {
  /** Nome do módulo, em destaque no painel da marca (ex.: "Recursos Humanos"). */
  moduleName: string;
  /** Frase de apresentação do módulo. */
  headline: string;
  features: AuthFeature[];
  children: React.ReactNode;
}

/** Tela de entrada dos módulos: painel com a identidade da CFFGROUP à esquerda, formulário à direita. */
export function AuthLayout({ moduleName, headline, features, children }: AuthLayoutProps) {
  return (
    <main className="flex flex-1 flex-col lg:flex-row">
      {/* Painel da marca: o grafite metálico do cartão, sempre no tema escuro. */}
      <section
        data-theme="dark"
        className="brand-band relative flex flex-col justify-between gap-8 overflow-clip px-6 py-6 text-ink sm:px-10 lg:w-[48%] lg:px-14 lg:py-12"
      >
        <BrandArt className="pointer-events-none absolute bottom-0 right-0 hidden h-full w-[44%] max-w-[330px] text-white/[0.11] lg:block" />
        <BrandArt variant="band" className="pointer-events-none absolute right-0 top-0 h-full w-[260px] text-white/[0.12] lg:hidden" />

        <div className="relative flex items-center justify-between gap-3">
          <CffLogo className="h-11 w-auto text-white lg:h-14" />
          <div className="lg:hidden">
            <ThemeToggle />
          </div>
        </div>

        <div className="relative hidden max-w-[52%] flex-col gap-8 lg:flex">
          <div className="flex flex-col gap-3">
            <span className="font-display text-sm font-light uppercase tracking-[0.24em] text-white/80">{moduleName}</span>
            <h1 className="font-display text-[46px] font-semibold uppercase leading-[1.02] tracking-[0.01em] text-white">
              {headline}
              <BrandDot className="ml-1.5 h-3 w-3 align-baseline" />
            </h1>
          </div>
          <ul className="flex flex-col gap-5">
            {features.map((f) => (
              <li key={f.title} className="flex items-start gap-3.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] border border-white/25 bg-white/10 text-white">
                  <f.icon className="h-[18px] w-[18px]" />
                </span>
                <span className="flex flex-col gap-0.5 leading-snug">
                  <span className="font-bold text-white">{f.title}</span>
                  <span className="text-[13px] text-white/80">{f.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative hidden font-display text-xs uppercase tracking-[0.16em] text-white/70 lg:block">
          Acesso restrito · cffgroup.com.br
        </p>
      </section>

      <section className="relative flex flex-1 items-center justify-center px-6 py-10 sm:px-8">
        <div className="absolute right-5 top-5 hidden lg:block">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-[380px]">{children}</div>
      </section>
    </main>
  );
}
