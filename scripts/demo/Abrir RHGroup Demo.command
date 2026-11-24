#!/bin/bash
# Abre a DEMONSTRAÇÃO do RHGroup (dados fictícios) no navegador.
# Deixe esta janela aberta enquanto usa; fechar a janela encerra o sistema.
DIR="$(cd "$(dirname "$0")" && pwd)"
SYS="$DIR/.sistema"
xattr -dr com.apple.quarantine "$DIR" 2>/dev/null

# Primeira vez: copia o banco de demonstração para a pasta de trabalho.
if [ ! -f "$SYS/dados/demo.db" ]; then
  mkdir -p "$SYS/dados"
  cp -R "$SYS/dados-originais/." "$SYS/dados/"
fi

PORT=3939
while lsof -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; do PORT=$((PORT + 1)); done

cd "$SYS/app" || exit 1
DATABASE_URL="file:$SYS/dados/demo.db" NODE_ENV=production COOKIE_INSECURE=1 ESTOQUE_PASSWORD=demo2026 \
  PORT=$PORT HOSTNAME=127.0.0.1 "$SYS/node/bin/node" server.js >"$SYS/dados/servidor.log" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null' EXIT INT TERM HUP

clear
echo "RHGroup · Demonstração (dados fictícios)"
echo
echo "Abrindo o sistema..."
for _ in $(seq 1 80); do
  curl -s -o /dev/null "http://127.0.0.1:$PORT/frequencia/entrar" && break
  sleep 0.5
done
open "http://localhost:$PORT/frequencia"
echo
echo "Pronto: http://localhost:$PORT/frequencia"
echo "Acesso: diretoria@demo.rhgroup · senha demo2026"
echo
echo "Deixe esta janela aberta enquanto usa. Para encerrar, feche-a."
wait $PID
