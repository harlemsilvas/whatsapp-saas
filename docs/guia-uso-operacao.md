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
   painel valida as credenciais na Meta antes de gravar, criptografa o token e
   nunca exibe o valor armazenado. Use `Revogar token` para interromper o uso.
3. Clique em uma conversa para visualizar as mensagens recebidas e enviadas.
4. Confira o estado do contato. Se estiver em atendimento humano ou pausado,
   use `Devolver para o bot` antes do teste automatico.
5. Use `Debug` para conferir `suppressReasonNow`, credenciais do WhatsApp,
   ultima entrada, ultima saida e itens recentes da outbox.
6. Use a visao global da outbox para filtrar `pending`, `processing`, `failed`,
   `dead` e `sent`. `failed` ainda terá retry automático; `dead` exige revisar
   o motivo terminal e usar `Reabrir e reenviar` pelo próprio painel.
7. O campo de envio do painel cria uma mensagem manual. Esse teste valida
   banco, outbox, worker e Graph API, mas nao valida o webhook nem a IA.
8. Em `Acesso administrativo`, gere chaves específicas por empresa. Prefira o
   perfil `Operação` no uso diário e mantenha a chave global somente para
   bootstrap e manutenção de superadmin.
9. Consulte `Auditoria recente` para conferir alterações bem-sucedidas. Corpos
   de requisição, tokens e chaves nunca são copiados para o log de auditoria.
10. Em `Inteligência artificial`, use `Sincronizar catálogo` na chave desejada.
    Escolha um modelo de chat retornado e clique em `Usar modelo`; o sistema faz
    uma inferência curta antes de efetivar a troca.

## Atualizar o token da Meta

Quando a conexao exibir `Error validating access token: Session has expired`,
o token de acesso da Meta expirou. O `Phone Number ID` e o webhook continuam
validos e nao devem ser alterados por esse motivo.

Para producao, nao reutilize o token temporario exibido em
`WhatsApp > Configuracao da API`. Gere um token por usuario do sistema:

1. Acesse as [Configuracoes do negocio da Meta](https://business.facebook.com/settings/system-users?business_id=1679554223178097).
2. Entre em `Usuarios > Usuarios do sistema`.
3. Crie um usuario chamado `whatsapp-saas`, preferencialmente como
   administrador.
4. Em `Adicionar ativos`, conceda acesso total ao aplicativo
   `931281519613193`.
5. Adicione a conta do WhatsApp correspondente e permita gerenciar a conta.
6. Clique em `Gerar novo token` e selecione o aplicativo `931281519613193`.
7. Escolha a validade `Nunca`, quando essa opcao estiver disponivel.
8. Marque as permissoes `whatsapp_business_messaging` e
   `whatsapp_business_management`.
9. Gere e armazene o token em local seguro. Nunca o envie em mensagens, logs,
   documentacao ou capturas de tela.

Para substituir o token no `whatsapp-saas`:

1. Abra `Configuracoes da empresa > Configurar WhatsApp`.
2. Mantenha o Phone Number ID atual. Para a empresa `1`, o valor confirmado e
   `993692280501871`.
3. Cole o novo valor em `Token de acesso`.
4. Clique em `Salvar e validar`.
5. Execute `Testar conexao atual` para confirmar a Graph API.

O token e atualizado diretamente no banco e passa a ser lido nas proximas
operacoes. Nao e necessario reiniciar a API ou o worker. O `VERIFY_TOKEN` do
webhook e uma credencial independente e nao deve ser substituido junto com o
token de acesso.

A expiracao bloqueia validacoes e mensagens de saida na Graph API. O
recebimento pelo webhook pode continuar funcionando, pois usa a assinatura e o
`VERIFY_TOKEN`, e nao o token de envio armazenado para a empresa.

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
GEMINI_MODEL=gemini-3.5-flash-lite
NVIDIA_API_KEY=CHAVE_NVIDIA
NVIDIA_MODEL=nvidia/nemotron-3.5-lightning-30b-a3b
CREDENTIALS_ENCRYPTION_KEY=CHAVE_DE_32_BYTES_EM_BASE64
REQUIRE_CREDENTIALS_ENCRYPTION_KEY=true
AI_MAX_CREDENTIAL_ATTEMPTS=3
CREDENTIAL_HEALTH_TIMEOUT_MS=15000
CREDENTIAL_HEALTH_CONCURRENCY=2
CREDENTIAL_HEALTH_FAILURE_THRESHOLD=2
CREDENTIAL_HEALTH_ALERT_DAYS=30,15,7,3,1
# Opcional para consultar a expiração pelo debug_token da Meta
META_APP_ID=ID_DO_APLICATIVO_META
# Canal externo opcional; alertas também permanecem no painel
CREDENTIAL_HEALTH_ALERT_WEBHOOK_URL=
WEBHOOK_WORKER_STATUSES=failed
OUTBOX_MAX_ATTEMPTS=8
OUTBOX_RETRY_BASE_SECONDS=30
OUTBOX_RETRY_MAX_SECONDS=3600
OUTBOX_RETRY_JITTER_RATIO=0.2
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

### Agendar a saúde das credenciais

Depois do deploy, valide primeiro sem persistir alterações:

```bash
cd /home/whatsapp/app
npm run credentials:health -- --dry-run
```

Instale o timer horário versionado no repositório:

```bash
sudo cp ops/systemd/whatsapp-saas-credential-health.service /etc/systemd/system/
sudo cp ops/systemd/whatsapp-saas-credential-health.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now whatsapp-saas-credential-health.timer
sudo systemctl start whatsapp-saas-credential-health.service
sudo systemctl status whatsapp-saas-credential-health.timer --no-pager
sudo journalctl -u whatsapp-saas-credential-health.service -n 100 --no-pager
```

O painel mostra alertas persistentes. Configure
`CREDENTIAL_HEALTH_ALERT_WEBHOOK_URL` para receber também um POST JSON em canal
independente do WhatsApp. O payload contém empresa, provedor, motivo e prazo,
mas nunca token, chave ou fingerprint.

### Sincronizar o catálogo de modelos

Depois do deploy e da migration `013`, faça uma descoberta sem gravar para
validar o acesso aos provedores:

```bash
cd /home/whatsapp/app
npm run models:sync -- --dry-run
```

Persistindo o catálogo de todas as credenciais habilitadas:

```bash
npm run models:sync
```

Para inspecionar uma empresa e gerar um arquivo detalhado sem incluir chaves:

```bash
npm run models:sync -- --empresa-id=1 --include-models --output=/tmp/model-catalog.json
```

Instale o timer diário após confirmar a execução manual:

```bash
sudo cp ops/systemd/whatsapp-saas-model-catalog.service /etc/systemd/system/
sudo cp ops/systemd/whatsapp-saas-model-catalog.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now whatsapp-saas-model-catalog.timer
sudo systemctl start whatsapp-saas-model-catalog.service
sudo systemctl status whatsapp-saas-model-catalog.timer --no-pager
sudo journalctl -u whatsapp-saas-model-catalog.service -n 100 --no-pager
```

O timer consulta apenas catálogos. A seleção de um modelo no painel continua
validando uma inferência curta, pois aparecer em `/models` não garante suporte
ao endpoint usado pelo atendimento.

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
