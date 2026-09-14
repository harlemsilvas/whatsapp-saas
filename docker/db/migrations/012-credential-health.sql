ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS whatsapp_token_status VARCHAR(20) NOT NULL DEFAULT 'untested',
  ADD COLUMN IF NOT EXISTS whatsapp_token_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS whatsapp_token_failure_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS whatsapp_token_auth_failure_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS whatsapp_token_last_checked_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS whatsapp_token_last_valid_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS whatsapp_token_last_error_code VARCHAR(80) NULL,
  ADD COLUMN IF NOT EXISTS whatsapp_token_last_error TEXT NULL,
  ADD COLUMN IF NOT EXISTS whatsapp_token_expires_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS whatsapp_token_expiry_source VARCHAR(40) NULL;

ALTER TABLE ai_provider_credentials
  ADD COLUMN IF NOT EXISTS health_auth_failure_count INT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_empresas_whatsapp_token_status'
  ) THEN
    ALTER TABLE empresas ADD CONSTRAINT ck_empresas_whatsapp_token_status
      CHECK (whatsapp_token_status IN ('untested', 'valid', 'warning', 'invalid', 'revoked')) NOT VALID;
  END IF;
END $$;

ALTER TABLE empresas VALIDATE CONSTRAINT ck_empresas_whatsapp_token_status;

CREATE TABLE IF NOT EXISTS credential_health_runs (
  id BIGSERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'running',
  dry_run BOOLEAN NOT NULL DEFAULT FALSE,
  checked_count INT NOT NULL DEFAULT 0,
  valid_count INT NOT NULL DEFAULT 0,
  warning_count INT NOT NULL DEFAULT 0,
  invalid_count INT NOT NULL DEFAULT 0,
  error_count INT NOT NULL DEFAULT 0,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT ck_credential_health_run_status
    CHECK (status IN ('running', 'completed', 'failed'))
);

CREATE TABLE IF NOT EXISTS credential_health_alerts (
  id BIGSERIAL PRIMARY KEY,
  empresa_id INT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  credential_type VARCHAR(20) NOT NULL,
  credential_id BIGINT NULL,
  provider VARCHAR(30) NOT NULL,
  alert_code VARCHAR(80) NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'warning',
  title VARCHAR(160) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  first_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_notified_at TIMESTAMPTZ NULL,
  notification_count INT NOT NULL DEFAULT 0,
  resolved_at TIMESTAMPTZ NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT ck_credential_health_alert_type
    CHECK (credential_type IN ('whatsapp', 'ai')),
  CONSTRAINT ck_credential_health_alert_severity
    CHECK (severity IN ('info', 'warning', 'critical')),
  CONSTRAINT ck_credential_health_alert_status
    CHECK (status IN ('active', 'resolved'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_credential_health_alert_active
  ON credential_health_alerts (
    empresa_id, credential_type, COALESCE(credential_id, 0), provider, alert_code
  )
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS ix_credential_health_alert_empresa
  ON credential_health_alerts (empresa_id, status, last_detected_at DESC);

CREATE INDEX IF NOT EXISTS ix_credential_health_runs_started
  ON credential_health_runs (started_at DESC);
