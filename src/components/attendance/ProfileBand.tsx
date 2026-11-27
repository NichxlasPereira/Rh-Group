"use client";

import { useEffect, useState } from "react";
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
 * Logo pronta para o fundo escuro da faixa: o fundo branco some (transparência pela
 * "tinta" de cada ponto) e as partes muito escuras (texto preto ou azul-marinho, que
 * sumiriam no fundo) ficam brancas; as cores da marca continuam como são.
 * null enquanto processa ou se não der para ler a imagem.
 */
function useBandLogo(url: string | null): string | null {
  const [result, setResult] = useState<{ url: string; data: string | null } | null>(null);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    const img = new Image();
    img.onload = () => {
      try {
        const max = 640;
        const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error();
        ctx.drawImage(img, 0, 0, w, h);
        const pixels = ctx.getImageData(0, 0, w, h);
        const d = pixels.data;
        for (let i = 0; i < d.length; i += 4) {
          const [r, g, b] = [d[i], d[i + 1], d[i + 2]];
          const ink = 1 - Math.min(r, g, b) / 255;
          d[i + 3] = Math.round((d[i + 3] / 255) * Math.min(1, ink * 1.6) * 255);
          const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
          if (luminance < 0.3) d[i] = d[i + 1] = d[i + 2] = 255;
        }
        ctx.putImageData(pixels, 0, 0);
        if (alive) setResult({ url, data: canvas.toDataURL("image/png") });
      } catch {
        if (alive) setResult({ url, data: null });
      }
    };
    img.onerror = () => alive && setResult({ url, data: null });
    img.src = url;
    return () => {
      alive = false;
    };
  }, [url]);
  return result && result.url === url ? result.data : null;
}

/**
 * Faixa do topo do perfil (ficha do RH e portal), no arranjo definido pelo RH:
 * foto grande à esquerda; no meio, o sobretítulo e o nome em cima e as etiquetas e o
 * cargo embaixo; à direita, a logo colorida da empresa no alto e as ações embaixo.
 * Com identidade da empresa, o fundo fica nas cores da marca (escurecidas para o texto
 * branco continuar legível) com a faixa das cores no pé; sem ela (ou CFFGROUP), fica
 * a faixa grafite com a arte da CFF.
 */
export function ProfileBand({
  brand,
  photo,
  eyebrow,
  title,
  chips,
  subtitle,
  actions,
}: {
  brand: ProfileBrand | null;
  photo: React.ReactNode;
  eyebrow: React.ReactNode;
  title: React.ReactNode;
  chips: React.ReactNode;
  subtitle: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const color = brand?.color ?? null;
  const branded = Boolean(brand && (color || brand.logoUrl));
  const logo = useBandLogo(branded ? (brand?.logoUrl ?? null) : null);
  const logoEl = logo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logo} alt={brand ? `Logo ${brand.name}` : ""} className="h-9 w-auto max-w-[170px] object-contain object-right sm:h-[52px] sm:max-w-[240px]" />
  ) : null;

  return (
    <header
      data-theme="dark"
      className={`relative overflow-clip rounded-[18px] px-5 pb-6 pt-5 text-ink shadow-[0_18px_40px_-24px_rgba(0,0,0,0.6)] sm:px-6 ${
        branded && color ? "" : "brand-band"
      }`}
      style={
        branded && color
          ? {
              background: `radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, ${color} 78%, #000) 0%, color-mix(in srgb, ${color} 48%, #000) 70%, color-mix(in srgb, ${color} 34%, #000) 100%)`,
            }
          : undefined
      }
    >
      {!branded && (
        <BrandArt variant="band" className="pointer-events-none absolute right-0 top-0 hidden h-[72%] w-[300px] text-white/[0.12] sm:block" />
      )}

      <div className="relative flex flex-col gap-4 sm:grid sm:min-h-[160px] sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-x-6 sm:gap-y-0">
        {/* Celular: foto e logo na mesma linha; computador: a foto ocupa a altura da faixa. */}
        <div className="flex items-start justify-between gap-4 sm:items-center">
          {photo}
          {logoEl && <div className="sm:hidden">{logoEl}</div>}
        </div>

        {/* Sobretítulo, nome, etiquetas e cargo num bloco só, alinhados e com o mesmo respiro. */}
        <div className="flex min-w-0 flex-col justify-center gap-2.5">
          {eyebrow}
          {title}
          {chips}
          {subtitle}
        </div>

        <div className="flex flex-col items-start justify-between gap-4 sm:items-end">
          {logoEl ? <div className="hidden sm:block">{logoEl}</div> : <span className="hidden sm:block" />}
          {actions}
        </div>
      </div>

      {branded && color && (
        <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1.5" style={{ background: brandStripe(color, brand?.accent) }} />
      )}
    </header>
  );
}
