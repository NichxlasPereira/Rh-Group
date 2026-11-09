import { prisma } from "./prisma";
import { Billing, Provider, ProviderDetail } from "./providers";

const PROVIDER_INCLUDE = {
  invoices: { select: { month: true } },
  _count: { select: { documents: true } },
} as const;

type Row = Awaited<ReturnType<typeof prisma.serviceProvider.findFirstOrThrow<{ include: typeof PROVIDER_INCLUDE }>>>;

function toProvider(p: Row): Provider {
  return {
    id: p.id,
    name: p.name,
    department: p.department,
    role: p.role,
    area: p.area,
    registration: p.registration,
    corporateEmail: p.corporateEmail,
    contractStart: p.contractStart?.toISOString() ?? null,
    contractEnd: p.contractEnd?.toISOString() ?? null,
    amountCents: p.amountCents,
    billing: p.billing as Billing,
    active: p.active,
    createdAt: p.createdAt.toISOString(),
    invoiceMonths: [...new Set(p.invoices.map((i) => i.month))].sort(),
    documentCount: p._count.documents,
  };
}

export async function listProviders(): Promise<Provider[]> {
  const rows = await prisma.serviceProvider.findMany({ include: PROVIDER_INCLUDE, orderBy: [{ active: "desc" }, { name: "asc" }] });
  return rows.map(toProvider);
}

export async function getProvider(id: string): Promise<ProviderDetail | null> {
  const p = await prisma.serviceProvider.findUnique({ where: { id }, include: PROVIDER_INCLUDE });
  if (!p) return null;
  const [documents, invoices] = await Promise.all([
    prisma.serviceProviderDocument.findMany({
      where: { providerId: id },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, fileName: true, mimeType: true, size: true, uploadedBy: true, createdAt: true },
    }),
    prisma.serviceProviderInvoice.findMany({
      where: { providerId: id },
      orderBy: [{ month: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        month: true,
        number: true,
        amountCents: true,
        issueDate: true,
        fileName: true,
        size: true,
        notes: true,
        uploadedBy: true,
        createdAt: true,
      },
    }),
  ]);
  return {
    ...toProvider(p),
    birthDate: p.birthDate?.toISOString() ?? null,
    rg: p.rg,
    cpf: p.cpf,
    taxId: p.taxId,
    phone: p.phone,
    emergencyContact: p.emergencyContact,
    personalEmail: p.personalEmail,
    address: p.address,
    cep: p.cep,
    pixKey: p.pixKey,
    notes: p.notes,
    documents: documents.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() })),
    invoices: invoices.map((i) => ({ ...i, issueDate: i.issueDate?.toISOString() ?? null, createdAt: i.createdAt.toISOString() })),
  };
}
