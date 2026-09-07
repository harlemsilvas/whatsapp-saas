ALTER TABLE mensagens
  ADD COLUMN IF NOT EXISTS provider_status VARCHAR(30) NULL,
  ADD COLUMN IF NOT EXISTS provider_status_payload JSONB NULL,
  ADD COLUMN IF NOT EXISTS provider_status_at TIMESTAMP NULL;

CREATE INDEX IF NOT EXISTS ix_mensagens_empresa_provider_status
  ON mensagens (empresa_id, provider_status, created_at DESC);
