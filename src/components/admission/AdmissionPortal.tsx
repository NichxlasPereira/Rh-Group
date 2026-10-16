"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { DocumentStatus, FieldType, admissionProgress, fieldsProgress, normalizeFieldValue } from "@/lib/admission";
import { ATTACHMENT_ACCEPT, MAX_ATTACHMENT_MB, formatFileSize } from "@/lib/attendance";
import { formatDateBR } from "@/lib/format";
import { ThemeToggle } from "../ThemeToggle";
import { IconAlertTriangle, IconPaperclip, IconX } from "../icons";
import { DocumentStatusBadge } from "./DocumentStatusBadge";

interface PortalDocument {
  id: string;
  kind: "upload" | "nda" | "imagem";
  name: string;
  description: string | null;
  required: boolean;
  status: DocumentStatus;
  reviewNote: string | null;
  /** Termos: o representante da empresa já assinou também. */
  companySigned: boolean;
  files: { id: string; fileName: string; size: number }[];
}

interface PortalField {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  value: string | null;
}

interface PortalData {
  companyName: string | null;
  retentionDays: number;
  submitted: boolean;
  candidateName: string | null;
  fields: PortalField[];
  role: string | null;
  startDate: string | null;
  tokenExpiresAt: string;
  documents: PortalDocument[];
}

/** Tudo o que é obrigatório já foi enviado: dados completos e nenhum documento faltando ou recusado. */
export function submissionComplete(data: Pick<PortalData, "fields" | "documents">): boolean {
  const fields = fieldsProgress(data.fields);
  return (
    fields.filled >= fields.required &&
    data.documents.every((d) => !d.required || d.status === "enviado" || d.status === "aprovado")
  );
}

