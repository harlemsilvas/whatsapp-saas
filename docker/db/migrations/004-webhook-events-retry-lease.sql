-- Migração: lease e retry básico para webhook_events

ALTER TABLE webhook_events
  ADD COLUMN IF NOT EXISTS attempt_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS lease_token VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMP NULL;
