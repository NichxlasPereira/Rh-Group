#!/bin/bash
# Cópia no computador — baixa para uma pasta local os documentos aprovados dos
# onboardings concluídos no RHGroup (uma pasta por colaborador).
#
# Só usa o que já vem no macOS (bash 3.2 e curl): não precisa instalar nada.
# Instalado por instalar.sh, fica ligado e confere a cada 10 segundos
# (--continuo). Só baixa o que ainda não tem; nunca apaga nem sobrescreve nada.
#
# Configuração (criada pelo instalador, só o seu usuário lê), em
# ~/Library/Application Support/RHGroup/: url, pasta e cabecalho (a chave).

set -u
APP_DIR="$HOME/Library/Application Support/RHGroup"
ESTADO="$APP_DIR/copia-local-estado.tsv" # id<TAB>caminho dentro da pasta
INTERVALO=10
INTERVALO_ERRO=60

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*"; }

ler() { [[ -f "$APP_DIR/$1" ]] && tr -d '\r\n' < "$APP_DIR/$1"; }

# Nome seguro mesmo que venha algo estranho: sem barras, sem começar com ponto.
seguro() {
  local n="${1//\//-}"
  while [[ "$n" == .* ]]; do n="${n#.}"; done
  [[ -n "$n" ]] && printf '%s' "$n" || printf 'documento'
}

# Caminho livre: "nome.pdf", senão "nome (2).pdf", "nome (3).pdf"…
livre() {
  local dir="$1" nome="$2" base ext n=2
  if [[ "$nome" == *.* ]]; then base="${nome%.*}"; ext=".${nome##*.}"; else base="$nome"; ext=""; fi
  local alvo="$dir/$nome"
  while [[ -e "$alvo" || -e "$alvo.baixando" ]]; do alvo="$dir/$base ($n)$ext"; n=$((n + 1)); done
  printf '%s' "$alvo"
}

# Uma rodada. Saída: 0 = ok, 1 = erro (mensagem em $ERRO).
ERRO=""
BAIXADOS=0
rodada() {
  ERRO=""
  BAIXADOS=0
  local url pasta
  url="$(ler url)"; pasta="$(ler pasta)"
  if [[ -z "$url" || -z "$pasta" || ! -s "$APP_DIR/cabecalho" ]]; then
    ERRO="Configuração incompleta em $APP_DIR. Rode o instalador de novo."
    return 1
  fi

  # Estado de outro sistema (ex.: trocou do teste para o oficial) não vale: recomeça.
  if [[ "$(head -1 "$ESTADO" 2>/dev/null)" != "#url"$'\t'"$url" ]]; then
    mkdir -p "$APP_DIR"
    printf '#url\t%s\n' "$url" > "$ESTADO"
    chmod 600 "$ESTADO"
  fi

  local lista codigo
  lista="$(mktemp -t rhgroup-lista)"
  # A chave vai num arquivo de cabeçalho, não na linha de comando (não aparece no "ps").
  codigo="$(curl -sS -m 30 -o "$lista" -w '%{http_code}' -H @"$APP_DIR/cabecalho" "$url/api/copia-local/lista" 2>/dev/null)"
  if [[ "$codigo" == "401" ]]; then
    rm -f "$lista"
    ERRO="Chave recusada pelo RHGroup (desativada ou trocada). Gere uma nova chave para este computador e rode o instalador de novo."
    return 1
  fi
  if [[ "$codigo" != "200" ]]; then
    rm -f "$lista"
    ERRO="Sem conexão com o RHGroup (resposta: ${codigo:-nenhuma})."
    return 1
  fi

  local id pasta_pessoa arquivo salvo dir alvo
  while IFS=$'\t' read -r id pasta_pessoa arquivo; do
    [[ -z "$id" || -z "$arquivo" ]] && continue
    salvo="$(awk -F'\t' -v id="$id" '$1 == id { print $2; exit }' "$ESTADO")"
    [[ -n "$salvo" && -e "$pasta/$salvo" ]] && continue

    dir="$pasta/$(seguro "$pasta_pessoa")"
    mkdir -p "$dir"
    alvo="$(livre "$dir" "$(seguro "$arquivo")")"
    codigo="$(curl -sS -m 120 -o "$alvo.baixando" -w '%{http_code}' -H @"$APP_DIR/cabecalho" "$url/api/copia-local/arquivos/$id" 2>/dev/null)"
    if [[ "$codigo" != "200" ]]; then
      rm -f "$alvo.baixando"
      log "Falhou ($codigo): $pasta_pessoa/$arquivo"
      continue
    fi
    chmod 600 "$alvo.baixando"
    mv "$alvo.baixando" "$alvo"
    printf '%s\t%s\n' "$id" "${alvo#"$pasta"/}" >> "$ESTADO"
    BAIXADOS=$((BAIXADOS + 1))
    log "Baixado: ${alvo#"$pasta"/}"
  done < "$lista"
  rm -f "$lista"
  return 0
}

if [[ "${1:-}" != "--continuo" ]]; then
  if rodada; then
    log "OK — $BAIXADOS arquivo(s) novo(s)."
    exit 0
  fi
  log "ERRO: $ERRO"
  exit 1
fi

# Modo contínuo (o que o Mac roda): só escreve no registro quando baixa algo ou o erro muda.
log "Cópia contínua iniciada."
ultimo_erro=""
while true; do
  if rodada; then
    [[ -n "$ultimo_erro" ]] && log "Conexão normalizada."
    ultimo_erro=""
    [[ "$BAIXADOS" -gt 0 ]] && log "OK — $BAIXADOS arquivo(s) novo(s)."
    sleep "$INTERVALO"
  else
    [[ "$ERRO" != "$ultimo_erro" ]] && log "ERRO: $ERRO"
    ultimo_erro="$ERRO"
    sleep "$INTERVALO_ERRO"
  fi
done
