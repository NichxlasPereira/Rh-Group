-- Avisos do calendário já mandados no Slack (para não repetir).
CREATE TABLE "CalendarReminderLog" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
