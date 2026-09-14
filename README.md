# whatsapp-saas

Antes de retomar desenvolvimento, manutencao ou deploy, siga a leitura inicial
obrigatoria definida em [`CLAUDE.md`](CLAUDE.md).

Backend Node/Express + PostgreSQL para automação de WhatsApp Cloud API (Meta).

## Rodar a API

1. Instalar dependências:

```bash
npm install
```

2. Configure o arquivo `.env` (porta, DB e credenciais do WhatsApp).

3. Subir a API em modo dev (com reload):

```bash
npm run dev
```

Healthcheck:

```bash
curl -sS http://localhost:3000/
```

## Banco com Docker

Desenvolvimento local:

```bash
docker compose up -d postgres
```

O `docker-compose.yml` agora:

- usa variáveis de ambiente para credenciais
- publica o PostgreSQL apenas em `127.0.0.1`
- adiciona `healthcheck`
- cria o usuário da aplicação por script de init, sem senha fixa no SQL versionado

Produção:

```bash
docker compose -f docker-compose.prod.yml up -d postgres
```

Antes de subir em produção, preencha no `.env`:

- `POSTGRES_SUPERUSER`
- `POSTGRES_SUPERPASS`
- `POSTGRES_DB`
- `APP_DB_USER`
- `APP_DB_PASS`

Observação: o arquivo de produção mantém o banco preso em `localhost`, para uso atrás de proxy/rede privada na VPS.

## CI

O workflow em [deploy.yml](/home/harlem/projetos/whatsapp-saas/.github/workflows/deploy.yml:1) agora:

- roda testes em `push` e `pull_request` para `main`
- só executa deploy se o job de testes passar
- faz deploy apenas em eventos de `push` na branch `main`
- serializa deploys para evitar duas atualizações simultâneas
- executa as migrations idempotentes antes do restart
- mantém API e worker pelo `ecosystem.config.js`
- valida o healthcheck local e restaura o commit anterior se o deploy falhar

Secrets obrigatórios no GitHub:

- `VPS_HOST`
- `VPS_USER`
- `VPS_SSH_KEY`

## Itens obrigatórios na Meta (Políticas/Termos/Exclusão)

Ao configurar o App no painel da Meta, normalmente são exigidas as URLs abaixo. Este projeto já expõe páginas públicas para isso.

Se você faz deploy em subpasta (ex.: Nginx com `/wppsaas/`), inclua o prefixo na URL final (ex.: `https://hrmmotos.com.br/wppsaas/privacy`).

- Política de Privacidade: `https://SEU_DOMINIO/privacy`
- Termos de Serviço: `https://SEU_DOMINIO/terms`
- Exclusão de dados do usuário (instruções): `https://SEU_DOMINIO/data-deletion`

Fallback (caso seu proxy só exponha a API em `/api/`):

- Política de Privacidade: `https://SEU_DOMINIO/api/privacy`
- Termos de Serviço: `https://SEU_DOMINIO/api/terms`
- Exclusão de dados do usuário (instruções): `https://SEU_DOMINIO/api/data-deletion`

Também preencha **Domínios do aplicativo** com o seu domínio (ex.: `seudominio.com` ou `api.seudominio.com`, conforme seu deploy).

### Personalizar texto/e-mail exibidos nas páginas

As páginas acima usam variáveis de ambiente (opcionais):

- `SERVICE_NAME` (padrão: `WhatsApp SaaS`)
- `LEGAL_ENTITY_NAME` (padrão: vazio)
- `LEGAL_CONTACT_EMAIL` (fallback: `CONTACT_EMAIL`, se existir)

Exemplo no `.env`:

```bash
SERVICE_NAME=HRM Motos - Atendimento WhatsApp
LEGAL_ENTITY_NAME=HRM Motos LTDA
LEGAL_CONTACT_EMAIL=seu-email@dominio.com
```

## ngrok (para webhook público)

Exemplo:

```bash
npx ngrok http 3000
```

O callback do webhook deve ficar no formato:

`https://SEU_NGROK.ngrok-free.app/api/webhook`

## Scripts úteis

### 1) Testar se o token do WhatsApp está válido

