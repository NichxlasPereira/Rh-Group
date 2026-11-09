import { prisma } from "./prisma";
import { Provider, ProviderDetail } from "./providers";

const PROVIDER_INCLUDE = {
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
    contractStart: p.contractStart?.toISOString() ?? null,
    contractEnd: p.contractEnd?.toISOString() ?? null,
    active: p.active,
    createdAt: p.createdAt.toISOString(),
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
  const documents = await prisma.serviceProviderDocument.findMany({
    where: { providerId: id },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, fileName: true, mimeType: true, size: true, uploadedBy: true, createdAt: true },
  });
  return {
    ...toProvider(p),
    documents: documents.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() })),
  };
}
