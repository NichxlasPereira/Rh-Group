-- AlterTable
ALTER TABLE "ContractingCompany" ADD COLUMN "address" TEXT;
ALTER TABLE "ContractingCompany" ADD COLUMN "cep" TEXT;
ALTER TABLE "ContractingCompany" ADD COLUMN "city" TEXT;
ALTER TABLE "ContractingCompany" ADD COLUMN "cnpj" TEXT;
ALTER TABLE "ContractingCompany" ADD COLUMN "district" TEXT;
ALTER TABLE "ContractingCompany" ADD COLUMN "legalNature" TEXT;
ALTER TABLE "ContractingCompany" ADD COLUMN "state" TEXT;

-- Onboardings em andamento cujo candidato ainda não enviou os dados passam a
-- pedir nacionalidade, estado civil e profissão (logo depois da data de
-- nascimento), usados no termo de uso de imagem. Quem já enviou não muda.
CREATE TEMP TABLE "_alvo" AS
  SELECT a."id" FROM "Admission" a
  WHERE a."status" = 'em_andamento' AND a."submittedAt" IS NULL
    AND EXISTS (SELECT 1 FROM "AdmissionField" n WHERE n."admissionId" = a."id" AND n."key" = 'nascimento')
    AND NOT EXISTS (SELECT 1 FROM "AdmissionField" x WHERE x."admissionId" = a."id" AND x."key" = 'nacionalidade');

UPDATE "AdmissionField"
SET "sortOrder" = "sortOrder" + 3
WHERE "admissionId" IN (SELECT "id" FROM "_alvo")
  AND "sortOrder" > (SELECT n."sortOrder" FROM "AdmissionField" n WHERE n."admissionId" = "AdmissionField"."admissionId" AND n."key" = 'nascimento');

INSERT INTO "AdmissionField" ("id", "admissionId", "key", "label", "type", "required", "sortOrder", "value", "createdAt", "updatedAt")
SELECT novo."prefixo" || lower(hex(randomblob(11))), n."admissionId", novo."key", novo."label", 'text', true, n."sortOrder" + novo."pos", NULL,
       CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM "AdmissionField" n
JOIN (
  SELECT 'na' AS "prefixo", 'nacionalidade' AS "key", 'Nacionalidade' AS "label", 1 AS "pos"
  UNION ALL SELECT 'ec', 'estadocivil', 'Estado civil', 2
  UNION ALL SELECT 'pr', 'profissao', 'Profissão', 3
) novo
WHERE n."key" = 'nascimento' AND n."admissionId" IN (SELECT "id" FROM "_alvo");

DROP TABLE "_alvo";

-- Onboardings em andamento com empresa contratante e dados ainda não enviados
-- também pedem o termo de uso de imagem, no fim da lista de documentos.
INSERT INTO "AdmissionDocument" ("id", "admissionId", "kind", "name", "description", "required", "sortOrder", "status", "createdAt", "updatedAt")
SELECT 'im' || lower(hex(randomblob(11))), a."id", 'imagem', 'Termo de autorização de uso de imagem',
       'Baixe o termo já preenchido, assine no gov.br e envie aqui o PDF assinado.', true,
       COALESCE((SELECT MAX(d."sortOrder") FROM "AdmissionDocument" d WHERE d."admissionId" = a."id"), -1) + 1, 'pendente',
       CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM "Admission" a
WHERE a."status" = 'em_andamento' AND a."submittedAt" IS NULL AND a."contractingCompanyId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "AdmissionDocument" d WHERE d."admissionId" = a."id" AND d."kind" = 'imagem');
