import { prisma } from "./prisma";
import { SlackError, slackApi, slackConfig, slackEscape } from "./slack";

/**
 * Kit de início: ao concluir o onboarding, o RHGroup monta a lista do que a
 * pessoa precisa no primeiro dia (pelos itens cadastrados para a empresa e a
 * área dela) e manda, por mensagem direta no Slack, a cada responsável só os
 * itens dele — com um botão "Pronto" por item. Quem resolve marca ali mesmo
 * (ou o RH marca na ficha) e a mensagem se atualiza.
 */

/** Lembrete quando faltar até tantos dias para o início e ainda houver itens. */
export const REMINDER_DAYS = 3;

export const SUGGESTED_ITEMS: { name: string; responsible: string }[] = [
  { name: "E-mail corporativo", responsible: "TI" },
  { name: "Acesso ao Slack", responsible: "TI" },
  { name: "Notebook configurado", responsible: "TI" },
  { name: "Acessos aos sistemas da área", responsible: "Gestor" },
  { name: "Crachá", responsible: "RH" },
];

const REQUEST_INCLUDE = {
  tasks: { orderBy: [{ sortOrder: "asc" as const }, { name: "asc" as const }] },
  messages: true,
  employee: { select: { id: true, name: true, role: true, department: true, areaId: true, managerId: true, startDate: true } },
};

type RequestRow = NonNullable<Awaited<ReturnType<typeof loadRequest>>>;
type TaskRow = RequestRow["tasks"][number];

function loadRequest(id: string) {
  return prisma.startKitRequest.findUnique({ where: { id }, include: REQUEST_INCLUDE });
}

const dateBR = (d: Date) => d.toISOString().slice(0, 10).split("-").reverse().join("/");

function daysUntil(d: Date): number {
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((d.getTime() - today) / 86_400_000);
}

/** Itens do kit que valem para esta pessoa (empresa e área; vazio = todos). */
async function itemsFor(department: string | null, areaName: string | null) {
  const items = await prisma.startKitItem.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  return items.filter((i) => (!i.department || i.department === department) && (!i.area || i.area === areaName));
}

async function contextFor(req: RequestRow) {
  const [area, manager] = await Promise.all([
    req.employee.areaId ? prisma.companyArea.findUnique({ where: { id: req.employee.areaId }, select: { name: true } }) : null,
    req.employee.managerId ? prisma.employee.findUnique({ where: { id: req.employee.managerId }, select: { name: true } }) : null,
  ]);
  return { area: area?.name ?? null, manager: manager?.name ?? null };
}

/** Itens de cada responsável no Slack (ID → itens). Itens sem pessoa ficam de fora. */
function tasksByRecipient(tasks: TaskRow[]): Map<string, TaskRow[]> {
  const map = new Map<string, TaskRow[]>();
  for (const t of tasks) {
    if (!t.slackMention) continue;
    map.set(t.slackMention, [...(map.get(t.slackMention) ?? []), t]);
  }
  return map;
}

/** Mensagem direta (blocos) para um responsável, só com os itens dele. */
async function buildMessage(req: RequestRow, tasks: TaskRow[]) {
  const { area, manager } = await contextFor(req);
  const start = req.startDate ?? req.employee.startDate;
  const done = tasks.filter((t) => t.doneAt).length;
  const total = tasks.length;
  const when = start
    ? `${dateBR(start)}${daysUntil(start) >= 0 ? ` (em ${daysUntil(start)} ${daysUntil(start) === 1 ? "dia" : "dias"})` : ""}`
    : "a definir";

  const fields = [
    ["Empresa", req.employee.department],
    ["Cargo", req.employee.role],
    ["Área", area],
    ["Gestor", manager],
    ["Começa em", when],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => ({ type: "mrkdwn", text: `*${k}*\n${slackEscape(String(v))}` }));

  const blocks: Record<string, unknown>[] = [
    { type: "header", text: { type: "plain_text", text: `Kit de início — ${req.employee.name}`.slice(0, 150) } },
    { type: "section", text: { type: "mrkdwn", text: "Um colaborador novo está chegando. Estes itens são com você:" } },
    { type: "section", fields },
    { type: "divider" },
  ];
  for (const t of tasks) {
    blocks.push(
      t.doneAt
        ? {
            type: "section",
            text: { type: "mrkdwn", text: `:white_check_mark: ~${slackEscape(t.name)}~\n_pronto${t.doneBy ? ` por ${slackEscape(t.doneBy)}` : ""}_` },
            accessory: { type: "button", text: { type: "plain_text", text: "Desfazer" }, action_id: "kit_desfazer", value: t.id },
          }
        : {
            type: "section",
            text: { type: "mrkdwn", text: `:white_square: *${slackEscape(t.name)}*` },
            accessory: { type: "button", style: "primary", text: { type: "plain_text", text: "Pronto" }, action_id: "kit_pronto", value: t.id },
          }
    );
  }
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: done === total ? ":tada: Tudo pronto da sua parte. Obrigado!" : `${done} de ${total} ${total === 1 ? "pronto" : "prontos"} · clique em *Pronto* quando resolver.`,
      },
    ],
  });
  const text = `Kit de início: ${req.employee.name} começa em ${when} — ${total - done} ${total - done === 1 ? "item seu" : "itens seus"} para preparar.`;
  return { blocks, text };
}

