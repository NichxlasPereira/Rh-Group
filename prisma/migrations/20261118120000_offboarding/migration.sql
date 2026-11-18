-- Offboarding: itens e pedidos de saída usam a mesma estrutura do kit de início.
ALTER TABLE "StartKitItem" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'inicio';
ALTER TABLE "StartKitRequest" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'inicio';
