# Continuidade entre whatsapp-saas e Paylo.IA

Retomada obrigatoria: leia primeiro `CLAUDE.md` e depois este documento. A
sequencia completa de leitura e validacao inicial esta definida em
`CLAUDE.md`.

Data da decisão: 7 de setembro de 2026.

## Fechamento do fluxo ponta a ponta - 12 de setembro de 2026

O fluxo principal do gateway foi validado na VPS:

1. a Meta entrega a mensagem no webhook assinado;
2. o evento e a mensagem de entrada sao persistidos;
3. a empresa e o contato sao identificados;
4. a IA responde com credencial criptografada da empresa;
5. a mensagem de saida entra na outbox;
6. o worker envia pela Graph API;
7. os estados de entrega retornam ao painel.

Gemini responde como provedor primario com `gemini-3.5-flash-lite`. NVIDIA foi
validada como fallback com `nvidia/nemotron-3.5-lightning-30b-a3b`. A validacao
de novas credenciais agora executa uma inferencia curta, evitando aceitar um
modelo que apareca no catalogo mas nao funcione em `chat/completions`.

Estado operacional confirmado:

- commit `89e65d1` implantado com CI aprovada;
- 17 suites e 61 testes aprovados;
- `NODE_ENV=production`;
- assinatura da Meta obrigatoria na VPS;
- `ADMIN_API_KEY` configurada;
- `APP_PUBLIC_BASE_URL=https://bot.hrmmotos.com.br`;
- API e worker online no PM2.

### Incidente de retries contido

Foram encontrados tres itens antigos da outbox em retry continuo:

- item `5`: erro definitivo `400`, destinatario nao autorizado, mais de 10 mil
  tentativas;
- itens `7` e `8`: erro `401` com token expirado preservado no payload, mais de
  4 mil tentativas em cada item;
- os tres registros foram mantidos como `failed` e tiveram `next_retry_at`
  movido para `2099-01-01`, interrompendo as chamadas sem apagar o historico.

O codigo atual nao possui limite maximo de tentativas, reprocessa todo item
`failed` e prioriza `payload.token` sobre a credencial atual da empresa. O
payload da outbox nao deve armazenar tokens.

## Sprint 3.1 - endurecimento da outbox

Implementacao local concluida em 13 de setembro de 2026:

1. novos payloads guardam somente `useEnvWhatsApp`, sem token ou Phone Number ID;
2. a migration `010-outbox-retry-hardening.sql` limpa segredos historicos;
3. cada envio resolve a credencial WhatsApp atual da empresa;
4. erros `400/401/403` tornam-se terminais; `429`, rede e `5xx` usam retry;
5. o estado `dead` encerra erros definitivos ou oito tentativas esgotadas;
6. retries automaticos usam backoff exponencial, jitter e teto configuravel;
7. a reabertura manual zera tentativas e registra contador e data de auditoria;
8. a API administrativa omite payloads, leases e resposta bruta do provedor;
9. o painel separa falhas temporarias e encerradas, com filtro e motivo terminal;
10. migration aplicada duas vezes no PostgreSQL local para validar idempotencia.

Validacao local concluida: 17 suites e 71 testes aprovados, JavaScript inline do
painel valido e migration executada duas vezes com sucesso no PostgreSQL local.

### Deploy pendente da Sprint 3.1

O deploy automatizado executara
`npm run db:migrate:outbox:retry-hardening` antes de reiniciar API e worker. A
migration convertera os itens antigos `5`, `7` e `8` em `dead`, preservando o
historico e removendo `token` e `phoneId` de todos os payloads existentes.

Depois do deploy, confirmar no painel:

1. contador `Encerradas` igual a pelo menos tres;
2. itens `5`, `7` e `8` sem nova variacao de `attempt_count`;
3. filtro `Encerradas` e botao `Reabrir e reenviar` visiveis;
4. envio de uma mensagem real concluido como `sent` e entregue pela Meta.

## Sprint 5 - multiempresa seguro

Implementacao local concluida em 13 de setembro de 2026:

- `phone_number_id` unico e restrito a digitos;
- FKs compostas impedem contato ou mensagem de outra empresa na outbox;
- campos centrais de tenant, direcao e tipo receberam integridade obrigatoria;
- token WhatsApp criptografado com AES-256-GCM e fingerprint seguro;
- migracao em duas fases preserva rollback ate API e worker passarem no health;
- rotacao e revogacao do token disponiveis no painel;
- chaves administrativas persistidas somente por hash SHA-256;
- chaves limitadas por empresa e permissoes `read`, `write` e `manage_keys`;
- `ADMIN_API_KEY` do `.env` preservada como superadmin de bootstrap;
- auditoria automatica de mutacoes bem-sucedidas e tentativas de acesso
  cruzado negadas, sem corpo ou segredo;
