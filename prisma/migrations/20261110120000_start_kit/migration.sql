-- CreateTable
CREATE TABLE "StartKitItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "responsible" TEXT NOT NULL,
    "slackMention" TEXT,
    "department" TEXT,
    "area" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "StartKitRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "admissionId" TEXT,
    "startDate" DATETIME,
    "slackChannel" TEXT,
    "slackTs" TEXT,
    "slackError" TEXT,
    "reminderSentAt" DATETIME,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StartKitRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StartKitTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "responsible" TEXT NOT NULL,
    "slackMention" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "doneAt" DATETIME,
    "doneBy" TEXT,
    "doneVia" TEXT,
    CONSTRAINT "StartKitTask_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "StartKitRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "StartKitRequest_employeeId_idx" ON "StartKitRequest"("employeeId");

-- CreateIndex
CREATE INDEX "StartKitTask_requestId_idx" ON "StartKitTask"("requestId");
