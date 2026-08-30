# whatsapp-saas — Cronograma de Correção e Evolução

Data-base: 29/08/2026

## Resumo executivo

Com base em [docs/analise.md](/home/harlem/projetos/whatsapp-saas/docs/analise.md), o projeto já tem base funcional, mas ainda não está pronto para produção comercial. Os principais riscos atuais estão concentrados em quatro frentes:

- confiabilidade do webhook
- segurança operacional
- idempotência e processamento assíncrono
- governança multiempresa

Também foi feita uma checagem rápida do código atual, que confirmou pontos críticos já descritos na análise:

- o webhook engole falhas e sempre responde `200` em [src/controllers/webhookController.js](/home/harlem/projetos/whatsapp-saas/src/controllers/webhookController.js:36)
- a autenticação administrativa está em fail-open quando `ADMIN_API_KEY` não existe em [src/middlewares/apiKeyAuth.js](/home/harlem/projetos/whatsapp-saas/src/middlewares/apiKeyAuth.js:10)
- o banco no Compose usa credenciais fixas e expõe `5432` em [docker-compose.yml](/home/harlem/projetos/whatsapp-saas/docker-compose.yml:8)
- a idempotência atual é baseada em consulta prévia de `wa_message_id`, com janela de inconsistência em [src/models/Mensagem.js](/home/harlem/projetos/whatsapp-saas/src/models/Mensagem.js:67)

## Critérios de priorização

Ordem usada no cronograma:

1. impedir perda silenciosa de mensagens
2. reduzir risco de exposição administrativa e credenciais
3. criar base de testes e deploy seguro
4. só então evoluir arquitetura e novos recursos

## Cronograma recomendado

### Sprint 0 — Estabilização imediata

Período: 31/08/2026 a 04/09/2026

Objetivo: reduzir risco operacional sem depender de refatoração grande.

Entregas:

- revisar e congelar escopo técnico da fase inicial
- criar `.env.example` seguro e remover segredos de exemplos
- mapear variáveis obrigatórias por ambiente: local, staging e produção
- documentar política mínima de logs, dados sensíveis e credenciais
- abrir backlog técnico com prioridade, esforço e responsável

Problemas atacados:

- item 3 da análise: logs com dados sensíveis
- item 6 da análise: configuração insegura de ambiente
- item 7 da análise: falta de base operacional formal

Esforço estimado: 3 a 5 dias

### Sprint 1 — Testes e hardening crítico

Período: 08/09/2026 a 18/09/2026

Objetivo: fechar as brechas mais perigosas antes de qualquer expansão.

Entregas:

- ativar suíte de testes de forma confiável no CI
- cobrir webhook signature, parsing de payload, multiempresa e autenticação admin
- remover `textPreview`, telefones completos e qualquer fragmento de token dos logs
- tornar `ADMIN_API_KEY` obrigatória em produção
- substituir comparação simples por verificação segura
- revisar CORS e validar assinatura da Meta obrigatoriamente em produção
- criar Compose de produção sem credenciais fixas e sem exposição pública do PostgreSQL

Problemas atacados:

- item 3 da análise: dados sensíveis em logs
- item 4 da análise: administração fail-open
- item 6 da análise: banco e Compose inseguros
- item 7 da análise: testes insuficientes

Dependências:

- conclusão da Sprint 0

Esforço estimado: 2 semanas

### Sprint 2 — Confiabilidade do webhook

Período: 21/09/2026 a 02/10/2026

Objetivo: garantir que recebimento de eventos não cause perda silenciosa.

Entregas:

- refatorar entrada do webhook para iterar todos os `entries`, `changes`, `messages` e `statuses`
- separar validação e persistência do processamento de negócio
- criar registro durável de evento recebido
- definir estados mínimos do evento: `received`, `processing`, `processed`, `failed`
- revisar estratégia de resposta HTTP para permitir retry seguro da Meta

Problemas atacados:

- item 1 da análise: falhas do webhook confirmadas como sucesso
- item 8 da análise: processamento síncrono
- item 9 da análise: leitura incompleta de payload em lote

