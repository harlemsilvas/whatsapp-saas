-- =========================
-- DATABASE STRUCTURE SaaS
-- =========================

-- Empresas (multi-tenant)
CREATE TABLE empresas (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(255) NOT NULL,
  telefone VARCHAR(20),
  whatsapp_token TEXT,
  phone_number_id VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Contatos (clientes dos seus clientes)
CREATE TABLE contatos (
  id SERIAL PRIMARY KEY,
  empresa_id INT REFERENCES empresas(id) ON DELETE CASCADE,
  nome VARCHAR(255),
  telefone VARCHAR(20) NOT NULL,
  tags TEXT[],
  atendimento_modo VARCHAR(10) NOT NULL DEFAULT 'bot',
  atendimento_pausado_ate TIMESTAMP NULL,
  ultimo_humano_em TIMESTAMP NULL,
  atendimento_assumido_por VARCHAR(100) NULL,
  bot_status_reason VARCHAR(40) NULL,
  bot_status_details TEXT NULL,
  bot_status_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Mensagens
CREATE TABLE mensagens (
  id SERIAL PRIMARY KEY,
  empresa_id INT REFERENCES empresas(id) ON DELETE CASCADE,
  contato_id INT REFERENCES contatos(id) ON DELETE CASCADE,
  direcao VARCHAR(10), -- entrada | saida
  conteudo TEXT,
  tipo VARCHAR(20) DEFAULT 'text',
  lida_em TIMESTAMP NULL,
  wa_message_id VARCHAR(128) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Idempotência: evita processar o mesmo evento do WhatsApp mais de uma vez
CREATE UNIQUE INDEX IF NOT EXISTS ux_mensagens_empresa_wa_message_id
  ON mensagens (empresa_id, wa_message_id)
  WHERE wa_message_id IS NOT NULL;

-- Fluxos automatizados
CREATE TABLE fluxos (
  id SERIAL PRIMARY KEY,
  empresa_id INT REFERENCES empresas(id) ON DELETE CASCADE,
  gatilho VARCHAR(100),
  resposta TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Logs de IA
CREATE TABLE ia_logs (
  id SERIAL PRIMARY KEY,
  empresa_id INT,
  pergunta TEXT,
  resposta TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Event store minimo para ingressar webhooks com durabilidade
CREATE TABLE webhook_events (
  id BIGSERIAL PRIMARY KEY,
  event_key VARCHAR(255) NOT NULL UNIQUE,
  empresa_id INT REFERENCES empresas(id) ON DELETE SET NULL,
  event_kind VARCHAR(20) NOT NULL,
  message_id VARCHAR(128) NULL,
  status_id VARCHAR(128) NULL,
  phone_number_id VARCHAR(100) NULL,
  payload_hash VARCHAR(64) NULL,
  payload_json JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'received',
  attempt_count INT NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMP NULL,
  lease_token VARCHAR(64) NULL,
  lease_expires_at TIMESTAMP NULL,
  last_error TEXT NULL,
  processed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_webhook_events_status_created_at
  ON webhook_events (status, created_at);

CREATE INDEX IF NOT EXISTS ix_webhook_events_empresa_created_at
  ON webhook_events (empresa_id, created_at DESC);

CREATE TABLE outbox_messages (
  id BIGSERIAL PRIMARY KEY,
  dedup_key VARCHAR(255) NOT NULL UNIQUE,
  empresa_id INT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  contato_id INT NULL REFERENCES contatos(id) ON DELETE SET NULL,
  mensagem_id INT NULL REFERENCES mensagens(id) ON DELETE SET NULL,
  webhook_event_id BIGINT NULL REFERENCES webhook_events(id) ON DELETE SET NULL,
  channel VARCHAR(30) NOT NULL DEFAULT 'whatsapp',
  message_type VARCHAR(30) NOT NULL DEFAULT 'text',
  recipient VARCHAR(40) NOT NULL,
  content TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  provider_message_id VARCHAR(128) NULL,
  provider_status VARCHAR(30) NULL,
  provider_status_payload JSONB NULL,
  provider_status_at TIMESTAMP NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  attempt_count INT NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMP NULL,
  lease_token VARCHAR(64) NULL,
  lease_expires_at TIMESTAMP NULL,
  last_error TEXT NULL,
  processed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_outbox_messages_status_created_at
  ON outbox_messages (status, created_at);

-- =========================
-- DADOS INICIAIS
-- =========================

INSERT INTO empresas (nome, telefone)
VALUES ('Empresa Teste', '5511999999999');

INSERT INTO fluxos (empresa_id, gatilho, resposta)
VALUES (1, 'menu', '1 - Produtos\n2 - Suporte\n3 - Pedidos');
