"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Modal } from "../Modal";
import { Button } from "../Button";
import { inputClass } from "../attendance/formControls";
import { IconEdit, IconTrash } from "../icons";

interface Item {
  id: string;
  name: string;
  responsible: string;
  slackMention: string | null;
  slackUserName: string | null;
  department: string | null;
  area: string | null;
}

interface Settings {
  slack: { configured: boolean; interactive: boolean; ok: boolean; workspace?: string; bot?: string; error?: string };
  items: Item[];
}

interface SlackPerson {
  id: string;
  name: string;
  title: string | null;
}

async function call(url: string, method = "GET", body?: unknown) {
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

const errorToast = (err: unknown) => toast.error(err instanceof Error ? err.message : "Erro inesperado.");

const emptyItem = { name: "", responsible: "", slackMention: "", slackUserName: "", department: "", area: "" };

/** Manifesto do app do Slack: cola em api.slack.com › Create New App › From a manifest (ou em App Manifest, para atualizar). */
function manifest(origin: string) {
  return JSON.stringify(
    {
      display_information: { name: "RHGroup", description: "Kit de início dos colaboradores novos (CFFGROUP)" },
      features: {
        app_home: { home_tab_enabled: false, messages_tab_enabled: true, messages_tab_read_only_enabled: true },
        bot_user: { display_name: "RHGroup", always_online: false },
      },
      oauth_config: { scopes: { bot: ["chat:write", "im:write", "users:read"] } },
      settings: {
        interactivity: { is_enabled: true, request_url: `${origin}/api/slack/interacoes` },
        org_deploy_enabled: false,
        socket_mode_enabled: false,
        token_rotation_enabled: false,
      },
    },
    null,
    2
  );
}

async function copy(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    const field = document.createElement("textarea");
    field.value = text;
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    const ok = document.execCommand("copy");
    field.remove();
    if (ok) toast.success(done);
    else toast.error("Não foi possível copiar. Selecione o texto e copie.");
  }
}

/**
 * Kit de início (administradores): conexão com o Slack e os itens que cada
 * colaborador novo precisa no primeiro dia — cada item com a pessoa do Slack
 * que o recebe por mensagem direta.
 */
