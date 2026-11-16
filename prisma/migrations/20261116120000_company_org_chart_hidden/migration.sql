-- Empresa fora do organograma (continua nos termos e no cadastro dos colaboradores).
ALTER TABLE "ContractingCompany" ADD COLUMN "hiddenInOrgChart" BOOLEAN NOT NULL DEFAULT false;
