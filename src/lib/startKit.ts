import { prisma } from "./prisma";
import { SlackError, slackApi, slackConfig, slackEscape, slackMention } from "./slack";

/**
 * Kit de início: ao concluir o onboarding, o RHGroup monta a lista do que a
 * pessoa precisa no primeiro dia (pelos itens cadastrados para a empresa e a
 * área dela) e manda para um canal do Slack, com um botão "Pronto" por item.
 * Quem resolve marca ali mesmo (ou o RH marca na ficha) e a mensagem se atualiza.
 */

export const CHANNEL_SETTING = "kit_slack_canal";
/** Lembrete no Slack quando faltar até tantos dias para o início e ainda houver itens. */
export const REMINDER_DAYS = 3;

export const SUGGESTED_ITEMS: { name: string; responsible: string }[] = [
  { name: "E-mail corporativo", responsible: "TI" },
  { name: "Acesso ao Slack", responsible: "TI" },
  { name: "Notebook configurado", responsible: "TI" },
  { name: "Acessos aos sistemas da área", responsible: "Gestor" },
  { name: "Crachá", responsible: "RH" },
];

export async function kitChannel(): Promise<string | null> {
  const s = await prisma.appSetting.findUnique({ where: { key: CHANNEL_SETTING } });
  return s?.value || null;
}

export async function setKitChannel(channel: string | null): Promise<void> {
  if (!channel) await prisma.appSetting.deleteMany({ where: { key: CHANNEL_SETTING } });
  else await prisma.appSetting.upsert({ where: { key: CHANNEL_SETTING }, create: { key: CHANNEL_SETTING, value: channel }, update: { value: channel } });
}

const REQUEST_INCLUDE = {
  tasks: { orderBy: [{ sortOrder: "asc" as const }, { name: "asc" as const }] },
  employee: { select: { id: true, name: true, role: true, department: true, areaId: true, managerId: true, startDate: true } },
};

type RequestRow = NonNullable<Awaited<ReturnType<typeof loadRequest>>>;

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

/** Mensagem do Slack (blocos) com a situação atual de cada item. */
async function buildMessage(req: RequestRow) {
  const { area, manager } = await contextFor(req);
  const start = req.startDate ?? req.employee.startDate;
  const done = req.tasks.filter((t) => t.doneAt).length;
  const total = req.tasks.length;
  const allDone = total > 0 && done === total;
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
    { type: "section", fields },
    { type: "divider" },
  ];
  for (const t of req.tasks) {
    const who = [slackEscape(t.responsible), slackMention(t.slackMention)].filter(Boolean).join(" ");
    blocks.push(
      t.doneAt
        ? {
            type: "section",
            text: { type: "mrkdwn", text: `:white_check_mark: ~${slackEscape(t.name)}~  ·  ${who}\n_pronto${t.doneBy ? ` por ${slackEscape(t.doneBy)}` : ""}_` },
            accessory: { type: "button", text: { type: "plain_text", text: "Desfazer" }, action_id: "kit_desfazer", value: t.id },
          }
        : {
            type: "section",
            text: { type: "mrkdwn", text: `:white_square: *${slackEscape(t.name)}*  ·  ${who}` },
            accessory: { type: "button", style: "primary", text: { type: "plain_text", text: "Pronto" }, action_id: "kit_pronto", value: t.id },
          }
    );
  }
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: allDone
          ? ":tada: Tudo pronto para o primeiro dia."
          : `${done} de ${total} prontos · clique em *Pronto* quando resolver o seu item.`,
      },
    ],
  });
  const text = `Kit de início: ${req.employee.name} começa em ${when} — ${total - done} ${total - done === 1 ? "item" : "itens"} para preparar.`;
  return { blocks, text };
}

/** Manda (ou reenvia) a mensagem do pedido no canal configurado. Nunca lança: guarda o erro no pedido. */
export async function postStartKit(requestId: string): Promise<void> {
  const req = await loadRequest(requestId);
  if (!req) return;
  const channel = await kitChannel();
  const fail = (message: string) => prisma.startKitRequest.update({ where: { id: requestId }, data: { slackError: message } });
  if (!slackConfig()) return void (await fail("Slack não configurado (falta SLACK_BOT_TOKEN no Railway)."));
  if (!channel) return void (await fail("Escolha o canal do Slack em Onboarding › Kit de início."));
  if (req.tasks.length === 0) return void (await fail("Nenhum item do kit vale para esta pessoa. Cadastre itens em Onboarding › Kit de início."));
  try {
    const message = await buildMessage(req);
    const res = await slackApi<{ channel: string; ts: string }>("chat.postMessage", { channel, ...message, unfurl_links: false });
    await prisma.startKitRequest.update({ where: { id: requestId }, data: { slackChannel: res.channel, slackTs: res.ts, slackError: null } });
  } catch (err) {
    await fail(err instanceof SlackError ? err.message : "Falha inesperada ao enviar para o Slack.");
  }
}

