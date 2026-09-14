# Features futuras

## Catálogo automático de modelos de IA por credencial

**Status:** implementado localmente em 14 de setembro de 2026; deploy pendente

Automatizar a descoberta dos modelos disponíveis para cada credencial de IA,
começando pela NVIDIA e evoluindo para Gemini e OpenAI.

### Objetivo

- consultar o catálogo autenticado do provedor, como `GET /v1/models` da NVIDIA;
- gerar uma lista e um JSON normalizado dos modelos acessíveis pela chave;
- enriquecer cada modelo com capacidades conhecidas: chat, raciocínio, código,
  visão, embeddings, áudio, ferramentas e resposta estruturada;
- indicar endpoint gratuito, restrições, contexto máximo e compatibilidade com o
  fluxo atual do WhatsApp, quando essas informações estiverem disponíveis;
- registrar a origem e a data da última atualização dos metadados;
- nunca retornar, registrar ou exportar a API key.

### Entregas implementadas

1. Comando administrativo para sincronização manual e exportação JSON.
2. Catálogo persistido ou armazenado em cache, separado por provedor.
3. Endpoint administrativo para consultar modelos e suas capacidades.
4. Seletor de modelo no painel, filtrado pela credencial e pelo tipo de uso.
5. Atualização periódica com tratamento de modelos adicionados ou removidos.
6. Teste opcional de inferência curta para confirmar que o modelo listado está
   realmente operacional para a chave.

A migration `013-ai-model-catalog.sql` persiste o catálogo por empresa e
credencial, preserva modelos que deixaram de aparecer como indisponíveis e
registra cada sincronização. O comando `npm run models:sync` consulta Gemini,
NVIDIA e OpenAI, aceita filtros, modo `--dry-run` e exportação JSON com arquivo
criado em modo `0600`.

O painel permite sincronizar uma credencial e selecionar apenas modelos de chat
disponíveis para ela. A troca continua executando a inferência curta já usada
na validação de credenciais. A API nunca retorna a chave nem os metadados brutos
do provedor.

Um timer `systemd` diário mantém o catálogo atualizado. Capacidades informadas
pelo Gemini são marcadas como declaradas; dados deduzidos dos IDs dos catálogos
OpenAI-compatíveis são identificados separadamente como inferidos.

### Cuidados de implementação

- A resposta de `/v1/models` confirma quais IDs a chave consegue consultar, mas
  pode não informar todas as capacidades ou se o endpoint é gratuito.
- Os metadados complementares devem vir de documentação ou catálogo oficial,
  com cache para evitar consultas excessivas e dados desatualizados sinalizados.
- O sistema deve distinguir modelos de chat, multimodais, embeddings e outros
  endpoints para não oferecer uma opção incompatível no atendimento.
- A sincronização não deve consumir uma chamada de geração por modelo; testes de
  inferência devem ser explícitos, limitados e registrados sem conteúdo sensível.

### Protótipo disponível

O utilitário local `nvidia.py` já permite:

```bash
python3 nvidia.py --list-models
python3 nvidia.py
```

O primeiro comando lista os modelos acessíveis pela chave e o segundo executa
uma inferência curta com `NVIDIA_MODEL`.

## Rotina agendada de saúde das credenciais

**Status:** implementado e implantado em 14 de setembro de 2026

Criar um comando independente da API e do worker de mensagens para validar, em
segundo plano, as credenciais criptografadas no banco. Na VPS, ele poderá ser
executado por `systemd timer` ou cron e deverá usar uma trava para impedir duas
execuções simultâneas.

### Comportamento previsto

1. Buscar somente credenciais habilitadas e que estejam fora de cooldown.
2. Validar cada chave com a operação mais barata e confiável do provedor.
3. Confirmar que o modelo configurado aceita o endpoint usado pelo sistema, e
   não apenas que aparece no catálogo.
