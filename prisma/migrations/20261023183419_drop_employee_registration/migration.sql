/*
  Warnings:

  - You are about to drop the column `registration` on the `Employee` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Employee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "department" TEXT,
    "role" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "folgaAllowance" INTEGER NOT NULL DEFAULT 0,
    "startDate" DATETIME,
    "contractType" TEXT,
    "contractEnd" DATETIME,
    "areaId" TEXT,
    "areaLead" BOOLEAN NOT NULL DEFAULT false,
    "birthDate" DATETIME,
    "rg" TEXT,
    "cpf" TEXT,
    "phone" TEXT,
    "emergencyContact" TEXT,
    "personalEmail" TEXT,
    "corporateEmail" TEXT,
    "address" TEXT,
    "cep" TEXT,
    "jobFunction" TEXT,
    "pixKeys" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Employee_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "CompanyArea" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Employee" ("active", "address", "areaId", "areaLead", "birthDate", "cep", "contractEnd", "contractType", "corporateEmail", "cpf", "createdAt", "department", "emergencyContact", "folgaAllowance", "id", "jobFunction", "name", "personalEmail", "phone", "pixKeys", "rg", "role", "startDate", "updatedAt") SELECT "active", "address", "areaId", "areaLead", "birthDate", "cep", "contractEnd", "contractType", "corporateEmail", "cpf", "createdAt", "department", "emergencyContact", "folgaAllowance", "id", "jobFunction", "name", "personalEmail", "phone", "pixKeys", "rg", "role", "startDate", "updatedAt" FROM "Employee";
DROP TABLE "Employee";
ALTER TABLE "new_Employee" RENAME TO "Employee";
CREATE INDEX "Employee_name_idx" ON "Employee"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
