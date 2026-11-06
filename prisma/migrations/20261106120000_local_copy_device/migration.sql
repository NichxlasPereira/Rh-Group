-- CreateTable
CREATE TABLE "LocalCopyDevice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "keyAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME
);

-- CreateIndex
CREATE UNIQUE INDEX "LocalCopyDevice_tokenHash_key" ON "LocalCopyDevice"("tokenHash");

-- A chave única de antes vira o primeiro computador (continua funcionando).
INSERT INTO "LocalCopyDevice" ("id", "name", "tokenHash", "createdAt", "keyAt", "lastSeenAt")
SELECT 'primeiro-computador', 'Primeiro computador', "value", "updatedAt", "updatedAt",
       (SELECT "updatedAt" FROM "AppSetting" WHERE "key" = 'copia_local_visto')
FROM "AppSetting" WHERE "key" = 'copia_local_token';

DELETE FROM "AppSetting" WHERE "key" IN ('copia_local_token', 'copia_local_visto');
