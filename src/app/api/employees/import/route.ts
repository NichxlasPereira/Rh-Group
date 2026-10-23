import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { sectorName } from "@/lib/admission";
import {
  IMPORT_LABELS,
  ImportAction,
  ImportColumn,
  ImportResult,
  ImportRow,
  RECORD_FIELDS,
  fold,
  foldName,
  parseDateCell,
} from "@/lib/employeeRecord";
import { parseRecordValue } from "@/lib/employeeRecordServer";

const MAX_ROWS = 1000;

/**
 * Importa a planilha de colaboradores para a ficha cadastral. Com apply=false só
 * mostra o que mudaria. Encontra a pessoa pelo CPF ou pelo nome; células vazias
 * não apagam nada. Só administradores (são dados pessoais em lote).
 */
export async function POST(request: NextRequest) {
  const auth = await requireFrequenciaUser({ admin: true });
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => null);
  const rows: ImportRow[] = Array.isArray(body?.rows) ? body.rows : [];
  const apply = body?.apply === true;
  const createMissing = body?.createMissing === true;
  if (rows.length === 0) return NextResponse.json({ error: "Nenhuma linha para importar." }, { status: 400 });
  if (rows.length > MAX_ROWS) return NextResponse.json({ error: `Envie até ${MAX_ROWS} linhas por vez.` }, { status: 400 });

  const [employees, companies, areas] = await Promise.all([
    prisma.employee.findMany({
      select: {
        id: true,
        name: true,
        cpf: true,
        department: true,
        areaId: true,
        role: true,
        startDate: true,
        ...Object.fromEntries(RECORD_FIELDS.map((f) => [f.key, true])),
      },
    }),
    prisma.contractingCompany.findMany({ where: { cnpj: { not: null } }, select: { id: true, name: true, shortName: true } }),
    prisma.companyArea.findMany({ select: { id: true, companyId: true, name: true } }),
  ]);

  const byCpf = new Map<string, (typeof employees)[number]>();
  const byName = new Map<string, (typeof employees)[number][]>();
  for (const e of employees) {
    if (e.cpf) byCpf.set(e.cpf.replace(/\D/g, ""), e);
    const key = foldName(e.name);
    byName.set(key, [...(byName.get(key) ?? []), e]);
  }
  const companyFor = (text: string) =>
    companies.find((c) => fold(sectorName(c)) === fold(text) || fold(c.name) === fold(text)) ?? null;
  const companyBySector = (sector: string | null) =>
    sector ? (companies.find((c) => sectorName(c) === sector) ?? null) : null;

  const results: ImportResult[] = [];
  const seen = new Set<string>();
  const toCreate = new Set<string>();
  // Áreas criadas nesta importação (empresa + nome dobrado → id).
  const newAreas = new Map<string, string>();

  for (const raw of rows) {
    const row = sanitize(raw);
    const name = row.name ?? "";
    const warnings: string[] = [];
    const result: ImportResult = { line: row.line, name, employee: null, action: "ignorar", changes: [], warnings };
    results.push(result);

    if (!name && !row.cpf) {
      warnings.push("Linha sem nome e sem CPF.");
      continue;
    }

    // Quem é: CPF primeiro, depois o nome (sem acentos e maiúsculas).
    const cpfDigits = row.cpf?.replace(/\D/g, "") ?? "";
    let match = cpfDigits.length === 11 ? (byCpf.get(cpfDigits) ?? null) : null;
    if (!match && name) {
      const candidates = byName.get(foldName(name)) ?? [];
      if (candidates.length > 1) {
        warnings.push(`Há ${candidates.length} colaboradores com este nome: informe o CPF para saber qual é.`);
        continue;
      }
      match = candidates[0] ?? null;
    }
    if (match) {
      result.employee = match.name;
      if (seen.has(match.id)) warnings.push("Esta pessoa já apareceu numa linha anterior; vale a última.");
      seen.add(match.id);
    } else if (!createMissing || !name) {
      result.action = "nao_encontrado";
      continue;
    } else if (toCreate.has(foldName(name))) {
      warnings.push("Nome repetido na planilha: esta linha foi ignorada.");
      continue;
    } else {
      toCreate.add(foldName(name));
    }

    // O que muda. Células vazias não apagam o que já está na ficha.
    const data: Record<string, unknown> = {};
    const changed = (column: ImportColumn) => result.changes.push(IMPORT_LABELS[column]);

    for (const f of RECORD_FIELDS) {
      const cell = row[f.key];
      if (!cell) continue;
      const parsed = parseRecordValue(f.key, cell);
      if (parsed && typeof parsed === "object" && "error" in parsed) {
        warnings.push(parsed.error);
        continue;
      }
      const current = match?.[f.key as keyof typeof match];
      const same =
        parsed instanceof Date
          ? current instanceof Date && current.getTime() === parsed.getTime()
          : (current ?? null) === parsed;
      if (!same) {
        data[f.key] = parsed;
        changed(f.key);
      }
    }

    if (row.role && row.role !== (match?.role ?? null)) {
      data.role = row.role.slice(0, 120);
      changed("role");
    }
    if (row.startDate) {
      const iso = parseDateCell(row.startDate);
      if (!iso) warnings.push(`Data de contratação inválida: "${row.startDate}" (use dd/mm/aaaa).`);
      else if (match?.startDate?.toISOString().slice(0, 10) !== iso) {
        data.startDate = new Date(`${iso}T00:00:00.000Z`);
        changed("startDate");
      }
    }

    let department = match?.department ?? null;
    if (row.company) {
      const company = companyFor(row.company);
      if (!company) warnings.push(`Empresa "${row.company}" não encontrada entre as empresas com CNPJ: setor não alterado.`);
      else if (sectorName(company) !== department) {
        department = sectorName(company);
        data.department = department;
        changed("company");
      }
    }

    let areaToCreate: { companyId: string; name: string; key: string } | null = null;
    if (row.area) {
      const company = companyBySector(department);
      if (!company) warnings.push(`Departamento "${row.area}" ignorado: a pessoa não tem empresa com CNPJ.`);
      else {
        const area = areas.find((a) => a.companyId === company.id && fold(a.name) === fold(row.area!));
        const key = `${company.id}:${fold(row.area)}`;
        if (area) {
          if (area.id !== match?.areaId) {
            data.areaId = area.id;
            data.areaLead = false;
            changed("area");
          }
        } else {
          areaToCreate = { companyId: company.id, name: row.area.slice(0, 60), key };
          changed("area");
          warnings.push(`Departamento "${row.area}" será criado como área da ${sectorName(company)}.`);
        }
      }
    } else if (data.department && match?.areaId) {
      // Mudou de empresa sem informar o departamento: sai da área antiga.
      data.areaId = null;
      data.areaLead = false;
    }

    if (!match) result.action = "criar";
    else result.action = result.changes.length > 0 ? "atualizar" : "sem_mudancas";

    if (!apply || result.action === "sem_mudancas") continue;

    await prisma.$transaction(async (tx) => {
      if (areaToCreate) {
        let areaId = newAreas.get(areaToCreate.key);
        if (!areaId) {
          areaId = (await tx.companyArea.create({ data: { companyId: areaToCreate.companyId, name: areaToCreate.name } })).id;
          newAreas.set(areaToCreate.key, areaId);
          areas.push({ id: areaId, companyId: areaToCreate.companyId, name: areaToCreate.name });
        }
        data.areaId = areaId;
        data.areaLead = false;
      }
      if (match) {
        await tx.employee.update({ where: { id: match.id }, data });
        // Mantém a cópia do setor nas ocorrências em dia com o cadastro.
        if (data.department) {
          await tx.attendanceOccurrence.updateMany({
            where: { employeeId: match.id },
            data: { employeeDepartment: data.department as string },
          });
        }
      } else {
        const created = await tx.employee.create({ data: { ...data, name: name.slice(0, 160) } });
        result.employee = created.name;
      }
    });
  }

  const count = (a: ImportAction) => results.filter((r) => r.action === a).length;
  return NextResponse.json({
    applied: apply,
    summary: {
      atualizar: count("atualizar"),
      criar: count("criar"),
      sem_mudancas: count("sem_mudancas"),
      nao_encontrado: count("nao_encontrado"),
      ignorar: count("ignorar"),
    },
    results,
  });
}

/** Só as colunas conhecidas, como texto aparado. */
function sanitize(raw: unknown): ImportRow {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const row: ImportRow = { line: Number(r.line) || 0 };
  for (const column of Object.keys(IMPORT_LABELS) as ImportColumn[]) {
    const v = r[column];
    if (typeof v === "string" && v.trim()) row[column] = v.trim().slice(0, 600);
  }
  return row;
}
