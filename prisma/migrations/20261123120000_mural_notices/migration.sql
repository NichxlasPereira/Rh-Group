-- Mural do RH: recados com data de validade.
CREATE TABLE "MuralNotice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "until" DATETIME,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "MuralNotice_until_idx" ON "MuralNotice"("until");
