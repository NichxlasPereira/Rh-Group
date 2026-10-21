import { NextRequest, NextResponse } from "next/server";
import { FREQ_USER_COOKIE } from "@/lib/frequenciaCookie";
import { MODULES, isValidSessionToken, moduleForPath, modulePassword } from "@/lib/moduleAuth";

export function proxy(request: NextRequest) {
  // Portal de admissão: o candidato é externo e entra só pelo link privado
  // (token aleatório, validado em cada rota). Fica fora de todas as senhas.
  if (isAdmissionPortal(request.nextUrl.pathname)) return NextResponse.next();

  const basicAuthFailure = checkBasicAuth(request);
  if (basicAuthFailure) return basicAuthFailure;
  return checkFrequencia(request) ?? checkModulePassword(request) ?? NextResponse.next();
}


function isAdmissionPortal(p: string): boolean {
  // Também o link de exportação lido pela planilha do RH (=IMPORTDATA), que
  // vem dos servidores do Google, sem senha: o token na URL é a chave.
  return p.startsWith("/admissao/") || p.startsWith("/api/admissao/") || p.startsWith("/api/planilha/");
}

const FREQ_PUBLIC = new Set([
  "/frequencia/entrar",
  "/api/frequencia/login",
  "/api/frequencia/logout",
  "/api/frequencia/setup",
  "/api/frequencia/register",
]);

function isFrequenciaPath(p: string): boolean {
  const under = (base: string) => p === base || p.startsWith(`${base}/`);
  return (
    under("/frequencia") ||
    under("/api/frequencia") ||
    under("/api/employees") ||
    under("/api/occurrences") ||
    under("/api/attachments") ||
    under("/api/admissions") ||
    under("/api/admission-files") ||
    under("/api/employee-documents")
  );
}

/**
 * Frequência (RH): contas individuais. Aqui é só a checagem rápida — tem o
 * cookie de sessão? A validação de verdade (sessão no banco, pessoa ativa)
 * acontece em cada rota da API, via requireFrequenciaUser.
 */
function checkFrequencia(request: NextRequest): NextResponse | null {
  const { pathname, search } = request.nextUrl;
  if (!isFrequenciaPath(pathname) || FREQ_PUBLIC.has(pathname)) return null;
  if (request.cookies.get(FREQ_USER_COOKIE)?.value) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 });
  }
  const login = new URL("/frequencia/entrar", request.url);
  login.searchParams.set("voltar", pathname + search);
  return NextResponse.redirect(login);
}

/** Estoque: senha compartilhada do módulo. */
function checkModulePassword(request: NextRequest): NextResponse | null {
  const { pathname, search } = request.nextUrl;
  const moduleKey = moduleForPath(pathname);
  if (!moduleKey) return null;

  const config = MODULES[moduleKey];
  const password = modulePassword(moduleKey);
  if (password && isValidSessionToken(moduleKey, request.cookies.get(config.cookie)?.value, password)) return null;

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Acesso bloqueado. Entre com a senha do módulo." }, { status: 401 });
  }
  const login = new URL(config.loginPath, request.url);
  login.searchParams.set("voltar", pathname + search);
  return NextResponse.redirect(login);
}

function checkBasicAuth(request: NextRequest): NextResponse | null {
  const expectedUser = process.env.BASIC_AUTH_USER;
  const expectedPassword = process.env.BASIC_AUTH_PASSWORD;

  if (!expectedUser || !expectedPassword) {
    return null;
  }

  const authHeader = request.headers.get("authorization");

  if (authHeader?.startsWith("Basic ")) {
    const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf-8");
    const separatorIndex = decoded.indexOf(":");
    const user = decoded.slice(0, separatorIndex);
    const password = decoded.slice(separatorIndex + 1);

    if (user === expectedUser && password === expectedPassword) {
      return null;
    }
  }

  return new NextResponse("Autenticação necessária.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Estoque CFFGROUP"' },
  });
}

export const config = {
  // Public static assets are excluded so Next's image optimizer (and direct
  // requests) can fetch them without hitting the auth wall — see hero-office.jpg,
  // whose /_next/image request otherwise 400s because that internal fetch
  // carries no Basic Auth credentials.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|hero-office.jpg).*)"],
};
