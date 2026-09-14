# CLAUDE.md

Este e o guia inicial obrigatorio para qualquer agente que trabalhe neste
repositorio. Leia este arquivo primeiro em toda retomada, continuacao ou nova
sessao, antes de planejar, editar, executar migration, criar commit ou fazer
deploy.

## Leitura obrigatoria de retomada

Siga sempre esta ordem:

1. `CLAUDE.md`: regras permanentes e arquitetura do projeto.
2. `CONTINUOS.md`: ultimo estado implementado, validacoes e proximo marco.
3. `FEATURES.md`: backlog e escopo das entregas futuras.
4. `README.md`: instalacao, scripts, migrations, CI e operacao geral.
5. `docs/guia-uso-operacao.md`: painel, Meta, diagnostico e comandos da VPS.
6. `git status --short`, `git log -5 --oneline --decorate` e comparacao com
   `origin/main` antes de assumir o estado do codigo.

Se os documentos divergirem, confirme o comportamento no codigo e nos testes,
depois atualize a documentacao viva no mesmo trabalho. Nunca use apenas o
historico da conversa como fonte de continuidade.

## Objetivo do projeto

`whatsapp-saas` e um gateway SaaS multiempresa para a WhatsApp Cloud API da
Meta. Ele recebe webhooks, identifica a empresa por `phone_number_id`, persiste
eventos e mensagens, processa respostas com IA, grava a saida em outbox e envia
pela Graph API com reconciliacao de estados.

O projeto tambem oferece um painel administrativo para conversas, operacao da
outbox, configuracao WhatsApp, credenciais de IA, acessos por tenant, auditoria
e saude das credenciais.

O Paylo.IA e uma integracao futura e separada. Nao misture repositorios, bancos,
segredos, deploys ou regras de dominio sem uma etapa de integracao explicita.

## Arquitetura atual

- Runtime: Node.js CommonJS e Express.
- Banco: PostgreSQL, acessado por `pg`.
- API: `src/server.js` e `src/app.js`.
- Worker: `src/webhookWorker.js`.
- Rotas: `src/routes`.
- Controllers: `src/controllers`.
- Modelos SQL: `src/models`.
- Regras e integracoes: `src/services`.
- Painel: `src/ui/admin.html`, sem framework frontend.
- Migrations: `docker/db/migrations`, executadas por scripts em `scripts`.
- Testes: Jest em `tests`.
- Processos de producao: PM2 via `ecosystem.config.js`.
- CI/deploy: `.github/workflows/deploy.yml` e `deploy.sh`.
- Agendamentos da VPS: unidades versionadas em `ops/systemd`.

## Ambientes e enderecos

- Desenvolvimento: WSL, com Docker Desktop executado no Windows 11.
- PostgreSQL local: normalmente publicado em `127.0.0.1:15432` quando a porta
  `5432` estiver ocupada.
- Producao: VPS Ubuntu na Hostinger, usuario de aplicacao `whatsapp` e diretorio
  `/home/whatsapp/app`.
- Dominio publico atual: `https://bot.hrmmotos.com.br`.
- Painel: `https://bot.hrmmotos.com.br/api/admin/ui`.
- Healthcheck: `https://bot.hrmmotos.com.br/`.

Nao restaure URLs antigas com `/wppsaas` ou `hrmmotos.com.br/wppsaas`. Consulte
o README e a configuracao atual do proxy antes de alterar rotas publicas.

## Regras de seguranca

- Nunca imprimir, registrar, retornar ou commitar tokens, API keys, App Secret,
  Verify Token, chaves de criptografia ou payloads que os contenham.
- Nunca commitar `.env`, `.venv`, chaves SSH ou artefatos locais.
- Credenciais por empresa devem permanecer criptografadas com AES-256-GCM e
  `CREDENTIALS_ENCRYPTION_KEY`.
- A chave mestra nao pode ser trocada sem migration de recriptografia.
- Chaves administrativas de tenant ficam somente como hash SHA-256 e devem ser
  limitadas a uma empresa e a permissoes explicitas.
- `ADMIN_API_KEY` do ambiente e apenas o superadmin de bootstrap.
- Toda consulta ou mutacao de negocio deve manter `empresa_id` no contrato e no
  SQL. Nunca confiar em IDs globais sem validar o tenant.
