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

https://bot.hrmmotos.com.br/wppsaas/api/empresas/1/contatos?limit=100&offset=0

Como testar (exemplo)

curl -sS -H "x-api-key: $API_KEY" "$BASE_URL/api/admin/empresas/$EMPRESA_ID/conversas/$CONTATO_ID/debug" | jq