/** Página do candidato: envia os documentos pedidos e acompanha a análise do RH. */
export function AdmissionPortal({ token }: { token: string }) {
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState<string>();
  const [uploading, setUploading] = useState<string | null>(null);
  const router = useRouter();

  const load = useCallback(async (): Promise<PortalData | null> => {
    const res = await fetch(`/api/admissao/${token}`, { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error || "Não foi possível abrir este link.");
      return null;
    }
    setData(body);
    return body;
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  // Depois do envio final: se ficou tudo completo, vai para o agradecimento.
  const refreshAfterSend = useCallback(async () => {
    const fresh = await load();
    if (fresh && submissionComplete(fresh)) router.push(`/admissao/${token}/enviado`);
  }, [load, router, token]);

  async function upload(doc: PortalDocument, files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(doc.id);
    let sent = 0;
    for (const file of Array.from(files)) {
      if (file.size > MAX_ATTACHMENT_MB * 1024 * 1024) {
        toast.error(`${file.name}: passa de ${MAX_ATTACHMENT_MB} MB.`);
        continue;
      }
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/admissao/${token}/documents/${doc.id}`, { method: "POST", body: form });
      if (res.ok) sent++;
      else {
        const body = await res.json().catch(() => ({}));
        toast.error(`${file.name}: ${body.error || "não foi possível enviar."}`);
      }
    }
    setUploading(null);
    if (sent > 0) toast.success(sent === 1 ? "Arquivo enviado." : `${sent} arquivos enviados.`);
    await load();
  }

  async function removeFile(fileId: string) {
    const res = await fetch(`/api/admissao/${token}/files/${fileId}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error || "Não foi possível remover.");
    }
    await load();
  }

  if (error) {
    return (
      <Shell>
        <div className="flex gap-3 rounded-[14px] border border-warn bg-warn-soft p-4 text-sm text-ink">
          <IconAlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warn" />
          <p>{error}</p>
        </div>
      </Shell>
    );
  }
  if (!data) {
    return (
      <Shell>
        <p className="py-16 text-center text-sm text-muted">Carregando...</p>
      </Shell>
    );
  }

  const firstName = data.candidateName?.split(" ")[0];

  return (
    <Shell companyName={data.companyName}>
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-bold leading-tight text-ink">Olá{firstName ? `, ${firstName}` : ""}!</h1>
        <p className="text-sm text-muted">
          Este é o seu onboarding digital na {data.companyName ?? "CFFGROUP"}{data.role ? ` para ${data.role}` : ""}
          {data.startDate ? `, com início previsto em ${formatDateBR(data.startDate)}` : ""}. Preencha seus dados e
          envie cada documento abaixo — foto do celular ou PDF. O RH avalia e você acompanha por aqui.
        </p>
      </div>

      {/* Ordem do processo: preencher os dados, enviar os documentos e, por último, o botão que envia tudo. */}
      <SubmissionForm
        token={token}
        fields={data.fields}
        documents={data.documents}
        submitted={data.submitted}
        expiresAt={data.tokenExpiresAt}
        missingDocuments={data.documents.filter((d) => d.required && (d.status === "pendente" || d.status === "recusado"))}
        onSent={refreshAfterSend}
      >
        <h2 className="font-display text-xl font-bold text-ink">Seus documentos</h2>
        <ul className="flex flex-col gap-3">
          {data.documents.map((doc) => (
            <DocumentCard
              key={doc.id}
              token={token}
              doc={doc}
              busy={uploading === doc.id}
              onUpload={(files) => upload(doc, files)}
              onRemove={removeFile}
            />
          ))}
        </ul>
      </SubmissionForm>

      <section className="flex flex-col gap-1 rounded-[14px] border border-dashed border-border-strong p-4 text-xs leading-relaxed text-muted">
        <p className="font-semibold text-ink">Seus dados estão protegidos</p>
        <p>
          A CFFGROUP usa seus dados e documentos só para a sua admissão, e só a equipe de RH tem acesso a eles (LGPD).
          Se a contratação não seguir, tudo é apagado {data.retentionDays} dias depois. Não compartilhe este link: ele
          é pessoal.
        </p>
      </section>
    </Shell>
  );
}

/** O que está digitado em "Seus dados" agora — o acordo é gerado com isso. */
const FormValuesContext = createContext<Record<string, string>>({});

function DocumentCard({
  token,
  doc,
  busy,
  onUpload,
  onRemove,
}: {
  token: string;
  doc: PortalDocument;
  busy: boolean;
  onUpload: (files: FileList | null) => void;
  onRemove: (fileId: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const locked = doc.status === "aprovado";
  // Termo gerado pelo sistema (acordo, uso de imagem): baixar preenchido, assinar, enviar.
  const generated = doc.kind !== "upload";

  return (
    <li
      id={`documento-${doc.id}`}
      className={`scroll-mt-4 rounded-[14px] border bg-surface p-4 ${
        doc.status === "recusado" ? "border-critical" : "border-border"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-ink">
            {doc.name}
            {!doc.required && <span className="ml-1.5 text-xs font-normal text-muted">(se tiver)</span>}
          </p>
          {doc.description && <p className="text-xs text-muted">{doc.description}</p>}
        </div>
        <DocumentStatusBadge status={doc.status} />
      </div>

      {doc.status === "recusado" && doc.reviewNote && (
        <p className="mt-3 rounded-[10px] bg-critical-soft px-3 py-2 text-sm text-ink">
          <strong className="text-critical">O RH pediu para reenviar:</strong> {doc.reviewNote}
        </p>
      )}

      {doc.files.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {doc.files.map((f) => (
            <li key={f.id} className="flex items-center gap-2 rounded-[8px] bg-surface-2 px-3 py-2 text-sm">
              <IconPaperclip className="h-4 w-4 shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate text-ink">{f.fileName}</span>
              <span className="shrink-0 font-mono text-xs text-muted">{formatFileSize(f.size)}</span>
              {!locked && (
                <button
                  type="button"
                  onClick={() => onRemove(f.id)}
                  aria-label={`Remover ${f.fileName}`}
                  className="shrink-0 rounded-full p-1 text-muted transition hover:text-critical"
                >
                  <IconX className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {generated && doc.files.length > 0 && doc.status !== "recusado" && (
        <ul className="mt-3 flex flex-col gap-1 text-xs">
          <li className="flex items-center gap-2 text-ink">
            <span className="h-2 w-2 rounded-full bg-ok" aria-hidden="true" />
            Você assinou
          </li>
          <li className={`flex items-center gap-2 ${doc.companySigned ? "text-ink" : "text-muted"}`}>
            <span className={`h-2 w-2 rounded-full ${doc.companySigned ? "bg-ok" : "bg-warn"}`} aria-hidden="true" />
            {doc.companySigned ? "A empresa assinou" : "Aguardando a assinatura da empresa (o RH cuida disso)"}
          </li>
        </ul>
      )}

      {!locked && generated && (doc.files.length === 0 || doc.status === "recusado") && <TermSteps token={token} doc={doc} />}

      {!locked && (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-border-strong px-3 py-2.5 text-sm font-semibold text-accent-strong transition hover:bg-accent-soft disabled:opacity-60"
          >
            <IconPaperclip className="h-4 w-4" />
            {busy
              ? "Enviando..."
              : generated
                ? doc.files.length > 0 && doc.status !== "recusado"
                  ? "Enviar outra versão assinada"
                  : `3. Enviar o ${doc.kind === "nda" ? "acordo" : "termo"} assinado (PDF)`
                : doc.files.length > 0
                  ? "Enviar mais um arquivo"
                  : "Enviar documento"}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={generated ? "application/pdf" : ATTACHMENT_ACCEPT}
            multiple={!generated}
            className="hidden"
            onChange={(e) => {
              onUpload(e.target.files);
              e.target.value = "";
            }}
          />
        </>
      )}
    </li>
  );
}

function Shell({ children, companyName }: { children: React.ReactNode; companyName?: string | null }) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-5 px-4 py-8 sm:py-12">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
            style={{ background: "linear-gradient(135deg, #9b7bfb 0%, #6d4bde 100%)" }}
          >
            <span className="font-display text-sm font-bold text-white">C</span>
          </div>
          <span className="font-display text-sm font-bold tracking-tight text-ink">cffgroup · onboarding</span>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          {companyName && (
            <span
              className="truncate rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent-strong"
              title={`Empresa: ${companyName}`}
            >
              {companyName}
            </span>
          )}
          <ThemeToggle />
        </div>
      </div>
      {children}
    </main>
  );
}

const INPUT_TYPE: Record<FieldType, string> = {
  text: "text",
  cpf: "text",
  rg: "text",
  cnpj: "text",
  date: "date",
  email: "email",
  tel: "tel",
  textarea: "text",
};
const AUTOCOMPLETE: Partial<Record<FieldType, string>> = { email: "email", tel: "tel" };

function SubmissionForm({
  token,
  fields,
  documents,
  submitted,
  expiresAt,
  missingDocuments,
  onSent,
  children,
}: {
  token: string;
  fields: PortalField[];
  documents: PortalDocument[];
  submitted: boolean;
  expiresAt: string;
  missingDocuments: PortalDocument[];
  onSent: () => Promise<void>;
  children: React.ReactNode;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.id, f.value ?? ""]))
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const progress = fieldsProgress(fields);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    // Só envia com tudo certo: obrigatórios preenchidos, formatos válidos e documentos enviados.
    const found: Record<string, string> = {};
    for (const f of fields) {
      const result = normalizeFieldValue(f.type, values[f.id] ?? "");
      if ("error" in result) found[f.id] = result.error;
      else if (f.required && !result.value) found[f.id] = "Preencha este campo.";
    }
    setErrors(found);
    const invalid = Object.keys(found);
    if (invalid.length > 0) {
      toast.error(
        `Os dados não foram enviados: corrija ${invalid.length === 1 ? "o campo destacado" : `os ${invalid.length} campos destacados`}.`
      );
      document.getElementById(`campo-${invalid[0]}`)?.focus();
      return;
    }
    if (missingDocuments.length > 0) {
      toast.error(
        missingDocuments.length === 1
          ? `Falta enviar: ${missingDocuments[0].name}.`
          : `Faltam ${missingDocuments.length} documentos: ${missingDocuments.map((d) => d.name).join(", ")}.`
      );
      document.getElementById(`documento-${missingDocuments[0].id}`)?.scrollIntoView({ behavior: "smooth" });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/admissao/${token}/fields`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrors(body.fields ?? {});
        toast.error(body.error || "Não foi possível enviar os dados.");
        return;
      }
      setDirty(false);
      toast.success("Tudo enviado ao RH.");
      await onSent();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-5" noValidate>
      <Steps fields={fields} values={values} documents={documents} submitted={submitted} expiresAt={expiresAt} />
      {fields.length > 0 && (
        <div className="flex flex-col gap-4 rounded-[14px] border border-border bg-surface p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-display text-xl font-bold text-ink">Seus dados</h2>
            <span className="font-mono text-sm tabular-nums text-muted">
              {progress.filled}/{progress.required}
            </span>
          </div>
          {fields.map((f) => (
            <label key={f.id} className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-ink">
                {f.label}
                {!f.required && <span className="ml-1.5 text-xs font-normal text-muted">(opcional)</span>}
              </span>
              {f.type === "textarea" ? (
                <textarea
                  id={`campo-${f.id}`}
                  rows={2}
                  value={values[f.id] ?? ""}
                  onChange={(e) => {
                    setValues((v) => ({ ...v, [f.id]: e.target.value }));
                    setErrors((errs) => ({ ...errs, [f.id]: "" }));
                    setDirty(true);
                  }}
                  className={`w-full resize-y rounded-[10px] border bg-surface-2 px-3 py-2.5 text-base text-ink focus:outline-none ${
                    errors[f.id] ? "border-critical" : "border-border focus:border-accent"
                  }`}
                />
              ) : (
                <input
                  id={`campo-${f.id}`}
                  type={INPUT_TYPE[f.type]}
                  inputMode={f.type === "cpf" ? "numeric" : undefined}
                  autoComplete={AUTOCOMPLETE[f.type] ?? (f.label === "Nome completo" ? "name" : "off")}
                  placeholder={
                    f.type === "cpf"
                      ? "000.000.000-00"
                      : f.type === "cnpj"
                        ? "00.000.000/0000-00"
                        : f.type === "tel"
                          ? "(11) 99999-9999"
                          : undefined
                  }
                  // CNPJ pode ter letras (formato alfanumérico): só maiúsculas, sem corretor.
                  autoCapitalize={f.type === "cnpj" || f.type === "rg" ? "characters" : undefined}
                  value={values[f.id] ?? ""}
                  onChange={(e) => {
                    setValues((v) => ({ ...v, [f.id]: e.target.value }));
                    setErrors((errs) => ({ ...errs, [f.id]: "" }));
                    setDirty(true);
                  }}
                  className={`w-full rounded-[10px] border bg-surface-2 px-3 py-2.5 text-base text-ink focus:outline-none ${
                    errors[f.id] ? "border-critical" : "border-border focus:border-accent"
                  }`}
                />
              )}
              {errors[f.id] && <span className="text-xs text-critical">{errors[f.id]}</span>}
            </label>
          ))}
        </div>
      )}

      <FormValuesContext.Provider value={values}>{children}</FormValuesContext.Provider>

      <div className="flex flex-col gap-2 rounded-[14px] border border-border bg-surface p-4">
        <p className="text-sm text-muted">
          Confira seus dados e documentos. Ao enviar, o RH recebe tudo para análise.
        </p>
        <button
          type="submit"
          disabled={saving}
          className="rounded-[10px] bg-accent px-4 py-3.5 text-base font-semibold text-accent-ink transition hover:brightness-110 disabled:opacity-60"
        >
          {saving ? "Enviando..." : !dirty && progress.filled > 0 && missingDocuments.length === 0 ? "Dados enviados ✓" : "Enviar dados"}
        </button>
      </div>
    </form>
  );
}

/** Passos de um termo gerado: baixar preenchido, assinar no gov.br, enviar. */
function TermSteps({ token, doc }: { token: string; doc: PortalDocument }) {
  const values = useContext(FormValuesContext);
  const [busy, setBusy] = useState(false);

  const noun = doc.kind === "nda" ? "o acordo" : "o termo";

  async function download() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admissao/${token}/documents/${doc.id}/preenchido`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error || "Não foi possível gerar o termo.");
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.kind === "nda" ? "acordo-de-confidencialidade.pdf" : "termo-de-uso-de-imagem.pdf";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ol className="mt-3 flex flex-col gap-2 rounded-[10px] bg-surface-2 p-3 text-sm text-ink">
      <li className="flex flex-col gap-2">
        <span>
          <strong>1.</strong> Preencha “Seus dados” acima e baixe {noun} já preenchido com eles.
        </span>
        <button
          type="button"
          onClick={download}
          disabled={busy}
          className="self-start rounded-[10px] bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition hover:brightness-110 disabled:opacity-60"
        >
          {busy ? "Gerando..." : `Baixar ${noun.slice(2)} preenchido (PDF)`}
        </button>
      </li>
      <li>
        <strong>2.</strong> Assine o PDF de graça com a sua conta gov.br em{" "}
        <a href="https://assinador.iti.br" target="_blank" rel="noopener noreferrer" className="font-semibold text-accent-strong underline">
          assinador.iti.br
        </a>{" "}
        e baixe o arquivo assinado.
      </li>
      <li>
        <strong>3.</strong> Envie o PDF assinado no botão abaixo.
      </li>
    </ol>
  );
}

/** Etapas do onboarding, conforme o que já está preenchido na tela e o que já foi enviado. */
function Steps({
  fields,
  values,
  documents,
  submitted,
  expiresAt,
}: {
  fields: PortalField[];
  values: Record<string, string>;
  documents: PortalDocument[];
  submitted: boolean;
  expiresAt: string;
}) {
  const sent = (d: PortalDocument) => d.status === "enviado" || d.status === "aprovado";
  const uploads = documents.filter((d) => d.kind === "upload" && d.required);
  const terms = documents.filter((d) => d.kind !== "upload" && d.required);
  const dataOk = fields.every((f) => {
    const result = normalizeFieldValue(f.type, values[f.id] ?? "");
    return !("error" in result) && (!f.required || !!result.value);
  });
  const steps = [
    { label: "Dados", done: dataOk },
    { label: "Documentos", done: uploads.every(sent) },
    ...(terms.length > 0 ? [{ label: "Termos", done: terms.every(sent) }] : []),
    { label: "Enviar", done: submitted },
  ];
  const current = steps.findIndex((s) => !s.done);
  const progress = admissionProgress(documents);

  return (
    <div className="flex flex-col gap-2 rounded-[14px] border border-border bg-surface p-4">
      <ol className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((step, i) => (
          <li key={step.label} className="flex flex-col gap-1.5" aria-current={i === current ? "step" : undefined}>
            <span
              className={`h-1.5 rounded-full ${step.done ? "bg-ok" : i === current ? "bg-accent" : "bg-surface-2"}`}
              aria-hidden="true"
            />
            <span className={`text-xs font-semibold ${step.done || i === current ? "text-ink" : "text-muted"}`}>
              {step.done ? "✓ " : ""}
              {step.label}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted">
        {progress.approved > 0 && `${progress.approved}/${progress.required} aprovados pelo RH · `}
        {progress.refused > 0 && `${progress.refused} para reenviar · `}
        link válido até {formatDateBR(expiresAt)}
      </p>
    </div>
  );
}