4. Atualizar `status`, `last_checked_at`, `failure_count`, `cooldown_until`,
   `last_error_code` e `last_error` sem registrar o segredo.
5. Desativar ou marcar como inválida somente uma credencial com erro definitivo.
6. Produzir um resumo em JSON e logs estruturados para monitoramento e alertas.
7. Oferecer modo `--dry-run`, limite de concorrência e timeout por provedor.

### Classificação de falhas

- `401` e `403`: chave inválida, revogada ou sem permissão; marcar como inválida
  após confirmação para evitar bloqueio por uma falha isolada.
- `404`: normalmente modelo ou endpoint incompatível; manter a chave e marcar a
  configuração do modelo como inválida.
- `429`: limite ou saldo; aplicar cooldown e manter a credencial habilitada.
- timeout, erro de rede e `5xx`: falha transitória; tentar novamente com espera
  progressiva e não desativar a chave.
- resposta válida: zerar falhas e retirar cooldown.

### Renovação e alertas

- Chaves de Gemini, NVIDIA e OpenAI não possuem um fluxo genérico seguro de
  renovação automática. Quando inválidas, a rotina deve alertar e aguardar a
  substituição pelo painel.
- O token da Meta poderá ser verificado pela Graph API e, quando a expiração for
  conhecida, gerar alerta antecipado. A renovação automática só será adotada se
  houver um fluxo oficial compatível com usuário do sistema e armazenamento
  seguro dos dados necessários.
- Tokens permanentes ou sem data de expiração ainda devem ser validados
  periodicamente, pois podem ser revogados ou perder permissões.

### Aviso obrigatório de expiração

- Registrar `expires_at`, a origem dessa informação e a data do último alerta
  sempre que o provedor informar a validade da credencial.
- Avisar o administrador com 30, 15, 7, 3 e 1 dia de antecedência, além de um
  alerta imediato quando a credencial expirar ou for revogada.
- Exibir um banner persistente no painel até a credencial ser substituída e
  validada novamente.
- Enviar o alerta por pelo menos um canal independente da credencial afetada,
  como e-mail ou webhook de monitoramento. O WhatsApp pode ser usado como canal
  adicional enquanto o token da Meta ainda estiver válido, mas não pode ser o
  único canal.
- Deduplicar notificações por credencial e marco de expiração para não enviar o
  mesmo aviso a cada execução da rotina.
- Informar empresa, provedor, nome da credencial, prazo restante e ação
  necessária, sem incluir token, chave, fingerprint completo ou outro segredo.
- Enviar uma confirmação de recuperação quando uma nova credencial for salva e
  validada com sucesso.
- Permitir configurar destinatários, canais e marcos de antecedência por
  variáveis de ambiente ou configuração administrativa.

### Integração com o catálogo

O catálogo e a rotina de saúde devem compartilhar adaptadores por provedor. A
sincronização descobre IDs e capacidades; o health check confirma credencial,
permissão e funcionamento real do modelo selecionado. O painel deverá mostrar
separadamente a saúde da chave e a saúde da configuração do modelo.

### Entrega implementada

- comando independente `npm run credentials:health`, com `--dry-run`, timeout,
  concorrência limitada e trava PostgreSQL;
- validação de Gemini, NVIDIA, OpenAI e token WhatsApp armazenado por empresa;
- duas falhas de autenticação consecutivas antes de desativar uma chave de IA;
- classificação separada para autenticação, modelo, limite e erro transitório;
- histórico resumido de execuções e alertas persistentes deduplicados;
- marcos de expiração configuráveis e consulta opcional via `debug_token` da
  Meta quando `META_APP_ID` estiver disponível;
- webhook externo opcional, sem segredos, e confirmação de recuperação;
- banner e detalhes de saúde no painel administrativo;
- unidades `systemd` para execução horária na VPS.

O catálogo automático foi implementado em 14 de setembro de 2026 e complementa
o health check: descoberta não substitui o teste real do modelo selecionado.
