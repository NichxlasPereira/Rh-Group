/**
 * Banco da DEMONSTRAÇÃO do RHGroup: tudo inventado (nomes, empresas, datas,
 * ocorrências). Nenhum dado de colaborador real. Roda num banco novo, separado:
 *
 *   DATABASE_URL="file:/caminho/demo.db" DEMO_FOTOS=/pasta/com/fotos npx tsx scripts/demo/seed.ts
 *
 * As fotos (randomuser.me) vão para a pasta "colaboradores" ao lado do banco.
 */
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes, randomUUID, scrypt } from "node:crypto";
import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const prisma = new PrismaClient();
const scryptAsync = promisify(scrypt) as (p: string, s: Buffer, n: number) => Promise<Buffer>;

export const DEMO_EMAIL = "diretoria@demo.rhgroup";
export const DEMO_PASSWORD = "demo2026";

// Aleatório com semente: a demo sai igual toda vez que o pacote é gerado.
let seed = 20261124;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T>(list: T[]): T => list[Math.floor(rand() * list.length)];
const between = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));

const DAY = 86_400_000;
const today = new Date();
today.setUTCHours(0, 0, 0, 0);
const day = (offset: number) => new Date(today.getTime() + offset * DAY);
const ymd = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

const MEN = ["Rafael", "Lucas", "Gabriel", "Thiago", "Bruno", "Felipe", "Mateus", "André", "Diego", "Rodrigo", "Vinícius", "Caio", "Eduardo", "Leonardo", "Gustavo", "Henrique", "Daniel", "Marcelo", "Igor", "Fábio", "Otávio", "Murilo"];
const WOMEN = ["Mariana", "Juliana", "Camila", "Beatriz", "Larissa", "Fernanda", "Patrícia", "Aline", "Renata", "Carolina", "Letícia", "Natália", "Bianca", "Gabriela", "Isabela", "Vanessa", "Priscila", "Tatiane", "Débora", "Luana", "Helena", "Sofia"];
const SURNAMES = ["Albuquerque", "Moraes", "Teixeira", "Barros", "Cardoso", "Duarte", "Fonseca", "Guimarães", "Lacerda", "Macedo", "Nogueira", "Peixoto", "Queiroz", "Rezende", "Sampaio", "Tavares", "Valente", "Xavier", "Amaral", "Bittencourt", "Campos", "Dantas", "Esteves", "Freitas", "Garcia", "Leal", "Meireles", "Pacheco", "Rocha", "Siqueira"];

const COMPANIES = [
  { name: "Aurora Tecnologia Ltda.", short: "AURORA", brand: "#3B5BDB", accent: "#91A7FF" },
  { name: "Nimbus Logística S.A.", short: "NIMBUS", brand: "#0CA678", accent: "#63E6BE" },
  { name: "Vértice Consultoria Ltda.", short: "VÉRTICE", brand: "#E8590C", accent: "#FFA94D" },
  { name: "Lumen Saúde Ltda.", short: "LUMEN", brand: "#AE3EC9", accent: "#E599F7" },
];
const AREAS: Record<string, string[]> = {
  AURORA: ["Tecnologia", "Produto", "Comercial", "Financeiro"],
  NIMBUS: ["Operações", "Frota", "Comercial", "Administrativo"],
  "VÉRTICE": ["Consultoria", "Marketing", "Financeiro"],
  LUMEN: ["Atendimento", "Enfermagem", "Administrativo"],
};
const ROLES: Record<string, string[]> = {
  Tecnologia: ["Desenvolvedor(a) back-end", "Desenvolvedor(a) front-end", "Analista de dados", "Engenheiro(a) de software"],
  Produto: ["Product manager", "Designer de produto", "Analista de produto"],
  Comercial: ["Executivo(a) de contas", "Analista comercial", "SDR"],
  Financeiro: ["Analista financeiro(a)", "Assistente financeiro(a)", "Controller"],
  "Operações": ["Analista de operações", "Supervisor(a) de operações", "Assistente de operações"],
  Frota: ["Coordenador(a) de frota", "Analista de frota"],
  Administrativo: ["Assistente administrativo(a)", "Analista administrativo(a)"],
  Consultoria: ["Consultor(a) sênior", "Consultor(a) pleno", "Analista de consultoria"],
  Marketing: ["Analista de marketing", "Designer gráfico", "Social media"],
  Atendimento: ["Recepcionista", "Analista de atendimento"],
  Enfermagem: ["Enfermeiro(a)", "Técnico(a) de enfermagem"],
};
const LEAD_ROLE: Record<string, string> = {
  Tecnologia: "Head de tecnologia", Produto: "Head de produto", Comercial: "Gerente comercial", Financeiro: "Gerente financeiro(a)",
  "Operações": "Gerente de operações", Frota: "Gerente de frota", Administrativo: "Coordenador(a) administrativo(a)",
  Consultoria: "Diretor(a) de consultoria", Marketing: "Gerente de marketing", Atendimento: "Coordenador(a) de atendimento", Enfermagem: "Coordenador(a) de enfermagem",
};

