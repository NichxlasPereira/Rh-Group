"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { Button } from "./Button";
import { AuthLayout, AuthFeature } from "./AuthLayout";
import { IconAlertTriangle, IconBox, IconCart, IconChart, IconUsers } from "./icons";
import { inputClass } from "./attendance/formControls";

type ModuleKey = "estoque";

const STOCK_FEATURES: AuthFeature[] = [
  { title: "Materiais e estoque mínimo", text: "Quantidade, local e alerta quando algo está acabando.", icon: IconBox },
  { title: "Retiradas registradas", text: "Quem retirou, quanto e quando, com histórico completo.", icon: IconCart },
  { title: "Relatórios", text: "Consumo por categoria e por período.", icon: IconChart },
];

const COPY: Record<ModuleKey, { label: string; description: string; envVar: string }> = {
  estoque: {
    label: "estoque",
    description: "O estoque é de uso interno. Digite a senha do módulo para continuar.",
    envVar: "ESTOQUE_PASSWORD",
  },
};

interface ModuleLoginFormProps {
  module: ModuleKey;
  next: string;
  configured: boolean;
}

export function ModuleLoginForm({ module, next, configured }: ModuleLoginFormProps) {
  const copy = COPY[module];
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!password) {
      setError("Digite a senha.");
      return;
    }
    setSubmitting(true);
    setError(undefined);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "Não foi possível entrar.");
        setPassword("");
        return;
      }
      // Navegação completa, para o proxy já receber o cookie novo.
      window.location.assign(next);
    } catch {
      setError("Falha de conexão. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout headline="O estoque da CFFGROUP sob controle." features={STOCK_FEATURES}>
      <div className="flex flex-col">
        <h2 className="font-display text-[26px] font-bold text-ink">Entrar no Estoque</h2>
        <p className="mt-1 text-sm text-muted">{copy.description}</p>

        {configured ? (
          <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-ink">Senha</span>
              <input
                type="password"
                autoComplete="current-password"
                autoFocus
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(undefined);
                }}
                className={inputClass(!!error)}
              />
              {error && <span className="text-xs text-critical">{error}</span>}
            </label>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Entrando..." : "Entrar"}
            </Button>
          </form>
        ) : (
          <div className="mt-5 flex gap-3 rounded-[10px] border border-warn bg-warn-soft px-3 py-2.5 text-sm text-ink">
            <IconAlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warn" />
            <p>
              A senha ainda não foi definida. O administrador precisa configurar a variável{" "}
              <code className="font-mono text-xs">{copy.envVar}</code> no servidor.
            </p>
          </div>
        )}

        <div className="mt-6 flex items-center gap-3 text-[11.5px] text-muted">
          <span className="h-px flex-1 bg-border" />
          outro módulo
          <span className="h-px flex-1 bg-border" />
        </div>
        <Link
          href="/frequencia"
          prefetch={false}
          className="mt-4 flex h-11 items-center justify-center gap-2 rounded-[12px] border border-border-strong text-sm font-bold text-ink transition hover:bg-surface-2"
        >
          <IconUsers className="h-[17px] w-[17px] text-muted" />
          Ir para o RHGroup
        </Link>
      </div>
    </AuthLayout>
  );
}
