#!/usr/bin/env node
/**
 * Cópia no computador — baixa para uma pasta local os documentos aprovados
 * dos onboardings concluídos no RHGroup (uma pasta por pessoa).
 *
 * Roda sozinho de hora em hora (instalado por instalar.sh). Só baixa o que
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

async function main() {
  const config = await readJson(CONFIG);
  const { url, token, pasta } = config;
  if (!url || !token || !pasta) throw new Error(`Configuração incompleta em ${CONFIG}. Rode o instalador de novo.`);
  const base = url.replace(/\/+$/, "");
  const headers = { Authorization: `Bearer ${token}` };

  const res = await fetch(`${base}/api/copia-local/onboardings`, { headers });
  if (res.status === 401) throw new Error("Chave recusada pelo RHGroup (desativada ou trocada). Gere uma nova e rode o instalador de novo.");
  if (!res.ok) throw new Error(`RHGroup respondeu ${res.status} ao listar os onboardings.`);
  const { admissions } = await res.json();

  const state = await readJson(STATE, { files: {} });
  let downloaded = 0;

  for (const admission of admissions) {
    const dir = path.join(pasta, safe(admission.folder));
    for (const file of admission.files) {
      const saved = state.files[file.id];
      if (saved && (await exists(path.join(pasta, saved)))) continue;

      await mkdir(dir, { recursive: true });
      const wanted = path.join(dir, safe(file.name));
      const current = await exists(wanted);
      // Mesmo nome e mesmo tamanho: já é este arquivo (ex.: estado apagado).
      const target = current && current.size === file.size ? wanted : await freeName(dir, safe(file.name));
      if (target !== wanted || !current) {
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
      }
      state.files[file.id] = path.relative(pasta, target);
    }
  }

  await mkdir(APP_DIR, { recursive: true });
  await writeFile(STATE, JSON.stringify(state, null, 2), { mode: 0o600 });
  log(`OK — ${admissions.length} onboarding(s) concluído(s), ${downloaded} arquivo(s) novo(s).`);
}

main().catch((err) => {
  log(`ERRO: ${err.message}`);
  process.exitCode = 1;
});
