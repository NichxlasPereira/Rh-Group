-- AlterTable
ALTER TABLE "Admission" ADD COLUMN "closedAt" DATETIME;

-- AlterTable
ALTER TABLE "AdmissionDocument" ADD COLUMN "companySignedAt" DATETIME;
ALTER TABLE "AdmissionDocument" ADD COLUMN "companySignedBy" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AdmissionFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storedName" TEXT NOT NULL,
    "origin" TEXT NOT NULL DEFAULT 'candidato',
    "driveFileId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdmissionFile_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "AdmissionDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AdmissionFile" ("createdAt", "documentId", "driveFileId", "fileName", "id", "mimeType", "size", "storedName") SELECT "createdAt", "documentId", "driveFileId", "fileName", "id", "mimeType", "size", "storedName" FROM "AdmissionFile";
DROP TABLE "AdmissionFile";
ALTER TABLE "new_AdmissionFile" RENAME TO "AdmissionFile";
CREATE UNIQUE INDEX "AdmissionFile_storedName_key" ON "AdmissionFile"("storedName");
CREATE INDEX "AdmissionFile_documentId_idx" ON "AdmissionFile"("documentId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Onboardings já cancelados contam os 90 dias a partir da última alteração.
UPDATE "Admission" SET "closedAt" = "updatedAt" WHERE "status" = 'cancelada' AND "closedAt" IS NULL;
