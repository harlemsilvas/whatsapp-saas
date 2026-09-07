# Guia de uso e operacao

Este guia descreve como acessar, testar e diagnosticar o `whatsapp-saas` na VPS.

## Enderecos do servico

Base publica atual:

```text
https://bot.hrmmotos.com.br
```

Principais enderecos:

- painel administrativo: `https://bot.hrmmotos.com.br/api/admin/ui?key=SUA_ADMIN_API_KEY`
- healthcheck: `https://bot.hrmmotos.com.br/`
- webhook da Meta: `https://bot.hrmmotos.com.br/api/webhook`
- politica de privacidade: `https://bot.hrmmotos.com.br/privacy`
- termos de servico: `https://bot.hrmmotos.com.br/terms`
- exclusao de dados: `https://bot.hrmmotos.com.br/data-deletion`

O `GET /api/webhook` sem os parametros `hub.*` retorna `403`. Isso e esperado e
nao significa que o webhook esteja fora do ar.

## Seguranca do painel

A chave administrativa e uma credencial. Nao a registre em documentacao,
prints ou mensagens. Como uma chave curta foi compartilhada durante o
diagnostico, substitua-a por uma chave longa e aleatoria no `.env` da VPS:

```bash
cd /home/whatsapp/app
openssl rand -hex 32
nano .env
pm2 restart ecosystem.config.js --update-env
pm2 save
```

Abra o painel com a nova chave apenas uma vez. A pagina remove o parametro da
barra de enderecos e usa a chave no header `x-api-key` nas chamadas seguintes.

## Como usar o painel

1. Abra o painel e mantenha `Empresa ID` igual a `1` enquanto houver apenas uma
   empresa cadastrada.
2. Use `Configurar WhatsApp` para informar o `Phone Number ID` e o token. O
   painel valida as credenciais na Meta antes de gravar e nunca exibe o token
   armazenado.
3. Clique em uma conversa para visualizar as mensagens recebidas e enviadas.
4. Confira o estado do contato. Se estiver em atendimento humano ou pausado,
   use `Devolver para o bot` antes do teste automatico.
5. Use `Debug` para conferir `suppressReasonNow`, credenciais do WhatsApp,
   ultima entrada, ultima saida e itens recentes da outbox.
6. Use a visao global da outbox para filtrar `pending`, `processing`, `failed`
   e `sent`. Um item `failed` pode ser reenviado pelo proprio painel.
7. O campo de envio do painel cria uma mensagem manual. Esse teste valida
   banco, outbox, worker e Graph API, mas nao valida o webhook nem a IA.

## Teste ponta a ponta

Use um telefone autorizado no aplicativo da Meta para enviar uma mensagem de
texto ao numero de teste do WhatsApp Cloud API.

Resultado esperado, nesta ordem:

1. A nova entrada aparece na conversa do painel.
2. O contato permanece em modo `bot`, sem `suppressReasonNow`.
3. Uma resposta de saida e gravada.
4. Um item aparece na outbox como `pending` e avanca para `sent`.
5. O `provider_status` avanca para `delivered` e, quando aplicavel, `read`.
6. A resposta chega ao telefone que iniciou a conversa.

Depois de enviar a mensagem, acompanhe os dois processos na VPS:

```bash
pm2 status
pm2 logs whatsapp-saas-api --lines 200
pm2 logs whatsapp-saas-worker --lines 200
```

Logs esperados na API:

```text
Webhook recebido
Webhook mensagem recebida
Mensagem recebida
```

Logs esperados no worker quando houver trabalho:

```text
Webhook worker processou ciclo
```

Deve existir exatamente um processo `whatsapp-saas-api` e um processo
`whatsapp-saas-worker` no PM2.

## Diagnostico por etapa

### A mensagem nao aparece no painel

O problema esta antes do processamento da aplicacao. Confira no painel da Meta:

- callback: `https://bot.hrmmotos.com.br/api/webhook`
- verify token: o mesmo `VERIFY_TOKEN` da VPS
- assinatura do campo `messages`
- modo do aplicativo e telefones de teste autorizados

Confira tambem os logs do Nginx e da API:

```bash
sudo tail -n 200 /var/log/nginx/access.log
sudo tail -n 200 /var/log/nginx/error.log
pm2 logs whatsapp-saas-api --lines 200
```

### A entrada aparece, mas a resposta e generica

O texto `No momento nao consegui responder automaticamente...` indica que a
OpenAI esta desabilitada ou falhou. Atualmente o codigo deste repositorio usa
OpenAI; Gemini ainda nao esta implementado como provedor alternativo.

