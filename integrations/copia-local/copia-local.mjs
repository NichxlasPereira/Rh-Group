#!/usr/bin/env node
/**
 * Cópia no computador — baixa para uma pasta local os documentos aprovados
 * dos onboardings concluídos no RHGroup (uma pasta por pessoa).
 *
 * Fica ligado e confere a cada 10 segundos (instalado por instalar.sh). Só baixa o que
 * ainda não tem; nunca apaga nada da pasta local.
 *
 * Configuração (criada pelo instalador, só o seu usuário lê):
 *   ~/Library/Application Support/RHGroup/copia-local.json
 *   { "url": "https://…", "token": "…", "pasta": "/Users/…/Onboarding RH" }
 */

import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

const APP_DIR = path.join(homedir(), "Library", "Application Support", "RHGroup");
const CONFIG = path.join(APP_DIR, "copia-local.json");
const STATE = path.join(APP_DIR, "copia-local-estado.json");

const log = (msg) => console.log(`${new Date().toISOString()} ${msg}`);

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT" && fallback !== undefined) return fallback;
    throw err;
  }
}

/** Nome seguro mesmo que o servidor mande algo estranho: nada de "..", barras ou caminhos absolutos. */
function safe(name) {
  const clean = String(name).replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/^\.+/, "").trim().slice(0, 150);
  return clean || "documento";
}

async function exists(file) {
  try {
    return await stat(file);
  } catch {
    return null;
  }
}

/** Não sobrescreve um arquivo diferente com o mesmo nome: usa "nome (2).pdf". */
async function freeName(dir, name) {
  const ext = path.extname(name);
  const base = name.slice(0, name.length - ext.length);
  for (let n = 1; ; n++) {
    const candidate = path.join(dir, n === 1 ? name : `${base} (${n})${ext}`);
    if (!(await exists(candidate))) return candidate;
  }
}

async function syncOnce() {
  const config = await readJson(CONFIG);
  const { url, token, pasta } = config;
  if (!url || !token || !pasta) throw new Error(`Configuração incompleta em ${CONFIG}. Rode o instalador de novo.`);
  const base = url.replace(/\/+$/, "");
  const headers = { Authorization: `Bearer ${token}` };

  const res = await fetch(`${base}/api/copia-local/onboardings`, { headers });
  if (res.status === 401) throw new Error("Chave recusada pelo RHGroup (desativada ou trocada). Gere uma nova e rode o instalador de novo.");
  if (!res.ok) throw new Error(`RHGroup respondeu ${res.status} ao listar os onboardings.`);
  const { admissions } = await res.json();

  const saved = await readJson(STATE, { files: {} });
  // Outro sistema (ex.: trocou do teste para o oficial): os ids não valem mais.
  const state = saved.url === base ? saved : { url: base, files: {} };
  let downloaded = 0;

  for (const admission of admissions) {
    const dir = path.join(pasta, safe(admission.folder));
    for (const file of admission.files) {
      const saved = state.files[file.id];
      if (saved && (await exists(path.join(pasta, saved)))) continue;

      await mkdir(dir, { recursive: true });
      // Nunca sobrescreve: se já existe um arquivo com esse nome, salva como "nome (2)".
      const target = await freeName(dir, safe(file.name));
      const r = await fetch(`${base}/api/copia-local/arquivos/${encodeURIComponent(file.id)}`, { headers });
      if (!r.ok) {
        log(`Falhou (${r.status}): ${admission.folder}/${file.name}`);
        continue;
      }
      const data = Buffer.from(await r.arrayBuffer());
      const part = `${target}.baixando`;
      await writeFile(part, data, { mode: 0o600 });
      await rename(part, target);
      downloaded++;
      log(`Baixado: ${path.relative(pasta, target)}`);
      state.files[file.id] = path.relative(pasta, target);
    }
  }

  if (downloaded > 0 || saved.url !== base) {
    await mkdir(APP_DIR, { recursive: true });
    await writeFile(STATE, JSON.stringify(state, null, 2), { mode: 0o600 });
  }
  return { admissions: admissions.length, downloaded };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const INTERVALO = 10_000; // de 10 em 10 segundos: o onboarding concluído aparece quase na hora
const INTERVALO_ERRO = 60_000;

async function main() {
  if (!process.argv.includes("--continuo")) {
    const r = await syncOnce();
    log(`OK — ${r.admissions} onboarding(s) concluído(s), ${r.downloaded} arquivo(s) novo(s).`);
    return;
  }
  // Modo contínuo (o que o Mac roda): fica ligado e confere a cada 10 segundos.
  // Só escreve no registro quando baixa algo ou quando o erro muda.
  log("Cópia contínua iniciada.");
  let lastError = null;
  for (;;) {
    try {
      const r = await syncOnce();
      if (lastError) log("Conexão normalizada.");
      if (r.downloaded > 0) log(`OK — ${r.downloaded} arquivo(s) novo(s).`);
      lastError = null;
      await sleep(INTERVALO);
    } catch (err) {
      if (err.message !== lastError) log(`ERRO: ${err.message}`);
      lastError = err.message;
      await sleep(INTERVALO_ERRO);
    }
  }
}

main().catch((err) => {
  log(`ERRO: ${err.message}`);
  process.exitCode = 1;
});
