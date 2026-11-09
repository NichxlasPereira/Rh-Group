-- Prestadores: o mesmo cadastro do colaborador + início e validade do contrato.
-- Os campos pessoais da primeira versão saem (nunca foram para produção).
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ServiceProvider" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "department" TEXT,
    "role" TEXT,
    "area" TEXT,
    "contractStart" DATETIME,
    "contractEnd" DATETIME,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ServiceProvider" ("active", "area", "contractEnd", "contractStart", "createdAt", "createdBy", "department", "id", "name", "role", "updatedAt") SELECT "active", "area", "contractEnd", "contractStart", "createdAt", "createdBy", "department", "id", "name", "role", "updatedAt" FROM "ServiceProvider";
DROP TABLE "ServiceProvider";
ALTER TABLE "new_ServiceProvider" RENAME TO "ServiceProvider";
CREATE INDEX "ServiceProvider_contractEnd_idx" ON "ServiceProvider"("contractEnd");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