Confira somente a presenca das variaveis, sem imprimir seus valores:

```bash
cd /home/whatsapp/app
node -e "require('dotenv').config(); for (const k of ['OPENAI_API_KEY','OPENAI_MODEL','OPENAI_API_STYLE']) console.log(k, process.env[k] ? 'configurada' : 'ausente')"
pm2 logs whatsapp-saas-api --lines 200
```

Procure nos logs por `IA respondeu com fallback` e pelo erro imediatamente
anterior. Depois de corrigir o `.env`, reinicie a API com o ambiente atualizado:

```bash
pm2 restart whatsapp-saas-api --update-env
```

### A resposta e criada, mas nao chega ao WhatsApp

Confira primeiro a outbox no painel. Se nao houver item novo, confirme que a
VPS esta no commit esperado e reinicie os dois processos pelo ecosystem:

```bash
cd /home/whatsapp/app
git rev-parse --short HEAD
git status --short
pm2 startOrRestart ecosystem.config.js --update-env
pm2 save
```

Se o item estiver `pending`, o worker nao o processou. Se estiver `failed`, abra
o detalhe para ler `last_error`. Se estiver `sent`, confira
`provider_message_id` e `provider_status`.

### Credenciais da empresa ausentes

O envio multiempresa usa `empresas.whatsapp_token` e
`empresas.phone_number_id`. No painel, clique em `Configurar WhatsApp`, informe
o Phone Number ID e o token e use `Salvar e validar`.

Como alternativa operacional, configure ambos pela API administrativa:

```bash
curl -sS -X PUT "https://bot.hrmmotos.com.br/api/empresas/1/whatsapp" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $ADMIN_API_KEY" \
  -d '{
    "phone_number_id": "SEU_PHONE_NUMBER_ID",
    "whatsapp_token": "SEU_TOKEN_DE_LONGA_DURACAO",
    "validate": true
  }'
```

Valide as credenciais salvas:

```bash
curl -sS -X POST \
  "https://bot.hrmmotos.com.br/api/empresas/1/whatsapp/verify" \
  -H "x-api-key: $ADMIN_API_KEY"
```

Resposta esperada: HTTP `200`, `ok: true`, numero exibido e nome verificado.
Somente depois dessa validacao mantenha `ALLOW_PHONE_ID_FALLBACK=false` em
producao.

## Configuracao minima da VPS

O `.env` da VPS deve conter, no minimo:

```env
NODE_ENV=production
APP_PUBLIC_BASE_URL=https://bot.hrmmotos.com.br
ADMIN_API_KEY=CHAVE_LONGA_E_ALEATORIA
REQUIRE_ADMIN_API_KEY=true
VERIFY_TOKEN=TOKEN_DE_VERIFICACAO
WHATSAPP_APP_SECRET=APP_SECRET_DA_META
REQUIRE_WHATSAPP_WEBHOOK_SIGNATURE=true
WHATSAPP_PHONE_ID=PHONE_NUMBER_ID_DA_META
WHATSAPP_TOKEN=TOKEN_DE_LONGA_DURACAO
ALLOW_PHONE_ID_FALLBACK=false
OPENAI_API_KEY=CHAVE_OPENAI
OPENAI_MODEL=gpt-4o-mini
OPENAI_API_STYLE=responses
WEBHOOK_WORKER_STATUSES=failed
```

Nao execute `source .env`: valores com espacos podem ser interpretados como
comandos pelo shell. A API e o worker carregam o arquivo com `dotenv`.

## Resultado do diagnostico de 7/9/2026

Os testes externos confirmaram:

- healthcheck publico respondendo HTTP `200`;
- webhook acessivel e retornando o `403` esperado sem parametros;
- mensagens de entrada chegando e sendo persistidas;
- contato em modo `bot`, sem pausa ou atendimento humano;
- IA retornando o fallback generico;
- empresa `1` sem token e sem `phone_number_id` no banco;
- onboarding ainda gerando a URL antiga `https://hrmmotos.com.br/wppsaas`;
- ultimo item existente na outbox enviado e entregue em 31/8/2026;
- respostas gravadas em 7/9/2026 sem item correspondente na outbox consultada.

Ordem recomendada para corrigir:

1. Trocar `ADMIN_API_KEY` e `APP_PUBLIC_BASE_URL` na VPS.
2. Confirmar o commit implantado e reiniciar o ecosystem com `--update-env`.
3. Salvar e validar as credenciais WhatsApp da empresa `1`.
4. Diagnosticar a OpenAI pelos logs e corrigir sua credencial/configuracao.
5. Enviar uma nova mensagem real e acompanhar conversa, outbox e os dois logs.
