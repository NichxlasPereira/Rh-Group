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
        {/* F F: barra do meio e as duas hastes */}
        <path d="M126 137.5V66.5H287.5M211 66.5V137.5" />
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
 */
export function BrandArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 420 820" className={className} aria-hidden="true" preserveAspectRatio="xMaxYMid slice">
      <g fill="none" stroke="currentColor" strokeWidth="24">
        <path d="M84 -20V700Q84 788 172 788H440" />
        <path d="M440 214H232V-20" />
        <path d="M440 470H232V290" />
      </g>
      <text
        x="0"
        y="0"
        transform="translate(52 236) rotate(-90)"
        fill="currentColor"
        fontFamily="var(--font-barlow), 'Segoe UI', sans-serif"
        fontSize="58"
        fontWeight="400"
        letterSpacing="8"
        opacity="0.8"
      >
        GROUP
      </text>
      <circle cx="372" cy="62" r="22" fill="var(--brand)" opacity="0.55" />
    </svg>
  );
}

/** Ponto vermelho do logo, para fechar títulos ("Onboarding."). */
export function BrandDot({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`inline-block rounded-full bg-brand ${className}`} />;
}
