#!/bin/bash
# Instala a cópia no computador (Mac): baixa de hora em hora os documentos
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
echo "Cole a chave gerada no RHGroup (Onboarding › Cópia no computador) e aperte Enter."
read -r -s -p "Chave (não aparece na tela ao colar): " TOKEN
echo
TOKEN="$(printf '%s' "$TOKEN" | tr -d '[:space:]')"
if [[ ! "$TOKEN" =~ ^[A-Za-z0-9_-]{20,64}$ ]]; then
  echo "Isso não parece a chave. Copie de novo em RHGroup › Onboarding › Cópia no computador › Copiar chave e rode o instalador outra vez." >&2
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
  </array>
  <key>StartInterval</key><integer>3600</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLIST

echo "Primeira cópia…"
if "$NODE" "$APP_DIR/copia-local.mjs" | tee -a "$LOG"; then :; fi

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

echo
echo "Pronto. A cópia roda ao ligar o Mac e de hora em hora."
echo "Pasta: $PASTA"
echo "Registro: $LOG"
