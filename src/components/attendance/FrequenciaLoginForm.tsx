"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { Button } from "../Button";
import { AuthLayout, AuthFeature } from "../AuthLayout";
import { IconAlertTriangle, IconBox, IconCalendarX, IconKey, IconUserPlus } from "../icons";
import { Field, inputClass } from "./formControls";

interface FrequenciaLoginFormProps {
  next: string;
  /** Nenhuma conta existe ainda: mostra o cadastro do primeiro administrador. */
  needsSetup: boolean;
  setupConfigured: boolean;
}

type Mode = "login" | "register";

const RH_FEATURES: AuthFeature[] = [
  { title: "Faltas, atestados e folgas", text: "Saldo de folgas e atestados com anexo, mês a mês.", icon: IconCalendarX },
  { title: "Onboarding 100% digital", text: "Documentos e termos assinados no gov.br pelo candidato.", icon: IconUserPlus },
  { title: "Acesso individual", text: "Cada pessoa com o próprio login, liberado pelo administrador.", icon: IconKey },
];

export function FrequenciaLoginForm({ next, needsSetup, setupConfigured }: FrequenciaLoginFormProps) {
  const [values, setValues] = useState({ setupKey: "", name: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<Mode>("login");
  const [requestSent, setRequestSent] = useState(false);
  // Primeiro acesso e pedido de cadastro pedem nome e confirmação de senha.
  const creating = needsSetup || mode === "register";

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setError(undefined);
    setRequestSent(false);
    setValues((v) => ({ ...v, password: "", confirm: "" }));
  }

  function set(key: keyof typeof values, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
    setError(undefined);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!values.email.trim() || !values.password) {
      setError("Preencha e-mail e senha.");
      return;
    }
    if (creating) {
      if ((needsSetup && !values.setupKey) || !values.name.trim()) {
        setError("Preencha todos os campos.");
        return;
      }
      if (values.password !== values.confirm) {
        setError("As senhas não conferem.");
        return;
      }
    }

    setSubmitting(true);
    try {
      const url = needsSetup
        ? "/api/frequencia/setup"
        : mode === "register"
          ? "/api/frequencia/register"
          : "/api/frequencia/login";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          needsSetup
            ? { setupKey: values.setupKey, name: values.name, email: values.email, password: values.password }
            : mode === "register"
              ? { name: values.name, email: values.email, password: values.password }
              : { email: values.email, password: values.password }
        ),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "Não foi possível entrar.");
        setValues((v) => ({ ...v, password: "", confirm: "", setupKey: "" }));
        if (res.status === 409 && needsSetup) window.location.reload();
        return;
      }
      if (mode === "register" && !needsSetup) {
        // Pedido enviado: não há sessão até um administrador aprovar.
        setRequestSent(true);
        setMode("login");
        setValues((v) => ({ ...v, name: "", password: "", confirm: "" }));
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
    <AuthLayout headline="O RH da CFFGROUP em um só lugar." features={RH_FEATURES}>
      <div className="flex flex-col">
        <h2 className="font-display text-[26px] font-bold text-ink">
          {needsSetup ? "Primeiro acesso" : mode === "register" ? "Solicitar cadastro" : "Entrar no RHGroup"}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {needsSetup
            ? "Crie a conta de administrador. Depois, é você quem libera o acesso de outras pessoas."
            : mode === "register"
              ? "Preencha seus dados. Você poderá entrar assim que um administrador aprovar o cadastro."
              : "Use o e-mail e a senha do seu acesso."}
        </p>

        {requestSent && (
          <div className="mt-4 rounded-[10px] border border-ok bg-ok-soft px-3 py-2.5 text-sm text-ink">
            Pedido enviado! Assim que um administrador aprovar, entre aqui com o e-mail e a senha que você cadastrou.
          </div>
        )}

        {needsSetup && !setupConfigured ? (
          <div className="mt-5 flex gap-3 rounded-[10px] border border-warn bg-warn-soft px-3 py-2.5 text-sm text-ink">
            <IconAlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warn" />
            <p>
              A chave de primeiro acesso não está configurada. Defina a variável{" "}
              <code className="font-mono text-xs">FREQUENCIA_PASSWORD</code> no servidor.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3">
            {needsSetup && (
              <>
                <Field label="Chave de primeiro acesso" hint="O valor de FREQUENCIA_PASSWORD, definido no servidor.">
                  <input
                    type="password"
                    autoComplete="off"
                    value={values.setupKey}
                    onChange={(e) => set("setupKey", e.target.value)}
                    className={inputClass(false)}
                  />
                </Field>
              </>
            )}
            {creating && (
              <Field label="Seu nome">
                <input
                  value={values.name}
                  onChange={(e) => set("name", e.target.value)}
                  autoComplete="name"
                  autoFocus={mode === "register"}
                  className={inputClass(false)}
                />
              </Field>
            )}
            <Field label="E-mail">
              <input
                type="email"
                autoComplete={creating ? "email" : "username"}
                autoFocus={!creating}
                value={values.email}
                onChange={(e) => set("email", e.target.value)}
                className={inputClass(false)}
              />
            </Field>
            <Field label={creating ? "Crie uma senha" : "Senha"} hint={creating ? "Mínimo de 8 caracteres." : undefined}>
              <input
                type="password"
                autoComplete={creating ? "new-password" : "current-password"}
                value={values.password}
                onChange={(e) => set("password", e.target.value)}
                className={inputClass(!!error)}
              />
            </Field>
            {creating && (
              <Field label="Repita a senha">
                <input
                  type="password"
                  autoComplete="new-password"
                  value={values.confirm}
                  onChange={(e) => set("confirm", e.target.value)}
                  className={inputClass(false)}
                />
              </Field>
            )}
            {error && <span className="text-xs text-critical">{error}</span>}
            <Button type="submit" disabled={submitting}>
              {submitting
                ? "Enviando..."
                : needsSetup
                  ? "Criar conta e entrar"
                  : mode === "register"
                    ? "Enviar pedido de cadastro"
                    : "Entrar"}
            </Button>
            {!needsSetup && (
              <p className="text-center text-sm text-muted">
                {mode === "login" ? (
                  <>
                    Não tem acesso?{" "}
                    <button
                      type="button"
                      onClick={() => switchMode("register")}
                      className="font-semibold text-accent-strong underline-offset-2 hover:underline"
                    >
                      Solicitar cadastro
                    </button>
                  </>
                ) : (
                  <>
                    Já tem cadastro aprovado?{" "}
                    <button
                      type="button"
                      onClick={() => switchMode("login")}
                      className="font-semibold text-accent-strong underline-offset-2 hover:underline"
                    >
                      Entrar
                    </button>
                  </>
                )}
              </p>
            )}
          </form>
        )}

        <div className="mt-6 flex items-center gap-3 text-[11.5px] text-muted">
          <span className="h-px flex-1 bg-border" />
          outro módulo
          <span className="h-px flex-1 bg-border" />
        </div>
        <Link
          href="/"
          prefetch={false}
          className="mt-4 flex h-11 items-center justify-center gap-2 rounded-[12px] border border-border-strong text-sm font-bold text-ink transition hover:bg-surface-2"
        >
          <IconBox className="h-[17px] w-[17px] text-muted" />
          Ir para o Estoque
        </Link>
      </div>
    </AuthLayout>
  );
}
