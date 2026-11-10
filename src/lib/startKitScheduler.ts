import { sendStartKitReminders } from "./startKit";

const HOUR = 60 * 60 * 1000;
const globalForKit = globalThis as unknown as { startKitTimer?: NodeJS.Timeout };

/** Lembretes do kit de início: uma conferência logo após subir e depois de hora em hora. */
export function startStartKitScheduler(): void {
  if (globalForKit.startKitTimer) return;
  const run = () => sendStartKitReminders().catch((err) => console.error("Lembretes do kit de início:", err));
  setTimeout(run, 60_000).unref();
  globalForKit.startKitTimer = setInterval(run, HOUR);
  globalForKit.startKitTimer.unref();
}
