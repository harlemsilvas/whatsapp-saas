-- Migração: reconciliação básica de status do provider na outbox

ALTER TABLE outbox_messages
  ADD COLUMN IF NOT EXISTS provider_status VARCHAR(30) NULL,
  ADD COLUMN IF NOT EXISTS provider_status_payload JSONB NULL,
  ADD COLUMN IF NOT EXISTS provider_status_at TIMESTAMP NULL;
