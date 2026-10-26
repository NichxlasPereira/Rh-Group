import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFrequenciaUser } from "@/lib/frequenciaAccess";
import { DISPLAYABLE_IMAGE, isPhotoDocument } from "@/lib/employeeProfile";
import { Birthday, monthDayOf } from "@/lib/birthdays";

/**
 * Aniversariantes: dia e mês de nascimento de cada colaborador (nunca o ano).
 * A data vem da ficha cadastral; vazia, do onboarding digital.
 */
export async function GET() {
  const auth = await requireFrequenciaUser();
  if ("response" in auth) return auth.response;

  const [employees, onboarding, uploads, admissionPhotos] = await Promise.all([
    prisma.employee.findMany({ select: { id: true, birthDate: true } }),
    prisma.admissionField.findMany({
      where: { key: "nascimento", value: { not: null }, admission: { employeeId: { not: null } } },
      orderBy: { admission: { updatedAt: "asc" } },
      select: { value: true, admission: { select: { employeeId: true } } },
    }),
    prisma.employeeDocument.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, employeeId: true, name: true, mimeType: true },
    }),
    prisma.admissionFile.findMany({
      where: { document: { admission: { employeeId: { not: null } } } },
      orderBy: { createdAt: "asc" },
      select: { id: true, mimeType: true, document: { select: { name: true, admission: { select: { employeeId: true } } } } },
    }),
  ]);

  // Os mais recentes sobrescrevem os antigos (listas em ordem crescente).
  const fromOnboarding = new Map<string, string>();
  for (const f of onboarding) if (f.admission.employeeId && f.value) fromOnboarding.set(f.admission.employeeId, f.value);

  // Mesma regra da rota da foto: a enviada na ficha vale mais que a do onboarding.
  const photo = new Map<string, string>();
  for (const f of admissionPhotos) {
    const id = f.document.admission.employeeId;
    if (id && isPhotoDocument(f.document.name) && DISPLAYABLE_IMAGE.test(f.mimeType)) photo.set(id, f.id);
  }
  for (const d of uploads) if (isPhotoDocument(d.name) && DISPLAYABLE_IMAGE.test(d.mimeType)) photo.set(d.employeeId, d.id);

  const birthdays: Birthday[] = [];
  for (const e of employees) {
    const date = monthDayOf(e.birthDate?.toISOString() ?? fromOnboarding.get(e.id));
    if (date) birthdays.push({ employeeId: e.id, ...date, photo: photo.get(e.id) ?? null });
  }
  return NextResponse.json(birthdays);
}
