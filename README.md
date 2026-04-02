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
