import { NextRequest, NextResponse } from "next/server";
import {
  MODULES,
  SESSION_SECONDS,
  createSessionToken,
  isModuleKey,
  modulePassword,
  safeEqual,
} from "@/lib/moduleAuth";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const moduleKey = body?.module;
  if (!isModuleKey(moduleKey)) {
    return NextResponse.json({ error: "Módulo inválido." }, { status: 400 });
  }

  const password = modulePassword(moduleKey);
  if (!password) {
    return NextResponse.json(
      { error: `A senha deste módulo ainda não foi configurada no servidor (${MODULES[moduleKey].envVar}).` },
      { status: 503 }
    );
  }

  const attempt = typeof body?.password === "string" ? body.password : "";
  if (!safeEqual(attempt, password)) {
    // Atraso fixo: torna tentativa e erro em massa bem mais lenta.
    await new Promise((r) => setTimeout(r, 800));
    return NextResponse.json({ error: "Senha incorreta." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(MODULES[moduleKey].cookie, createSessionToken(moduleKey, password), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
  return response;
}