Dependências:

- Sprint 1 concluída

Esforço estimado: 2 semanas

### Sprint 3 — Idempotência real e outbox

Período: 05/10/2026 a 23/10/2026

Objetivo: impedir duplicidade lógica e perda parcial entre entrada e saída.

Entregas:

- criar tabela `webhook_events` com chave única do evento
- implementar lease ou fencing simples para evitar processamento concorrente
- introduzir `attempt_count`, `last_error` e `next_retry_at`
- criar outbox transacional para mensagens de saída
- adicionar retries com backoff para Graph API
- rastrear correlação entre evento de entrada, mensagem criada e envio externo

Problemas atacados:

- item 2 da análise: janela de inconsistência na idempotência
- item 8 da análise: processamento síncrono

Dependências:

- Sprint 2 concluída

Esforço estimado: 3 semanas

### Sprint 4 — Infraestrutura e deploy independente

Período: 26/10/2026 a 06/11/2026

Objetivo: deixar o serviço implantável com previsibilidade e recuperação.

Entregas:

- criar `Dockerfile` de aplicação
- criar Compose de produção com healthcheck
- publicar aplicação atrás de Nginx com HTTPS
- restringir PostgreSQL a rede privada ou localhost
- configurar backup e restore mínimo do banco
- configurar pipeline de deploy no GitHub Actions
- adicionar monitoramento básico de disponibilidade e fila

Problemas atacados:

- item 6 da análise: exposição do banco e operação insegura
- itens 1 e 8 da análise: necessidade de operação resiliente

Dependências:

- Sprint 3 concluída

Esforço estimado: 2 semanas

### Sprint 5 — Multiempresa seguro

Período: 09/11/2026 a 27/11/2026

Objetivo: consolidar o produto como SaaS multi-tenant de forma segura.

Entregas:

- adicionar unicidade para `phone_number_id`
- reforçar `NOT NULL`, `CHECKS` e consistência de tenant
- criptografar `whatsapp_token` em repouso
- implementar rotação e revogação de credenciais
- criar autenticação administrativa por usuário ou sessão
- adicionar autorização por empresa e trilha de auditoria

Problemas atacados:

- item 5 da análise: tokens em texto puro
- item 10 da análise: integridade multiempresa incompleta
- item 4 da análise: admin ainda simplificado demais para produção

Dependências:

- Sprint 4 concluída

Esforço estimado: 3 semanas

### Sprint 6 — Expansão de produto

Período: 30/11/2026 a 18/12/2026

Objetivo: crescer funcionalidades sem sacrificar a base operacional.

Entregas:

- suporte a botões, listas e mídia
- melhorias no inbox e filas de atendimento
- métricas operacionais e de negócio
- onboarding assistido de empresas
- integrações externas priorizadas pelo negócio

Pré-requisito:

- nenhuma feature nova deve entrar antes do fechamento das Sprints 1 a 3

Esforço estimado: 3 semanas

## Roadmap resumido por prioridade

Alta prioridade:

- Sprint 1
- Sprint 2
- Sprint 3

Média prioridade:

- Sprint 4
- Sprint 5

Baixa prioridade por ora:

- Sprint 6

## Recomendações práticas

- Não levar o projeto para produção comercial antes do fim da Sprint 3.
- Se o time estiver pequeno, combinar Sprint 0 e Sprint 1 na mesma janela.
- Se houver pressão por deploy rápido, ainda assim não pular os itens de autenticação, logs e confiabilidade do webhook.
- Novos recursos de interface ou onboarding devem ficar atrás dos temas de idempotência e processamento assíncrono.

## Proposta de ordem de execução do backlog

1. hardening de segurança e testes
2. confiabilidade do webhook
3. idempotência com event store e outbox
4. deploy produtivo
5. multiempresa completo
6. novas features

## Estimativa total

Prazo enxuto e realista: 12 a 16 semanas, considerando um projeto já em andamento e alguma paralelização entre backend, infra e QA.

Se houver apenas uma pessoa dedicada em tempo parcial, a estimativa mais segura sobe para 16 a 20 semanas.
