"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Modal } from "../Modal";
import { Button } from "../Button";
import { IconPlus, IconTrash, IconUsers } from "../icons";
import { ActionButton, EmptyState, Field, SkeletonRows, inputClass } from "./formControls";

export interface AccessUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "member";
  active: boolean;
  pending: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

interface AccessPanelProps {
  currentUserId: string;
  /** Avisa a página quando a lista muda (atualiza o contador de pedidos). */
  onChanged?: () => void;
}

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    window.location.replace("/frequencia/entrar");
    throw new Error("Sessão expirada.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Não foi possível concluir.");
  return data;
}

function formatLastLogin(value: string | null): string {
  if (!value) return "nunca entrou";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

/** Aba "acessos": quem pode entrar na frequência. Só administradores veem. */
export function AccessPanel({ currentUserId, onChanged }: AccessPanelProps) {
  const [users, setUsers] = useState<AccessUser[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<AccessUser | null>(null);
  const [removing, setRemoving] = useState<AccessUser | null>(null);

  const load = useCallback(async () => {
    try {
      setUsers(await send("/api/frequencia/users", "GET"));
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro inesperado.");
    }
  }, [onChanged]);

  const pending = users?.filter((u) => u.pending) ?? [];
  const members = users?.filter((u) => !u.pending) ?? null;

  useEffect(() => {
    load();
  }, [load]);

  async function update(
    user: AccessUser,
    changes: Partial<Pick<AccessUser, "active" | "role">> & { approve?: boolean },
    message: string
  ) {
    try {
      await send(`/api/frequencia/users/${user.id}`, "PATCH", changes);
      await load();
      toast.success(message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro inesperado.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-border bg-surface px-4 py-3">
        <p className="max-w-xl text-sm text-muted">
          Só as pessoas desta lista entram no RHGroup, cada uma com o próprio e-mail e senha.
          Bloquear ou remover alguém encerra o acesso na hora.
        </p>
        <Button onClick={() => setAdding(true)} className="!px-4 !py-2 text-xs">
          <IconPlus className="h-3.5 w-3.5" />
          Liberar acesso
        </Button>
      </div>

      {pending.length > 0 && (
        <div className="rounded-[14px] border border-warn bg-surface">
          <div className="border-b border-border px-4 py-3">
            <h3 className="font-display text-base font-semibold text-ink">
              Pedidos de cadastro <span className="font-mono text-warn">({pending.length})</span>
            </h3>
            <p className="text-xs text-muted">
              Essas pessoas se cadastraram sozinhas e ainda não entram. Aprove só quem deve ver dados de RH.
            </p>
          </div>
          <ul>
            {pending.map((u) => (
              <li
                key={u.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-0"
              >
                <div>
                  <p className="font-medium text-ink">{u.name}</p>
                  <p className="text-xs text-muted">
                    {u.email} · pedido em {formatLastLogin(u.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => update(u, { approve: true }, `${u.name} agora tem acesso.`)}
                    className="!px-4 !py-1.5 text-xs"
                  >
                    Aprovar
                  </Button>
                  <Button variant="ghost" onClick={() => setRemoving(u)} className="!px-4 !py-1.5 text-xs">
                    Recusar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-[14px] border border-border bg-surface">
        {members === null ? (
          <SkeletonRows rows={4} />
        ) : members.length === 0 ? (
          <EmptyState icon={<IconUsers className="h-6 w-6" />} title="Nenhum acesso" text="Libere o acesso de alguém." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2/60 text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-medium">Pessoa</th>
                  <th className="px-4 py-3 font-medium">Perfil</th>
                  <th className="px-4 py-3 font-medium">Situação</th>
                  <th className="px-4 py-3 font-medium">Último acesso</th>
                  <th className="px-4 py-3 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {members.map((u) => {
                  const isSelf = u.id === currentUserId;
                  return (
                    <tr key={u.id} className={`border-b border-border last:border-0 ${u.active ? "" : "opacity-60"}`}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-ink">
                          {u.name}
                          {isSelf && <span className="ml-2 text-xs font-normal text-muted">(você)</span>}
                        </p>
                        <p className="text-xs text-muted">{u.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={u.role}
                          onChange={(e) =>
                            update(u, { role: e.target.value as AccessUser["role"] }, "Perfil atualizado.")
                          }
                          className="rounded-[8px] border border-border bg-surface-2 px-2 py-1 text-xs text-ink focus:border-accent focus:outline-none"
                        >
                          <option value="member">Acesso</option>
                          <option value="admin">Administrador</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        {u.active ? (
                          <span className="inline-flex rounded-full bg-ok-soft px-2.5 py-1 text-xs font-medium text-ok">Ativo</span>
                        ) : (
                          <span className="inline-flex rounded-full bg-critical-soft px-2.5 py-1 text-xs font-medium text-critical">
                            Bloqueado
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">{formatLastLogin(u.lastLoginAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setResetting(u)}
                            className="rounded-[8px] px-2 py-1 text-xs font-semibold text-muted transition hover:bg-surface-2 hover:text-accent-strong"
                          >
                            nova senha
                          </button>
                          {!isSelf && (
                            <button
                              type="button"
                              onClick={() =>
                                update(u, { active: !u.active }, u.active ? "Acesso bloqueado." : "Acesso desbloqueado.")
                              }
                              className="rounded-[8px] px-2 py-1 text-xs font-semibold text-muted transition hover:bg-surface-2 hover:text-ink"
                            >
                              {u.active ? "bloquear" : "desbloquear"}
                            </button>
                          )}
                          {!isSelf && (
                            <ActionButton label="Remover acesso" onClick={() => setRemoving(u)} danger>
                              <IconTrash className="h-4 w-4" />
                            </ActionButton>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AddUserModal open={adding} onClose={() => setAdding(false)} onCreated={load} />
      <ResetPasswordModal user={resetting} onClose={() => setResetting(null)} />
      <Modal
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={removing?.pending ? "Recusar pedido" : "Remover acesso"}
        maxWidthClassName="max-w-md"
        footer={
          <>
            <Button variant="ghost" type="button" onClick={() => setRemoving(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              type="button"
              onClick={async () => {
                if (!removing) return;
                try {
                  await send(`/api/frequencia/users/${removing.id}`, "DELETE");
                  const wasPending = removing.pending;
                  setRemoving(null);
                  await load();
                  toast.success(wasPending ? "Pedido recusado." : "Acesso removido.");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Erro inesperado.");
                }
              }}
            >
              {removing?.pending ? "Recusar pedido" : "Remover acesso"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink">
          {removing?.pending ? (
            <>
              O pedido de <strong>{removing?.name}</strong> será descartado. Se precisar, a pessoa pode pedir de
              novo.
            </>
          ) : (
            <>
              <strong>{removing?.name}</strong> não vai mais conseguir entrar no RHGroup. Os registros de
              ocorrências não são afetados.
            </>
          )}
        </p>
      </Modal>
    </div>
  );
}

function AddUserModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [values, setValues] = useState({ name: "", email: "", password: "", role: "member" as AccessUser["role"] });
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setValues({ name: "", email: "", password: "", role: "member" });
      setError(undefined);
    }
  }, [open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await send("/api/frequencia/users", "POST", values);
      onCreated();
      onClose();
      toast.success("Acesso liberado. Passe a senha inicial para a pessoa.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Liberar acesso"
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="submit" form="add-user-form" disabled={submitting}>
            {submitting ? "Salvando..." : "Liberar acesso"}
          </Button>
        </>
      }
    >
      <form id="add-user-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Nome">
          <input
            value={values.name}
            onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
            className={inputClass(false)}
            autoFocus
          />
        </Field>
        <Field label="E-mail (usado para entrar)">
          <input
            type="email"
            value={values.email}
            onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
            className={inputClass(false)}
          />
        </Field>
        <Field label="Senha inicial" hint="Mínimo de 8 caracteres. A pessoa pode trocar depois em “minha senha”.">
          <input
            type="password"
            autoComplete="new-password"
            value={values.password}
            onChange={(e) => setValues((v) => ({ ...v, password: e.target.value }))}
            className={inputClass(false)}
          />
        </Field>
        <Field label="Perfil" hint="Administradores também liberam e removem acessos.">
          <select
            value={values.role}
            onChange={(e) => setValues((v) => ({ ...v, role: e.target.value as AccessUser["role"] }))}
            className={inputClass(false)}
          >
            <option value="member">Acesso — vê e registra ocorrências</option>
            <option value="admin">Administrador — também gerencia acessos</option>
          </select>
        </Field>
        {error && <span className="text-xs text-critical">{error}</span>}
      </form>
    </Modal>
  );
}

function ResetPasswordModal({ user, onClose }: { user: AccessUser | null; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();

  useEffect(() => {
    setPassword("");
    setError(undefined);
  }, [user]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    try {
      await send(`/api/frequencia/users/${user.id}`, "PATCH", { password });
      onClose();
      toast.success("Senha redefinida. As sessões abertas dessa pessoa foram encerradas.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    }
  }

  return (
    <Modal
      open={!!user}
      onClose={onClose}
      title="Definir nova senha"
      maxWidthClassName="max-w-md"
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="reset-password-form">
            Salvar senha
          </Button>
        </>
      }
    >
      <form id="reset-password-form" onSubmit={handleSubmit} className="flex flex-col gap-3">
        <p className="text-sm text-muted">
          Nova senha de <strong className="text-ink">{user?.name}</strong>. Quem estiver logado com essa conta
          será desconectado.
        </p>
        <Field label="Nova senha" error={error} hint="Mínimo de 8 caracteres.">
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(undefined);
            }}
            className={inputClass(!!error)}
            autoFocus
          />
        </Field>
      </form>
    </Modal>
  );
}

/** "minha senha": a própria pessoa troca, informando a atual. */
export function ChangeOwnPasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [values, setValues] = useState({ current: "", next: "", confirm: "" });
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (open) {
      setValues({ current: "", next: "", confirm: "" });
      setError(undefined);
    }
  }, [open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (values.next !== values.confirm) {
      setError("As senhas novas não conferem.");
      return;
    }
    try {
      await send("/api/frequencia/password", "POST", { current: values.current, next: values.next });
      onClose();
      toast.success("Senha alterada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    }
  }

  const field = (key: keyof typeof values, label: string, autoComplete: string, hint?: string) => (
    <Field label={label} hint={hint}>
      <input
        type="password"
        autoComplete={autoComplete}
        value={values[key]}
        onChange={(e) => {
          setValues((v) => ({ ...v, [key]: e.target.value }));
          setError(undefined);
        }}
        className={inputClass(false)}
      />
    </Field>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Minha senha"
      maxWidthClassName="max-w-md"
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="own-password-form">
            Alterar senha
          </Button>
        </>
      }
    >
      <form id="own-password-form" onSubmit={handleSubmit} className="flex flex-col gap-3">
        {field("current", "Senha atual", "current-password")}
        {field("next", "Nova senha", "new-password", "Mínimo de 8 caracteres.")}
        {field("confirm", "Repita a nova senha", "new-password")}
        {error && <span className="text-xs text-critical">{error}</span>}
      </form>
    </Modal>
  );
}
