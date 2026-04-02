## Plan: Próximos passos WhatsApp SaaS

Consolidar o que já está pronto (webhook real, persistência no Postgres, envio WhatsApp) e preparar o projeto para desenvolvimento contínuo e produção (multi-tenant real, configuração por empresa, segurança mínima, deploy com HTTPS). A abordagem é incremental: primeiro garantir configuração/ambiente e verificação do webhook; depois multi-tenant (identificação da empresa + credenciais por empresa); por fim endurecimento (auth/logs) e deploy.

**Steps**

1. Higiene de repositório e setup local (rápido)
   - Confirmar que a pasta docs/ não vai para o Git: já existe `docs/` em [.gitignore](.gitignore#L1). Verificar se ainda está tracked com `git ls-files docs/`; se listar arquivos, rodar `git rm -r --cached docs/`.
   - Padronizar variáveis de ambiente usadas hoje: PORT, DB_HOST, DB_NAME, DB_USER, DB_PASS, WHATSAPP_URL, WHATSAPP_PHONE_ID, WHATSAPP_TOKEN.
   - Subir Postgres via Docker e validar conexão usando a config em [src/config/database.js](src/config/database.js).

2. Validar “caminho feliz” do webhook e healthcheck
   - Confirmar healthcheck `GET /` (já implementado em [src/app.js](src/app.js)) para monitoramento simples.
   - Confirmar endpoints do webhook: `GET /api/webhook` e `POST /api/webhook` em [src/routes/webhookRoutes.js](src/routes/webhookRoutes.js) e [src/controllers/webhookController.js](src/controllers/webhookController.js).
   - Testar verificação da Meta (challenge) e recebimento real (payload Cloud API), validando o parse atual em [src/services/messageService.js](src/services/messageService.js).

3. Externalizar `VERIFY_TOKEN` e remover valores hardcoded (_depende do passo 2_)
   - Trocar `VERIFY_TOKEN = "123456"` por `process.env.VERIFY_TOKEN` em [src/controllers/webhookController.js](src/controllers/webhookController.js).
   - Definir política mínima de logs: manter mascaramento de telefone e evitar logar token/challenge em produção.

4. Multi-tenant real (identificar empresa no webhook) (_depende do passo 2_)
   - Extrair `phone_number_id` do payload real: `payload.entry[0].changes[0].value.metadata.phone_number_id`.
   - Criar método no model de empresa para buscar por `phone_number_id` (tabela já tem a coluna) em [src/models/Empresa.js](src/models/Empresa.js).
   - Alterar [src/services/messageService.js](src/services/messageService.js) para resolver `empresaId` dinamicamente (em vez de `empresa_id = 1`).

5. Credenciais por empresa no envio WhatsApp (_depende do passo 4_)
   - Ajustar [src/services/whatsappService.js](src/services/whatsappService.js) para aceitar token/phoneId por chamada (ex: `enviarMensagem({ token, phoneId, to, text })`), com fallback para env para manter compatibilidade.
   - Persistir e gerenciar `whatsapp_token` e `phone_number_id` por empresa via endpoints já existentes em [src/controllers/empresaController.js](src/controllers/empresaController.js).

6. Fluxos dinâmicos via banco (MVP de automação) (_pode ser paralelo ao passo 5_)
   - Criar `Fluxo` model (tabela `fluxos` já existe no init.sql em [docker/db/init.sql](docker/db/init.sql)).
   - Evoluir [src/services/fluxoService.js](src/services/fluxoService.js) para consultar por `empresa_id` + `gatilho` (por exemplo: match simples por palavra-chave, começando por `menu`).
   - Atualizar [src/services/messageService.js](src/services/messageService.js) para chamar `fluxoService.verificar(empresaId, mensagem)`.

7. IA (opcional, depois do multi-tenant)
   - Manter `iaService` como fallback, mas trocar o mock por integração real (OpenAI ou equivalente) em [src/services/iaService.js](src/services/iaService.js) usando env (`OPENAI_API_KEY`, modelo, etc.).
   - Registrar logs mínimos em `ia_logs` (tabela já existe) para auditoria/custo.

8. Segurança mínima (deixar preparado, mas pode entrar depois)
   - Manter endpoints administrativos sem auth só em ambiente fechado; antes de expor publicamente, adicionar API key por empresa nas rotas em [src/routes/index.js](src/routes/index.js) + middleware em src/middlewares/.
   - Rate limit no webhook se o endpoint ficar público (produção).

9. Observabilidade e tratamento de erros (produção)
   - Trocar `console.log/error` por logger estruturado (Winston já está em package.json) e melhorar [src/middlewares/errorHandler.js](src/middlewares/errorHandler.js) (diferenciar 4xx/5xx, não expor stack em produção).
   - Adicionar validação de env obrigatória no boot (por exemplo no server/app) para falhar cedo quando faltar variável.

10. Deploy (Hostinger VPS) e URL fixa com HTTPS

- Seguir o fluxo documentado em docs/deploy_hostinger.md: Node + PM2 + Nginx + Certbot.
- Confirmar URL final do webhook: `https://SEU_DOMINIO/api/webhook`.
- Usar healthcheck `GET /` para checagens externas.

**Relevant files**

- [src/app.js](src/app.js) — healthcheck `GET /` e montagem do app Express
- [src/routes/webhookRoutes.js](src/routes/webhookRoutes.js) — `GET/POST /api/webhook`
- [src/controllers/webhookController.js](src/controllers/webhookController.js) — verificação (challenge) e recebimento
- [src/services/messageService.js](src/services/messageService.js) — parse do payload real, persistência e orquestração
- [src/services/whatsappService.js](src/services/whatsappService.js) — envio via Cloud API + validação de env
- [src/services/fluxoService.js](src/services/fluxoService.js) — automação (hoje hardcoded)
- [src/services/iaService.js](src/services/iaService.js) — fallback IA (hoje mock)
- [src/models/Empresa.js](src/models/Empresa.js) — armazenar token e phone_number_id por empresa
- [src/config/database.js](src/config/database.js) e [docker-compose.yml](docker-compose.yml) — Postgres local
- [docker/db/init.sql](docker/db/init.sql) — schema (empresas/contatos/mensagens/fluxos/ia_logs)
- [.gitignore](.gitignore) — garante `docs/` fora do repo

**Verification**

1. Local
   - `docker-compose up -d` e validar tabelas existentes no Postgres.
   - `npm run dev` e testar `GET /`.
   - Testar verificação: `GET /api/webhook?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...`.
2. WhatsApp Cloud API
   - Envio direto via Graph API (curl) e depois via [src/services/whatsappService.js](src/services/whatsappService.js).
   - Recebimento real: mandar mensagem para o número de teste e verificar persistência em `mensagens` + resposta automática.
3. Multi-tenant
   - Cadastrar 2 empresas com `phone_number_id` distinto e garantir roteamento correto (empresaId resolvido do payload).

**Decisions**

- Multi-tenant (MVP): identificar empresa por `metadata.phone_number_id`.
- Próxima sprint: concluir passos 3–6 (token em env, empresa dinâmica, credenciais por empresa, fluxos no banco).
- Depois: IA real; e autenticação de endpoints administrativos (recomendação: API key por empresa antes de expor).

**Further Considerations**

1. Token WhatsApp: manter env no sandbox; em produção migrar para token de longo prazo (System User) por empresa.
2. Autenticação admin: quando abrir acesso externo, usar API key por empresa (MVP) ou JWT (mais completo).
