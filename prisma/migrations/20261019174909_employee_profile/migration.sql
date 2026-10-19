-- AlterTable
ALTER TABLE "Employee" ADD COLUMN "contractEnd" DATETIME;
ALTER TABLE "Employee" ADD COLUMN "contractType" TEXT;
ALTER TABLE "Employee" ADD COLUMN "startDate" DATETIME;

-- CreateTable
CREATE TABLE "EmployeeDataView" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "viewedBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmployeeDataView_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "EmployeeDataView_employeeId_idx" ON "EmployeeDataView"("employeeId");

-- Quem entrou pelo onboarding digital já tem a data de início: vira a data de entrada.
UPDATE "Employee"
SET "startDate" = (
  SELECT a."startDate" FROM "Admission" a
  WHERE a."employeeId" = "Employee"."id" AND a."status" = 'concluida' AND a."startDate" IS NOT NULL
  ORDER BY a."updatedAt" DESC LIMIT 1
)
WHERE "startDate" IS NULL;
