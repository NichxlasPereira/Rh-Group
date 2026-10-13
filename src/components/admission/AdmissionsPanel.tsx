"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "../Button";
import { Modal } from "../Modal";
import { IconPaperclip, IconPlus, IconTrash, IconUsers } from "../icons";
import { EmptyState, Field, inputClass } from "../attendance/formControls";
import {
  ADMISSION_STATUS_LABEL,
  AdmissionDocumentInfo,
  AdmissionInfo,
  AdmissionStatus,
  AdmissionFieldInfo,
  ContractingCompanyInfo,
  DEFAULT_FIELDS,
  admissionProgress,
  fieldsProgress,
} from "@/lib/admission";
import { formatFileSize } from "@/lib/attendance";
import { formatDateBR } from "@/lib/format";
import { DocumentStatusBadge } from "./DocumentStatusBadge";
import { NdaSettingsModal } from "./NdaSettingsModal";

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

/** Antes de o candidato preencher, o onboarding ainda não tem nome. */
const displayName = (a: Pick<AdmissionInfo, "candidateName">) => a.candidateName ?? "Aguardando o candidato";

const errorToast = (err: unknown) => toast.error(err instanceof Error ? err.message : "Erro inesperado.");

const STATUS_STYLE: Record<AdmissionStatus, string> = {
  em_andamento: "bg-accent-soft text-accent-strong",
  concluida: "bg-ok-soft text-ok",
  cancelada: "border border-border-strong text-muted",
};

interface AdmissionsPanelProps {
  departments: string[];
  /** Administradores cadastram as empresas e editam o texto do acordo. */
  isAdmin: boolean;
  /** Concluir cria um colaborador: a página recarrega a lista dela. */
  onEmployeesChanged: () => void;
}

