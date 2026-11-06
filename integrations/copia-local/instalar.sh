#!/bin/bash
# Instala a cópia no computador (Mac): baixa quase na hora (a cada 10 s) os documentos
# dos onboardings concluídos no RHGroup para uma pasta local.
#
#   bash instalar.sh            instala ou troca a chave/pasta
#   bash instalar.sh --remover  desinstala (os arquivos já baixados ficam)
set -euo pipefail

LABEL="com.cffgroup.rhgroup.copia-local"
APP_DIR="$HOME/Library/Application Support/RHGroup"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/RHGroup-copia-local.log"
URL_PADRAO="https://system-onboarding-cffgroup.up.railway.app"
PASTA_PADRAO="$HOME/Onboarding RH"

if [[ "${1:-}" == "--remover" ]]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$PLIST" "$APP_DIR/copia-local.json" "$APP_DIR/copia-local.mjs" "$APP_DIR/copia-local-estado.json"
  echo "Cópia no computador removida. Os arquivos já baixados continuam na pasta."
  exit 0
fi

NODE="$(command -v node || true)"
if [[ -z "$NODE" ]]; then
  echo "Node.js não encontrado. Instale em https://nodejs.org e rode de novo." >&2
  exit 1
fi

# Uma pergunta só (a chave). Outro endereço ou pasta: RHGROUP_URL=… PASTA=… bash instalar.sh
URL="${RHGROUP_URL:-$URL_PADRAO}"
PASTA="${PASTA:-$PASTA_PADRAO}"
PASTA="${PASTA/#\~/$HOME}"

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
    -e 'display dialog "Cole aqui a chave do RHGroup (Onboarding › Cópia no computador › Copiar chave):" default answer "" with hidden answer with title "Cópia no computador — RHGroup" buttons {"Cancelar", "Instalar"} default button "Instalar"' \
    -e 'text returned of result' 2>/dev/null | tr -d '[:space:]' || true)"
fi
if ! is_key "$TOKEN"; then
  echo "Nenhuma chave válida. No RHGroup, clique em Onboarding › Cópia no computador › Gerar nova chave › Baixar arquivo da chave e rode o instalador outra vez." >&2
  exit 1
fi

mkdir -p "$APP_DIR" "$PASTA" "$(dirname "$PLIST")" "$(dirname "$LOG")"
chmod 700 "$APP_DIR"
cp "$(dirname "$0")/copia-local.mjs" "$APP_DIR/copia-local.mjs"

# JSON escrito pelo Node: nada de aspas quebrando o arquivo. A chave vai pelo ambiente, não pela linha de comando.
umask 077
URL="$URL" TOKEN="$TOKEN" PASTA="$PASTA" "$NODE" -e '
  const { url, token, pasta } = { url: process.env.URL, token: process.env.TOKEN, pasta: process.env.PASTA };
  require("fs").writeFileSync(process.argv[1], JSON.stringify({ url, token, pasta }, null, 2), { mode: 0o600 });
' "$APP_DIR/copia-local.json"
unset TOKEN

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$APP_DIR/copia-local.mjs</string>
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
if ! "$NODE" "$APP_DIR/copia-local.mjs" | tee -a "$LOG"; then
  echo
  echo "Não instalado: a primeira cópia falhou (mensagem acima). Corrija e rode o instalador outra vez." >&2
  exit 1
fi

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

echo
echo "Pronto. A cópia fica ligada e confere a cada 10 segundos: o onboarding concluído aparece na pasta quase na hora."
echo "Pasta: $PASTA"
echo "Registro: $LOG"
