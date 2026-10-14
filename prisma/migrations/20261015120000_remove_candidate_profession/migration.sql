-- A profissão deixou de ser pedida ao candidato: sai dos onboardings em andamento.
DELETE FROM "AdmissionField"
WHERE "key" = 'profissao'
  AND "admissionId" IN (SELECT "id" FROM "Admission" WHERE "status" = 'em_andamento');
