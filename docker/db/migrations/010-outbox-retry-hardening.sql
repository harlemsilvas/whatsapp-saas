ALTER TABLE outbox_messages
  ADD COLUMN IF NOT EXISTS error_class VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS last_error_code VARCHAR(80) NULL,
  ADD COLUMN IF NOT EXISTS terminal_reason VARCHAR(80) NULL,
  ADD COLUMN IF NOT EXISTS dead_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS manual_retry_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_manual_retry_at TIMESTAMP NULL;

UPDATE outbox_messages
SET payload_json = COALESCE(payload_json, '{}'::jsonb) - 'token' - 'phoneId'
WHERE payload_json ? 'token' OR payload_json ? 'phoneId';

UPDATE outbox_messages
SET
  status = 'dead',
  terminal_reason = 'max_attempts_exceeded',
  dead_at = COALESCE(processed_at, NOW()),
  next_retry_at = NULL,
  lease_token = NULL,
  lease_expires_at = NULL
WHERE status = 'failed'
  AND attempt_count >= 8;

CREATE INDEX IF NOT EXISTS ix_outbox_messages_retryable
  ON outbox_messages (next_retry_at, created_at)
  WHERE status IN ('pending', 'failed');

