#!/usr/bin/env bash
set -euo pipefail

API_KEY=123456
BASE_URL="http://localhost:31827"

EMPRESA_ID=1
CONTATO_ID=2

curl -sS -H "x-api-key: $API_KEY" "$BASE_URL/api/empresas/$EMPRESA_ID/contatos" | jq

/api/empresas/:empresaId/contatos?limit=50&offset=0

#Listar (padrão 50):

curl -sS -H "x-api-key: $API_KEY" "$BASE_URL/api/empresas/$EMPRESA_ID/contatos"
#Listar com paginação:

curl -sS -H "x-api-key: $API_KEY" "$BASE_URL/api/empresas/$EMPRESA_ID/contatos?limit=100&offset=0"
#(Opcional) ver bonito com jq:

curl -sS -H "x-api-key: $API_KEY" "$BASE_URL/api/empresas/$EMPRESA_ID/contatos?limit=100&offset=0" | jq
#Se estiver em produção atrás do subpath (/wppsaas), a URL normalmente vira:

https://bot.hrmmotos.com.br/api/empresas/1/contatos?limit=100&offset=0

Como testar (exemplo)

curl -sS -H "x-api-key: $API_KEY" "$BASE_URL/api/admin/empresas/$EMPRESA_ID/conversas/$CONTATO_ID/debug" | jq

curl -sS -H "x-api-key: $API_KEY" "$BASE_URL/api/admin/empresas/$EMPRESA_ID/conversas/$CONTATO_ID/debug" \
  | jq '{suppressNow: .runtime.suppressReasonNow, botStatus: .botStatus, botStatusEffective: .botStatusEffective, cols: .hints.bot_status_columns_present, lastIn: .mensagens.lastInbound.created_at, lastOut: .mensagens.lastOutbound.created_at}'

# Se botStatus.reason continuar null mas botStatusEffective.reason vier preenchido,
# cheque os logs do PM2 por: "Falha ao atualizar bot_status_*" (erro do Postgres/permite diagnosticar).


whatsapp@srv1433055:~$ curl -sS -H "x-api-key: 123456" "http://localhost:31827/api/admin/empresas/1/conversas/2/debug" | jq '.runtime.suppressReasonNow, .botStatus, .botStatusEffective, .hints.bot_status_columns_present, .mensagens.lastInbound.created_at, .mensagens.lastOutbound.created_at'
"human_active"
{
  "reason": null,
  "at": null,
  "details": null
}
{
  "reason": "human_active",
  "at": "2026-04-13T22:42:31.254Z",
  "details": {
    "computed": true,
    "source": "runtime",
    "note": "Fallback: motivo efetivo baseado no estado atual quando bot_status_* está vazio."
  }
}
true
"2026-04-13T22:46:09.599Z"
"2026-04-13T22:42:31.252Z"

