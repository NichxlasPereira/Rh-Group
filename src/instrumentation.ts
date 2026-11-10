/**
 * Roda uma vez quando o servidor sobe. No Node, liga os lembretes do kit de
 * início (Slack) — confere de hora em hora.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startStartKitScheduler } = await import("./lib/startKitScheduler");
    startStartKitScheduler();
  }
}
