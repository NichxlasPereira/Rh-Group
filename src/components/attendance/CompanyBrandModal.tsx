"use client";

import { useRef, useState } from "react";
import toast from "react-hot-toast";
import { Modal } from "../Modal";
import { Button } from "../Button";
import { ContractingCompanyInfo, sectorName } from "@/lib/admission";
import { inkOn, suggestBrandColors } from "@/lib/brandColors";
import { MAX_ATTACHMENT_MB } from "@/lib/attendance";

interface CompanyBrandModalProps {
  company: ContractingCompanyInfo | null;
  onClose: () => void;
  /** Empresa atualizada (logo ou cores) para a lista da página. */
  onChanged: (company: ContractingCompanyInfo) => void;
}

export const companyLogoUrl = (c: Pick<ContractingCompanyInfo, "id" | "logoUpdatedAt">) =>
  c.logoUpdatedAt ? `/api/frequencia/companies/${c.id}/logo?v=${encodeURIComponent(c.logoUpdatedAt)}` : null;

const NEUTRAL = "#4b4d51";

/** Logo e cores da marca de uma empresa, usados no organograma. */
export function CompanyBrandModal({ company, onClose, onChanged }: CompanyBrandModalProps) {
  // A página monta um modal novo por empresa (key), então as cores começam das salvas.
  const [brandColor, setBrandColor] = useState(company?.brandColor ?? NEUTRAL);
  const [accentColor, setAccentColor] = useState<string | null>(company?.accentColor ?? null);
  const [busy, setBusy] = useState(false);
  const [suggested, setSuggested] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  if (!company) return null;
  const logo = companyLogoUrl(company);
  const name = sectorName(company);

  async function suggestFrom(url: string) {
    const colors = await suggestBrandColors(url);
    if (!colors) {
      toast.error("Não consegui tirar as cores deste logo. Escolha manualmente.");
      return;
    }
    setBrandColor(colors.brandColor);
    setAccentColor(colors.accentColor);
    setSuggested(true);
  }

  async function uploadLogo(file: File | undefined) {
    if (fileInput.current) fileInput.current.value = "";
    if (!file || !company) return;
    if (file.size > MAX_ATTACHMENT_MB * 1024 * 1024) {
      toast.error(`O logo passa do limite de ${MAX_ATTACHMENT_MB} MB.`);
      return;
    }
    setBusy(true);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/frequencia/companies/${company.id}/logo`, { method: "POST", body: form });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      toast.error(body.error || "Não foi possível enviar o logo.");
      return;
    }
    onChanged(body);
    toast.success("Logo enviado.");
    const url = companyLogoUrl(body);
    if (url) await suggestFrom(url);
  }

  async function removeLogo() {
    if (!company) return;
    setBusy(true);
    const res = await fetch(`/api/frequencia/companies/${company.id}/logo`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      toast.error(body.error || "Não foi possível remover o logo.");
      return;
    }
    onChanged(body);
    toast.success("Logo removido.");
  }

  async function saveColors() {
    if (!company) return;
    setBusy(true);
    const res = await fetch(`/api/frequencia/companies/${company.id}/brand`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandColor, accentColor }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      toast.error(body.error || "Não foi possível salvar as cores.");
      return;
    }
    onChanged(body);
    toast.success("Identidade visual salva.");
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Identidade visual · ${name}`}
      maxWidthClassName="max-w-xl"
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose} disabled={busy}>
            Fechar
          </Button>
          <Button type="button" onClick={saveColors} disabled={busy}>
            Salvar cores
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-2.5">
          <span className="text-sm font-medium text-ink">Logo</span>
          <div className="flex flex-wrap items-center gap-4">
            {/* Logos são feitos para fundo claro: ficam sempre numa placa branca. */}
            <div className="flex h-20 w-56 items-center justify-center rounded-[12px] border border-border bg-white p-3">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt={`Logo da ${name}`} className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-xs font-semibold text-[#8f9196]">Sem logo</span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                <label className="cursor-pointer rounded-[8px] border border-border-strong bg-surface px-3 py-1.5 text-[13px] font-semibold text-ink transition hover:bg-surface-2 focus-within:ring-2 focus-within:ring-accent">
                  {logo ? "Trocar logo" : "Enviar logo"}
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={busy}
                    onChange={(e) => uploadLogo(e.target.files?.[0])}
                    className="sr-only"
                  />
                </label>
                {logo && (
                  <button
                    type="button"
                    onClick={removeLogo}
                    disabled={busy}
                    className="rounded-[8px] px-3 py-1.5 text-[13px] font-semibold text-muted hover:text-critical"
                  >
                    Remover
                  </button>
                )}
              </div>
              <span className="text-xs text-muted">PNG (de preferência com fundo transparente), JPG ou WEBP.</span>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium text-ink">Cores da marca</span>
            {logo && (
              <button
                type="button"
                onClick={() => suggestFrom(logo)}
                className="text-[12.5px] font-bold text-accent-strong underline-offset-2 hover:underline"
              >
                Sugerir do logo
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ColorField label="Principal" value={brandColor} onChange={setBrandColor} />
            <ColorField
              label="Destaque (opcional)"
              value={accentColor}
              onChange={setAccentColor}
              onClear={() => setAccentColor(null)}
            />
          </div>
          {suggested && <span className="text-xs text-muted">Cores sugeridas a partir do logo. Ajuste se quiser e salve.</span>}
        </section>

        <section className="flex flex-col gap-2.5">
          <span className="text-sm font-medium text-ink">Prévia no organograma</span>
          <div className="overflow-clip rounded-[14px] border border-border bg-surface">
            <div className="h-1.5" style={{ background: brandStripe(brandColor, accentColor) }} />
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              {logo ? (
                <span className="flex h-10 items-center rounded-[8px] bg-white px-2.5 py-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logo} alt="" className="h-full w-auto object-contain" />
                </span>
              ) : (
                <span className="font-display text-base font-semibold uppercase tracking-[0.04em] text-ink">{name}</span>
              )}
              <span
                className="rounded-full px-2.5 py-0.5 font-display text-sm font-bold tabular-nums"
                style={{ background: brandColor, color: inkOn(brandColor) }}
              >
                21
              </span>
            </div>
          </div>
        </section>
      </div>
    </Modal>
  );
}

/** Faixa com as cores da marca (topo dos cartões da empresa). */
export function brandStripe(brandColor: string, accentColor: string | null | undefined): string {
  return accentColor ? `linear-gradient(90deg, ${brandColor} 0 72%, ${accentColor} 72% 100%)` : brandColor;
}

function ColorField({
  label,
  value,
  onChange,
  onClear,
}: {
  label: string;
  value: string | null;
  onChange: (value: string) => void;
  onClear?: () => void;
}) {
  return (
    <label className="flex items-center gap-3 rounded-[10px] border border-border bg-surface-2 px-3 py-2 text-sm">
      <input
        type="color"
        value={value ?? "#ffffff"}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
      />
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="font-medium text-ink">{label}</span>
        <span className="font-mono text-xs uppercase text-muted">{value ?? "sem cor"}</span>
      </span>
      {onClear && value && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            onClear();
          }}
          className="text-xs font-semibold text-muted hover:text-ink"
        >
          Limpar
        </button>
      )}
    </label>
  );
}
