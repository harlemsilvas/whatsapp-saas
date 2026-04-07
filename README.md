# whatsapp-saas

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

- [ ] Token de longo prazo (produção): trocar token temporário por System User / token com expiração adequada
- [ ] Garantir assinatura correta no App da Meta: evento `messages` + URL fixa (sem depender de ngrok)
- [ ] Deploy com HTTPS (Nginx + Certbot) e processo (PM2) + restart automático
- [ ] Rate limit / hardening no webhook (evitar abuso, logs e métricas)
- [ ] Multi-tenant completo: CRUD de credenciais por empresa + onboarding (phone_number_id/token)

## Admin (Empresas + Onboarding)

Se `ADMIN_API_KEY` estiver definido no `.env`, os endpoints abaixo exigem header `x-api-key`.

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
