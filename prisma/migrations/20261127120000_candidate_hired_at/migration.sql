-- Data da contratação: 30 dias depois o candidato sai do quadro de seleção.
ALTER TABLE "JobCandidate" ADD COLUMN "hiredAt" DATETIME;
