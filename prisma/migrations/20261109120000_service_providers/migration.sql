-- CreateTable
CREATE TABLE "ServiceProvider" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "birthDate" DATETIME,
    "rg" TEXT,
    "cpf" TEXT,
    "taxId" TEXT,
    "phone" TEXT,
    "emergencyContact" TEXT,
    "personalEmail" TEXT,
    "corporateEmail" TEXT,
    "address" TEXT,
    "cep" TEXT,
    "registration" TEXT,
    "department" TEXT,
    "role" TEXT,
    "area" TEXT,
    "contractStart" DATETIME,
    "contractEnd" DATETIME,
    "amountCents" INTEGER,
    "billing" TEXT NOT NULL DEFAULT 'mensal',
    "pixKey" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ServiceProviderDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "providerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storedName" TEXT NOT NULL,
    "uploadedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceProviderDocument_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ServiceProvider" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServiceProviderInvoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "providerId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "number" TEXT,
    "amountCents" INTEGER,
    "issueDate" DATETIME,
    "fileName" TEXT,
    "mimeType" TEXT,
    "size" INTEGER,
    "storedName" TEXT,
    "notes" TEXT,
    "uploadedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceProviderInvoice_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ServiceProvider" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ServiceProvider_contractEnd_idx" ON "ServiceProvider"("contractEnd");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceProviderDocument_storedName_key" ON "ServiceProviderDocument"("storedName");

-- CreateIndex
CREATE INDEX "ServiceProviderDocument_providerId_idx" ON "ServiceProviderDocument"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceProviderInvoice_storedName_key" ON "ServiceProviderInvoice"("storedName");

-- CreateIndex
CREATE INDEX "ServiceProviderInvoice_providerId_month_idx" ON "ServiceProviderInvoice"("providerId", "month");

-- CreateIndex
CREATE INDEX "ServiceProviderInvoice_month_idx" ON "ServiceProviderInvoice"("month");
