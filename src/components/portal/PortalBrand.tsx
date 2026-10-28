import { BrandArt, BrandDot, CffLogo } from "../brand";

/** Faixa grafite do portal: logo, subtítulo e título em maiúsculas com o ponto vermelho. */
export function PortalBrand({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  // A última palavra vai junto com o ponto, para ele nunca ficar sozinho numa linha.
  const words = title.split(" ");
  const last = words.pop();
  return (
    <header className="brand-band relative flex flex-col gap-7 overflow-clip px-5 pb-7 pt-6">
      <BrandArt className="pointer-events-none absolute bottom-0 right-0 h-full w-[150px] text-white/[0.12]" />
      <div className="relative flex items-center justify-between gap-3">
        <CffLogo className="h-9 w-auto text-white" />
        {children}
      </div>
      <div className="relative flex max-w-[270px] flex-col gap-2">
        <span className="font-display text-xs font-medium uppercase tracking-[0.22em] text-white/80">Portal do colaborador</span>
        <h1 className="font-display text-[30px] font-semibold uppercase leading-[1.02] tracking-[0.01em] text-white">
          {words.length > 0 && `${words.join(" ")} `}
          <span className="whitespace-nowrap">
            {last}
            <BrandDot className="ml-1 h-2.5 w-2.5 align-baseline" />
          </span>
        </h1>
        {subtitle && <span className="text-[13px] text-white/85">{subtitle}</span>}
      </div>
    </header>
  );
}
