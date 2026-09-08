# Continuidade entre whatsapp-saas e Paylo.IA

Data da decisão: 7 de setembro de 2026.

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
