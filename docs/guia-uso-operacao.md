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

Na tela `Configuracoes basicas` da Meta, preencha `Dominios do aplicativo`
somente com `bot.hrmmotos.com.br`, sem protocolo ou caminho. As URLs legais
recebem os enderecos completos acima. A URL de retorno nao e preenchida nessa
tela nem no Gerenciador do WhatsApp.

Para configurar o retorno, abra o painel `Meta for Developers`, selecione o
aplicativo e acesse `WhatsApp > Configuracao > Webhook`. Para o aplicativo
atual, o endereco direto e:

```text
https://developers.facebook.com/apps/931281519613193/whatsapp-business/wa-settings/
```

Na secao `Webhook`, clique em `Editar` ou `Configurar webhooks` e informe:

```text
URL de callback: https://bot.hrmmotos.com.br/api/webhook
Token de verificacao: o mesmo VERIFY_TOKEN da VPS
```

Depois de `Verificar e salvar`, use `Gerenciar` nos campos do webhook e assine
`messages`. Dependendo do layout da conta, o menu pode aparecer como
`Casos de uso > Personalizar > WhatsApp > Configuracao`.

Na interface atual, essa area tambem pode aparecer em
`Etapa 2 > Configuracao de producao > Configurar webhooks`. A presenca do botao
`Remover assinatura` e do indicador verde confirma que o callback foi salvo.
Mantenha o certificado de cliente desativado, salvo se o servidor tiver sido
preparado especificamente para mTLS.

Se a Meta exibir o alerta de aplicativo nao publicado, apenas os webhooks de
teste disparados pelo painel serao entregues. Primeiro assine `messages` e use
`Testar`; depois conclua os requisitos e publique o aplicativo para validar
mensagens reais.

O teste padrao do campo `messages` pode enviar identificadores ficticios, como
`phone_number_id=123456123` e remetente `16315551181`. Ele valida callback,
assinatura e processamento de entrada, mas uma tentativa de responder a esse
remetente pode receber HTTP 400. Nao salve esses valores na empresa. Para
validar envio e resposta, use o Phone Number ID real da tela de configuracao da
API e envie uma mensagem a partir de um telefone autorizado.

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

O texto `No momento nao consegui responder automaticamente...` indica que todos
os provedores configurados falharam ou estao desabilitados. A ordem padrao e
Gemini, NVIDIA e OpenAI, respeitando sempre a prioridade numerica salva.

O caminho recomendado e abrir `Configuracoes > Inteligencia artificial` no
painel da empresa. Cadastre nome, API key, modelo, estilo da API e prioridade.
A chave so e armazenada depois de ser validada e nunca volta ao navegador.
Use `Testar` para revalidar, `Desativar` para retira-la da rotacao e uma
prioridade numerica menor para que seja tentada antes das demais.

Confira somente a presenca das variaveis, sem imprimir seus valores:

```bash
cd /home/whatsapp/app
node -e "require('dotenv').config(); for (const k of ['OPENAI_API_KEY','OPENAI_MODEL','OPENAI_API_STYLE']) console.log(k, process.env[k] ? 'configurada' : 'ausente')"
pm2 logs whatsapp-saas-api --lines 200
```

Procure nos logs por `Provedor de IA falhou com credencial`, incluindo o campo
`provider`, e pelo erro imediatamente anterior. Depois de corrigir o `.env`,
reinicie a API com o ambiente atualizado:

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
CORS_ALLOWED_ORIGINS=https://bot.hrmmotos.com.br
CORS_ALLOW_NO_ORIGIN=true
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
GEMINI_API_KEY=CHAVE_GEMINI
GEMINI_MODEL=gemini-2.5-flash-lite
NVIDIA_API_KEY=CHAVE_NVIDIA
NVIDIA_MODEL=meta/llama-3.1-8b-instruct
CREDENTIALS_ENCRYPTION_KEY=CHAVE_DE_32_BYTES_EM_BASE64
AI_MAX_CREDENTIAL_ATTEMPTS=3
WEBHOOK_WORKER_STATUSES=failed
```

Antes do primeiro cadastro de chave pelo painel, gere uma chave mestra uma
unica vez na VPS e adicione o resultado ao `.env` sem executar `source .env`:

```bash
openssl rand -base64 32
```

Depois do deploy, aplique `npm run db:migrate:ai-credentials` com o usuario dono
do schema e reinicie API e worker. Nao troque nem perca
`CREDENTIALS_ENCRYPTION_KEY`: as credenciais ja salvas dependem dela para serem
descriptografadas. `OPENAI_API_KEY` pode permanecer no `.env` como ultimo
fallback enquanto a migracao para as chaves por empresa e validada.

Nao execute `source .env`: valores com espacos podem ser interpretados como
comandos pelo shell. A API e o worker carregam o arquivo com `dotenv`.

Se o painel exibir `CORS origin nao permitida`, confirme que
`CORS_ALLOWED_ORIGINS` contem exatamente a origem do navegador, sem barra no
final, e reinicie `whatsapp-saas-api` com `--update-env`.

Validacao realizada em 8 de setembro de 2026 para a empresa `1`: Phone Number
ID `993692280501871`, token armazenado e numero `+1 555-161-3563` (`Test
Number`) aceitos pela Graph API.

O teste real com um destinatario autorizado tambem foi concluido: entrada,
persistencia, outbox, envio e estado `delivered` funcionaram. A resposta usou o
fallback generico, deixando a configuracao dos provedores de IA como unico
bloqueio observado nesse fluxo.

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
4. Cadastrar e testar Gemini, NVIDIA e OpenAI, nessa ordem de prioridade.
5. Enviar uma nova mensagem real e acompanhar conversa, outbox e os dois logs.
