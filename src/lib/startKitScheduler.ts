import { sendStartKitReminders } from "./startKit";
import { sendCalendarReminders } from "./calendarReminders";
import { discardOldHires } from "./selecaoServer";

const HOUR = 60 * 60 * 1000;
const globalForKit = globalThis as unknown as { startKitTimer?: NodeJS.Timeout };

/**
 * Lembretes no Slack: kit de início e avisos do calendário do RH. Uma
 * conferência logo após subir e depois de hora em hora.
 */
export function startStartKitScheduler(): void {
  if (globalForKit.startKitTimer) return;
  const run = async () => {
    await sendStartKitReminders().catch((err) => console.error("Lembretes do kit de início:", err));
    await sendCalendarReminders().catch((err) => console.error("Avisos do calendário:", err));
    await discardOldHires().catch((err) => console.error("Descarte de contratados:", err));
  };
  setTimeout(run, 60_000).unref();
  globalForKit.startKitTimer = setInterval(run, HOUR);
  globalForKit.startKitTimer.unref();
}
