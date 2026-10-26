import { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "ghost" | "dark" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const variants: Record<Variant, string> = {
  // Botão principal na cor de ação do tema: claro sobre o grafite, grafite sobre o claro.
  primary:
    "bg-accent text-accent-ink shadow-[0_6px_20px_rgba(0,0,0,0.28)] hover:brightness-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:brightness-100",
  ghost:
    "bg-transparent text-ink border border-border-strong hover:bg-ink hover:text-bg hover:border-ink disabled:opacity-50 disabled:cursor-not-allowed",
  // Solid ink-on-bg pill — inverts with the theme (near-black on light, near-white on dark), for the hero CTA.
  dark: "bg-ink text-bg hover:opacity-85 disabled:opacity-50 disabled:cursor-not-allowed",
  danger:
    "bg-critical text-[#2b1620] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed",
};

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition enabled:active:scale-[0.97] ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
