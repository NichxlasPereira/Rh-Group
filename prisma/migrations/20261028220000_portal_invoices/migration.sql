-- CreateTable
CREATE TABLE "PortalAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "passwordHash" TEXT,
    "inviteTokenHash" TEXT,
    "inviteExpiresAt" DATETIME,
    "invitedBy" TEXT,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PortalAccount_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PortalSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PortalSession_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "PortalAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServiceInvoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "competence" TEXT NOT NULL,
    "number" TEXT,
    "amountCents" INTEGER,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'enviada',
    "reviewNote" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ServiceInvoice_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServiceInvoiceFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storedName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceInvoiceFile_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "ServiceInvoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PortalAccount_employeeId_key" ON "PortalAccount"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "PortalAccount_inviteTokenHash_key" ON "PortalAccount"("inviteTokenHash");

-- CreateIndex
CREATE INDEX "PortalSession_accountId_idx" ON "PortalSession"("accountId");

-- CreateIndex
CREATE INDEX "ServiceInvoice_employeeId_idx" ON "ServiceInvoice"("employeeId");

-- CreateIndex
CREATE INDEX "ServiceInvoice_competence_idx" ON "ServiceInvoice"("competence");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceInvoiceFile_storedName_key" ON "ServiceInvoiceFile"("storedName");

-- CreateIndex
CREATE INDEX "ServiceInvoiceFile_invoiceId_idx" ON "ServiceInvoiceFile"("invoiceId");

