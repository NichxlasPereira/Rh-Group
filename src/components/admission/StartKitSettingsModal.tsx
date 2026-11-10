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
  department: string | null;
  area: string | null;
}

interface Settings {
  slack: { configured: boolean; interactive: boolean; ok: boolean; workspace?: string; bot?: string; error?: string };
  channel: string | null;
  items: Item[];
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

const emptyItem = { name: "", responsible: "", slackMention: "", department: "", area: "" };

/** Manifesto do app do Slack: cola em api.slack.com › Create New App › From a manifest. */
function manifest(origin: string) {
  return JSON.stringify(
    {
      display_information: { name: "RHGroup", description: "Kit de início dos colaboradores novos (CFFGROUP)" },
      features: { bot_user: { display_name: "RHGroup", always_online: false } },
      oauth_config: { scopes: { bot: ["chat:write", "chat:write.public"] } },
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
 * Kit de início (administradores): conexão com o Slack, canal das mensagens e
 * os itens que cada colaborador novo precisa no primeiro dia.
 */
export function StartKitSettingsModal({ open, onClose, departments }: { open: boolean; onClose: () => void; departments: string[] }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [channel, setChannel] = useState("");
  const [form, setForm] = useState(emptyItem);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [areasBySector, setAreasBySector] = useState<Map<string, string[]>>(new Map());
  const [showSetup, setShowSetup] = useState(false);

  const load = useCallback(async () => {
    try {
      const s: Settings = await call("/api/frequencia/kit");
      setSettings(s);
      setChannel(s.channel ?? "");
      setShowSetup(!s.slack.ok);
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

  async function saveChannel(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await call("/api/frequencia/kit", "PUT", { channel: channel.trim() });
      toast.success("Canal salvo.");
      await load();
    } catch (err) {
      errorToast(err);
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    try {
      await call("/api/frequencia/kit/teste", "POST");
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
          Ao concluir um onboarding, o RHGroup manda no Slack a lista do que a pessoa precisa no primeiro dia, com um botão{" "}
          <strong className="text-ink">Pronto</strong> por item. A 3 dias do início, quem ainda não marcou recebe um lembrete. A lista
          também aparece na ficha do colaborador.
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
                Em <strong className="text-ink">api.slack.com/apps</strong>, clique em <em>Create New App › From a manifest</em>, escolha o
                workspace e cole o manifesto abaixo.
                <div className="mt-2">
                  <Button type="button" variant="ghost" className="!px-3 !py-1.5 text-xs" onClick={() => copy(manifest(origin), "Manifesto copiado.")}>
                    Copiar manifesto
                  </Button>
                </div>
              </li>
              <li>
                Clique em <em>Install to Workspace</em> e autorize.
              </li>
              <li>
                Em <em>OAuth &amp; Permissions</em>, copie o <em>Bot User OAuth Token</em> (começa com xoxb-) e coloque no Railway na
                variável <strong className="text-ink">SLACK_BOT_TOKEN</strong>.
              </li>
              <li>
                Em <em>Basic Information</em>, copie o <em>Signing Secret</em> e coloque no Railway na variável{" "}
                <strong className="text-ink">SLACK_SIGNING_SECRET</strong>.
              </li>
              <li>Volte aqui, escolha o canal e clique em “Enviar teste”.</li>
            </ol>
          )}

          <form onSubmit={saveChannel} className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-[14rem] flex-1 flex-col gap-1.5">
              <span className="text-xs font-semibold text-muted">Canal das mensagens</span>
              <input
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                placeholder="#onboarding"
                className={inputClass(false)}
              />
            </label>
            <Button type="submit" variant="ghost" className="!px-4 !py-2 text-xs" disabled={busy}>
              Salvar canal
            </Button>
            <Button type="button" variant="ghost" className="!px-4 !py-2 text-xs" disabled={busy || !settings?.channel || !slack?.ok} onClick={sendTest}>
              Enviar teste
            </Button>
          </form>
          <p className="text-xs text-muted">Canal público funciona direto. Em canal privado, adicione o app RHGroup ao canal antes.</p>
        </section>

        {/* Itens */}
        <section className="flex flex-col gap-3">
          <h3 className="font-display text-[15px] font-semibold text-ink">Itens do kit</h3>
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
                      {i.responsible}
                      {i.slackMention ? ` · marca ${i.slackMention} no Slack` : ""} ·{" "}
                      {i.department ? `${i.department}${i.area ? ` › ${i.area}` : ""}` : "todas as empresas"}
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
              placeholder="Quem cuida (ex.: TI, Facilities, Gestor)"
              maxLength={40}
              className={inputClass(false)}
            />
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
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <input
                value={form.slackMention}
                onChange={(e) => setForm({ ...form, slackMention: e.target.value })}
                placeholder="Quem marcar no Slack (opcional): ID do membro (U…) ou do grupo (S…)"
                className={inputClass(false)}
              />
              <span className="text-xs text-muted">No Slack: perfil da pessoa › ⋮ › Copiar ID do membro. Sem ID, a mensagem mostra só o nome do responsável.</span>
            </label>
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