- O webhook da Meta deve validar `X-Hub-Signature-256` em producao.
- Alertas de credenciais nunca podem depender apenas da credencial afetada.
- Renovacao de token/chave e manual ate existir um fluxo oficial seguro para o
  provedor especifico.

## Banco e migrations

- Migrations aplicadas sao imutaveis. Correcoes estruturais exigem uma nova
  migration numerada.
- Prefira migrations aditivas, idempotentes e compativeis com rollback do
  codigo.
- Execute migration com o usuario dono do schema/tabelas quando houver `ALTER`.
- Nunca use `source .env`; valores com espacos podem virar comandos shell.
- Scripts carregam `.env` com `dotenv`.
- Valide migrations localmente duas vezes para comprovar idempotencia.
- Em mudancas destrutivas ou de credenciais, separe expansao, verificacao e
  finalizacao, preservando rollback ate o healthcheck passar.
- Nao altere diretamente o banco da VPS fora de um procedimento documentado.

## Fluxos que nao podem regredir

- Webhook valido deve ser persistido antes do processamento.
- Duplicatas da Meta nao podem gerar mensagens ou envios duplicados.
- API e worker processam com leases e retries controlados.
- Outbox nao armazena tokens e resolve a credencial atual da empresa no envio.
- Erros permanentes terminam em `dead`; erros transitorios usam backoff.
- O painel nunca recebe ciphertext, IV, auth tag ou segredo descriptografado.
- Gemini, NVIDIA e OpenAI respeitam prioridade e isolamento por empresa.
- Falha de um provedor deve permitir fallback sem vazar a chave em logs.
- Token Meta ou chave de IA so deve ser desativado conforme a classificacao e
  os limiares documentados.

## Forma de trabalhar

- Entenda o problema no codigo antes de editar.
- Faca a menor alteracao correta e preserve os padroes existentes.
- Nao reescreva modulos inteiros quando uma correcao local for suficiente.
- Nao limpe alteracoes do usuario nem arquivos fora do escopo.
- Use `rg`/`rg --files` para busca e `apply_patch` para edicoes manuais.
- Para bug: identifique a causa, escreva ou ajuste o teste e valide a correcao.
- Para feature: defina contrato, implemente em passos pequenos, teste e atualize
  `CONTINUOS.md` e, quando aplicavel, `FEATURES.md`, README e guia operacional.
- Nao declare sucesso sem executar as validacoes relevantes.

## Validacao minima

Antes de concluir uma mudanca de codigo:

```bash
npm test -- --runInBand
git diff --check
```

Quando aplicavel, tambem execute:

```bash
node --check CAMINHO_DO_ARQUIVO.js
bash -n deploy.sh
npm audit --omit=dev --audit-level=high
```

Para mudancas no painel, valide o JavaScript inline. Para systemd, use
`systemd-analyze verify`. Para banco, aplique a migration duas vezes no
PostgreSQL local. Registre quando alguma verificacao nao puder ser executada.

## Commit, CI e deploy

- Antes do commit, confira branch, `git status`, diff staged e possiveis
  segredos.
- Inclua somente arquivos relacionados. Alteracoes locais conhecidas em
  `.venv` e arquivos auxiliares nao devem entrar por acidente.
- Nao fazer amend, reset destrutivo ou reversao de trabalho do usuario.
- Commit e push somente quando solicitados ou autorizados pelo usuario.
- Push em `main` dispara testes e deploy automatico na VPS.
- Acompanhe os jobs ate o fim; sucesso no push nao significa sucesso no deploy.
- Confirme migrations, PM2, healthcheck e etapas de verificacao nos logs da CI.
- Depois do deploy, valide o endpoint publico e registre SHA, resultado e
  proximos testes operacionais em `CONTINUOS.md`.

## Fonte do estado atual

O estado corrente, o ultimo release e o proximo passo ficam em
`CONTINUOS.md`. Nao duplique aqui um numero de sprint ou SHA que ficara
desatualizado. Ao retomar, leia a secao mais recente daquele documento antes de
continuar a implementacao.
