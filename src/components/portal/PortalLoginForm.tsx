"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Button } from "../Button";
import { IconLock } from "../icons";
import { Field, inputClass } from "../attendance/formControls";
import { AuthLayout } from "../AuthLayout";
import { PORTAL_FEATURES } from "./portalFeatures";

export function PortalLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Informe o e-mail e a senha.");
      return;
    }
    setSubmitting(true);
    setError(undefined);
    try {
      const res = await fetch("/api/portal/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "Não foi possível entrar.");
        setPassword("");
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
    <AuthLayout moduleName="Portal do colaborador" headline="Seu RH sempre à mão" features={PORTAL_FEATURES} themeToggle={false}>
      <h2 className="font-display text-[26px] font-bold text-ink">Entrar no portal</h2>
      <p className="mt-1 text-sm text-muted">Use o seu e-mail corporativo e a senha que você criou pelo convite do RH.</p>
      <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
        <Field label="E-mail corporativo">
          <input
            type="email"
            autoComplete="username"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nome@empresa.com.br"
            className={inputClass(false) + " h-12 text-base"}
          />
        </Field>
        <Field label="Senha" error={error}>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass(!!error) + " h-12 text-base"}
          />
        </Field>
        <Button type="submit" disabled={submitting} className="h-12 !rounded-[12px] text-[15px]">
          {submitting ? "Entrando..." : "Entrar"}
        </Button>
        <p className="flex gap-2.5 rounded-[12px] border border-border bg-surface px-3.5 py-3 text-xs leading-relaxed text-muted">
          <IconLock className="mt-0.5 h-4 w-4 shrink-0 text-ink" />
          Primeiro acesso ou esqueceu a senha? Peça ao RH o link de convite: por ele você cria uma senha nova.
        </p>
      </form>
    </AuthLayout>
  );
}
