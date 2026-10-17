/**
 * Identidade visual da CFFGROUP (do cartão de visita): o logo em traço fino com
 * o ponto vermelho e as formas de contorno do "C" com "GROUP" na vertical.
 */

/** Logo "CFF." em traço, com "GROUP" e o ponto vermelho. A cor dos traços vem de `currentColor`. */
export function CffLogo({ className, title = "CFF Group" }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 292 142" className={className} role="img" aria-label={title}>
      <g fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="butt" strokeLinejoin="round">
        {/* C: traço de cima corre até o fim do logo */}
        <path d="M94 137.5H40.5Q4.5 137.5 4.5 101.5V40.5Q4.5 4.5 40.5 4.5H287.5" />
        {/* F F: cada um com a sua barra e haste, com um respiro entre eles (como no logo) */}
        <path d="M126 137.5V66.5H199" />
        <path d="M211 137.5V66.5H287.5" />
      </g>
      <text
        x="286"
        y="38"
        textAnchor="end"
        fill="currentColor"
        fontFamily="var(--font-barlow), 'Segoe UI', sans-serif"
        fontSize="17"
        fontWeight="500"
        letterSpacing="1.5"
      >
        GROUP
      </text>
      <circle cx="268" cy="126" r="8.5" fill="var(--brand)" />
    </svg>
  );
}

/**
 * Formas de contorno do lado direito do cartão: o "C" grande, os cantos e
 * "GROUP" na vertical. Decorativo; fica atrás do conteúdo.
 * - "tall" (painéis altos, como a tela de entrada): a composição inteira,
 *   sempre visível, ancorada no canto inferior direito.
 * - "band" (faixas baixas): só as linhas, que podem ser recortadas sem perder nada.
 */
export function BrandArt({ className, variant = "tall" }: { className?: string; variant?: "tall" | "band" }) {
  if (variant === "band") {
    return (
      <svg viewBox="0 0 520 220" className={className} aria-hidden="true" preserveAspectRatio="xMaxYMid slice">
        <g fill="none" stroke="currentColor" strokeWidth="18">
          <path d="M540 196H170Q110 196 110 136V-20" />
          <path d="M540 96H290V-20" />
        </g>
        <circle cx="468" cy="44" r="11" fill="var(--brand)" opacity="0.6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 400 860" className={className} aria-hidden="true" preserveAspectRatio="xMaxYMax meet">
      <g fill="none" stroke="currentColor" strokeWidth="24">
        {/* "C" grande: desce pela esquerda, curva embaixo e segue até a borda */}
        <path d="M70 0V732Q70 818 156 818H400" />
        {/* Cantos internos, como no cartão */}
        <path d="M400 300H234V0" />
        <path d="M400 640H234V392" />
      </g>
      <text
        x="0"
        y="0"
        transform="translate(186 352) rotate(-90)"
        fill="currentColor"
        fontFamily="var(--font-barlow), 'Segoe UI', sans-serif"
        fontSize="64"
        fontWeight="400"
        letterSpacing="10"
      >
        GROUP
      </text>
      <circle cx="334" cy="78" r="20" fill="var(--brand)" opacity="0.7" />
    </svg>
  );
}

/** Ponto vermelho do logo, para fechar títulos ("Onboarding."). */
export function BrandDot({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`inline-block rounded-full bg-brand ${className}`} />;
}