- painel permite emitir/revogar acessos e consultar auditoria recente;
- migration expansiva executada duas vezes e finalizacao validada no PostgreSQL
  local;
- `axios` e dependencias transitivas atualizadas; `npm audit` sem
  vulnerabilidades de producao ou desenvolvimento;
- 20 suites e 87 testes aprovados na validacao final.

Deploy concluido em 13 de setembro de 2026 pelo GitHub Actions, release
`50d5126`. A CI aprovou 20 suites e 87 testes. Na VPS, o `deploy.sh` aplicou
`db:migrate:tenant-security`, copiou um token legado para AES-256-GCM,
reiniciou API e worker, aprovou o healthcheck, validou a descriptografia e o
fingerprint e somente entao removeu o token da coluna legada. API e worker
ficaram `online`, e `https://bot.hrmmotos.com.br/` respondeu normalmente.

Validacoes operacionais seguintes:

1. conexao WhatsApp da empresa `1` validada sem recadastrar o token;
2. mensagem real recebida, tratada e entregue;
3. chave de tenant criada no painel e bloqueada ao trocar a empresa da URL;
4. rotacao/revogacao e auditoria conferidas com uma chave de teste.

### Marco seguinte

Rotina de saude, expiracao e alertas implementada localmente em 13 de setembro
de 2026. O comando independente valida Meta e IA com trava PostgreSQL,
`--dry-run`, concorrencia limitada, confirmacao de duas falhas de autenticacao,
alertas deduplicados e webhook externo opcional. O painel exibe banner e
detalhes sem revelar segredos. A migration `012-credential-health.sql` foi
aplicada duas vezes no PostgreSQL local e 21 suites com 94 testes passaram.

Deploy pendente. Depois do deploy, executar o dry-run na VPS e instalar o timer
horario em `ops/systemd`. O catalogo automatico de modelos permanece como o
proximo item de desenvolvimento em `FEATURES.md`.

## Multi-provedor de IA - 10 de setembro de 2026

Implementada e validada localmente a ampliacao da rotacao de IA para:

1. Gemini como primario, prioridade padrao `10` e modelo
   `gemini-2.5-flash-lite`;
2. NVIDIA como secundario, prioridade padrao `20` e modelo
   `meta/llama-3.1-8b-instruct`;
3. OpenAI como ultimo fallback, prioridade padrao `30`.

Gemini e NVIDIA usam endpoints oficiais compativeis com Chat Completions. A
OpenAI preserva suporte a Responses API e Chat Completions. A migration aditiva
`009-ai-multi-provider.sql` amplia o constraint sem alterar ou remover chaves
OpenAI existentes. O limite recomendado passa a ser
`AI_MAX_CREDENTIAL_ATTEMPTS=3` para permitir a sequencia completa.

Variaveis globais opcionais de fallback: `GEMINI_API_KEY`, `GEMINI_MODEL`,
`NVIDIA_API_KEY`, `NVIDIA_MODEL`, `OPENAI_API_KEY`, `OPENAI_MODEL` e
`OPENAI_API_STYLE`. O cadastro pelo painel e preferivel porque preserva o
isolamento por empresa.

Validacao local concluida:

- migrations `008` e `009` aplicadas em sequencia;
- migration `009` repetida com sucesso para confirmar idempotencia;
- 16 suites e 58 testes aprovados;
- JavaScript inline do painel, sintaxe Node e `git diff --check` aprovados;
- nenhuma chave real identificada no diff.

Antes do proximo deploy, ajustar na VPS `AI_MAX_CREDENTIAL_ATTEMPTS=3`. As
chaves podem ser cadastradas diretamente no painel depois que a migration `009`
for aplicada pela CI.

## Implementacao de credenciais de IA - 8 de setembro de 2026

Implementada localmente a configuracao OpenAI por empresa no painel admin:

- varias chaves por empresa, ordenadas por prioridade;
- validacao na OpenAI antes da gravacao e teste manual posterior;
- segredos criptografados com AES-256-GCM e nunca retornados pela API;
- chave identificada no painel e nos logs somente por fingerprint;
- ativacao, desativacao, alteracao de prioridade e exclusao pelo painel;
- failover limitado por `AI_MAX_CREDENTIAL_ATTEMPTS`;
- falhas `401/403` invalidam a chave, `429` aplica cooldown de cinco minutos e
  falhas de rede/servidor aplicam cooldown de um minuto;
