#!/bin/bash
# Volta a demonstração do RHGroup para os dados iniciais (apaga o que foi criado ou editado).
DIR="$(cd "$(dirname "$0")" && pwd)"
SYS="$DIR/.sistema"
echo "Isso apaga tudo o que foi criado ou editado na demonstração e volta aos dados iniciais."
read -r -p "Continuar? (s/n) " answer
if [ "$answer" = "s" ] || [ "$answer" = "S" ]; then
  rm -rf "$SYS/dados"
  echo "Pronto. Na próxima vez que abrir, a demo começa do zero."
else
  echo "Nada foi alterado."
fi
