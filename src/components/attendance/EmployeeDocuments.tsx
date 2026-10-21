"use client";

import { FormEvent, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "../Button";
import { IconFile, IconPaperclip, IconTrash } from "../icons";
import { ATTACHMENT_ACCEPT, MAX_ATTACHMENT_MB, formatFileSize } from "@/lib/attendance";
import { EMPLOYEE_DOCUMENT_TYPES } from "@/lib/employeeProfile";
import { formatDateBR } from "@/lib/format";
import { ActionButton, inputClass } from "./formControls";

export interface UploadedDocument {
  id: string;
  name: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedBy: string | null;
  createdAt: string;
}

const OTHER = "__outro";

interface EmployeeDocumentsProps {
  employeeId: string;
  documents: UploadedDocument[];
  onChange: (documents: UploadedDocument[]) => void;
}

/** Documentos enviados pelo RH direto na ficha (para quem não passou pelo onboarding digital). */
export function EmployeeDocuments({ employeeId, documents, onChange }: EmployeeDocumentsProps) {
  const [type, setType] = useState<string>(EMPLOYEE_DOCUMENT_TYPES[0]);
  const [otherName, setOtherName] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const name = type === OTHER ? otherName.trim() : type;

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    if (!name) {
      toast.error("Informe qual é o documento.");
      return;
    }
    if (files.length === 0) {
      toast.error("Selecione o arquivo.");
      return;
    }
    setUploading(true);
    const added: UploadedDocument[] = [];
    const failures: string[] = [];
    for (const file of files) {
      const form = new FormData();
      form.append("name", name);
      form.append("file", file);
      const res = await fetch(`/api/employees/${employeeId}/documents`, { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (res.ok) added.push(body);
      else failures.push(`${file.name}: ${body.error || "não foi possível enviar."}`);
    }
    setUploading(false);
    if (added.length > 0) {
      onChange([...added.reverse(), ...documents]);
      toast.success(added.length === 1 ? "Documento enviado." : `${added.length} arquivos enviados.`);
      setFiles([]);
      if (fileInput.current) fileInput.current.value = "";
    }
    if (failures.length > 0) toast.error(failures.join(" "), { duration: 8000 });
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/employee-documents/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error || "Não foi possível excluir o documento.");
      return;
    }
    setDeleting(null);
    onChange(documents.filter((d) => d.id !== id));
    toast.success("Documento excluído.");
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={handleUpload}
        className="grid grid-cols-1 items-start gap-3 rounded-[12px] border border-dashed border-border-strong bg-surface-2/50 p-3.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto]"
      >
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink">Documento</span>
          <select value={type} onChange={(e) => setType(e.target.value)} className={inputClass(false)}>
            {EMPLOYEE_DOCUMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
            <option value={OTHER}>Outro...</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink">Arquivo</span>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept={ATTACHMENT_ACCEPT}
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            className="w-full py-1 text-sm text-muted file:mr-3 file:rounded-[8px] file:border file:border-border-strong file:bg-surface file:px-3 file:py-1.5 file:text-[13px] file:font-semibold file:text-ink"
          />
          <span className="text-xs text-muted">PDF ou imagem, até {MAX_ATTACHMENT_MB} MB cada. Pode escolher mais de um.</span>
        </label>
        <Button type="submit" disabled={uploading} className="sm:mt-[26px]">
          {uploading ? "Enviando..." : "Enviar"}
        </Button>
        {type === OTHER && (
          <label className="flex flex-col gap-1.5 text-sm sm:col-start-1 sm:row-start-2">
            <span className="font-medium text-ink">Nome do documento</span>
            <input
              value={otherName}
              onChange={(e) => setOtherName(e.target.value)}
              className={inputClass(false)}
              placeholder="Ex.: Carteira de trabalho"
              maxLength={80}
            />
          </label>
        )}
      </form>

      {documents.length === 0 ? (
        <p className="text-sm text-muted">Nenhum documento enviado na ficha ainda.</p>
      ) : (
        <ul className="flex flex-col">
          {documents.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2.5 border-t border-border py-2.5 first:border-t-0 first:pt-0">
              <IconFile className="h-4 w-4 shrink-0 text-muted" />
              <span className="flex min-w-0 flex-1 flex-col leading-snug">
                <span className="text-[13px] font-semibold text-ink">{d.name}</span>
                <span className="text-[11.5px] text-muted">
                  Enviado em {formatDateBR(d.createdAt)}
                  {d.uploadedBy ? ` por ${d.uploadedBy}` : ""}
                </span>
              </span>
              {deleting === d.id ? (
                <span className="flex items-center gap-2 text-[13px]">
                  <span className="text-ink">Excluir este arquivo?</span>
                  <Button variant="ghost" type="button" onClick={() => setDeleting(null)}>
                    Cancelar
                  </Button>
                  <Button type="button" onClick={() => handleDelete(d.id)}>
                    Excluir
                  </Button>
                </span>
              ) : (
                <>
                  <a
                    href={`/api/employee-documents/${d.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex max-w-[16rem] items-center gap-1.5 rounded-[8px] bg-surface-2 px-3 py-1.5 text-xs text-ink hover:underline"
                  >
                    <IconPaperclip className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{d.fileName}</span>
                    <span className="shrink-0 text-muted">{formatFileSize(d.size)}</span>
                  </a>
                  <ActionButton label="Excluir documento" danger onClick={() => setDeleting(d.id)}>
                    <IconTrash className="h-4 w-4" />
                  </ActionButton>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
