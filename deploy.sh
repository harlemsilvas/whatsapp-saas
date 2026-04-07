#!/bin/bash
set -euo pipefail

APP_DIR="/home/whatsapp/app"
PM2_APP="whatsapp-saas-api"

echo "=== Deploy whatsapp-saas ==="
echo "$(date)"

cd "$APP_DIR"

echo ">> Atualizando código (força estado do origin/main)..."
git fetch origin main
git reset --hard origin/main
# Remove arquivos não rastreados que possam bloquear o deploy (ex.: package-lock.json antigo)
git clean -fd

echo ">> Instalando dependencias (prod)..."
if [ -f package-lock.json ]; then
	npm ci --omit=dev
else
	npm install --omit=dev
fi

echo ">> Reiniciando PM2..."
pm2 restart "$PM2_APP"

echo ">> Status"
pm2 status

echo "=== Deploy concluido ==="