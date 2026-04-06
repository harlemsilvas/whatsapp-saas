#!/bin/bash
set -euo pipefail

APP_DIR="/home/whatsapp/app"
PM2_APP="whatsapp-saas-api"

echo "=== Deploy whatsapp-saas ==="
echo "$(date)"

cd "$APP_DIR"
git pull origin main

echo ">> Instalando dependencias (prod)..."
npm install --omit=dev

echo ">> Reiniciando PM2..."
pm2 restart "$PM2_APP"

echo ">> Status"
pm2 status

echo "=== Deploy concluido ==="