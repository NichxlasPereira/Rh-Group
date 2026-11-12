-- Kit de início no onboarding: área da pessoa e itens tirados desta contratação.
ALTER TABLE "Admission" ADD COLUMN "areaId" TEXT;
ALTER TABLE "Admission" ADD COLUMN "startKitSkip" TEXT;
ALTER TABLE "StartKitRequest" ADD COLUMN "skipped" TEXT;