- `OPENAI_API_KEY` do `.env` permanece como ultimo fallback;
- migracao `008-ai-provider-credentials.sql` aplicada duas vezes com sucesso no
  PostgreSQL local;
- suite local aprovada com 15 suites e 54 testes;
- JavaScript inline do painel e `git diff --check` aprovados.

Antes do deploy na VPS:

1. gerar uma unica chave com `openssl rand -base64 32`;
2. gravar o resultado em `CREDENTIALS_ENCRYPTION_KEY` no `.env` da VPS;
3. manter `OPENAI_API_KEY` temporariamente como fallback;
4. executar o deploy, que inclui `npm run db:migrate:ai-credentials`;
5. reiniciar API e worker com o ambiente atualizado;
6. abrir `Configuracoes > Inteligencia artificial`, cadastrar e testar a chave
   da empresa `1`;
7. enviar nova mensagem real e confirmar que a resposta nao usa mais o fallback
   generico.

Nao alterar nem perder `CREDENTIALS_ENCRYPTION_KEY` depois de cadastrar
credenciais. A rotacao dessa chave mestra exige uma migracao de recriptografia,
que ainda nao foi implementada.

## Decisão

O desenvolvimento volta agora para o projeto `whatsapp-saas`. Esse projeto será
estabilizado e concluído como gateway próprio para a WhatsApp Cloud API da Meta
antes de iniciarmos sua integração com o Paylo.IA.

A integração será uma etapa posterior e controlada. Ela não autoriza misturar os
dois códigos, bancos de dados, pipelines de deploy ou segredos.

## Responsabilidades

### whatsapp-saas

Responsável pela camada de canal:

- receber e validar webhooks da Meta;
- identificar empresa e contato;
- persistir eventos recebidos;
- controlar leases, retries e reprocessamento;
- enfileirar e enviar respostas pela Graph API;
- reconciliar estados `sent`, `delivered`, `read` e `failed`;
- oferecer operação administrativa, atendimento humano e observabilidade.

### Paylo.IA

Responsável pelo domínio financeiro:

- interpretar mensagens financeiras com Gemini;
- aplicar regras de gastos, receitas, metas e consultas;
- manter integridade e idempotência das operações financeiras;
- persistir os dados financeiros no Supabase;
- produzir uma resposta independente do provedor de WhatsApp.

## Ordem de execução

### Etapa 1 - Concluir o whatsapp-saas

Antes da integração, o gateway deve possuir:

- suíte de testes e CI aprovadas;
- assinatura da Meta obrigatória em produção;
- persistência durável antes do processamento;
- processamento de eventos `received` e `failed` pelo worker;
- leases e retries com backoff verificados;
- outbox com chave idempotente baseada no evento/comando de origem;
- correlação completa entre webhook, mensagem, outbox e ID da Graph API;
- reconciliação operacional dos estados da Meta;
- isolamento multiempresa por `phone_number_id`;
- política segura para credenciais e dados sensíveis;
- deploy, healthcheck, monitoramento e rollback documentados;
- teste real de entrada, resposta, duplicidade, falha e recuperação.

#### Progresso em 7 de setembro de 2026

Concluído nesta retomada:

- reconciliação transacional entre `outbox_messages` e `mensagens`;
- propagação do ID retornado pela Graph API para a mensagem de saída;
- estados `sent`, `delivered`, `read` e `failed` visíveis na conversa e outbox;
- proteção contra regressão quando webhooks de status chegam fora de ordem;
- isolamento da reconciliação por `phone_number_id` em produção;
- testes automatizados para avanço, regressão e isolamento de status;
- chave idempotente da outbox baseada no `webhook_event_id` ou comando manual;
- propagação do ID persistido do webhook até a criação da outbox;
- suporte a `Idempotency-Key` nos envios manuais do admin;
- prevenção de mensagens de saída órfãs quando uma origem é repetida;
- configuração de `phone_number_id` e token por empresa diretamente no painel;
- validação das credenciais na Graph API antes da persistência;
- token armazenado permanece oculto em todas as respostas administrativas.

#### Encerramento de 7 de setembro de 2026

- suíte local aprovada com 13 suítes e 50 testes;
- script JavaScript do painel validado sem erro de sintaxe;
- `git diff --check` aprovado;
- deploy desta versão executado de forma controlada pelo workflow do GitHub;
- nenhuma migração nova de banco é necessária para este pacote;
- alterações locais de `.venv` e `package-lock.json` não pertencem ao pacote e
  devem continuar fora dos commits.

Ordem da próxima retomada:

