# Continuidade entre whatsapp-saas e Paylo.IA

Data da decisão: 7 de setembro de 2026.

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
