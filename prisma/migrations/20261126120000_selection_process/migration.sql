-- Processos seletivos: vagas e candidatos (funil, devolutivas e banco de talentos).
CREATE TABLE "JobOpening" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "department" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 2,
    "status" TEXT NOT NULL DEFAULT 'aberta',
    "openedAt" DATETIME NOT NULL,
    "filledAt" DATETIME,
    "positions" INTEGER NOT NULL DEFAULT 1,
    "extraPhase1" INTEGER NOT NULL DEFAULT 0,
    "extraHired" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "JobOpening_status_idx" ON "JobOpening"("status");

CREATE TABLE "JobCandidate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT,
    "jobTitle" TEXT,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "stage" TEXT NOT NULL,
    "phase1Date" DATETIME,
    "phase2Date" DATETIME,
    "phase3Date" DATETIME,
    "notes" TEXT,
    "feedbackDue" DATETIME,
    "feedbackAt" DATETIME,
    "feedbackBy" TEXT,
    "feedbackType" TEXT,
    "feedbackNote" TEXT,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "JobCandidate_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "JobOpening" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "JobCandidate_jobId_idx" ON "JobCandidate"("jobId");
CREATE INDEX "JobCandidate_stage_idx" ON "JobCandidate"("stage");