/** Aba "admissões": admissão 100% digital, do envio dos documentos à aprovação. */
export function AdmissionsPanel({ departments, isAdmin, onEmployeesChanged }: AdmissionsPanelProps) {
  const [companies, setCompanies] = useState<ContractingCompanyInfo[]>([]);
  const [ndaSettings, setNdaSettings] = useState(false);
  const [admissions, setAdmissions] = useState<AdmissionInfo[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [link, setLink] = useState<{ url: string; admission: AdmissionInfo } | null>(null);
  // Abre mostrando todos: um filtro escondido fazia onboardings concluídos "sumirem".
  const [statusFilter, setStatusFilter] = useState<AdmissionStatus | "">("");

  const load = useCallback(async () => {
    try {
      setAdmissions(await send("/api/admissions", "GET"));
    } catch (err) {
      errorToast(err);
    }
  }, []);

  const loadCompanies = useCallback(async () => {
    try {
      setCompanies(await send("/api/frequencia/companies", "GET"));
    } catch (err) {
      errorToast(err);
    }
  }, []);

  useEffect(() => {
    load();
    loadCompanies();
  }, [load, loadCompanies]);

  const visible = useMemo(
    () => (admissions ?? []).filter((a) => !statusFilter || a.status === statusFilter),
    [admissions, statusFilter]
  );
  const selected = admissions?.find((a) => a.id === selectedId) ?? null;
  const count = (status: AdmissionStatus) => (admissions ?? []).filter((a) => a.status === status).length;

  // Um clique: cria com os dados e documentos padrão e já mostra o link.
  async function create() {
    setCreating(true);
    try {
      const result = await send("/api/admissions", "POST", {});
      await load();
      setLink({ url: result.link, admission: result.admission });
    } catch (err) {
      errorToast(err);
    } finally {
      setCreating(false);
    }
  }

  if (selected) {
    return (
      <AdmissionDetail
        admission={selected}
        departments={departments}
        companies={companies}
        onBack={() => setSelectedId(null)}
        onChanged={load}
        onShowLink={(url) => setLink({ url, admission: selected })}
        onEmployeesChanged={onEmployeesChanged}
        linkModal={link && <LinkModal link={link} onClose={() => setLink(null)} />}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-border bg-surface px-4 py-3">
        <p className="max-w-xl text-sm text-muted">
          Crie o onboarding, envie o link para o candidato e acompanhe aqui cada documento: em análise, aprovado ou
          recusado. Ao concluir, a pessoa entra como colaborador ativo.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <Button variant="ghost" onClick={() => setNdaSettings(true)} className="!px-4 !py-2 text-xs">
              Acordo de confidencialidade
            </Button>
          )}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as AdmissionStatus | "")}
            className="rounded-[10px] border border-border bg-surface-2 px-3 py-2 text-xs text-ink focus:border-accent focus:outline-none"
            aria-label="Filtrar por situação"
          >
            <option value="">Todos ({admissions?.length ?? 0})</option>
            <option value="em_andamento">Em andamento ({count("em_andamento")})</option>
            <option value="concluida">Concluídos ({count("concluida")})</option>
            <option value="cancelada">Cancelados ({count("cancelada")})</option>
          </select>
          <Button onClick={create} disabled={creating} className="!px-4 !py-2 text-xs">
            <IconPlus className="h-3.5 w-3.5" />
            {creating ? "Gerando link..." : "Novo onboarding"}
          </Button>
        </div>
      </div>

      <div className="rounded-[14px] border border-border bg-surface">
        {admissions === null ? (
          <p className="px-6 py-16 text-center text-sm text-muted">Carregando...</p>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<IconUsers className="h-6 w-6" />}
            title={admissions.length === 0 ? "Nenhum onboarding ainda" : "Nenhum onboarding nesta situação"}
            text={
              admissions.length === 0
                ? "Clique em “Novo onboarding” para gerar o link de envio de documentos do candidato."
                : "Troque o filtro para ver as outras."
            }
          />
        ) : (
          <ul>
            {visible.map((a) => {
              const p = admissionProgress(a.documents);
              const pct = p.required ? Math.round((p.approved / p.required) * 100) : 0;
              return (
                <li key={a.id} className="border-b border-border last:border-0">
                  <button
                    type="button"
                    onClick={() => setSelectedId(a.id)}
                    className="flex w-full flex-wrap items-center gap-4 px-4 py-3 text-left transition hover:bg-surface-2/40"
                  >
                    <div className="min-w-[12rem] flex-1">
                      <p className={`font-medium ${a.candidateName ? "text-ink" : "italic text-muted"}`}>{displayName(a)}</p>
                      <p className="text-xs text-muted">
                        {[a.role, a.department].filter(Boolean).join(" · ") || "Cargo não informado"}
                        {a.startDate && ` · início ${formatDateBR(a.startDate)}`}
                        {(() => {
                          const d = fieldsProgress(a.fields);
                          return d.required > 0 ? ` · dados ${d.filled}/${d.required}` : "";
                        })()}
                      </p>
                    </div>
                    <div className="w-44">
                      <div className="mb-1 flex justify-between text-xs text-muted">
                        <span>
                          {p.inReview > 0 ? (
                            <span className="font-semibold text-warn">{p.inReview} para analisar</span>
                          ) : (
                            "aprovados"
                          )}
                        </span>
                        <span className="font-mono tabular-nums">
                          {p.approved}/{p.required}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <div className="h-full rounded-full bg-ok" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[a.status]}`}>
                      {ADMISSION_STATUS_LABEL[a.status]}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {link && <LinkModal link={link} onClose={() => setLink(null)} />}
      {isAdmin && (
        <NdaSettingsModal
          open={ndaSettings}
          onClose={() => setNdaSettings(false)}
          companies={companies}
          onCompaniesChanged={async () => {
            await loadCompanies();
            await load();
          }}
        />
      )}
    </div>
  );
}

function AdmissionDetail({
  admission,
  departments,
  companies,
  onBack,
  onChanged,
  onShowLink,
  onEmployeesChanged,
  linkModal,
}: {
  admission: AdmissionInfo;
  departments: string[];
  companies: ContractingCompanyInfo[];
  onBack: () => void;
  onChanged: () => Promise<void>;
  onShowLink: (url: string) => void;
  onEmployeesChanged: () => void;
  linkModal: React.ReactNode;
}) {
  const [refusing, setRefusing] = useState<AdmissionDocumentInfo | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newDoc, setNewDoc] = useState("");
  const p = admissionProgress(admission.documents);
  const d = fieldsProgress(admission.fields);
  const ready = p.approved >= p.required && d.filled >= d.required && !!admission.candidateName;
  const open = admission.status === "em_andamento";
  const base = `/api/admissions/${admission.id}`;

  async function act(fn: () => Promise<unknown>, message: string) {
    try {
      await fn();
      await onChanged();
      toast.success(message);
    } catch (err) {
      errorToast(err);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onBack} className="self-start text-sm text-muted hover:text-ink">
        ← Todos os onboardings
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4 rounded-[14px] border border-border bg-surface p-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className={`font-display text-2xl font-bold ${admission.candidateName ? "text-ink" : "italic text-muted"}`}>
              {displayName(admission)}
            </h2>
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[admission.status]}`}>
              {ADMISSION_STATUS_LABEL[admission.status]}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">
            {[admission.role, admission.department].filter(Boolean).join(" · ") || "Cargo não informado"}
            {admission.startDate && ` · início previsto ${formatDateBR(admission.startDate)}`}
          </p>
          <p className="text-xs text-muted">
            {[admission.email, admission.phone].filter(Boolean).join(" · ")}
            {admission.createdBy && ` · criado por ${admission.createdBy} em ${formatDateBR(admission.createdAt)}`}
          </p>
          <p className="mt-3 text-sm text-ink">
            Dados: <strong className="font-mono">{d.filled}</strong> de <strong className="font-mono">{d.required}</strong>{" "}
            obrigatórios preenchidos
          </p>
          <p className="text-sm text-ink">
            Documentos: <strong className="font-mono">{p.approved}</strong> de <strong className="font-mono">{p.required}</strong>{" "}
            obrigatórios aprovados
            {p.inReview > 0 && <span className="text-warn"> · {p.inReview} para analisar</span>}
            {p.refused > 0 && <span className="text-critical"> · {p.refused} recusado(s)</span>}
            {p.missing > 0 && <span className="text-muted"> · {p.missing} não enviado(s)</span>}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {open && (
            <>
              <Button
                variant="ghost"
                className="!px-4 !py-2 text-xs"
                onClick={async () => {
                  try {
                    const r = await send(`${base}/link`, "POST");
                    onShowLink(r.link);
                    await onChanged();
                  } catch (err) {
                    errorToast(err);
                  }
                }}
              >
                Gerar link do candidato
              </Button>
              <Button
                className="!px-4 !py-2 text-xs"
                disabled={!ready}
                title={ready ? undefined : "O candidato precisa preencher os dados e você aprovar os documentos obrigatórios"}
                onClick={() =>
                  act(async () => {
                    await send(base, "PATCH", { action: "concluir" });
                    onEmployeesChanged();
                  }, `${displayName(admission)} agora é colaborador ativo.`)
                }
              >
                Concluir onboarding
              </Button>
            </>
          )}
          {admission.status !== "concluida" && (
            <Button
              variant="ghost"
              className="!px-4 !py-2 text-xs"
              onClick={() =>
                act(
                  () => send(base, "PATCH", { action: open ? "cancelar" : "reabrir" }),
                  open ? "Onboarding cancelado." : "Onboarding reaberto."
                )
              }
            >
              {open ? "Cancelar onboarding" : "Reabrir"}
            </Button>
          )}
          {admission.documents.some((doc) => doc.files.length > 0) && (
            <a
              href={`${base}/zip`}
              className="inline-flex items-center gap-2 rounded-full border border-border-strong px-4 py-2 text-xs font-semibold text-ink transition hover:bg-ink hover:text-bg"
            >
              Baixar documentos (.zip)
            </a>
          )}
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            title="Excluir onboarding e documentos"
            className="rounded-[8px] p-2 text-muted transition hover:bg-surface-2 hover:text-critical"
          >
            <IconTrash className="h-4 w-4" />
          </button>
        </div>
      </div>

      <CandidateDataCard
        fields={admission.fields}
        editable={open}
        onAdd={(body) => act(() => send(`${base}/fields`, "POST", body), "Dado incluído. O candidato já vê no link dele.")}
        onToggle={(f) =>
          act(
            () => send(`${base}/fields/${f.id}`, "PATCH", { required: !f.required }),
            f.required ? "Agora é opcional." : "Agora é obrigatório."
          )
        }
        onRemove={(f) => act(() => send(`${base}/fields/${f.id}`, "DELETE"), "Dado retirado do pedido.")}
      />

      <InternalInfoCard
        admission={admission}
        departments={departments}
        companies={companies}
        editable={admission.status !== "concluida"}
        onSave={(body) => act(() => send(base, "PATCH", body), "Dados internos salvos.")}
      />

      <h3 className="mt-2 font-display text-lg font-semibold text-ink">Documentos</h3>
      <ul className="flex flex-col gap-3">
        {admission.documents.map((doc) => (
          <li key={doc.id} className="rounded-[14px] border border-border bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-ink">
                  {doc.name}
                  {!doc.required && <span className="ml-1.5 text-xs font-normal text-muted">(opcional)</span>}
                </p>
                {doc.description && <p className="text-xs text-muted">{doc.description}</p>}
                {doc.reviewedBy && doc.reviewedAt && doc.status !== "enviado" && (
                  <p className="text-xs text-muted">
                    {doc.status === "aprovado" ? "Aprovado" : "Recusado"} por {doc.reviewedBy} em{" "}
                    {formatDateBR(doc.reviewedAt)}
                  </p>
                )}
              </div>
              <DocumentStatusBadge status={doc.status} />
            </div>

            {doc.kind === "nda" && doc.files.length > 0 && doc.status === "enviado" && (
              <p className="mt-2 text-xs text-muted">
                Antes de aprovar, confira a assinatura gov.br do PDF em{" "}
                <a
                  href="https://validar.iti.gov.br"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-accent-strong underline"
                >
                  validar.iti.gov.br
                </a>
                .
              </p>
            )}

            {doc.status === "recusado" && doc.reviewNote && (
              <p className="mt-2 rounded-[10px] bg-critical-soft px-3 py-2 text-sm text-ink">Motivo: {doc.reviewNote}</p>
            )}

            {doc.files.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-2">
                {doc.files.map((f) => (
                  <li key={f.id}>
                    <a
                      href={`/api/admission-files/${f.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex max-w-[16rem] items-center gap-1.5 rounded-[8px] bg-surface-2 px-3 py-1.5 text-xs text-accent-strong hover:underline"
                    >
                      <IconPaperclip className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{f.fileName}</span>
                      <span className="shrink-0 text-muted">{formatFileSize(f.size)}</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-muted">O candidato ainda não enviou este documento.</p>
            )}

            {open && (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                {doc.files.length > 0 && doc.status !== "aprovado" && (
                  <Button
                    className="!px-3 !py-1.5 text-xs"
                    onClick={() => act(() => send(`${base}/documents/${doc.id}`, "PATCH", { status: "aprovado" }), "Documento aprovado.")}
                  >
                    Aprovar
                  </Button>
                )}
                {doc.files.length > 0 && doc.status !== "recusado" && (
                  <Button variant="ghost" className="!px-3 !py-1.5 text-xs" onClick={() => setRefusing(doc)}>
                    Recusar
                  </Button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    act(
                      () => send(`${base}/documents/${doc.id}`, "PATCH", { required: !doc.required }),
                      doc.required ? "Agora é opcional." : "Agora é obrigatório."
                    )
                  }
                  className="text-xs font-semibold text-muted underline-offset-2 hover:text-ink hover:underline"
                >
                  {doc.required ? "tornar opcional" : "tornar obrigatório"}
                </button>
                <button
                  type="button"
                  onClick={() => act(() => send(`${base}/documents/${doc.id}`, "DELETE"), "Documento retirado da lista.")}
                  className="ml-auto text-xs font-semibold text-muted underline-offset-2 hover:text-critical hover:underline"
                >
                  retirar da lista
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {open && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const name = newDoc.trim();
            if (!name) return;
            act(async () => {
              await send(`${base}/documents`, "POST", { name, required: true });
              setNewDoc("");
            }, "Documento incluído. O candidato já vê no link dele.");
          }}
        >
          <input
            value={newDoc}
            onChange={(e) => setNewDoc(e.target.value)}
            placeholder="Pedir outro documento"
            className={inputClass(false)}
          />
          <Button type="submit" variant="ghost" className="!px-4 shrink-0 text-xs">
            <IconPlus className="h-3.5 w-3.5" />
            Incluir
          </Button>
        </form>
      )}

      <RefuseModal
        document={refusing}
        onClose={() => setRefusing(null)}
        onConfirm={(note) =>
          act(async () => {
            await send(`${base}/documents/${refusing!.id}`, "PATCH", { status: "recusado", reviewNote: note });
            setRefusing(null);
          }, "Documento recusado. O candidato vai ver o motivo.")
        }
      />

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Excluir onboarding"
        maxWidthClassName="max-w-md"
        footer={
          <>
            <Button variant="ghost" type="button" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              type="button"
              onClick={async () => {
                try {
                  await send(base, "DELETE");
                  setConfirmDelete(false);
                  await onChanged();
                  onBack();
                  toast.success("Onboarding excluído.");
                } catch (err) {
                  errorToast(err);
                }
              }}
            >
              Excluir
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink">
          O onboarding de <strong>{displayName(admission)}</strong> e todos os documentos enviados serão apagados
          definitivamente. O link do candidato deixa de funcionar.
        </p>
      </Modal>

      {linkModal}
    </div>
  );
}

function RefuseModal({
  document,
  onClose,
  onConfirm,
}: {
  document: AdmissionDocumentInfo | null;
  onClose: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  useEffect(() => setNote(""), [document]);

  return (
    <Modal
      open={!!document}
      onClose={onClose}
      title="Recusar documento"
      maxWidthClassName="max-w-md"
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" type="button" disabled={!note.trim()} onClick={() => onConfirm(note.trim())}>
            Recusar
          </Button>
        </>
      }
    >
      <Field label={`Por que “${document?.name ?? ""}” foi recusado?`} hint="O candidato vê esta mensagem e reenvia.">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          autoFocus
          className={inputClass(false) + " resize-y"}
          placeholder="Ex.: a foto está cortada, envie frente e verso inteiros."
        />
      </Field>
    </Modal>
  );
}

function LinkModal({ link, onClose }: { link: { url: string; admission: AdmissionInfo }; onClose: () => void }) {
  const { url, admission } = link;
  const firstName = admission.candidateName?.split(" ")[0];
  const message = `Olá${firstName ? `, ${firstName}` : ""}! Para o seu onboarding na CFFGROUP, preencha seus dados e envie seus documentos por este link pessoal: ${url}`;
  const phone = admission.phone?.replace(/\D/g, "");
  const whatsapp = `https://wa.me/${phone ? (phone.length <= 11 ? `55${phone}` : phone) : ""}?text=${encodeURIComponent(message)}`;

  return (
    <Modal
      open
      onClose={onClose}
      title="Link do candidato"
      maxWidthClassName="max-w-lg"
      footer={
        <Button type="button" onClick={onClose}>
          Pronto
        </Button>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-muted">
          Envie este link para {admission.candidateName ? <strong className="text-ink">{admission.candidateName}</strong> : "o candidato"}. Ele
          preenche os dados e envia os documentos por lá, sem senha. O link vale por 30 dias. <strong className="text-ink">Por segurança, ele só é mostrado agora</strong> — se
          perder, gere um novo (o antigo para de funcionar).
        </p>
        <input readOnly value={url} onFocus={(e) => e.target.select()} className={inputClass(false) + " font-mono text-xs"} />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="ghost"
            className="!px-4 !py-2 text-xs"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
                toast.success("Link copiado.");
              } catch {
                toast.error("Não foi possível copiar. Selecione o link e copie.");
              }
            }}
          >
            Copiar link
          </Button>
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-full border border-border-strong px-4 py-2 text-xs font-semibold text-ink transition hover:bg-ink hover:text-bg"
          >
            Enviar pelo WhatsApp
          </a>
          {admission.email && (
            <a
              href={`mailto:${admission.email}?subject=${encodeURIComponent("Documentos para o onboarding — CFFGROUP")}&body=${encodeURIComponent(message)}`}
              className="inline-flex items-center rounded-full border border-border-strong px-4 py-2 text-xs font-semibold text-ink transition hover:bg-ink hover:text-bg"
            >
              Enviar por e-mail
            </a>
          )}
        </div>
      </div>
    </Modal>
  );
}

function CandidateDataCard({
  fields,
  editable,
  onAdd,
  onToggle,
  onRemove,
}: {
  fields: AdmissionFieldInfo[];
  editable: boolean;
  onAdd: (body: { key?: string; label?: string }) => Promise<void>;
  onToggle: (field: AdmissionFieldInfo) => void;
  onRemove: (field: AdmissionFieldInfo) => void;
}) {
  const [extra, setExtra] = useState("");
  const missingPresets = DEFAULT_FIELDS.filter((preset) => !fields.some((f) => f.key === preset.key));

  return (
    <section className="rounded-[14px] border border-border bg-surface p-5">
      <h3 className="font-display text-lg font-semibold text-ink">Dados do candidato</h3>
      <p className="mb-3 text-xs text-muted">Preenchidos pelo próprio candidato no link.</p>
      {fields.length === 0 ? (
        <p className="text-sm text-muted">Nenhum dado pedido neste onboarding.</p>
      ) : (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.id} className="min-w-0 border-b border-border pb-2">
              <dt className="flex items-center gap-2 text-xs text-muted">
                {f.label}
                {!f.required && <span>(opcional)</span>}
                {editable && f.key !== "nome" && (
                  <span className="ml-auto flex gap-2">
                    <button type="button" onClick={() => onToggle(f)} className="font-semibold hover:text-ink">
                      {f.required ? "tornar opcional" : "tornar obrigatório"}
                    </button>
                    <button type="button" onClick={() => onRemove(f)} className="font-semibold hover:text-critical">
                      retirar
                    </button>
                  </span>
                )}
              </dt>
              <dd className={`mt-0.5 whitespace-pre-line break-words text-sm ${f.value ? "text-ink" : "italic text-muted"}`}>
                {f.value ? (f.type === "date" ? formatDateBR(f.value) : f.value) : "não preenchido"}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {editable && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {missingPresets.map((preset) => (
            <button
              key={preset.key}
              type="button"
              onClick={() => onAdd({ key: preset.key })}
              className="rounded-full border border-border-strong px-3 py-1 text-xs font-semibold text-muted hover:text-ink"
            >
              + {preset.label}
            </button>
          ))}
          <form
            className="flex min-w-[16rem] flex-1 gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const label = extra.trim();
              if (!label) return;
              await onAdd({ label });
              setExtra("");
            }}
          >
            <input
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder="Pedir outro dado (ex.: Tamanho da camiseta)"
              className={inputClass(false)}
            />
            <Button type="submit" variant="ghost" className="!px-4 shrink-0 text-xs">
              <IconPlus className="h-3.5 w-3.5" />
              Pedir
            </Button>
          </form>
        </div>
      )}
    </section>
  );
}

/** Informações que só o RH preenche (o candidato não vê). */
function InternalInfoCard({
  admission,
  departments,
  companies,
  editable,
  onSave,
}: {
  admission: AdmissionInfo;
  departments: string[];
  companies: ContractingCompanyInfo[];
  editable: boolean;
  onSave: (body: Record<string, string>) => Promise<void>;
}) {
  const initial = () => ({
    role: admission.role ?? "",
    department: admission.department ?? "",
    startDate: admission.startDate ? admission.startDate.slice(0, 10) : "",
    notes: admission.notes ?? "",
    contractingCompanyId: admission.contractingCompanyId ?? "",
  });
  const company = companies.find((c) => c.id === admission.contractingCompanyId);
  const [values, setValues] = useState(initial);
  const [editing, setEditing] = useState(false);
  const set = (key: keyof ReturnType<typeof initial>, value: string) => setValues((v) => ({ ...v, [key]: value }));

  if (!editing) {
    return (
      <section className="flex flex-wrap items-start justify-between gap-3 rounded-[14px] border border-border bg-surface p-5">
        <div className="min-w-0">
          <h3 className="font-display text-lg font-semibold text-ink">Dados internos</h3>
          <p className="text-sm text-muted">
            {[admission.role && `Cargo: ${admission.role}`, admission.department && `Setor: ${admission.department}`, admission.startDate && `Início: ${formatDateBR(admission.startDate)}`]
              .filter(Boolean)
              .join(" · ") || "Cargo, setor e início ainda não informados."}
          </p>
          <p className="text-sm text-muted">
            Empresa contratante (acordo de confidencialidade):{" "}
            {company ? <span className="text-ink">{company.name}</span> : "nenhuma — o candidato não recebe o acordo"}
          </p>
          {admission.notes && <p className="mt-1 whitespace-pre-line text-sm text-ink">{admission.notes}</p>}
          <p className="mt-1 text-xs text-muted">Só o RH vê. Cargo e setor vão para o cadastro do colaborador ao concluir.</p>
        </div>
        {editable && (
          <Button
            variant="ghost"
            className="!px-4 !py-1.5 text-xs"
            onClick={() => {
              setValues(initial());
              setEditing(true);
            }}
          >
            Editar
          </Button>
        )}
      </section>
    );
  }

  return (
    <form
      className="grid grid-cols-1 gap-4 rounded-[14px] border border-border bg-surface p-5 sm:grid-cols-3"
      onSubmit={async (e) => {
        e.preventDefault();
        // A rota grava o registro inteiro: manda junto o que o candidato preencheu.
        await onSave({
          ...values,
          candidateName: admission.candidateName ?? "",
          email: admission.email ?? "",
          phone: admission.phone ?? "",
        });
        setEditing(false);
      }}
    >
      <h3 className="font-display text-lg font-semibold text-ink sm:col-span-3">Dados internos</h3>
      <Field label="Cargo">
        <input value={values.role} onChange={(e) => set("role", e.target.value)} className={inputClass(false)} autoFocus />
      </Field>
      <Field label="Setor">
        <input
          value={values.department}
          onChange={(e) => set("department", e.target.value)}
          className={inputClass(false)}
          list="admission-departments"
        />
        <datalist id="admission-departments">
          {departments.map((dep) => (
            <option key={dep} value={dep} />
          ))}
        </datalist>
      </Field>
      <Field label="Início previsto">
        <input
          type="date"
          value={values.startDate}
          onChange={(e) => set("startDate", e.target.value)}
          className={inputClass(false) + " font-mono"}
        />
      </Field>
      <Field label="Empresa contratante (acordo de confidencialidade)" className="sm:col-span-3">
        <select
          value={values.contractingCompanyId}
          onChange={(e) => set("contractingCompanyId", e.target.value)}
          className={inputClass(false)}
        >
          <option value="">Nenhuma — sem acordo de confidencialidade</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Observações (só o RH vê)" className="sm:col-span-3">
        <textarea value={values.notes} onChange={(e) => set("notes", e.target.value)} rows={2} className={inputClass(false) + " resize-y"} />
      </Field>
      <div className="flex gap-2 sm:col-span-3">
        <Button type="submit" className="!px-4 !py-1.5 text-xs">
          Salvar
        </Button>
        <Button type="button" variant="ghost" className="!px-4 !py-1.5 text-xs" onClick={() => setEditing(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
