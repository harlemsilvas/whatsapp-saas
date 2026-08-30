-- Migração: outbox transacional para envios de saída

CREATE TABLE IF NOT EXISTS outbox_messages (
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
