"use client";

import Image from "next/image";
import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";
import { DoodleScribble } from "./DoodleScribble";
import { CffLogo } from "./brand";

export type ModuleKey = "estoque" | "frequencia";

const MODULES: { key: ModuleKey; label: string; href: string }[] = [
  { key: "estoque", label: "estoque", href: "/" },
  { key: "frequencia", label: "RHGroup", href: "/frequencia" },
];

interface HeaderProps {
  module: ModuleKey;
  title: React.ReactNode;
  description: string;
  actions: React.ReactNode;
  tabs: React.ReactNode;
  /** Frequência é restrita ao RH: o link só aparece para quem tem acesso. */
  showFrequencia?: boolean;
}

export function Header({ module, title, description, actions, tabs, showFrequencia = true }: HeaderProps) {
  const modules = MODULES.filter((m) => m.key !== "frequencia" || showFrequencia || module === "frequencia");
  return (
    <header className="relative overflow-hidden border-b border-border bg-surface">
      <Image
        src="/hero-office.jpg"
        alt="Equipe CFFGROUP em reunião estratégica"
        fill
        sizes="100vw"
        className="object-cover opacity-30"
        priority
      />

      <div className="relative mx-auto flex max-w-7xl flex-col gap-10 px-6 py-6 sm:px-10 sm:py-8 lg:py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <CffLogo className="h-9 w-auto text-ink" />
            {modules.length > 1 && (
              <nav
                aria-label="Módulos"
                className="flex items-center gap-1 rounded-full border border-border bg-surface/70 p-1 backdrop-blur"
              >
                {modules.map((m) => (
                  <Link
                    key={m.key}
                    href={m.href}
                    // Trocar de módulo encerra a sessão do atual; nada de pré-carregar.
                    prefetch={false}
                    aria-current={module === m.key ? "page" : undefined}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                      module === m.key ? "bg-ink text-bg" : "text-muted hover:text-ink"
                    }`}
                  >
                    {m.label}
                  </Link>
                ))}
              </nav>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ThemeToggle />
            {actions}
          </div>
        </div>

        {tabs}

        <div className="relative flex flex-col gap-6 py-4">
          <DoodleScribble className="pointer-events-none absolute -left-6 -top-10 h-20 w-20 text-accent/50 sm:h-24 sm:w-24" />

          <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight text-ink sm:text-5xl">
            {title}
          </h1>

          <p className="max-w-sm text-sm leading-relaxed text-muted">{description}</p>
        </div>
      </div>
    </header>
  );
}