export function StartKitSettingsModal({ open, onClose, departments }: { open: boolean; onClose: () => void; departments: string[] }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [people, setPeople] = useState<SlackPerson[] | null>(null);
  const [peopleError, setPeopleError] = useState("");
  const [testUser, setTestUser] = useState("");
  const [form, setForm] = useState(emptyItem);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [areasBySector, setAreasBySector] = useState<Map<string, string[]>>(new Map());
  const [showSetup, setShowSetup] = useState(false);

  const load = useCallback(async () => {
    try {
      const s: Settings = await call("/api/frequencia/kit");
      setSettings(s);
      setShowSetup(!s.slack.ok);
      if (s.slack.ok) {
        try {
          setPeople(await call("/api/frequencia/kit/pessoas"));
          setPeopleError("");
        } catch (err) {
          setPeople([]);
          setPeopleError(err instanceof Error ? err.message : "Não foi possível listar as pessoas do Slack.");
        }
      }
    } catch (err) {
      errorToast(err);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setForm(emptyItem);
    setEditingId(null);
    void load();
    // Áreas de cada empresa, para escolher a área de um item.
    Promise.all([call("/api/frequencia/companies"), call("/api/frequencia/areas")])
      .then(([companies, areas]: [{ id: string; name: string; shortName: string | null }[], { companyId: string; name: string }[]]) => {
        const map = new Map<string, string[]>();
        for (const c of companies) {
          const sector = (c.shortName || c.name).trim();
          map.set(sector, areas.filter((a) => a.companyId === c.id).map((a) => a.name).sort((a, b) => a.localeCompare(b, "pt-BR")));
        }
        setAreasBySector(map);
      })
      .catch(() => undefined);
  }, [open, load]);

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const formAreas = useMemo(() => (form.department ? (areasBySector.get(form.department) ?? []) : []), [form.department, areasBySector]);
  // Pessoa já escolhida que não está mais na lista (saiu do Slack) continua visível.
  const peopleOptions = useMemo(() => {
    const list = people ?? [];
    return form.slackMention && !list.some((p) => p.id === form.slackMention)
      ? [{ id: form.slackMention, name: form.slackUserName || form.slackMention, title: null }, ...list]
      : list;
  }, [people, form.slackMention, form.slackUserName]);

  async function sendTest() {
    setBusy(true);
    try {
      await call("/api/frequencia/kit/teste", "POST", { userId: testUser });
      toast.success("Mensagem de teste enviada no Slack.");
    } catch (err) {
      errorToast(err);
    } finally {
      setBusy(false);
    }
  }

  async function saveItem(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await call(editingId ? `/api/frequencia/kit/itens/${editingId}` : "/api/frequencia/kit/itens", editingId ? "PATCH" : "POST", form);
      setForm(emptyItem);
      setEditingId(null);
      await load();
    } catch (err) {
      errorToast(err);
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(item: Item) {
    if (!window.confirm(`Tirar “${item.name}” do kit? Os pedidos já enviados não mudam.`)) return;
    try {
      await call(`/api/frequencia/kit/itens/${item.id}`, "DELETE");
      await load();
    } catch (err) {
      errorToast(err);
    }
  }

  async function useSuggestion() {
    try {
      await call("/api/frequencia/kit", "PUT", { action: "sugestao" });
      await load();
    } catch (err) {
      errorToast(err);
    }
  }

  const slack = settings?.slack;
  const missingPerson = settings?.items.filter((i) => !i.slackMention).length ?? 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Kit de início"
      maxWidthClassName="max-w-3xl"
      footer={
        <Button type="button" onClick={onClose}>
          Pronto
        </Button>
      }
    >
      <div className="flex flex-col gap-5 text-sm">
        <p className="text-muted">
          Ao concluir um onboarding, cada responsável recebe no Slack, por <strong className="text-ink">mensagem direta</strong>, só os
          itens dele — com um botão <strong className="text-ink">Pronto</strong> por item. A 3 dias do início, quem ainda tiver item
          pendente recebe um lembrete. A lista completa aparece na ficha do colaborador.
        </p>

        {/* Slack */}
        <section className="flex flex-col gap-3 rounded-[12px] border border-border bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-[15px] font-semibold text-ink">Slack</h3>
            {settings === null ? (
              <span className="text-xs text-muted">Conferindo…</span>
            ) : slack?.ok ? (
              <span className="rounded-full bg-ok-soft px-2.5 py-0.5 text-xs font-bold text-ok">
                Conectado{slack.workspace ? ` · ${slack.workspace}` : ""}
              </span>
            ) : (
              <span className="rounded-full bg-warn-soft px-2.5 py-0.5 text-xs font-bold text-warn">
                {slack?.configured ? "Com problema" : "Não conectado"}
              </span>
            )}
          </div>
          {slack?.error && <p className="text-xs text-warn">{slack.error}</p>}
          {peopleError && <p className="text-xs text-warn">{peopleError}</p>}
          {slack?.ok && !slack.interactive && (
            <p className="text-xs text-warn">
              Falta a variável SLACK_SIGNING_SECRET no Railway: sem ela, o botão “Pronto” do Slack não funciona.
            </p>
          )}

          <button
            type="button"
            onClick={() => setShowSetup((v) => !v)}
            className="self-start text-xs font-semibold text-muted underline-offset-2 hover:text-ink hover:underline"
          >
            {showSetup ? "Esconder como conectar" : "Como conectar o Slack"}
          </button>
          {showSetup && (
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-[13px] text-muted">
              <li>
                Em <strong className="text-ink">api.slack.com/apps</strong>: para um app novo, <em>Create New App › From a manifest</em>; para o
                app RHGroup que já existe, abra o app › <em>App Manifest</em>. Cole o manifesto abaixo e salve.
                <div className="mt-2">
                  <Button type="button" variant="ghost" className="!px-3 !py-1.5 text-xs" onClick={() => copy(manifest(origin), "Manifesto copiado.")}>
                    Copiar manifesto
                  </Button>
                </div>
              </li>
              <li>
                Clique em <em>Install to Workspace</em> (ou <em>Reinstall</em>) e autorize. Permissões: enviar mensagens, mensagens
                diretas e ver a lista de pessoas.
              </li>
              <li>
                Em <em>OAuth &amp; Permissions</em>, copie o <em>Bot User OAuth Token</em> (começa com xoxb-) para a variável{" "}
                <strong className="text-ink">SLACK_BOT_TOKEN</strong> no Railway.
              </li>
              <li>
                Em <em>Basic Information</em>, copie o <em>Signing Secret</em> para a variável{" "}
                <strong className="text-ink">SLACK_SIGNING_SECRET</strong> no Railway.
              </li>
              <li>Volte aqui, mande um teste para você e escolha quem recebe cada item.</li>
            </ol>
          )}

          {slack?.ok && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex min-w-[14rem] flex-1 flex-col gap-1.5">
                <span className="text-xs font-semibold text-muted">Mandar uma mensagem de teste para</span>
                <select value={testUser} onChange={(e) => setTestUser(e.target.value)} className={inputClass(false)}>
                  <option value="">Escolha a pessoa…</option>
                  {(people ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.title ? ` — ${p.title}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <Button type="button" variant="ghost" className="!px-4 !py-2 text-xs" disabled={busy || !testUser} onClick={sendTest}>
                Enviar teste
              </Button>
            </div>
          )}
        </section>

        {/* Itens */}
        <section className="flex flex-col gap-3">
          <h3 className="font-display text-[15px] font-semibold text-ink">Itens do kit</h3>
          {missingPerson > 0 && (
            <p className="rounded-[10px] bg-warn-soft px-3 py-2 text-xs text-warn">
              {missingPerson} {missingPerson === 1 ? "item está" : "itens estão"} sem pessoa no Slack e não {missingPerson === 1 ? "vai" : "vão"} ser
              enviado{missingPerson === 1 ? "" : "s"}. Clique no lápis para escolher quem recebe.
            </p>
          )}
          {settings && settings.items.length === 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-dashed border-border-strong px-4 py-3 text-muted">
              Nenhum item ainda.
              <Button type="button" variant="ghost" className="!px-3 !py-1.5 text-xs" onClick={useSuggestion}>
                Começar com a sugestão
              </Button>
            </div>
          )}
          {settings && settings.items.length > 0 && (
            <ul className="divide-y divide-border rounded-[12px] border border-border bg-surface">
              {settings.items.map((i) => (
                <li key={i.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink">{i.name}</p>
                    <p className="text-xs text-muted">
                      {i.responsible} ·{" "}
                      {i.slackUserName ? (
                        <span className="text-ink">recebe: {i.slackUserName}</span>
                      ) : (
                        <span className="text-warn">sem pessoa no Slack</span>
                      )}{" "}
                      · {i.department ? `${i.department}${i.area ? ` › ${i.area}` : ""}` : "todas as empresas"}
                    </p>
                  </div>
                  <button
                    type="button"
                    title="Editar"
                    onClick={() => {
                      setEditingId(i.id);
                      setForm({
                        name: i.name,
                        responsible: i.responsible,
                        slackMention: i.slackMention ?? "",
                        slackUserName: i.slackUserName ?? "",
                        department: i.department ?? "",
                        area: i.area ?? "",
                      });
                    }}
                    className="rounded-[8px] p-2 text-muted hover:bg-surface-2 hover:text-accent-strong"
                  >
                    <IconEdit className="h-4 w-4" />
                  </button>
                  <button type="button" title="Tirar do kit" onClick={() => removeItem(i)} className="rounded-[8px] p-2 text-muted hover:bg-surface-2 hover:text-critical">
                    <IconTrash className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={saveItem} className="grid grid-cols-1 gap-3 rounded-[12px] border border-border bg-surface p-4 sm:grid-cols-2">
            <p className="text-xs font-semibold text-muted sm:col-span-2">{editingId ? "Editar item" : "Novo item"}</p>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Item (ex.: Notebook)" maxLength={80} className={inputClass(false)} />
            <input
              value={form.responsible}
              onChange={(e) => setForm({ ...form, responsible: e.target.value })}
              placeholder="Área responsável (ex.: TI, Facilities, Gestor)"
              maxLength={40}
              className={inputClass(false)}
            />
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <select
                value={form.slackMention}
                onChange={(e) => {
                  const person = peopleOptions.find((p) => p.id === e.target.value);
                  setForm({ ...form, slackMention: e.target.value, slackUserName: person?.name ?? "" });
                }}
                disabled={!slack?.ok}
                className={inputClass(false) + " disabled:opacity-60"}
              >
                <option value="">{slack?.ok ? "Quem recebe no Slack…" : "Conecte o Slack para escolher quem recebe"}</option>
                {peopleOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.title ? ` — ${p.title}` : ""}
                  </option>
                ))}
              </select>
              <span className="text-xs text-muted">Essa pessoa recebe o item por mensagem direta e marca “Pronto” quando resolver.</span>
            </label>
            <select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value, area: "" })} className={inputClass(false)}>
              <option value="">Todas as empresas</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select
              value={form.area}
              onChange={(e) => setForm({ ...form, area: e.target.value })}
              disabled={!form.department || formAreas.length === 0}
              className={inputClass(false) + " disabled:opacity-60"}
            >
              <option value="">Todas as áreas</option>
              {formAreas.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" className="!px-4 !py-2 text-xs" disabled={busy || !form.name.trim() || !form.responsible.trim()}>
                {editingId ? "Salvar item" : "Adicionar item"}
              </Button>
              {editingId && (
                <Button
                  type="button"
                  variant="ghost"
                  className="!px-4 !py-2 text-xs"
                  onClick={() => {
                    setEditingId(null);
                    setForm(emptyItem);
                  }}
                >
                  Cancelar
                </Button>
              )}
            </div>
          </form>
        </section>
      </div>
    </Modal>
  );
}
