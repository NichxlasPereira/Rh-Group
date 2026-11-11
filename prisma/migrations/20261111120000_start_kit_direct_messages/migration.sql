-- AlterTable
ALTER TABLE "StartKitItem" ADD COLUMN "slackUserName" TEXT;

-- AlterTable
ALTER TABLE "StartKitTask" ADD COLUMN "slackUserName" TEXT;

-- CreateTable
CREATE TABLE "StartKitMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "slackUserId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "ts" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StartKitMessage_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "StartKitRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "StartKitMessage_requestId_slackUserId_key" ON "StartKitMessage"("requestId", "slackUserId");
