import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "./prisma";

/**
 * Chave de acesso sem login (link da planilha, cópia no computador): longa e
 * aleatória, mostrada uma vez só. O banco guarda só o hash, e gerar outra
 * invalida a anterior na hora.
 */

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export function settingToken(key: string) {
  return {
    async rotate(): Promise<string> {
      const token = randomBytes(24).toString("base64url");
      await prisma.appSetting.upsert({
        where: { key },
        create: { key, value: hash(token) },
        update: { value: hash(token) },
      });
      return token;
    },

    async revoke(): Promise<void> {
      await prisma.appSetting.deleteMany({ where: { key } });
    },

    async info(): Promise<{ active: boolean; updatedAt: Date | null }> {
      const setting = await prisma.appSetting.findUnique({ where: { key } });
      return { active: !!setting, updatedAt: setting?.updatedAt ?? null };
    },

    async isValid(token: string | null | undefined): Promise<boolean> {
      if (!token || !/^[A-Za-z0-9_-]{20,64}$/.test(token)) return false;
      const setting = await prisma.appSetting.findUnique({ where: { key } });
      if (!setting) return false;
      const a = Buffer.from(hash(token));
      const b = Buffer.from(setting.value);
      return a.length === b.length && timingSafeEqual(a, b);
    },
  };
}
