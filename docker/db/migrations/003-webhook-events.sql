-- Migração: event store mínimo para durabilidade do webhook

CREATE TABLE IF NOT EXISTS webhook_events (
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
  last_error TEXT NULL,
  processed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_webhook_events_status_created_at
  ON webhook_events (status, created_at);

CREATE INDEX IF NOT EXISTS ix_webhook_events_empresa_created_at
  ON webhook_events (empresa_id, created_at DESC);