/** Atualiza a mensagem já enviada (depois de marcar ou desmarcar um item). */
export async function refreshStartKitMessage(requestId: string): Promise<void> {
  const req = await loadRequest(requestId);
  if (!req?.slackChannel || !req.slackTs) return;
  try {
    const message = await buildMessage(req);
    await slackApi("chat.update", { channel: req.slackChannel, ts: req.slackTs, ...message });
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
        create: items.map((i, index) => ({ name: i.name, responsible: i.responsible, slackMention: i.slackMention, sortOrder: index })),
      },
    },
  });
  await postStartKit(req.id);
  return req.id;
}

/** Marca ou desmarca um item, no RHGroup ou pelo botão do Slack, e atualiza a mensagem. */
export async function setTaskDone(taskId: string, done: boolean, by: string, via: "slack" | "rhgroup"): Promise<string | null> {
  const task = await prisma.startKitTask.findUnique({ where: { id: taskId }, select: { requestId: true } });
  if (!task) return null;
  await prisma.startKitTask.update({
    where: { id: taskId },
    data: done ? { doneAt: new Date(), doneBy: by.slice(0, 120), doneVia: via } : { doneAt: null, doneBy: null, doneVia: null },
  });
  await refreshStartKitMessage(task.requestId);
  return task.requestId;
}

/**
 * Lembrete: para cada pedido com itens pendentes e início em até
 * REMINDER_DAYS dias, responde na conversa da mensagem marcando os
 * responsáveis do que falta. Uma vez por pedido.
 */
export async function sendStartKitReminders(): Promise<number> {
  if (!slackConfig()) return 0;
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const limit = new Date(today + REMINDER_DAYS * 86_400_000);
  const due = await prisma.startKitRequest.findMany({
    where: {
      reminderSentAt: null,
      slackTs: { not: null },
      startDate: { gte: new Date(today), lte: limit },
      tasks: { some: { doneAt: null } },
    },
    include: REQUEST_INCLUDE,
  });
  let sent = 0;
  for (const req of due) {
    const pending = req.tasks.filter((t) => !t.doneAt);
    const lines = pending.map((t) => `• *${slackEscape(t.name)}* · ${[slackEscape(t.responsible), slackMention(t.slackMention)].filter(Boolean).join(" ")}`);
    const days = daysUntil(req.startDate!);
    const when = days === 0 ? "hoje" : days === 1 ? "amanhã" : `em ${days} dias`;
    try {
      await slackApi("chat.postMessage", {
        channel: req.slackChannel,
        thread_ts: req.slackTs,
        reply_broadcast: true,
        text: `:alarm_clock: ${slackEscape(req.employee.name)} começa ${when} e ainda falta:\n${lines.join("\n")}`,
      });
      await prisma.startKitRequest.update({ where: { id: req.id }, data: { reminderSentAt: new Date() } });
      sent++;
    } catch (err) {
      await prisma.startKitRequest.update({
        where: { id: req.id },
        data: { slackError: err instanceof SlackError ? err.message : "Falha ao mandar o lembrete no Slack." },
      });
    }
  }
  return sent;
}

/** Pedidos do colaborador (o mais novo primeiro), para a ficha. */
export async function startKitsFor(employeeId: string) {
  const rows = await prisma.startKitRequest.findMany({
    where: { employeeId },
    orderBy: { createdAt: "desc" },
    include: { tasks: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
  });
  return rows.map((r) => ({
    id: r.id,
    startDate: r.startDate?.toISOString() ?? null,
    sentToSlack: !!r.slackTs,
    slackError: r.slackError,
    reminderSentAt: r.reminderSentAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    createdBy: r.createdBy,
    tasks: r.tasks.map((t) => ({
      id: t.id,
      name: t.name,
      responsible: t.responsible,
      doneAt: t.doneAt?.toISOString() ?? null,
      doneBy: t.doneBy,
      doneVia: t.doneVia,
    })),
  }));
}

export type StartKitView = Awaited<ReturnType<typeof startKitsFor>>[number];
