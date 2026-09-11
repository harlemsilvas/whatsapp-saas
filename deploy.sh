#!/bin/bash
set -euo pipefail

APP_DIR="/home/whatsapp/app"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-http://127.0.0.1:31827/}"
SKIP_SYNC="${1:-}"

echo "=== Deploy whatsapp-saas ==="
echo "$(date)"

cd "$APP_DIR"

PREVIOUS_COMMIT="${DEPLOY_PREVIOUS_COMMIT:-$(git rev-parse HEAD)}"

rollback() {
	trap - ERR
	set +e
	echo ">> Falha no deploy. Restaurando codigo em $PREVIOUS_COMMIT..."
	git reset --hard "$PREVIOUS_COMMIT"
	if [ -f package-lock.json ]; then
		npm ci --omit=dev
	else
		npm install --omit=dev
	fi
	if [ -f ecosystem.config.js ]; then
		pm2 startOrRestart ecosystem.config.js
	else
		pm2 restart whatsapp-saas-api
		pm2 restart whatsapp-saas-worker || true
	fi
	pm2 save
	echo ">> Rollback do codigo concluido. Migracoes aditivas nao foram revertidas."
	exit 1
}

trap rollback ERR

if [ "$SKIP_SYNC" != "--skip-sync" ]; then
	echo ">> Atualizando código para origin/main..."
	git fetch origin main
	git reset --hard origin/main
	git clean -fd
fi

echo ">> Instalando dependencias (prod)..."
if [ -f package-lock.json ]; then
	npm ci --omit=dev
else
	npm install --omit=dev
fi

echo ">> Aplicando migrations idempotentes..."
npm run db:migrate:unread
npm run db:migrate:webhook-events
npm run db:migrate:webhook-events:retry-lease
npm run db:migrate:outbox
npm run db:migrate:outbox:provider-status
npm run db:migrate:message-provider-status
npm run db:migrate:ai-credentials
npm run db:migrate:ai-multi-provider

command -v pm2 >/dev/null 2>&1 || { echo "pm2 nao encontrado no PATH"; exit 1; }
mkdir -p /home/whatsapp/logs

echo ">> Reiniciando API e worker pelo ecosystem..."
pm2 startOrRestart ecosystem.config.js
pm2 save

echo ">> Aguardando healthcheck..."
HEALTHY=0
for attempt in 1 2 3 4 5 6 7 8 9 10; do
	if curl --fail --silent --show-error "$HEALTHCHECK_URL" >/dev/null; then
		HEALTHY=1
		break
	fi
	echo "Healthcheck ainda indisponivel (tentativa $attempt/10)"
	sleep 3
done

if [ "$HEALTHY" -ne 1 ]; then
	echo "Healthcheck falhou: $HEALTHCHECK_URL"
	false
fi

echo ">> Status"
pm2 status

trap - ERR
echo "=== Deploy concluido com sucesso ==="
