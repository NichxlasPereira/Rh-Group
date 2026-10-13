-- CreateTable
CREATE TABLE "ContractingCompany" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "qualification" TEXT NOT NULL,
    "signerName" TEXT NOT NULL,
    "signerRole" TEXT NOT NULL,
    "signerCpf" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Admission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "candidateName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "role" TEXT,
    "department" TEXT,
    "startDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'em_andamento',
    "notes" TEXT,
    "tokenHash" TEXT NOT NULL,
    "tokenExpiresAt" DATETIME NOT NULL,
    "createdBy" TEXT,
    "employeeId" TEXT,
    "driveStatus" TEXT,
    "driveFolderId" TEXT,
    "driveFolderUrl" TEXT,
    "driveError" TEXT,
    "driveSyncedAt" DATETIME,
    "submittedAt" DATETIME,
    "contractingCompanyId" TEXT,
    "sheetStatus" TEXT,
    "sheetError" TEXT,
    "sheetSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Admission_contractingCompanyId_fkey" FOREIGN KEY ("contractingCompanyId") REFERENCES "ContractingCompany" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Admission" ("candidateName", "createdAt", "createdBy", "department", "driveError", "driveFolderId", "driveFolderUrl", "driveStatus", "driveSyncedAt", "email", "employeeId", "id", "notes", "phone", "role", "sheetError", "sheetStatus", "sheetSyncedAt", "startDate", "status", "submittedAt", "tokenExpiresAt", "tokenHash", "updatedAt") SELECT "candidateName", "createdAt", "createdBy", "department", "driveError", "driveFolderId", "driveFolderUrl", "driveStatus", "driveSyncedAt", "email", "employeeId", "id", "notes", "phone", "role", "sheetError", "sheetStatus", "sheetSyncedAt", "startDate", "status", "submittedAt", "tokenExpiresAt", "tokenHash", "updatedAt" FROM "Admission";
DROP TABLE "Admission";
ALTER TABLE "new_Admission" RENAME TO "Admission";
CREATE UNIQUE INDEX "Admission_tokenHash_key" ON "Admission"("tokenHash");
CREATE TABLE "new_AdmissionDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "admissionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'upload',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "reviewNote" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AdmissionDocument_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AdmissionDocument" ("admissionId", "createdAt", "description", "id", "name", "required", "reviewNote", "reviewedAt", "reviewedBy", "sortOrder", "status", "updatedAt") SELECT "admissionId", "createdAt", "description", "id", "name", "required", "reviewNote", "reviewedAt", "reviewedBy", "sortOrder", "status", "updatedAt" FROM "AdmissionDocument";
DROP TABLE "AdmissionDocument";
ALTER TABLE "new_AdmissionDocument" RENAME TO "AdmissionDocument";
CREATE INDEX "AdmissionDocument_admissionId_idx" ON "AdmissionDocument"("admissionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
