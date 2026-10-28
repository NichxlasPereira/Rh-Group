// Separado de portalAccess.ts para o proxy não carregar Prisma nem
// next/headers só para ler o nome do cookie.
export const PORTAL_COOKIE = "portal_session";
