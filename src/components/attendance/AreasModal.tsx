"use client";

import { FormEvent, useState } from "react";
import toast from "react-hot-toast";
import { Modal } from "../Modal";
import { Button } from "../Button";
import { CompanyArea, Employee } from "@/lib/attendance";
import { ContractingCompanyInfo, sectorName } from "@/lib/admission";
import { IconEdit, IconTrash } from "../icons";
import { ActionButton, inputClass } from "./formControls";

interface AreasModalProps {
  company: ContractingCompanyInfo | null;
  areas: CompanyArea[];
  employees: Employee[];
  onClose: () => void;
  /** Recarrega áreas e colaboradores depois de cada mudança. */
  onChanged: () => Promise<void>;
}

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Não foi possível salvar a área.");
  }
}

/** Cadastro das áreas de uma empresa (Tecnologia, Comercial...) para o organograma. */
export function AreasModal({ company, areas, employees, onClose, onChanged }: AreasModalProps) {
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const list = company
    ? areas.filter((a) => a.companyId === company.id).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    : [];
  const peopleIn = (areaId: string) => employees.filter((e) => e.areaId === areaId).length;

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true);
    try {
      await action();
      await onChanged();
      toast.success(success);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro inesperado.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!company || !newName.trim()) return;
    const ok = await run(() => send("/api/frequencia/areas", "POST", { companyId: company.id, name: newName }), "Área criada.");
    if (ok) setNewName("");
  }

  async function handleRename(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const ok = await run(() => send(`/api/frequencia/areas/${editing.id}`, "PATCH", { name: editing.name }), "Área renomeada.");
    if (ok) setEditing(null);
  }

  async function handleDelete(id: string) {
    const ok = await run(() => send(`/api/frequencia/areas/${id}`, "DELETE"), "Área excluída.");
    if (ok) setDeleting(null);
  }

  function close() {
    setNewName("");
    setEditing(null);
    setDeleting(null);
    onClose();
  }

  return (
    <Modal
      open={!!company}
      onClose={close}
      title={company ? `Áreas de ${sectorName(company)}` : "Áreas"}
      footer={
        <Button variant="ghost" type="button" onClick={close}>
          Fechar
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          Crie as áreas da empresa. Depois, na ficha de cada pessoa (Editar), escolha a área e marque quem é o
          responsável.
        </p>

        {list.length === 0 ? (
          <p className="rounded-[10px] border border-dashed border-border-strong px-3 py-4 text-center text-sm text-muted">
            Nenhuma área cadastrada ainda.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-[10px] border border-border">
            {list.map((a) => {
              const count = peopleIn(a.id);
              return (
                <li key={a.id} className="px-3 py-2">
                  {editing?.id === a.id ? (
                    <form onSubmit={handleRename} className="flex items-center gap-2">
                      <input
                        value={editing.name}
                        onChange={(e) => setEditing({ id: a.id, name: e.target.value })}
                        className={inputClass(false)}
                        aria-label="Novo nome da área"
                        maxLength={60}
                        autoFocus
                      />
                      <Button type="submit" disabled={busy || !editing.name.trim()} className="shrink-0">
                        Salvar
                      </Button>
                      <Button variant="ghost" type="button" onClick={() => setEditing(null)} className="shrink-0">
                        Cancelar
                      </Button>
                    </form>
                  ) : deleting === a.id ? (
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="mr-auto text-ink">
                        Excluir <strong>{a.name}</strong>?
                        {count > 0 && (
                          <span className="block text-xs text-muted">
                            {count} {count === 1 ? "pessoa fica" : "pessoas ficam"} sem área.
                          </span>
                        )}
                      </span>
                      <Button variant="ghost" type="button" onClick={() => setDeleting(null)}>
                        Cancelar
                      </Button>
                      <Button type="button" disabled={busy} onClick={() => handleDelete(a.id)}>
                        Excluir
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium text-ink">{a.name}</span>
                      <span className="text-xs text-muted">
                        {count} {count === 1 ? "pessoa" : "pessoas"}
                      </span>
                      <span className="ml-auto flex items-center gap-1">
                        <ActionButton label="Renomear" onClick={() => setEditing({ id: a.id, name: a.name })}>
                          <IconEdit className="h-4 w-4" />
                        </ActionButton>
                        <ActionButton label="Excluir" danger onClick={() => setDeleting(a.id)}>
                          <IconTrash className="h-4 w-4" />
                        </ActionButton>
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <form onSubmit={handleAdd} className="flex items-center gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className={inputClass(false)}
            placeholder="Nova área (ex.: Tecnologia)"
            aria-label="Nome da nova área"
            maxLength={60}
          />
          <Button type="submit" disabled={busy || !newName.trim()} className="shrink-0">
            Adicionar
          </Button>
        </form>
      </div>
    </Modal>
  );
}