Valida o token atual do `.env` chamando a Graph API (não imprime o token):

```bash
npm run verify:whatsapp
```

Saída esperada (exemplo): `✅ WhatsApp auth OK`.

### 2) Salvar/sincronizar token novo (env + banco)

Quando você gerar um token novo no painel da Meta, rode:

```bash
npm run token:update
```

Ele vai:

- Perguntar o token no terminal (sem ecoar o que você digita)
- Atualizar `WHATSAPP_TOKEN` no `.env`
- Salvar o mesmo token em `empresas.whatsapp_token` (por padrão usa `DEFAULT_EMPRESA_ID` ou `1`)
- Fazer um sanity-check chamando a Graph API

Opções:

```bash
npm run token:update -- --empresaId=1
```

Também aceita passar por argumento (não recomendado; pode ficar no histórico do shell):

```bash
npm run token:update -- --token=SEU_TOKEN --empresaId=1
```

Ajuda:

```bash
npm run token:update -- --help
```

## Como parar a API

Se você rodou `npm run dev` (nodemon) no terminal, pare com `Ctrl+C`.

Se estiver rodando em background e você precisar encerrar “na marra”:

```bash
ps aux | grep "node src/server.js" | grep -v grep
kill -9 <PID>
```

## Como parar o ngrok

No terminal do ngrok, pare com `Ctrl+C`.

## Status do desenvolvimento (checklist)

### Feito

- [x] Healthcheck: `GET /` (API respondendo)
- [x] Webhook Meta: verificação `GET /api/webhook` (challenge)
- [x] Webhook Meta: recebimento `POST /api/webhook`
- [x] Tratamento de eventos `statuses` (ignora para bot)
- [x] Persistência no Postgres: contatos e mensagens (entrada/saída)
- [x] Fluxos por empresa (tabela `fluxos`) + fallback do MVP
- [x] Envio WhatsApp via Graph API com log de sucesso (messageId)
- [x] Multi-tenant por `metadata.phone_number_id` (resolve empresa)
- [x] Fallback controlado para payloads “example” (redireciona para `MEU_TELEFONE` fora de produção)
- [x] Logging estruturado (Winston) + error handler mais seguro
- [x] Validação de env no boot (configurável por flags)
- [x] Proteção simples de admin: `x-api-key` em `/api/empresas` quando `ADMIN_API_KEY` existe
- [x] Script para validar token: `npm run verify:whatsapp`
- [x] Script para atualizar token (env + banco): `npm run token:update`

### Próximos passos (recomendado)

O backlog detalhado de melhorias está em [FEATURES.md](FEATURES.md).

