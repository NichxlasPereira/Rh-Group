"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Button } from "../Button";
import { Field, inputClass } from "../attendance/formControls";
import { PortalBrand } from "./PortalBrand";

/** Convite do RH: a pessoa cria a senha e já entra no portal. */
export function PortalInvite({ token }: { token: string }) {
  const router = useRouter();
  const [info, setInfo] = useState<{ firstName: string; email: string | null } | null>(null);
  const [invalid, setInvalid] = useState<string>();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/portal/convite?token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (res.ok) setInfo(body);
        else setInvalid(body.error || "Este convite não vale mais. Peça um novo ao RH.");
      })
      .catch(() => setInvalid("Sem conexão. Recarregue a página."));
  }, [token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError("A senha precisa ter pelo menos 8 caracteres.");
    if (password !== confirm) return setError("As duas senhas não são iguais.");
    setSubmitting(true);
    setError(undefined);
    try {
      const res = await fetch("/api/portal/convite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "Não foi possível salvar a senha.");
        return;
      }
      router.replace("/portal");
    } catch {
      setError("Sem conexão. Tente de novo.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PortalBrand title={info ? `Bem-vindo, ${info.firstName}` : "Seu acesso"} />
      <div className="flex flex-col gap-4 px-5 py-7">
        {invalid ? (
          <p className="rounded-[12px] border border-border bg-surface px-4 py-4 text-sm text-muted">{invalid}</p>
        ) : !info ? (
          <p className="text-sm text-muted">Conferindo o convite...</p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <p className="text-sm leading-relaxed text-muted">
              Crie sua senha. Depois, é só entrar com o e-mail{" "}
              <strong className="font-semibold text-ink">{info.email}</strong> e ela.
            </p>
            <Field label="Nova senha" hint="Pelo menos 8 caracteres.">
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass(false) + " h-12 text-base"}
              />
            </Field>
            <Field label="Repita a senha" error={error}>
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={inputClass(!!error) + " h-12 text-base"}
              />
            </Field>
            <Button type="submit" disabled={submitting} className="h-12 !rounded-[12px] text-[15px]">
              {submitting ? "Salvando..." : "Criar senha e entrar"}
            </Button>
          </form>
        )}
      </div>
    </>
  );
}
