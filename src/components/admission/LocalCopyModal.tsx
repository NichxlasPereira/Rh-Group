"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "../Button";
import { Modal } from "../Modal";
import { inputClass } from "../attendance/formControls";

interface Device {
  id: string;
  name: string;
  createdBy: string | null;
  createdAt: string;
  keyAt: string;
  lastSeenAt: string | null;
}

const when = (value: string) => new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

/** "agora", "há 5 min", "há 2 h" ou a data — para o último contato de cada computador. */
function ago(value: string): string {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60_000);
  if (minutes < 2) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  if (minutes < 24 * 60) return `há ${Math.round(minutes / 60)} h`;
  return `em ${when(value)}`;
}

async function call(url: string, method: string, body?: unknown) {
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

/** Arquivo "rhgroup-chave.txt" em Downloads: o instalador lê e apaga. */
function downloadKey(token: string) {
  const url = URL.createObjectURL(new Blob([token + "\n"], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "rhgroup-chave.txt";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast.success("Arquivo da chave baixado.");
}

/** Copia um texto; se o navegador bloquear a área de transferência, usa o jeito antigo. */
async function copyText(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
    return;
  } catch {
    // segue para o jeito antigo
  }
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  const ok = document.execCommand("copy");
  field.remove();
  if (ok) toast.success(done);
  else toast.error("Não foi possível copiar. Selecione o texto e copie.");
}

/**
 * Cópia no computador: cada Mac do RH que recebe os documentos dos onboardings
 * concluídos tem a sua chave. O administrador adiciona, troca a chave ou remove
 * cada computador sem mexer nos outros.
 */
export function LocalCopyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [fresh, setFresh] = useState<{ name: string; token: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setDevices((await call("/api/frequencia/copia-local", "GET")).devices);
    } catch (err) {
      errorToast(err);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setFresh(null);
      setAdding(false);
      setName("");
      void load();
    }
  }, [open, load]);

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { token } = await call("/api/frequencia/copia-local", "POST", { name });
      setFresh({ name: name.trim(), token });
      setAdding(false);
      setName("");
      await load();
    } catch (err) {
      errorToast(err);
    } finally {
      setBusy(false);
    }
  }

  async function rotate(device: Device) {
    if (!window.confirm(`Gerar uma chave nova para “${device.name}”? Ele para de receber arquivos até o instalador rodar de novo com a chave nova.`)) return;
    setBusy(true);
    try {
      const { token } = await call(`/api/frequencia/copia-local/${device.id}`, "POST");
      setFresh({ name: device.name, token });
      await load();
    } catch (err) {
      errorToast(err);
    } finally {
      setBusy(false);
    }
  }

  async function remove(device: Device) {
    if (!window.confirm(`Remover “${device.name}”? Ele para de receber arquivos na hora. Os que já estão nele continuam lá.`)) return;
    setBusy(true);
    try {
      await call(`/api/frequencia/copia-local/${device.id}`, "DELETE");
      if (fresh?.name === device.name) setFresh(null);
      await load();
      toast.success("Computador removido.");
    } catch (err) {
      errorToast(err);
    } finally {
      setBusy(false);
    }
  }

  const installCommand =
    typeof window === "undefined" ? "" : `curl -fsSL ${window.location.origin}/api/copia-local/instalar.sh | bash`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cópia no computador"
      maxWidthClassName="max-w-xl"
      footer={
        <Button type="button" onClick={onClose}>
          Pronto
        </Button>
      }
    >
      <div className="flex flex-col gap-4 text-sm">
        <p className="text-muted">
          Os documentos aprovados de cada onboarding concluído também vão, quase na hora, para uma pasta em cada computador abaixo —
          uma pasta por colaborador. Os arquivos continuam guardados aqui no RHGroup.
        </p>

        {fresh && (
          <div className="flex flex-col gap-3 rounded-[12px] border border-border-strong bg-surface px-4 py-3">
            <p className="font-semibold text-ink">Instalar em “{fresh.name}”</p>
            <ol className="flex list-decimal flex-col gap-3 pl-5 text-muted">
              <li>
                <span>
                  No Mac “{fresh.name}”, baixe a chave dele. <strong className="text-ink">Ela aparece só agora</strong> — se perder, gere
                  outra.
                </span>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button type="button" className="!px-4 !py-2 text-xs" onClick={() => downloadKey(fresh.token)}>
                    Baixar arquivo da chave
                  </Button>
                  <Button type="button" variant="ghost" className="!px-4 !py-2 text-xs" onClick={() => copyText(fresh.token, "Chave copiada.")}>
                    Copiar chave
                  </Button>
                </div>
              </li>
              <li>
                <span>Abra o Terminal nesse Mac, cole este comando e aperte Enter:</span>
                <input
                  readOnly
                  value={installCommand}
                  onFocus={(e) => e.target.select()}
                  className={inputClass(false) + " mt-2 font-mono text-xs"}
                />
                <Button
                  type="button"
                  variant="ghost"
                  className="!px-4 !py-2 mt-2 text-xs"
                  onClick={() => copyText(installCommand, "Comando copiado.")}
                >
                  Copiar comando
                </Button>
              </li>
              <li>O instalador lê a chave do arquivo (e apaga o arquivo) e faz a primeira cópia.</li>
            </ol>
          </div>
        )}

        <div className="flex flex-col divide-y divide-border rounded-[12px] border border-border bg-surface">
          {devices === null ? (
            <p className="px-4 py-3 text-muted">Carregando…</p>
          ) : devices.length === 0 ? (
            <p className="px-4 py-3 text-muted">Nenhum computador recebe os documentos ainda.</p>
          ) : (
            devices.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{d.name}</p>
                  <p className="text-xs text-muted">
                    {d.lastSeenAt ? (
                      <span className={Date.now() - new Date(d.lastSeenAt).getTime() < 10 * 60_000 ? "text-ok" : ""}>
                        Último contato {ago(d.lastSeenAt)}
                      </span>
                    ) : (
                      "Ainda não se conectou com a chave atual"
                    )}
                    {" · "}chave de {when(d.keyAt)}
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => rotate(d)}
                    className="text-xs font-semibold text-muted underline-offset-2 transition hover:text-ink hover:underline disabled:opacity-50"
                  >
                    Nova chave
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => remove(d)}
                    className="text-xs font-semibold text-critical underline-offset-2 transition hover:underline disabled:opacity-50"
                  >
                    Remover
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {adding ? (
          <form onSubmit={add} className="flex flex-wrap items-center gap-2">
            <input
              autoFocus
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome do computador (ex.: MacBook da Alessandra)"
              className={inputClass(false) + " min-w-0 flex-1"}
            />
            <Button type="submit" className="!px-4 !py-2 text-xs" disabled={busy || !name.trim()}>
              Adicionar
            </Button>
            <Button type="button" variant="ghost" className="!px-4 !py-2 text-xs" onClick={() => setAdding(false)}>
              Cancelar
            </Button>
          </form>
        ) : (
          <Button type="button" variant="ghost" className="!px-4 !py-2 self-start text-xs" disabled={busy} onClick={() => setAdding(true)}>
            Adicionar computador
          </Button>
        )}
      </div>
    </Modal>
  );
}
