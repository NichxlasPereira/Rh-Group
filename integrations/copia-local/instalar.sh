#!/bin/bash
# Instala a cópia no computador (Mac): os documentos de cada onboarding concluído
# no RHGroup aparecem numa pasta local quase na hora (confere a cada 10 s).
# Não precisa instalar nada antes: só usa o que já vem no macOS.
#
# Em qualquer Mac, direto do RHGroup (o comando aparece na tela da chave):
#   curl -fsSL <endereço do RHGroup>/api/copia-local/instalar.sh | bash
# Ou, com o projeto: bash integrations/copia-local/instalar.sh
# Desinstalar: acrescente --remover (os arquivos já baixados ficam).
set -euo pipefail

LABEL="com.cffgroup.rhgroup.copia-local"
APP_DIR="$HOME/Library/Application Support/RHGroup"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/RHGroup-copia-local.log"

# Baixado do RHGroup, o endereço já vem preenchido; rodando do projeto, é o oficial.
URL_SERVIDOR="__RHGROUP_URL__"
[[ "$URL_SERVIDOR" == "__RHGROUP"*"__" ]] && URL_SERVIDOR="https://system-onboarding-cffgroup.up.railway.app"
URL="${RHGROUP_URL:-$URL_SERVIDOR}"
PASTA="${PASTA:-$HOME/Onboarding RH}"
PASTA="${PASTA/#\~/$HOME}"

parar() { launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true; }
# Arquivos da versão antiga (com Node.js), se houver.
limpar_antigos() { rm -f "$APP_DIR/copia-local.mjs" "$APP_DIR/copia-local.json" "$APP_DIR/copia-local-estado.json"; }

if [[ "${1:-}" == "--remover" ]]; then
  parar
  limpar_antigos
  rm -f "$PLIST" "$APP_DIR/copia-local.sh" "$APP_DIR/url" "$APP_DIR/pasta" "$APP_DIR/cabecalho" "$APP_DIR/copia-local-estado.tsv"
  echo "Cópia no computador removida deste Mac. Os arquivos já baixados continuam na pasta."
  echo "Para cortar o acesso também no sistema, remova este computador em RHGroup › Onboarding › Cópia no computador."
  exit 0
fi

echo "Cópia no computador — RHGroup"
echo "Sistema: $URL"
echo "Pasta:   $PASTA"
echo

is_key() { [[ "$1" =~ ^[A-Za-z0-9_-]{20,64}$ ]]; }

# A chave nunca é digitada no Terminal. Vem, nesta ordem, do arquivo baixado no
# RHGroup ("Baixar arquivo da chave" → Downloads/rhgroup-chave.txt), da área de
# transferência ("Copiar chave") ou de uma janela do Mac para colar.
TOKEN=""
ARQUIVO="$(ls -t "$HOME"/Downloads/rhgroup-chave*.txt 2>/dev/null | head -1 || true)"
if [[ -n "$ARQUIVO" ]]; then
  TOKEN="$(tr -d '[:space:]' < "$ARQUIVO" || true)"
  rm -f "$HOME"/Downloads/rhgroup-chave*.txt # a chave não fica largada em Downloads
  if is_key "$TOKEN"; then echo "Usando a chave do arquivo baixado do RHGroup (arquivo apagado)."; fi
fi
if is_key "$TOKEN"; then
  :
elif TOKEN="$(pbpaste 2>/dev/null | tr -d '[:space:]' || true)"; is_key "$TOKEN"; then
  echo "Usando a chave copiada do RHGroup."
  printf '' | pbcopy # limpa a área de transferência
else
  TOKEN="$(osascript \
    -e 'display dialog "Cole aqui a chave deste computador (RHGroup › Onboarding › Cópia no computador):" default answer "" with hidden answer with title "Cópia no computador — RHGroup" buttons {"Cancelar", "Instalar"} default button "Instalar"' \
    -e 'text returned of result' 2>/dev/null | tr -d '[:space:]' || true)"
fi
if ! is_key "$TOKEN"; then
  echo "Nenhuma chave válida. No RHGroup, abra Onboarding › Cópia no computador, gere a chave deste computador, clique em Baixar arquivo da chave e rode o instalador outra vez." >&2
  exit 1
fi

umask 077
mkdir -p "$APP_DIR" "$PASTA" "$(dirname "$PLIST")" "$(dirname "$LOG")"
chmod 700 "$APP_DIR"

# Programa: ao lado deste instalador (projeto) ou baixado do próprio RHGroup.
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]:-/nao-existe}")" 2>/dev/null && pwd || true)"
if [[ -n "$AQUI" && -f "$AQUI/copia-local.sh" ]]; then
  cp "$AQUI/copia-local.sh" "$APP_DIR/copia-local.sh.novo"
else
  curl -fsSL "$URL/api/copia-local/programa.sh" -o "$APP_DIR/copia-local.sh.novo"
fi
mv "$APP_DIR/copia-local.sh.novo" "$APP_DIR/copia-local.sh"

parar
limpar_antigos
printf '%s\n' "$URL" > "$APP_DIR/url"
printf '%s\n' "$PASTA" > "$APP_DIR/pasta"
# A chave fica num arquivo de cabeçalho só do seu usuário (nunca na linha de comando).
printf 'Authorization: Bearer %s\n' "$TOKEN" > "$APP_DIR/cabecalho"
unset TOKEN

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$APP_DIR/copia-local.sh</string>
    <string>--continuo</string>
  </array>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLIST

echo "Primeira cópia…"
if ! /bin/bash "$APP_DIR/copia-local.sh" | tee -a "$LOG"; then
  echo
  echo "Não instalado: a primeira cópia falhou (mensagem acima). Corrija e rode o instalador outra vez." >&2
  exit 1
fi

launchctl bootstrap "gui/$(id -u)" "$PLIST"

echo
echo "Pronto. A cópia fica ligada e confere a cada 10 segundos: o onboarding concluído aparece na pasta quase na hora."
echo "Pasta: $PASTA"
echo "Registro: $LOG"
