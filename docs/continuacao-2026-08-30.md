# Continuação do Projeto — 30/08/2026

## Ordem de leitura na próxima retomada

Ler nesta sequência:

1. [docs/analise.md](/home/harlem/projetos/whatsapp-saas/docs/analise.md)
2. [docs/cronograma.md](/home/harlem/projetos/whatsapp-saas/docs/cronograma.md)
3. [docs/deploy.md](/home/harlem/projetos/whatsapp-saas/docs/deploy.md)
4. [README.md](/home/harlem/projetos/whatsapp-saas/README.md)
5. [docs/continuacao-2026-08-30.md](/home/harlem/projetos/whatsapp-saas/docs/continuacao-2026-08-30.md)

Objetivo dessa ordem:

- entender os riscos originais
- ver o cronograma macro
- alinhar a realidade de deploy da VPS
- conferir comandos atualizados
- retomar exatamente do ponto atual

## Estado do repositório

Data de referência: 30/08/2026

Estado do Git:

- branch atual: `main`
- remoto: `origin https://github.com/harlemsilvas/whatsapp-saas.git`
- comparação local x remoto após `git fetch --all --prune`: `0` commits à frente e `0` atrás
- `HEAD` local e `origin/main` apontam para o commit `360886b`

Conclusão:

- não há divergência de histórico entre local e remoto neste momento
- o trabalho atual está principalmente em arquivos modificados e novos ainda não commitados

## Contexto de deploy e domínio correto

O domínio ativo na VPS não é `saas.hdevsolucoes.tech`.

A URL correta já em uso e configurada na VPS é:

- `https://hrmmotos.com.br/wppsaas/`

Base pública correta da aplicação:

- `APP_PUBLIC_BASE_URL=https://hrmmotos.com.br/wppsaas`

Esse ajuste já foi refletido no [`.env`](/home/harlem/projetos/whatsapp-saas/.env:43).

Referências consistentes com isso:

- [README.md](/home/harlem/projetos/whatsapp-saas/README.md:227)
- [docs/deploy.md](/home/harlem/projetos/whatsapp-saas/docs/deploy.md:30)

## O que já foi entregue

### Sprint 1

Concluído:

- hardening do admin com fail-closed em produção
- comparação segura de `ADMIN_API_KEY`
- limpeza de logs sensíveis do webhook e do envio WhatsApp
- `CORS` configurável por ambiente
- revisão do `.env.example`
- CI em GitHub Actions antes do deploy
- Compose local endurecido
- Compose de produção separado
- scripts de migração usando credenciais de superusuário quando necessário

### Sprint 2

Concluído:

- extração de payload em lote para múltiplos `entries`, `changes`, `messages` e `statuses`
- processamento unitário por evento
- persistência durável dos eventos em `webhook_events`
- marcação de `received`, `processing`, `processed` e `failed`
- replay manual de eventos falhos
- lease simples com `lease_token`, `lease_expires_at`, `attempt_count` e `next_retry_at`
- worker leve contínuo para polling de eventos retryable

### Sprint 3

Em andamento:

- outbox transacional de saída criada
- `messageService` agora enfileira resposta em vez de chamar a Graph API diretamente
- worker passou a processar `outbox_messages` além de `webhook_events`
- base pronta para retry de envio e futura reconciliação de status
- painel admin agora exibe a outbox recente por contato
- retry manual por item da outbox disponível via API/admin UI

## Comandos já disponíveis

Banco/migrações:

```bash
DB_PORT=15432 docker compose up -d postgres
npm run db:migrate:unread
npm run db:migrate:webhook-events
npm run db:migrate:webhook-events:retry-lease
npm run db:migrate:outbox
```

Aplicação:

```bash
npm run dev
npm run worker:webhook
```

Replay manual:

```bash
npm run webhook:reprocess
npm run webhook:reprocess -- --limit=50
```

Testes:

```bash
npm test -- --runInBand
```

## Observações importantes do ambiente local

No Windows 11 + WSL:

- a porta `5432` do Windows já estava ocupada
- o container local subiu com sucesso ao publicar `15432`
- a aplicação precisou ser ajustada para respeitar `DB_PORT`
- no cenário atual, `DB_HOST=localhost` funciona melhor que `host.docker.internal`

Estado esperado do `.env` local:

- `DB_HOST=localhost`
- `DB_PORT=15432`

## Próximo passo recomendado

Próximo foco técnico:

1. criar outbox transacional para mensagens de saída
2. desacoplar o envio da Graph API do processamento principal
3. implementar retry com backoff para envios
4. correlacionar `webhook_events` com envios de saída

Status atual desse bloco:

- itens 1 e 2 já entraram no código
- item 3 está parcialmente coberto pela estrutura de retry da outbox
- item 4 ainda precisa ser aprofundado

Próxima continuação recomendada:

1. ampliar a reconciliação de status da Meta (`sent`, `delivered`, `read`, `failed`) no admin e nos modelos
2. adicionar filtros operacionais da outbox no painel (`failed`, `pending`, `processing`, `sent`)
3. preparar observabilidade e métricas simples da fila
4. só depois aprofundar sync completo de delivery/read da Meta

## Arquivos-chave para a próxima etapa

- [src/controllers/webhookController.js](/home/harlem/projetos/whatsapp-saas/src/controllers/webhookController.js:1)
- [src/models/WebhookEvent.js](/home/harlem/projetos/whatsapp-saas/src/models/WebhookEvent.js:1)
- [src/services/webhookReplayService.js](/home/harlem/projetos/whatsapp-saas/src/services/webhookReplayService.js:1)
- [src/services/webhookWorkerService.js](/home/harlem/projetos/whatsapp-saas/src/services/webhookWorkerService.js:1)
- [src/webhookWorker.js](/home/harlem/projetos/whatsapp-saas/src/webhookWorker.js:1)
- [src/models/OutboxMessage.js](/home/harlem/projetos/whatsapp-saas/src/models/OutboxMessage.js:1)
- [src/services/outboxService.js](/home/harlem/projetos/whatsapp-saas/src/services/outboxService.js:1)
- [src/services/messageService.js](/home/harlem/projetos/whatsapp-saas/src/services/messageService.js:1)
- [src/services/whatsappService.js](/home/harlem/projetos/whatsapp-saas/src/services/whatsappService.js:1)
- [src/controllers/adminConversaController.js](/home/harlem/projetos/whatsapp-saas/src/controllers/adminConversaController.js:1)
- [src/ui/admin.html](/home/harlem/projetos/whatsapp-saas/src/ui/admin.html:1)

## Nota sobre documentação histórica

[docs/analise.md](/home/harlem/projetos/whatsapp-saas/docs/analise.md) e [docs/cronograma.md](/home/harlem/projetos/whatsapp-saas/docs/cronograma.md) continuam úteis como base, mas parte dos itens de Sprint 1 e Sprint 2 já foi executada.

Na próxima retomada, esse documento deve ser tratado como a referência operacional mais atual.