1. confirmar o healthcheck e os dois processos PM2 na VPS;
2. trocar a chave administrativa curta por uma chave forte;
3. ajustar `APP_PUBLIC_BASE_URL=https://bot.hrmmotos.com.br` e reiniciar o
   ecosystem com `--update-env`;
4. abrir `Configurar WhatsApp`, informar o `Phone Number ID` da Meta e um token
   de longa duração para a empresa `1`;
5. confirmar que o painel exibe `Conexão validada`;
6. revisar os logs da OpenAI, pois as mensagens reais estão usando fallback;
7. executar o teste real descrito em `docs/guia-uso-operacao.md` e conferir a
   sequência entrada, resposta, outbox, `sent`, `delivered` e `read`.

#### Tela da Meta registrada para a próxima retomada

Referência visual recebida em 7 de setembro de 2026: tela
`Configurações básicas` do aplicativo Meta.

Estado observado:

- ID do aplicativo: `931281519613193`;
- nome de exibição: `msg_teste`;
- namespace: `msg_teste`;
- chave secreta existente e mascarada; o valor não foi registrado;
- domínio do aplicativo ainda vazio;
- URLs legais ainda apontando para `https://hrmmotos.com.br/wppsaas`;
- instruções de exclusão configuradas por URL;
- ícone do aplicativo já configurado.

Valores a configurar nessa tela:

- Domínios do aplicativo: `bot.hrmmotos.com.br`;
- URL da Política de Privacidade:
  `https://bot.hrmmotos.com.br/privacy`;
- URL dos Termos de Serviço: `https://bot.hrmmotos.com.br/terms`;
- URL de instruções de exclusão de dados:
  `https://bot.hrmmotos.com.br/data-deletion`.

Configuração de retorno no `Meta for Developers`, e não no Gerenciador do
WhatsApp mostrado na captura:

- link direto do aplicativo:
  `https://developers.facebook.com/apps/931281519613193/whatsapp-business/wa-settings/`;
- menu alternativo da interface nova:
  `Casos de uso > Personalizar > WhatsApp > Configuração`;

- URL de callback: `https://bot.hrmmotos.com.br/api/webhook`;
- token de verificação: usar exatamente o `VERIFY_TOKEN` da VPS, sem registrar
  seu valor na documentação;
- assinar o campo `messages`;
- confirmar que a assinatura `X-Hub-Signature-256` está ativa e aceita pelo
  endpoint.

Estado confirmado em 8 de setembro de 2026:

- a tela correta foi localizada em `Etapa 2 > Configuração de produção`;
- callback preenchido com `https://bot.hrmmotos.com.br/api/webhook`;
- token de verificação preenchido e mascarado;
- webhook apresenta indicador verde e a ação `Remover assinatura`, indicando
  que a verificação foi salva;
- certificado de cliente está desativado, como esperado para a configuração
  atual;
- o aplicativo ainda não está publicado;
- a própria Meta alerta que, enquanto não houver publicação, serão entregues
  apenas webhooks de teste enviados pelo painel do aplicativo;
- próximo passo: confirmar a assinatura do campo `messages`, disparar o teste
  desse campo e somente depois revisar os requisitos para publicar o app.

Resultado do teste do campo `messages`:

- o webhook de teste chegou à API e foi persistido como mensagem de entrada;
- payload de teste recebido com `phone_number_id=123456123`, remetente
  `16315551181` e texto `this is a text message`;
- esses identificadores são fictícios da ferramenta de teste da Meta e não
  devem ser gravados como credenciais da empresa;
- a IA usou o fallback genérico e acionou corretamente o alerta humano;
- o alerta chegou ao telefone real configurado em `HUMAN_ALERT_WHATSAPP_TO`;
- a resposta automática foi criada na outbox com correlação ao webhook;
- o envio ao remetente fictício falhou com HTTP 400 após cinco tentativas, o
  que é esperado para esse payload de demonstração;
- a empresa `1` continua sem `phone_number_id` e token próprios no banco;
- o payload da outbox confirmou uso do fallback de credenciais do `.env`;
- próximo teste válido deve usar o Phone Number ID real salvo pelo botão
  `Configurar WhatsApp` e uma mensagem enviada por um telefone autorizado.

Bloqueio encontrado ao salvar pelo painel:

- o preflight `OPTIONS /api/empresas/1/whatsapp` retornou HTTP 403;
- origem bloqueada: `https://bot.hrmmotos.com.br`;
- corrigir na VPS com
  `CORS_ALLOWED_ORIGINS=https://bot.hrmmotos.com.br`;
