-- Configuracoes e credenciais de IA por empresa.
-- O segredo e armazenado apenas como AES-256-GCM (ciphertext + IV + auth tag).

CREATE TABLE IF NOT EXISTS ai_provider_credentials (
  id BIGSERIAL PRIMARY KEY,
  empresa_id INT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  provider VARCHAR(30) NOT NULL DEFAULT 'openai',
  label VARCHAR(100) NOT NULL,
  api_key_ciphertext TEXT NOT NULL,
  api_key_iv VARCHAR(64) NOT NULL,
  api_key_auth_tag VARCHAR(64) NOT NULL,
  key_fingerprint VARCHAR(16) NOT NULL,
  model VARCHAR(100) NOT NULL DEFAULT 'gpt-4o-mini',
  api_style VARCHAR(20) NOT NULL DEFAULT 'responses',
  base_url TEXT NOT NULL DEFAULT 'https://api.openai.com/v1',
  priority INT NOT NULL DEFAULT 100,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  status VARCHAR(20) NOT NULL DEFAULT 'untested',
  failure_count INT NOT NULL DEFAULT 0,
  cooldown_until TIMESTAMPTZ NULL,
  last_checked_at TIMESTAMPTZ NULL,
  last_error_code VARCHAR(80) NULL,
  last_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_ai_provider CHECK (provider IN ('openai')),
  CONSTRAINT ck_ai_api_style CHECK (api_style IN ('responses', 'chat')),
  CONSTRAINT ck_ai_status CHECK (status IN ('untested', 'valid', 'invalid', 'cooldown')),
  CONSTRAINT ck_ai_priority CHECK (priority BETWEEN 1 AND 10000),
  CONSTRAINT ux_ai_credential_label UNIQUE (empresa_id, provider, label),
  CONSTRAINT ux_ai_credential_fingerprint UNIQUE (empresa_id, provider, key_fingerprint)
);

CREATE INDEX IF NOT EXISTS ix_ai_credentials_empresa_priority
  ON ai_provider_credentials (empresa_id, enabled, priority, id);

CREATE INDEX IF NOT EXISTS ix_ai_credentials_health
  ON ai_provider_credentials (empresa_id, status, cooldown_until);