async function main() {
  if ((await prisma.employee.count()) > 0) throw new Error("Este banco já tem colaboradores. A demo só roda num banco novo.");
  const dbUrl = process.env.DATABASE_URL ?? "";
  if (!dbUrl.startsWith("file:") || !/demo/i.test(dbUrl)) throw new Error("Use um banco de demo (DATABASE_URL com 'demo' no nome).");
  const dataDir = path.dirname(path.resolve(path.join(process.cwd(), "prisma"), dbUrl.slice(5)));
  const photoSrc = process.env.DEMO_FOTOS ?? "";
  const photoDir = path.join(dataDir, "colaboradores");
  await mkdir(photoDir, { recursive: true });
  const photos = photoSrc ? (await readdir(photoSrc)).filter((f) => f.endsWith(".jpg")).sort() : [];
  const menPhotos = photos.filter((f) => f.startsWith("men-"));
  const womenPhotos = photos.filter((f) => f.startsWith("women-"));

  // ---------------------------------------------------------------- acesso
  const salt = randomBytes(16);
  const hash = await scryptAsync(DEMO_PASSWORD, salt, 64);
  await prisma.frequenciaUser.create({
    data: { name: "Diretoria Demo", email: DEMO_EMAIL, passwordHash: `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`, role: "admin" },
  });
  // Um pedido de acesso pendente, para mostrar a tela de Acessos.
  await prisma.frequenciaUser.create({
    data: { name: "Paula Siqueira", email: "paula.siqueira@demo.rhgroup", passwordHash: "scrypt$x$x", pending: true },
  });

  // ---------------------------------------------------------------- empresas e áreas
  const areaIds: Record<string, Record<string, string>> = {};
  const companyIds: Record<string, string> = {};
  for (const [i, c] of COMPANIES.entries()) {
    const company = await prisma.contractingCompany.create({
      data: {
        name: c.name,
        shortName: c.short,
        qualification: `${c.name}, empresa fictícia usada apenas nesta demonstração, com sede na Av. Exemplo, ${100 + i * 10}, São Paulo/SP.`,
        signerName: `${pick(WOMEN)} ${pick(SURNAMES)}`,
        signerRole: "Sócio(a) administrador(a)",
        signerCpf: "000.000.000-00",
        cnpj: `00.000.00${i + 1}/0001-00`,
        city: "São Paulo",
        state: "SP",
        brandColor: c.brand,
        accentColor: c.accent,
      },
    });
    companyIds[c.short] = company.id;
    areaIds[c.short] = {};
    for (const a of AREAS[c.short]) {
      areaIds[c.short][a] = (await prisma.companyArea.create({ data: { companyId: company.id, name: a } })).id;
    }
  }

  // ---------------------------------------------------------------- colaboradores
  type Made = { id: string; name: string; department: string; area: string; female: boolean; active: boolean };
  const people: Made[] = [];
  const used = new Set<string>();
  const photoIndex = { m: 0, f: 0 };
  const thisMonth = today.getUTCMonth() + 1;

  async function makeEmployee(department: string, area: string, lead: boolean, managerId: string | null, opts: { active?: boolean; birthdayToday?: boolean; birthdayThisMonth?: boolean; startSoon?: boolean } = {}) {
    let female = rand() < 0.5;
    let name = "";
    do {
      female = rand() < 0.5;
      name = `${pick(female ? WOMEN : MEN)} ${pick(SURNAMES)}`;
    } while (used.has(name));
    used.add(name);
    const startYear = between(2017, 2026);
    let startDate = ymd(startYear, between(1, 12), between(1, 28));
    if (startDate > today) startDate = day(-between(30, 400));
    if (opts.startSoon) startDate = day(between(2, 6));
    const contractType = lead ? "CLT" : pick(["CLT", "CLT", "CLT", "PJ", "Estágio"]);
    const contractEnd = contractType === "Estágio" ? day(between(10, 120)) : contractType === "PJ" ? day(between(20, 300)) : null;
    const birthMonth = opts.birthdayToday ? thisMonth : opts.birthdayThisMonth ? thisMonth : between(1, 12);
    const birthDay = opts.birthdayToday ? today.getUTCDate() : between(1, 28);
    const e = await prisma.employee.create({
      data: {
        name,
        department,
        role: lead ? LEAD_ROLE[area] : pick(ROLES[area]),
        active: opts.active ?? true,
        folgaAllowance: between(0, 6),
        startDate,
        contractType,
        contractEnd,
        areaId: areaIds[department][area],
        areaLead: lead,
        managerId,
        birthDate: ymd(between(1975, 2002), birthMonth, birthDay),
        corporateEmail: `${name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, ".")}@demo.rhgroup`,
      },
    });
    // Foto aleatória (randomuser.me), do mesmo gênero do nome.
    const list = female ? womenPhotos : menPhotos;
    const k = female ? photoIndex.f++ : photoIndex.m++;
    if (list.length && k < list.length) {
      const storedName = `${randomUUID()}.jpg`;
      await copyFile(path.join(photoSrc, list[k]), path.join(photoDir, storedName));
      await prisma.employeeDocument.create({
        data: {
          employeeId: e.id,
          name: "Foto para crachá",
          fileName: "foto.jpg",
          mimeType: "image/jpeg",
          size: (await stat(path.join(photoDir, storedName))).size,
          storedName,
          uploadedBy: "Demo",
        },
      });
    }
    const made = { id: e.id, name, department, area, female, active: opts.active ?? true };
    people.push(made);
    return made;
  }

  let birthdaysToday = 0;
  for (const c of COMPANIES) {
    for (const area of AREAS[c.short]) {
      const lead = await makeEmployee(c.short, area, true, null);
      const size = between(2, 4);
      for (let i = 0; i < size; i++) {
        await makeEmployee(c.short, area, false, lead.id, {
          birthdayToday: birthdaysToday < 2 && rand() < 0.15 ? (birthdaysToday++, true) : false,
          birthdayThisMonth: rand() < 0.15,
        });
      }
    }
  }
  // Alguns inativos (já saíram) e um começando nos próximos dias.
  await makeEmployee("NIMBUS", "Operações", false, null, { active: false });
  await makeEmployee("AURORA", "Comercial", false, null, { active: false });
  await makeEmployee("AURORA", "Tecnologia", false, null, { startSoon: true });
  const active = people.filter((p) => p.active);

  // ---------------------------------------------------------------- ocorrências (últimos 90 dias)
  for (let i = 0; i < 70; i++) {
    const p = pick(active);
    const type = pick(["falta", "falta", "atestado", "atestado", "folga", "horas", "horas"]);
    const start = day(-between(0, 90));
    const length = type === "atestado" ? between(0, 3) : type === "folga" ? between(0, 1) : 0;
    await prisma.attendanceOccurrence.create({
      data: {
        employeeId: p.id,
        employeeName: p.name,
        employeeDepartment: p.department,
        type,
        date: start,
        endDate: new Date(start.getTime() + length * DAY),
        justified: type === "atestado" || (type === "falta" && rand() < 0.4),
        startTime: type === "horas" ? pick(["08:00", "09:00", "14:00"]) : null,
        endTime: type === "horas" ? pick(["10:30", "11:00", "17:00"]) : null,
        approvedBy: type === "folga" ? "Gestor(a) da área" : null,
        notes: type === "atestado" ? "Atestado médico (demonstração)." : type === "horas" ? "Consulta médica." : null,
      },
    });
  }

  // ---------------------------------------------------------------- onboardings
  const fieldsFor = (name: string | null) => [
    { key: "nome", label: "Nome completo", type: "text", value: name },
    { key: "nascimento", label: "Data de nascimento", type: "date", value: name ? "1996-05-14" : null },
    { key: "email", label: "E-mail", type: "email", value: name ? "candidato@demo.rhgroup" : null },
    { key: "telefone", label: "Telefone / WhatsApp", type: "tel", value: name ? "(11) 90000-0000" : null },
    { key: "endereco", label: "Endereço completo (com CEP)", type: "textarea", value: name ? "Rua Fictícia, 123 · São Paulo/SP · 00000-000" : null },
  ];
  const docs = ["Documento de identidade (RG ou CNH)", "Comprovante de residência", "Carteira de trabalho digital", "Foto para crachá"];
  const admissions = [
    { name: "Ricardo Albuquerque", dept: "AURORA", area: "Tecnologia", role: "Desenvolvedor(a) back-end", start: 5, sent: true, statuses: ["aprovado", "enviado", "enviado", "pendente"] },
    { name: "Carolina Duarte", dept: "LUMEN", area: "Enfermagem", role: "Enfermeiro(a)", start: 12, sent: true, statuses: ["aprovado", "aprovado", "recusado", "enviado"] },
    { name: null, dept: "VÉRTICE", area: "Marketing", role: "Social media", start: 20, sent: false, statuses: ["pendente", "pendente", "pendente", "pendente"] },
  ];
  for (const a of admissions) {
    await prisma.admission.create({
      data: {
        candidateName: a.name,
        role: a.role,
        department: a.dept,
        areaId: areaIds[a.dept][a.area],
        contractingCompanyId: companyIds[a.dept],
        startDate: day(a.start),
        tokenHash: createHash("sha256").update(randomBytes(32)).digest("hex"),
        tokenExpiresAt: day(30),
        createdBy: "Diretoria Demo",
        submittedAt: a.sent ? day(-2) : null,
        fields: { create: fieldsFor(a.name).map((f, i) => ({ ...f, sortOrder: i, required: true })) },
        documents: { create: docs.map((name, i) => ({ name, sortOrder: i, status: a.statuses[i] })) },
      },
    });
  }

  // ---------------------------------------------------------------- kits (sem Slack na demo)
  const kitStart = [
    ["E-mail corporativo", "TI"], ["Acesso ao Slack", "TI"], ["Notebook configurado", "TI"], ["Crachá", "RH"], ["Acessos aos sistemas da área", "Gestor"],
  ];
  const kitExit = [["Desativar e-mail", "TI"], ["Recolher notebook", "TI"], ["Devolver crachá", "RH"], ["Revogar acessos aos sistemas", "Gestor"]];
  for (const [i, [name, responsible]] of kitStart.entries()) await prisma.startKitItem.create({ data: { name, responsible, kind: "inicio", sortOrder: i } });
  for (const [i, [name, responsible]] of kitExit.entries()) await prisma.startKitItem.create({ data: { name, responsible, kind: "saida", sortOrder: i } });

  // Offboardings: quem está saindo (último dia) e os pedidos.
  for (const [k, p] of people.filter((x) => !x.active).entries()) {
    await prisma.startKitRequest.create({
      data: {
        employeeId: p.id,
        kind: "saida",
        startDate: day(k === 0 ? -6 : 3),
        createdBy: "Diretoria Demo",
        tasks: {
          create: kitExit.map(([name, responsible], i) => ({
            name,
            responsible,
            sortOrder: i,
            doneAt: k === 0 || i < 2 ? day(-1) : null,
            doneBy: k === 0 || i < 2 ? "Equipe de TI" : null,
            doneVia: k === 0 || i < 2 ? "rhgroup" : null,
          })),
        },
      },
    });
  }

  // ---------------------------------------------------------------- prestadores
  const providers = [
    ["Studio Pixel Design", "VÉRTICE", "Designer de identidade visual", "Marketing", -200, 15],
    ["Byte Forte Sistemas", "AURORA", "Desenvolvedor(a) mobile", "Tecnologia", -100, 120],
    ["Rota Certa Transportes", "NIMBUS", "Transporte terceirizado", "Frota", -300, -5],
    ["Clínica Bem Viver", "LUMEN", "Plantão médico", "Atendimento", -50, 200],
    ["Contábil Horizonte", "VÉRTICE", "Assessoria contábil", "Financeiro", -400, 40],
  ] as const;
  for (const [name, dept, role, area, start, end] of providers) {
    await prisma.serviceProvider.create({
      data: { name, department: dept, role, area, contractStart: day(start), contractEnd: day(end), createdBy: "Diretoria Demo" },
    });
  }

  // ---------------------------------------------------------------- calendário e mural
  const y = today.getUTCFullYear();
  const events = [
    { title: "Novembro Azul", type: "campanha", startDate: ymd(y, 11, 1), endDate: ymd(y, 11, 30), yearly: true, notes: "Saúde do homem e prevenção ao câncer de próstata." },
    { title: "Dezembro Vermelho", type: "campanha", startDate: ymd(y, 12, 1), endDate: ymd(y, 12, 31), yearly: true, notes: "Prevenção ao HIV/aids e outras ISTs." },
    { title: "Outubro Rosa", type: "campanha", startDate: ymd(y, 10, 1), endDate: ymd(y, 10, 31), yearly: true, notes: "Prevenção ao câncer de mama." },
    { title: "Confraternização de fim de ano", type: "comemoracao", startDate: ymd(y, 12, 12), endDate: ymd(y, 12, 12), time: "19h · Espaço Jardins", notes: "Jantar com todas as empresas do grupo." },
    { title: "Recesso de fim de ano", type: "recesso", startDate: ymd(y, 12, 24), endDate: ymd(y + 1, 1, 2), notes: "Retorno em 05/01." },
    { title: "Treinamento de segurança da informação", type: "treinamento", startDate: day(3), endDate: day(3), time: "14h às 16h · Sala 2" },
    { title: "Integração de novos colaboradores", type: "treinamento", startDate: day(6), endDate: day(6), time: "9h · Auditório" },
  ];
  for (const e of events) await prisma.calendarEvent.create({ data: { ...e, createdBy: "Diretoria Demo" } });

  await prisma.muralNotice.create({ data: { title: "Bem-vindo(a) à demonstração do RHGroup", body: "Todos os nomes, fotos e números desta versão são fictícios. Fique à vontade para criar, editar e excluir.", createdBy: "Diretoria Demo" } });
  await prisma.muralNotice.create({ data: { title: "Campanha de vacinação na sexta", body: "Das 9h às 12h, na recepção.", until: day(4), createdBy: "Diretoria Demo" } });

  console.log(`Demo pronta: ${people.length} colaboradores, ${photos.length ? "com fotos" : "sem fotos"}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
