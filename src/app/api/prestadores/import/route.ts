import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { sectorName } from "@/lib/admission";
import { foldName } from "@/lib/employeeRecord";
import {
  PROVIDER_IMPORT_LABELS,
  ProviderImportAction,
  ProviderImportColumn,
  ProviderImportResult,
  ProviderImportRow,
  matchCompanyName,
  parseDateInput,
} from "@/lib/providers";

const MAX_ROWS = 500;

/**
 * Importa a planilha de prestadores, no mesmo jeito da de colaboradores: com
 * apply=false só mostra o que mudaria. Encontra o prestador pelo nome; células
 * vazias não apagam nada; quem não for encontrado só entra com createMissing.
 */
export async function POST(request: NextRequest) {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => null);
  const rows: ProviderImportRow[] = Array.isArray(body?.rows) ? body.rows.map(sanitize) : [];
  const apply = body?.apply === true;
  const createMissing = body?.createMissing === true;
  if (rows.length === 0) return NextResponse.json({ error: "Nenhuma linha para importar." }, { status: 400 });
  if (rows.length > MAX_ROWS) return NextResponse.json({ error: `Envie até ${MAX_ROWS} linhas por vez.` }, { status: 400 });

  const [providers, companies, areas] = await Promise.all([
    prisma.serviceProvider.findMany(),
    prisma.contractingCompany.findMany({ where: { cnpj: { not: null } }, select: { id: true, name: true, shortName: true } }),
    prisma.companyArea.findMany({ select: { companyId: true, name: true } }),
  ]);
  const companyList = companies.map((c) => ({ id: c.id, name: c.name, sector: sectorName(c) }));

  const byName = new Map<string, (typeof providers)[number][]>();
  for (const p of providers) {
    const key = foldName(p.name);
    byName.set(key, [...(byName.get(key) ?? []), p]);
  }

  const results: ProviderImportResult[] = [];
  const seen = new Set<string>();
  const toCreate = new Set<string>();

  for (const row of rows) {
    const name = row.name ?? "";
    const warnings: string[] = [];
    const result: ProviderImportResult = { line: row.line, name, provider: null, action: "ignorar", changes: [], warnings };
    results.push(result);

    if (!name) {
      warnings.push("Linha sem nome.");
      continue;
    }

    const candidates = byName.get(foldName(name)) ?? [];
    if (candidates.length > 1) {
      warnings.push(`Há ${candidates.length} prestadores com este nome: edite direto na lista.`);
      continue;
    }
    const match = candidates[0] ?? null;
    if (match) {
      result.provider = match.name;
      if (seen.has(match.id)) warnings.push("Este prestador já apareceu numa linha anterior; vale a última.");
      seen.add(match.id);
    } else if (!createMissing) {
      result.action = "nao_encontrado";
      continue;
    } else if (toCreate.has(foldName(name))) {
      warnings.push("Nome repetido na planilha: esta linha foi ignorada.");
      continue;
    } else {
      toCreate.add(foldName(name));
    }

    // O que muda. Células vazias não apagam o que já está no cadastro.
    const data: Record<string, unknown> = {};
    const changed = (c: ProviderImportColumn) => result.changes.push(PROVIDER_IMPORT_LABELS[c]);

    let department = match?.department ?? null;
    if (row.company) {
      const company = matchCompanyName(row.company, companyList);
      if (!company) warnings.push(`Empresa "${row.company}" não encontrada entre as empresas com CNPJ: setor não alterado.`);
      else if (company.sector !== department) {
        department = company.sector;
        data.department = department;
        changed("company");
      }
    }

    if (row.role && row.role !== (match?.role ?? null)) {
      data.role = row.role.slice(0, 80);
      changed("role");
    }

    if (row.area) {
      // Usa o nome da área já cadastrada na empresa quando bate (sem acentos e maiúsculas).
      const company = companyList.find((c) => c.sector === department);
      const existing = company && areas.find((a) => a.companyId === company.id && foldName(a.name) === foldName(row.area!));
      const area = existing ? existing.name : row.area.slice(0, 80);
      if (company && !existing) warnings.push(`Área "${row.area}" não existe na ${company.sector}: fica só no cadastro do prestador.`);
      if (area !== (match?.area ?? null)) {
        data.area = area;
        changed("area");
      }
    } else if (data.department && match?.area) {
      // Mudou de empresa sem informar a área: sai da área antiga.
      data.area = null;
    }

    for (const key of ["contractStart", "contractEnd"] as const) {
      const cell = row[key];
      if (!cell) continue;
      const iso = parseDateInput(cell);
      if (!iso) {
        warnings.push(`${PROVIDER_IMPORT_LABELS[key]} inválido: "${cell}" (use dd/mm/aaaa).`);
        continue;
      }
      if (match?.[key]?.toISOString().slice(0, 10) !== iso) {
        data[key] = new Date(`${iso}T00:00:00.000Z`);
        changed(key);
      }
    }
    const start = (data.contractStart as Date | undefined) ?? match?.contractStart ?? null;
    const end = (data.contractEnd as Date | undefined) ?? match?.contractEnd ?? null;
    if (start && end && end < start) {
      warnings.push("A validade do contrato fica antes do início: datas não alteradas.");
      delete data.contractStart;
      delete data.contractEnd;
      result.changes = result.changes.filter(
        (c) => c !== PROVIDER_IMPORT_LABELS.contractStart && c !== PROVIDER_IMPORT_LABELS.contractEnd
      );
    }

    if (!match) result.action = "criar";
    else result.action = result.changes.length > 0 ? "atualizar" : "sem_mudancas";

    if (!apply || result.action === "sem_mudancas") continue;
    if (match) await prisma.serviceProvider.update({ where: { id: match.id }, data });
    else {
      const created = await prisma.serviceProvider.create({ data: { ...data, name: name.slice(0, 120), createdBy: auth.user.name } });
      result.provider = created.name;
    }
  }

  const count = (a: ProviderImportAction) => results.filter((r) => r.action === a).length;
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
function sanitize(raw: unknown): ProviderImportRow {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const row: ProviderImportRow = { line: Number(r.line) || 0 };
  for (const column of Object.keys(PROVIDER_IMPORT_LABELS) as ProviderImportColumn[]) {
    const v = r[column];
    if (typeof v === "string" && v.trim()) row[column] = v.trim().slice(0, 300);
  }
  return row;
}
