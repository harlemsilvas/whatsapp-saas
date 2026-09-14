-- =========================
-- DATABASE STRUCTURE SaaS
-- =========================

-- Empresas (multi-tenant)
CREATE TABLE empresas (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(255) NOT NULL,
  telefone VARCHAR(20),
  whatsapp_token TEXT,
  whatsapp_token_ciphertext TEXT NULL,
  whatsapp_token_iv VARCHAR(64) NULL,
  whatsapp_token_auth_tag VARCHAR(64) NULL,
  whatsapp_token_fingerprint VARCHAR(16) NULL,
  whatsapp_token_rotated_at TIMESTAMPTZ NULL,
  whatsapp_token_revoked_at TIMESTAMPTZ NULL,
  whatsapp_token_status VARCHAR(20) NOT NULL DEFAULT 'untested',
  whatsapp_token_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  whatsapp_token_failure_count INT NOT NULL DEFAULT 0,
  whatsapp_token_auth_failure_count INT NOT NULL DEFAULT 0,
  whatsapp_token_last_checked_at TIMESTAMPTZ NULL,
  whatsapp_token_last_valid_at TIMESTAMPTZ NULL,
  whatsapp_token_last_error_code VARCHAR(80) NULL,
  whatsapp_token_last_error TEXT NULL,
  whatsapp_token_expires_at TIMESTAMPTZ NULL,
  whatsapp_token_expiry_source VARCHAR(40) NULL,
  phone_number_id VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE empresas ADD CONSTRAINT ck_empresas_phone_number_id
  CHECK (phone_number_id IS NULL OR phone_number_id ~ '^[0-9]+$');

ALTER TABLE empresas ADD CONSTRAINT ck_empresas_whatsapp_token_encrypted
  CHECK (
    (whatsapp_token_ciphertext IS NULL
      AND whatsapp_token_iv IS NULL
      AND whatsapp_token_auth_tag IS NULL
      AND whatsapp_token_fingerprint IS NULL)
    OR
    (whatsapp_token_ciphertext IS NOT NULL
      AND whatsapp_token_iv IS NOT NULL
      AND whatsapp_token_auth_tag IS NOT NULL
      AND whatsapp_token_fingerprint IS NOT NULL)
  );

ALTER TABLE empresas ADD CONSTRAINT ck_empresas_whatsapp_token_status
  CHECK (whatsapp_token_status IN ('untested', 'valid', 'warning', 'invalid', 'revoked'));

CREATE UNIQUE INDEX IF NOT EXISTS ux_empresas_phone_number_id
  ON empresas (phone_number_id)
  WHERE phone_number_id IS NOT NULL;

-- Contatos (clientes dos seus clientes)
CREATE TABLE contatos (
  id SERIAL PRIMARY KEY,
  empresa_id INT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
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
  empresa_id INT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  contato_id INT NOT NULL REFERENCES contatos(id) ON DELETE CASCADE,
  direcao VARCHAR(10) NOT NULL, -- entrada | saida
  conteudo TEXT,
  tipo VARCHAR(20) NOT NULL DEFAULT 'text',
  lida_em TIMESTAMP NULL,
  wa_message_id VARCHAR(128) NULL,
  provider_status VARCHAR(30) NULL,
  provider_status_payload JSONB NULL,
  provider_status_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Idempotência: evita processar o mesmo evento do WhatsApp mais de uma vez
CREATE UNIQUE INDEX IF NOT EXISTS ux_mensagens_empresa_wa_message_id
  ON mensagens (empresa_id, wa_message_id)
  WHERE wa_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_mensagens_empresa_provider_status
  ON mensagens (empresa_id, provider_status, created_at DESC);

-- Fluxos automatizados
CREATE TABLE fluxos (
  id SERIAL PRIMARY KEY,
  empresa_id INT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
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
  error_class VARCHAR(20) NULL,
  last_error_code VARCHAR(80) NULL,
  terminal_reason VARCHAR(80) NULL,
  dead_at TIMESTAMP NULL,
  manual_retry_count INT NOT NULL DEFAULT 0,
  last_manual_retry_at TIMESTAMP NULL,
  processed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_outbox_messages_status_created_at
  ON outbox_messages (status, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS ux_contatos_id_empresa
  ON contatos (id, empresa_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_mensagens_id_empresa
  ON mensagens (id, empresa_id);

ALTER TABLE contatos ADD CONSTRAINT ck_contatos_atendimento_modo
  CHECK (atendimento_modo IN ('bot', 'humano'));

ALTER TABLE mensagens ADD CONSTRAINT ck_mensagens_direcao
  CHECK (direcao IN ('entrada', 'saida'));

ALTER TABLE webhook_events ADD CONSTRAINT ck_webhook_events_status
  CHECK (status IN ('received', 'processing', 'processed', 'failed'));

ALTER TABLE outbox_messages ADD CONSTRAINT ck_outbox_messages_status
  CHECK (status IN ('pending', 'processing', 'failed', 'sent', 'dead'));

ALTER TABLE mensagens ADD CONSTRAINT fk_mensagens_contato_tenant
  FOREIGN KEY (contato_id, empresa_id) REFERENCES contatos (id, empresa_id);

ALTER TABLE outbox_messages ADD CONSTRAINT fk_outbox_contato_tenant
  FOREIGN KEY (contato_id, empresa_id) REFERENCES contatos (id, empresa_id);

ALTER TABLE outbox_messages ADD CONSTRAINT fk_outbox_mensagem_tenant
  FOREIGN KEY (mensagem_id, empresa_id) REFERENCES mensagens (id, empresa_id);

CREATE TABLE admin_api_keys (
  id BIGSERIAL PRIMARY KEY,
  empresa_id INT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  label VARCHAR(100) NOT NULL,
  key_hash VARCHAR(64) NOT NULL UNIQUE,
  key_prefix VARCHAR(12) NOT NULL,
  permissions TEXT[] NOT NULL DEFAULT ARRAY['read', 'write']::TEXT[],
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMPTZ NULL,
  last_used_at TIMESTAMPTZ NULL,
  revoked_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_admin_api_key_scope
    CHECK (empresa_id IS NOT NULL OR 'superadmin' = ANY(permissions)),
  CONSTRAINT ck_admin_api_key_permissions CHECK (
    cardinality(permissions) > 0
    AND permissions <@ ARRAY['read', 'write', 'manage_keys', 'superadmin']::TEXT[]
  )
);

CREATE INDEX IF NOT EXISTS ix_admin_api_keys_empresa
  ON admin_api_keys (empresa_id, enabled);

CREATE TABLE admin_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  empresa_id INT NULL REFERENCES empresas(id) ON DELETE SET NULL,
  actor_type VARCHAR(30) NOT NULL,
  actor_id BIGINT NULL REFERENCES admin_api_keys(id) ON DELETE SET NULL,
  actor_label VARCHAR(100) NULL,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(60) NOT NULL,
  resource_id VARCHAR(100) NULL,
  request_id VARCHAR(100) NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_admin_audit_empresa_created
  ON admin_audit_logs (empresa_id, created_at DESC);

-- Credenciais de IA criptografadas por empresa
CREATE TABLE ai_provider_credentials (
  id BIGSERIAL PRIMARY KEY,
  empresa_id INT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  provider VARCHAR(30) NOT NULL DEFAULT 'openai' CHECK (provider IN ('gemini', 'nvidia', 'openai')),
  label VARCHAR(100) NOT NULL,
  api_key_ciphertext TEXT NOT NULL,
  api_key_iv VARCHAR(64) NOT NULL,
  api_key_auth_tag VARCHAR(64) NOT NULL,
  key_fingerprint VARCHAR(16) NOT NULL,
  model VARCHAR(100) NOT NULL DEFAULT 'gpt-4o-mini',
  api_style VARCHAR(20) NOT NULL DEFAULT 'responses' CHECK (api_style IN ('responses', 'chat')),
  base_url TEXT NOT NULL DEFAULT 'https://api.openai.com/v1',
  priority INT NOT NULL DEFAULT 100 CHECK (priority BETWEEN 1 AND 10000),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  status VARCHAR(20) NOT NULL DEFAULT 'untested' CHECK (status IN ('untested', 'valid', 'invalid', 'cooldown')),
  failure_count INT NOT NULL DEFAULT 0,
  health_auth_failure_count INT NOT NULL DEFAULT 0,
  cooldown_until TIMESTAMPTZ NULL,
  last_checked_at TIMESTAMPTZ NULL,
  last_error_code VARCHAR(80) NULL,
  last_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, empresa_id),
  UNIQUE (empresa_id, provider, label),
  UNIQUE (empresa_id, provider, key_fingerprint)
);

CREATE INDEX ix_ai_credentials_empresa_priority
  ON ai_provider_credentials (empresa_id, enabled, priority, id);

CREATE TABLE ai_credential_models (
  id BIGSERIAL PRIMARY KEY,
  empresa_id INT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  credential_id BIGINT NOT NULL REFERENCES ai_provider_credentials(id) ON DELETE CASCADE,
  provider VARCHAR(30) NOT NULL CHECK (provider IN ('gemini', 'nvidia', 'openai')),
  model_id VARCHAR(200) NOT NULL,
  display_name VARCHAR(200) NULL,
  description TEXT NULL,
  owned_by VARCHAR(120) NULL,
  capabilities TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  declared_capabilities TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  inferred_capabilities TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  endpoints TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  input_token_limit INT NULL,
  output_token_limit INT NULL,
  context_window INT NULL,
  chat_compatible BOOLEAN NOT NULL DEFAULT FALSE,
  available BOOLEAN NOT NULL DEFAULT TRUE,
  metadata_source VARCHAR(40) NOT NULL DEFAULT 'provider_catalog',
  raw_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unavailable_since TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (credential_id, model_id),
  FOREIGN KEY (credential_id, empresa_id)
    REFERENCES ai_provider_credentials(id, empresa_id) ON DELETE CASCADE
);

CREATE INDEX ix_ai_models_tenant_provider
  ON ai_credential_models (empresa_id, provider, available, chat_compatible, model_id);

CREATE TABLE ai_model_catalog_sync_runs (
  id BIGSERIAL PRIMARY KEY,
  empresa_id INT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  credential_id BIGINT NULL REFERENCES ai_provider_credentials(id) ON DELETE SET NULL,
  provider VARCHAR(30) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  dry_run BOOLEAN NOT NULL DEFAULT FALSE,
  discovered_count INT NOT NULL DEFAULT 0,
  available_count INT NOT NULL DEFAULT 0,
  unavailable_count INT NOT NULL DEFAULT 0,
  error_code VARCHAR(80) NULL,
  error_message TEXT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ NULL
);

CREATE INDEX ix_ai_model_sync_started
  ON ai_model_catalog_sync_runs (started_at DESC);

CREATE TABLE credential_health_runs (
  id BIGSERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  dry_run BOOLEAN NOT NULL DEFAULT FALSE,
  checked_count INT NOT NULL DEFAULT 0,
  valid_count INT NOT NULL DEFAULT 0,
  warning_count INT NOT NULL DEFAULT 0,
  invalid_count INT NOT NULL DEFAULT 0,
  error_count INT NOT NULL DEFAULT 0,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE credential_health_alerts (
  id BIGSERIAL PRIMARY KEY,
  empresa_id INT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  credential_type VARCHAR(20) NOT NULL CHECK (credential_type IN ('whatsapp', 'ai')),
  credential_id BIGINT NULL,
  provider VARCHAR(30) NOT NULL,
  alert_code VARCHAR(80) NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
  title VARCHAR(160) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved')),
  first_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_notified_at TIMESTAMPTZ NULL,
  notification_count INT NOT NULL DEFAULT 0,
  resolved_at TIMESTAMPTZ NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX ux_credential_health_alert_active
  ON credential_health_alerts (
    empresa_id, credential_type, COALESCE(credential_id, 0), provider, alert_code
  ) WHERE status = 'active';

CREATE INDEX ix_credential_health_alert_empresa
  ON credential_health_alerts (empresa_id, status, last_detected_at DESC);

CREATE INDEX ix_credential_health_runs_started
  ON credential_health_runs (started_at DESC);

-- =========================
-- DADOS INICIAIS
-- =========================

INSERT INTO empresas (nome, telefone)
VALUES ('Empresa Teste', '5511999999999');

INSERT INTO fluxos (empresa_id, gatilho, resposta)
VALUES (1, 'menu', '1 - Produtos\n2 - Suporte\n3 - Pedidos');