/**
 * Manda a mensagem direta para cada responsável que ainda não recebeu. Nunca
 * lança: o que der errado fica no pedido (slackError) e aparece na ficha.
 */
export async function postStartKit(requestId: string): Promise<void> {
  const req = await loadRequest(requestId);
  if (!req) return;
  const problems: string[] = [];
  const withoutPerson = req.tasks.filter((t) => !t.slackMention);
  if (withoutPerson.length) {
    problems.push(`Sem pessoa no Slack: ${withoutPerson.map((t) => t.name).join(", ")}. Escolha quem recebe em Onboarding › Kit de início.`);
  }
  if (req.tasks.length === 0) problems.push("Nenhum item do kit vale para esta pessoa. Cadastre itens em Onboarding › Kit de início.");

  const groups = tasksByRecipient(req.tasks);
  if (groups.size > 0 && !slackConfig()) {
    problems.push("Slack não configurado (falta SLACK_BOT_TOKEN no Railway).");
  } else {
    const sent = new Set(req.messages.map((m) => m.slackUserId));
    for (const [userId, tasks] of groups) {
      if (sent.has(userId)) continue;
      try {
        const res = await slackApi<{ channel: string; ts: string }>("chat.postMessage", {
          channel: userId, // ID da pessoa: o Slack entrega como mensagem direta do app
          ...(await buildMessage(req, tasks)),
          unfurl_links: false,
        });
        await prisma.startKitMessage.create({ data: { requestId, slackUserId: userId, channel: res.channel, ts: res.ts } });
      } catch (err) {
        const who = tasks[0].slackUserName ?? userId;
        problems.push(`${who}: ${err instanceof SlackError ? err.message : "falha ao enviar."}`);
      }
    }
  }
  await prisma.startKitRequest.update({ where: { id: requestId }, data: { slackError: problems.length ? problems.join(" ") : null } });
}

/** Atualiza a mensagem do responsável por este item (depois de marcar ou desmarcar). */
async function refreshFor(requestId: string, slackUserId: string | null): Promise<void> {
  if (!slackUserId) return;
  const req = await loadRequest(requestId);
  const message = req?.messages.find((m) => m.slackUserId === slackUserId);
  if (!req || !message) return;
  const tasks = req.tasks.filter((t) => t.slackMention === slackUserId);
  try {
    await slackApi("chat.update", { channel: message.channel, ts: message.ts, ...(await buildMessage(req, tasks)) });
  } catch (err) {
    await prisma.startKitRequest.update({
      where: { id: requestId },
      data: { slackError: err instanceof SlackError ? err.message : "Falha ao atualizar a mensagem no Slack." },
    });
  }
}

/**
 * Cria o pedido do kit para o colaborador e manda no Slack. Usado ao concluir
 * o onboarding (uma vez por onboarding) e pelo botão da ficha.
 */
export async function createStartKit(
  employeeId: string,
  opts: { admissionId?: string | null; startDate?: Date | null; createdBy?: string | null } = {}
): Promise<string | null> {
  if (opts.admissionId) {
    const existing = await prisma.startKitRequest.findFirst({ where: { admissionId: opts.admissionId }, select: { id: true } });
    if (existing) return existing.id;
  }
  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { department: true, areaId: true, startDate: true } });
  if (!employee) return null;
  const area = employee.areaId ? await prisma.companyArea.findUnique({ where: { id: employee.areaId }, select: { name: true } }) : null;
  const items = await itemsFor(employee.department, area?.name ?? null);
  const req = await prisma.startKitRequest.create({
    data: {
      employeeId,
      admissionId: opts.admissionId ?? null,
      startDate: opts.startDate ?? employee.startDate ?? null,
      createdBy: opts.createdBy ?? null,
      tasks: {
        create: items.map((i, index) => ({
          name: i.name,
          responsible: i.responsible,
          slackMention: i.slackMention,
          slackUserName: i.slackUserName,
          sortOrder: index,
        })),
      },
    },
  });
  await postStartKit(req.id);
  return req.id;
}

