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
 * Logo em traço claro, como a arte da CFF na faixa: tira o fundo branco e pinta o resto
 * de branco, com a transparência proporcional à "tinta" de cada ponto (branco some,
 * cores e escuros ficam). null enquanto processa ou se não der para ler a imagem.
 */
function useLogoSilhouette(url: string | null): string | null {
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
          const ink = 1 - Math.min(d[i], d[i + 1], d[i + 2]) / 255;
          const alpha = (d[i + 3] / 255) * Math.min(1, ink * 1.6);
          d[i] = d[i + 1] = d[i + 2] = 255;
          d[i + 3] = Math.round(alpha * 255);
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
 * Faixa do topo do perfil com a arte da empresa: o fundo nas cores da marca (escurecidas
 * para o texto branco continuar legível), a logo em traço claro no canto direito (do tamanho
 * da arte da CFF) e a faixa das cores embaixo. Sem identidade cadastrada (ou CFFGROUP),
 * fica a faixa grafite com o logo da CFF.
 */
export function ProfileBand({
  brand,
  className = "",
  children,
}: {
  brand: ProfileBrand | null;
  className?: string;
  children: React.ReactNode;
}) {
  const color = brand?.color ?? null;
  const branded = Boolean(brand && (color || brand.logoUrl));
  const silhouette = useLogoSilhouette(branded ? (brand?.logoUrl ?? null) : null);
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
        silhouette && (
          <div aria-hidden="true" className="pointer-events-none absolute right-0 top-0 hidden h-full w-[380px] items-center justify-end py-[22px] pr-7 sm:flex">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={silhouette} alt="" className="max-h-full max-w-full object-contain opacity-[0.16]" />
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

/** Logo pequena da empresa no título da faixa, só no celular (lá a arte do canto não aparece). */
export function BandCompanyLogo({ brand }: { brand: ProfileBrand | null }) {
  if (!brand?.logoUrl) return null;
  return (
    <span className="inline-flex h-7 shrink-0 items-center rounded-[7px] bg-white px-2 sm:hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={brand.logoUrl} alt={`Logo ${brand.name}`} className="h-5 w-auto max-w-[96px] object-contain" />
    </span>
  );
}
