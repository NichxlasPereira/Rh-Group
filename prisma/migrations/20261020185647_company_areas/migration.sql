-- CreateTable
CREATE TABLE "CompanyArea" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompanyArea_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "ContractingCompany" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Employee_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "CompanyArea" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Employee" ("active", "contractEnd", "contractType", "createdAt", "department", "folgaAllowance", "id", "name", "role", "startDate", "updatedAt") SELECT "active", "contractEnd", "contractType", "createdAt", "department", "folgaAllowance", "id", "name", "role", "startDate", "updatedAt" FROM "Employee";
DROP TABLE "Employee";
ALTER TABLE "new_Employee" RENAME TO "Employee";
CREATE INDEX "Employee_name_idx" ON "Employee"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "CompanyArea_companyId_name_key" ON "CompanyArea"("companyId", "name");
