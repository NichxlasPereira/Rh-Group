import { BrandArt } from "../brand";
import { brandStripe } from "./CompanyBrandModal";

/** Identidade da empresa do colaborador (empresa com CNPJ do setor dele). */
export interface ProfileBrand {
  name: string;
  /** Cor principal da marca (#RRGGBB), se cadastrada. */
  color: string | null;
  accent: string | null;
  /** Endereço da logo, se houver. */
  logoUrl: string | null;
}

/**
 * Faixa do topo do perfil com a arte da empresa: o fundo nas cores da marca (escurecidas
 * para o texto branco continuar legível), a logo num cartão à direita e a faixa das cores
 * embaixo. Sem identidade cadastrada (ou CFFGROUP), fica a faixa grafite com o logo da CFF.
 */
export function ProfileBand({
  brand,
  showLogo = true,
  className = "",
  children,
}: {
  brand: ProfileBrand | null;
  /** Cartão com a logo à direita (o RH tem botões nesse lugar e mostra a logo no título). */
  showLogo?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const color = brand?.color ?? null;
  const branded = Boolean(brand && (color || brand.logoUrl));
  return (
    <header
      data-theme="dark"
      className={`relative overflow-clip rounded-[18px] px-5 py-6 text-ink shadow-[0_18px_40px_-24px_rgba(0,0,0,0.6)] sm:px-7 ${
        branded && color ? "" : "brand-band"
      } ${className}`}
      style={
        branded && color
          ? {
              background: `radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, ${color} 78%, #000) 0%, color-mix(in srgb, ${color} 48%, #000) 70%, color-mix(in srgb, ${color} 34%, #000) 100%)`,
            }
          : undefined
      }
    >
      {branded ? (
        brand?.logoUrl &&
        showLogo && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-6 top-1/2 hidden h-[104px] w-[200px] -translate-y-1/2 items-center justify-center rounded-[16px] bg-white p-4 shadow-[0_12px_30px_-14px_rgba(0,0,0,0.6)] md:flex"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={brand.logoUrl} alt="" className="max-h-full max-w-full object-contain" />
          </div>
        )
      ) : (
        <BrandArt variant="band" className="pointer-events-none absolute right-0 top-0 hidden h-full w-[380px] text-white/[0.12] sm:block" />
      )}
      {children}
      {branded && color && (
        <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1.5" style={{ background: brandStripe(color, brand?.accent) }} />
      )}
    </header>
  );
}

/** Logo pequena da empresa no título da faixa (num cartão branco, como no organograma). */
export function BandCompanyLogo({ brand }: { brand: ProfileBrand | null }) {
  if (!brand?.logoUrl) return null;
  return (
    <span className="inline-flex h-7 shrink-0 items-center rounded-[7px] bg-white px-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={brand.logoUrl} alt={`Logo ${brand.name}`} className="h-5 w-auto max-w-[96px] object-contain" />
    </span>
  );
}