/** Marca ou desmarca um item, no RHGroup ou pelo botão do Slack, e atualiza a mensagem. */
export async function setTaskDone(taskId: string, done: boolean, by: string, via: "slack" | "rhgroup"): Promise<string | null> {
  const task = await prisma.startKitTask.findUnique({ where: { id: taskId }, select: { requestId: true, slackMention: true } });
  if (!task) return null;
  await prisma.startKitTask.update({
    where: { id: taskId },
    data: done ? { doneAt: new Date(), doneBy: by.slice(0, 120), doneVia: via } : { doneAt: null, doneBy: null, doneVia: null },
  });
  await refreshFor(task.requestId, task.slackMention);
  return task.requestId;
}

/**
 * Lembrete: para cada pedido com itens pendentes e início em até
 * REMINDER_DAYS dias, responde na conversa de cada responsável que ainda tem
 * item pendente. Uma vez por pedido.
 */
export async function sendStartKitReminders(): Promise<number> {
  if (!slackConfig()) return 0;
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const limit = new Date(today + REMINDER_DAYS * 86_400_000);
  const due = await prisma.startKitRequest.findMany({
    where: {
      reminderSentAt: null,
      messages: { some: {} },
      startDate: { gte: new Date(today), lte: limit },
      tasks: { some: { doneAt: null } },
    },
    include: REQUEST_INCLUDE,
  });
  let sent = 0;
  for (const req of due) {
    const days = daysUntil(req.startDate!);
    const when = days === 0 ? "hoje" : days === 1 ? "amanhã" : `em ${days} dias`;
    for (const m of req.messages) {
      const pending = req.tasks.filter((t) => t.slackMention === m.slackUserId && !t.doneAt);
      if (pending.length === 0) continue;
      try {
        await slackApi("chat.postMessage", {
          channel: m.channel,
          thread_ts: m.ts,
          reply_broadcast: true,
          text: `:alarm_clock: ${slackEscape(req.employee.name)} começa ${when} e ainda falta:\n${pending.map((t) => `• *${slackEscape(t.name)}*`).join("\n")}`,
        });
        sent++;
      } catch (err) {
        await prisma.startKitRequest.update({
          where: { id: req.id },
          data: { slackError: err instanceof SlackError ? err.message : "Falha ao mandar o lembrete no Slack." },
        });
      }
    }
    await prisma.startKitRequest.update({ where: { id: req.id }, data: { reminderSentAt: new Date() } });
  }
  return sent;
}

/** Pedidos do colaborador (o mais novo primeiro), para a ficha. */
export async function startKitsFor(employeeId: string) {
  const rows = await prisma.startKitRequest.findMany({
    where: { employeeId },
    orderBy: { createdAt: "desc" },
    include: { tasks: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }, messages: { select: { slackUserId: true } } },
  });
  return rows.map((r) => {
    const sentTo = new Set(r.messages.map((m) => m.slackUserId));
    return {
      id: r.id,
      startDate: r.startDate?.toISOString() ?? null,
      sentCount: sentTo.size,
      slackError: r.slackError,
      reminderSentAt: r.reminderSentAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      createdBy: r.createdBy,
      tasks: r.tasks.map((t) => ({
        id: t.id,
        name: t.name,
        responsible: t.responsible,
        recipient: t.slackUserName,
        sent: !!t.slackMention && sentTo.has(t.slackMention),
        doneAt: t.doneAt?.toISOString() ?? null,
        doneBy: t.doneBy,
        doneVia: t.doneVia,
      })),
    };
  });
}

export type StartKitView = Awaited<ReturnType<typeof startKitsFor>>[number];

// ---------------------------------------------------------------- pessoas do Slack

export interface SlackPerson {
  id: string;
  name: string;
  title: string | null;
}

let peopleCache: { at: number; list: SlackPerson[] } | null = null;

/** Pessoas do workspace (sem bots e desativados), para escolher quem recebe cada item. */
export async function slackPeople(): Promise<SlackPerson[]> {
  if (peopleCache && Date.now() - peopleCache.at < 10 * 60_000) return peopleCache.list;
  const list: SlackPerson[] = [];
  let cursor: string | undefined;
  let pages = 0;
  do {
    const res = await slackApi<{
      members: { id: string; deleted?: boolean; is_bot?: boolean; real_name?: string; name?: string; profile?: { real_name?: string; display_name?: string; title?: string } }[];
      response_metadata?: { next_cursor?: string };
    }>("users.list", { limit: 200, ...(cursor ? { cursor } : {}) }, { form: true });
    for (const m of res.members) {
      if (m.deleted || m.is_bot || m.id === "USLACKBOT") continue;
      const name = m.profile?.real_name || m.real_name || m.profile?.display_name || m.name || m.id;
      list.push({ id: m.id, name, title: m.profile?.title || null });
    }
    cursor = res.response_metadata?.next_cursor || undefined;
  } while (cursor && ++pages < 50);
  list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  peopleCache = { at: Date.now(), list };
  return list;
}