- [ ] Token de longo prazo (produção): seguir [Atualizar o token da Meta](docs/guia-uso-operacao.md#atualizar-o-token-da-meta)
- [ ] Garantir assinatura correta no App da Meta: evento `messages` + URL fixa (sem depender de ngrok)
- [ ] Deploy com HTTPS (Nginx + Certbot) e processo (PM2) + restart automático
- [ ] Rate limit / hardening no webhook (evitar abuso, logs e métricas)
- [x] Credenciais WhatsApp e de IA isoladas por empresa, com onboarding no painel

## Admin (Empresas + Onboarding)

Em produção, `ADMIN_API_KEY` é obrigatória por padrão. Os endpoints abaixo exigem header `x-api-key`.

### Atualizar credenciais do WhatsApp por empresa (recomendado)

Atualiza `empresas.whatsapp_token` e/ou `empresas.phone_number_id` e (por padrão) valida na Graph API antes de salvar.

```bash
curl -sS -X PUT "http://localhost:3000/api/empresas/1/whatsapp" \
	-H "Content-Type: application/json" \
	-H "x-api-key: $ADMIN_API_KEY" \
	-d '{
		"whatsapp_token": "SEU_TOKEN",
		"phone_number_id": "993692280501871",
		"validate": true
	}'
```

### Verificar credenciais salvas no banco (empresa)

```bash
curl -sS -X POST "http://localhost:3000/api/empresas/1/whatsapp/verify" \
	-H "x-api-key: $ADMIN_API_KEY" | jq
```

### Obter resumo de onboarding (URLs para colar na Meta)

Defina `APP_PUBLIC_BASE_URL` no `.env` (ex.: `https://hrmmotos.com.br/wppsaas`) e chame:

```bash
curl -sS "http://localhost:3000/api/empresas/1/onboarding" \
	-H "x-api-key: $ADMIN_API_KEY" | jq
```

## Admin (Inbox / Conversas)

Para acesso em producao, uso do painel, teste ponta a ponta e diagnostico da
VPS, consulte [docs/guia-uso-operacao.md](docs/guia-uso-operacao.md).

Painel atual: `https://bot.hrmmotos.com.br/api/admin/ui?key=SUA_ADMIN_API_KEY`.
Nao registre a chave real no README ou em outros arquivos versionados.

O botão `Configurações` salva `phone_number_id` e token por empresa,
valida as credenciais na Graph API e nunca devolve o token armazenado ao
navegador.

Na seção `Inteligência artificial`, o mesmo painel permite cadastrar várias
chaves Gemini, NVIDIA e OpenAI por empresa. As chaves são validadas antes da gravação,
criptografadas com AES-256-GCM e exibidas apenas por impressão digital. A menor
prioridade numérica é tentada primeiro; falhas de autenticação invalidam a
chave e falhas transitórias ativam um cooldown antes do failover.

A ordem padrão é Gemini (`10`), NVIDIA (`20`) e OpenAI (`30`). As prioridades
podem ser alteradas no painel sem recadastrar a chave.

### Migração (não lidas)

Para habilitar contagem de **não lidas**, a tabela `mensagens` precisa da coluna `lida_em`.

Em bancos já existentes, rode:

```bash
npm run db:migrate:unread
```

### Migração (event store do webhook)

Para habilitar o registro durável dos eventos recebidos antes do processamento, aplique:

```bash
npm run db:migrate:webhook-events
```

Isso cria a tabela `webhook_events`, usada para marcar eventos como `received`, `processed` e `failed`.

Observação: os scripts de migração tentam usar `POSTGRES_SUPERUSER` e `POSTGRES_SUPERPASS` do `.env` quando disponíveis. Isso evita depender do `app_user` para criar ou alterar schema.

Para habilitar lease e retry básico nessa tabela, aplique também:

```bash
npm run db:migrate:webhook-events:retry-lease
```

### Migração (outbox de saída)

Para persistir mensagens de saída antes do envio à Graph API, aplique:

```bash
npm run db:migrate:outbox
npm run db:migrate:outbox:provider-status
npm run db:migrate:outbox:retry-hardening
npm run db:migrate:message-provider-status
npm run db:migrate:ai-credentials
npm run db:migrate:ai-multi-provider
npm run db:migrate:tenant-security
```

Isso cria a tabela `outbox_messages`, habilita a correlação dos estados da Meta
e aplica limite, classificação e backoff aos retries. Erros definitivos e itens
que esgotam as tentativas ficam em `dead` até uma reabertura manual pelo painel.

### Segurança multiempresa

A migration de segurança adiciona unicidade ao `phone_number_id`, valida os
vínculos de tenant, criptografa tokens da Meta com AES-256-GCM e cria chaves
administrativas por empresa e auditoria. Ela faz o backfill mantendo o campo
legado temporariamente para permitir rollback:

```bash
npm run db:migrate:tenant-security
```

Somente depois que API e worker novos estiverem saudáveis, remova o texto puro:

```bash
npm run db:verify:whatsapp-token-encryption
npm run db:finalize:whatsapp-token-encryption
```

O `deploy.sh` executa essa sequência automaticamente e só finaliza depois do
healthcheck e da verificação criptográfica. `CREDENTIALS_ENCRYPTION_KEY` deve
permanecer estável; perdê-la impede descriptografar tokens WhatsApp e chaves de
IA.

### Reprocessar eventos com falha

Quando houver registros `failed` em `webhook_events`, você pode tentar replay manual:

```bash
npm run webhook:reprocess
```

Opções:

```bash
npm run webhook:reprocess -- --limit=50
npm run webhook:reprocess -- --statuses=failed,received
```

Observação: o replay agora só claim eventos retryable quando o lease estiver livre ou expirado.

### Rodar o webhook worker

Para processar continuamente `webhook_events` fora da requisição HTTP:

```bash
npm run worker:webhook
```

O worker agora executa dois blocos no mesmo ciclo:

- reprocessamento de `webhook_events` retryable
- envio de `outbox_messages` pendentes ou falhas

Variáveis úteis:

- `WEBHOOK_WORKER_POLL_INTERVAL_MS`: intervalo entre polls
- `WEBHOOK_WORKER_BATCH_LIMIT`: tamanho do lote por ciclo
- `WEBHOOK_WORKER_LEASE_SECONDS`: duração do lease por evento
- `WEBHOOK_WORKER_STATUSES`: statuses considerados no worker, ex.: `failed` ou `failed,received`
- `OUTBOX_MAX_ATTEMPTS`: máximo de tentativas automáticas, padrão `8`
- `OUTBOX_RETRY_BASE_SECONDS`: espera inicial do backoff, padrão `30`
- `OUTBOX_RETRY_MAX_SECONDS`: teto do backoff, padrão `3600`
- `OUTBOX_RETRY_JITTER_RATIO`: variação aleatória do backoff, padrão `0.2`

No deploy da VPS Ubuntu, a recomendação é rodar a API e o worker como processos separados no PM2.

### Abrir o painel web (MVP)

O painel está em:

- `http://localhost:3000/admin?key=SEU_ADMIN_API_KEY` (atalho)
- `http://localhost:3000/api/admin/ui?key=SEU_ADMIN_API_KEY` (direto)

Observação: o `?key=` é usado só para abrir a página no browser (ela remove do URL ao carregar). As chamadas de API usam `x-api-key`.

Em `Configurações da empresa > Acesso administrativo`, o superadmin pode gerar
uma chave limitada à empresa com perfil de leitura, operação ou gestão. O valor
completo aparece uma única vez; o banco armazena somente SHA-256. A mesma tela
permite revogar acessos e consultar ações administrativas recentes.

## Provedores de IA

Quando não existe fluxo correspondente, `src/services/iaService.js` tenta as
credenciais válidas por prioridade. Gemini e NVIDIA usam Chat Completions
OpenAI-compatible; OpenAI pode usar Responses API ou Chat Completions.

### Variáveis de ambiente

- `CREDENTIALS_ENCRYPTION_KEY` (obrigatória para gravar/usar chaves do banco;
  gere uma única vez com `openssl rand -base64 32` e preserve em backup seguro)
- `AI_MAX_CREDENTIAL_ATTEMPTS` (opcional, padrão: `3`)
- `GEMINI_API_KEY` e `GEMINI_MODEL` (fallbacks globais opcionais)
- `NVIDIA_API_KEY` e `NVIDIA_MODEL` (fallbacks globais opcionais)
- `OPENAI_API_KEY` (opcional; usada como último fallback após as chaves do banco)
- `OPENAI_MODEL` (opcional, padrão: `gpt-4o-mini`)
- `OPENAI_BASE_URL` (opcional, padrão: `https://api.openai.com/v1`)
- `OPENAI_MAX_OUTPUT_TOKENS` (opcional, padrão: `220`)
- `OPENAI_TEMPERATURE` (opcional, padrão: `0.4`)
- `OPENAI_TIMEOUT_MS` (opcional, padrão: `15000`)
- `OPENAI_MAX_CONTEXT_MESSAGES` (opcional, padrão: `8`) quantas mensagens recentes entram como contexto
- `OPENAI_REASONING_EFFORT` (opcional, padrão: `low`) reduz gasto de tokens em modelos de raciocínio
- `AI_FALLBACK_TEXT` (opcional) texto usado quando a IA estiver desativada ou falhar

### Perfil da empresa (base de conhecimento)

Para respostas mais consistentes, você pode fornecer um documento com o “perfil da empresa” (horários, serviços, regras, etc.).

- `AI_COMPANY_PROFILE_PATH` (opcional) caminho do arquivo Markdown com o perfil (recomendado)
- `AI_COMPANY_PROFILE_TEXT` (opcional) texto inline com o perfil (alternativa)
- `AI_COMPANY_PROFILE_MAX_CHARS` (opcional, padrão: `4000`) trunca o perfil para evitar estourar tokens
- `AI_COMPANY_PROFILE_CACHE_MS` (opcional, padrão: `30000`) cache do arquivo em memória

Template sugerido: `src/ai/perfil-empresa.md`.

Nota: em alguns modelos (ex.: `gpt-5-nano`), o endpoint `/v1/responses` pode retornar `status=incomplete` por `max_output_tokens` quando o limite é baixo. O projeto faz retry automático aumentando o limite, mas você pode ajustar `OPENAI_MAX_OUTPUT_TOKENS` se quiser.

Exemplo no `.env`:

```bash
GEMINI_API_KEY=SEU_TOKEN_GEMINI
GEMINI_MODEL=gemini-3.5-flash-lite
NVIDIA_API_KEY=SEU_TOKEN_NVIDIA
NVIDIA_MODEL=nvidia/nemotron-3.5-lightning-30b-a3b
OPENAI_API_KEY=SEU_TOKEN_DA_OPENAI
OPENAI_MODEL=gpt-4o-mini
OPENAI_API_STYLE=responses
OPENAI_MAX_OUTPUT_TOKENS=220
OPENAI_TEMPERATURE=0.4
CREDENTIALS_ENCRYPTION_KEY=CHAVE_DE_32_BYTES_EM_BASE64
AI_MAX_CREDENTIAL_ATTEMPTS=3
```

### API de conversas (protegida por `x-api-key`)

Listar conversas (contatos + última mensagem + não lidas):

```bash
curl -sS "http://localhost:3000/api/admin/empresas/1/conversas?limit=50" \
	-H "x-api-key: $ADMIN_API_KEY" | jq
```

Buscar thread (mensagens) de um contato:

```bash
curl -sS "http://localhost:3000/api/admin/empresas/1/conversas/1/mensagens?order=asc&limit=200" \
	-H "x-api-key: $ADMIN_API_KEY" | jq
```

Marcar mensagens de entrada como lidas:

```bash
curl -sS -X POST "http://localhost:3000/api/admin/empresas/1/conversas/1/read" \
	-H "x-api-key: $ADMIN_API_KEY" | jq
```

Enviar mensagem manual (WhatsApp + salva em `mensagens` como `saida`):

```bash
curl -sS -X POST "http://localhost:3000/api/admin/empresas/1/conversas/1/send" \
	-H "Content-Type: application/json" \
	-H "x-api-key: $ADMIN_API_KEY" \
	-H "Idempotency-Key: comando-unico-123" \
	-d '{"text":"Olá! Posso ajudar?"}' | jq
```

Reutilize a mesma `Idempotency-Key` ao repetir uma requisição cujo resultado é
incerto. A API retornará a mensagem/outbox já criada sem duplicar o envio. Se o
header não for informado, a API gera uma chave nova e a devolve em `command_id`.

## Saúde das credenciais

A migration `012-credential-health.sql` adiciona estado de saúde do token Meta,
histórico de execuções e alertas deduplicados. Execute manualmente sem alterar
estado:

```bash
npm run db:migrate:credential-health
npm run credentials:health -- --dry-run
```

Para executar e persistir o resultado:

```bash
npm run credentials:health
```

O comando valida credenciais criptografadas por empresa, nunca imprime os
segredos e usa uma trava PostgreSQL para impedir sobreposição. Duas falhas de
autenticação consecutivas são exigidas antes de desativar uma chave de IA.
Alertas permanecem visíveis no painel mesmo sem webhook externo.

Variáveis opcionais: `META_APP_ID`, `CREDENTIAL_HEALTH_TIMEOUT_MS`,
`CREDENTIAL_HEALTH_CONCURRENCY`, `CREDENTIAL_HEALTH_FAILURE_THRESHOLD`,
`CREDENTIAL_HEALTH_ALERT_DAYS` e `CREDENTIAL_HEALTH_ALERT_WEBHOOK_URL`.
