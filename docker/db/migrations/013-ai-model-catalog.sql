DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ux_ai_provider_credential_id_empresa'
  ) THEN
    ALTER TABLE ai_provider_credentials ADD CONSTRAINT ux_ai_provider_credential_id_empresa
      UNIQUE (id, empresa_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS ai_credential_models (
  id BIGSERIAL PRIMARY KEY,
  empresa_id INT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  credential_id BIGINT NOT NULL REFERENCES ai_provider_credentials(id) ON DELETE CASCADE,
  provider VARCHAR(30) NOT NULL,
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
  CONSTRAINT ux_ai_credential_model UNIQUE (credential_id, model_id),
  CONSTRAINT fk_ai_credential_model_tenant
    FOREIGN KEY (credential_id, empresa_id)
    REFERENCES ai_provider_credentials(id, empresa_id) ON DELETE CASCADE,
  CONSTRAINT ck_ai_model_provider
    CHECK (provider IN ('gemini', 'nvidia', 'openai'))
);

CREATE INDEX IF NOT EXISTS ix_ai_models_tenant_provider
  ON ai_credential_models (empresa_id, provider, available, chat_compatible, model_id);

CREATE TABLE IF NOT EXISTS ai_model_catalog_sync_runs (
  id BIGSERIAL PRIMARY KEY,
  empresa_id INT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  credential_id BIGINT NULL REFERENCES ai_provider_credentials(id) ON DELETE SET NULL,
  provider VARCHAR(30) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'running',
  dry_run BOOLEAN NOT NULL DEFAULT FALSE,
  discovered_count INT NOT NULL DEFAULT 0,
  available_count INT NOT NULL DEFAULT 0,
  unavailable_count INT NOT NULL DEFAULT 0,
  error_code VARCHAR(80) NULL,
  error_message TEXT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ NULL,
  CONSTRAINT ck_ai_model_sync_status
    CHECK (status IN ('running', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS ix_ai_model_sync_started
  ON ai_model_catalog_sync_runs (started_at DESC);