- reiniciar somente `whatsapp-saas-api` com `--update-env`;
- repetir o preflight e depois usar `Salvar e validar` no painel.

Configuração concluída em 8 de setembro de 2026:

- CORS corrigido na VPS e preflight confirmado com HTTP 204;
- empresa `1` configurada com Phone Number ID `993692280501871`;
- token armazenado no banco sem exposição pela API;
- validação na Graph API aprovada;
- número confirmado pela Meta: `+1 555-161-3563`;
- nome verificado retornado: `Test Number`;
- ainda falta ajustar na VPS
  `APP_PUBLIC_BASE_URL=https://bot.hrmmotos.com.br`, pois o onboarding continua
  exibindo a URL histórica `/wppsaas`;
- correção visual local pendente de deploy: o código inline `messages` não deve
  usar o mesmo estilo de bloco reservado para a URL do webhook.

Teste de envio iniciado pela Meta:

- etapa `Envie uma mensagem do seu número de teste` marcada como concluída;
- número de teste selecionado: `+1 555-161-3563`;
- destinatário autorizado selecionado: `+55 11 96774-5351`;
- template de confirmação disparado pela ferramenta da Meta;
- a captura exibiu parte do Bearer token no exemplo de `curl`; por segurança,
  gerar outro token e substituí-lo pelo painel antes de continuar;
- próximo teste: responder pelo destinatário autorizado para o número de teste
  e acompanhar API, conversa e outbox.

Teste ponta a ponta real concluído em 8 de setembro de 2026, às 15:46:

- entrada recebida: `Olá, teste real do webhook`;
- mensagem persistida e exibida no painel;
- resposta de saída criada cerca de cinco segundos depois;
- outbox processada pelo worker;
- resposta confirmada como `Entregue ao cliente` pela Meta;
- webhook, assinatura, roteamento, credenciais WhatsApp, worker, Graph API e
  reconciliação de entrega estão funcionais no ambiente de teste;
- a resposta ainda usou `AI_FALLBACK_TEXT`, portanto o próximo diagnóstico deve
  se concentrar exclusivamente na configuração/erro da OpenAI;
- a publicação do aplicativo continua necessária antes do uso com usuários de
  produção fora do ambiente de teste autorizado.

Próximo foco:

- validar correlação completa em um teste real na VPS;
- exercitar duplicidade, falha transitória e recuperação pelo worker;
- tornar a assinatura da Meta obrigatória em produção e testar rejeições.

Diagnostico operacional e roteiro de teste:

- [docs/guia-uso-operacao.md](docs/guia-uso-operacao.md)
- o endpoint publico atual e `https://bot.hrmmotos.com.br`;
- a VPS ainda deve substituir `APP_PUBLIC_BASE_URL=https://hrmmotos.com.br/wppsaas`;
- a empresa `1` deve receber e validar `phone_number_id` e token no banco;
- a IA deve ser revisada porque as mensagens reais estao usando o fallback generico.

### Etapa 2 - Preparar o contrato de integração

Com o gateway estabilizado, definir um contrato interno contendo:

- `provider` e `external_message_id`;
- empresa, contato e telefone em formato canônico;
- texto, tipo e instante da mensagem;
- autenticação entre os serviços;
- classificação de erros transitórios e definitivos;
- resposta idempotente e recuperável;
- correlação de ponta a ponta.

### Etapa 3 - Integrar sem remover a Twilio imediatamente

O `whatsapp-saas` chamará o Paylo por uma API interna autenticada. O Paylo
retornará JSON, sem TwiML e sem conhecer detalhes da Graph API. A Twilio será
mantida temporariamente como caminho de rollback até a validação do fluxo Meta.

A ativação ocorrerá primeiro para um único número/empresa. A retirada da Twilio
só poderá acontecer depois de testes reais e observação do novo fluxo em
produção.

## Limites da integração

- Cada projeto permanece em seu próprio repositório.
- Cada projeto mantém seu próprio banco e suas próprias migrações.
- Nenhuma credencial será compartilhada ou versionada.
- O `whatsapp-saas` não acessará diretamente as tabelas financeiras.
- O Paylo não enviará mensagens diretamente pela Graph API.
- Falhas entre serviços devem ser recuperáveis sem duplicar movimentações ou
  respostas.
- Alterações de banco serão feitas somente por novas migrações.

## Repositórios vinculados

- `whatsapp-saas`: `/home/harlem/projetos/whatsapp-saas`
- Paylo.IA: `/home/harlem/projetos/paylo-gemini-v2`

Este documento deve existir nos dois repositórios e ser atualizado quando a
ordem, os critérios de conclusão ou o contrato de integração forem alterados.
