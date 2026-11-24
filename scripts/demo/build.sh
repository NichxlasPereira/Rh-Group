#!/bin/bash
# Gera o pacote de DEMONSTRAÇÃO do RHGroup para Mac com chip Apple: um .zip com
# o atalho "Abrir RHGroup Demo" (dois cliques), o Node.js embutido e um banco só
# com dados inventados (scripts/demo/seed.ts). Nada do banco real entra aqui.
#
#   DEMO_FOTOS=/pasta/fotos NODE_TGZ=/caminho/node-v22-darwin-arm64.tar.gz OUT=/pasta/saida scripts/demo/build.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
: "${DEMO_FOTOS:?informe DEMO_FOTOS}" "${NODE_TGZ:?informe NODE_TGZ}" "${OUT:?informe OUT}"
PKG="$OUT/RHGroup Demo"
SYS="$PKG/.sistema"
cd "$ROOT"

echo "1/5 Build da demo (pasta .next-demo, sem tocar no .next do dia a dia)"
rm -rf .next-demo
NEXT_OUTPUT_STANDALONE=1 NEXT_DIST_DIR=.next-demo NEXT_PUBLIC_DEMO=1 npx next build >/dev/null

echo "2/5 Montando o sistema"
rm -rf "$PKG" "$OUT/RHGroup-Demo.zip"
mkdir -p "$SYS/app" "$SYS/node/bin" "$SYS/dados-originais"
cp -R .next-demo/standalone/. "$SYS/app/"
cp -R .next-demo/static "$SYS/app/.next-demo/static"
cp -R public "$SYS/app/public"
# Fontes dos PDFs (lidas do disco, fora do rastreio do build).
mkdir -p "$SYS/app/node_modules/@fontsource"
cp -R node_modules/@fontsource/. "$SYS/app/node_modules/@fontsource/"
# Nada de banco ou arquivos reais dentro do pacote.
rm -rf "$SYS/app/prisma" "$SYS/app/.env"* 2>/dev/null || true

echo "3/5 Banco da demo (dados inventados)"
export DATABASE_URL="file:$SYS/dados-originais/demo.db"
npx prisma migrate deploy >/dev/null
DEMO_FOTOS="$DEMO_FOTOS" npx tsx scripts/demo/seed.ts
npx tsx prisma/seed.ts >/dev/null
unset DATABASE_URL

echo "4/5 Node.js embutido"
tar -xzf "$NODE_TGZ" -C "$SYS/node" --strip-components=1 "$(tar -tzf "$NODE_TGZ" | grep -m1 '/bin/node$')"
cp "$(dirname "$0")/Abrir RHGroup Demo.command" "$(dirname "$0")/Restaurar dados da demo.command" "$(dirname "$0")/LEIA-ME.txt" "$PKG/"
chmod +x "$PKG/"*.command "$SYS/node/bin/node"

echo "5/5 Compactando"
(cd "$OUT" && ditto -c -k --keepParent "RHGroup Demo" RHGroup-Demo.zip)
rm -rf .next-demo
du -sh "$OUT/RHGroup-Demo.zip"
