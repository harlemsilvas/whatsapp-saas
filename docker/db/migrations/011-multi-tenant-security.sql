ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS whatsapp_token_ciphertext TEXT NULL,
  ADD COLUMN IF NOT EXISTS whatsapp_token_iv VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS whatsapp_token_auth_tag VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS whatsapp_token_fingerprint VARCHAR(16) NULL,
  ADD COLUMN IF NOT EXISTS whatsapp_token_rotated_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS whatsapp_token_revoked_at TIMESTAMPTZ NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_empresas_phone_number_id
  ON empresas (phone_number_id)
  WHERE phone_number_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_contatos_id_empresa
  ON contatos (id, empresa_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_mensagens_id_empresa
  ON mensagens (id, empresa_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_empresas_phone_number_id'
  ) THEN
    ALTER TABLE empresas ADD CONSTRAINT ck_empresas_phone_number_id
      CHECK (phone_number_id IS NULL OR phone_number_id ~ '^[0-9]+$') NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_empresas_whatsapp_token_encrypted'
  ) THEN
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
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_contatos_atendimento_modo'
  ) THEN
    ALTER TABLE contatos ADD CONSTRAINT ck_contatos_atendimento_modo
      CHECK (atendimento_modo IN ('bot', 'humano')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_mensagens_direcao'
  ) THEN
    ALTER TABLE mensagens ADD CONSTRAINT ck_mensagens_direcao
      CHECK (direcao IN ('entrada', 'saida')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_mensagens_contato_tenant'
  ) THEN
    ALTER TABLE mensagens ADD CONSTRAINT fk_mensagens_contato_tenant
      FOREIGN KEY (contato_id, empresa_id)
      REFERENCES contatos (id, empresa_id) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_outbox_contato_tenant'
  ) THEN
    ALTER TABLE outbox_messages ADD CONSTRAINT fk_outbox_contato_tenant
      FOREIGN KEY (contato_id, empresa_id)
      REFERENCES contatos (id, empresa_id) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_outbox_mensagem_tenant'
  ) THEN
    ALTER TABLE outbox_messages ADD CONSTRAINT fk_outbox_mensagem_tenant
      FOREIGN KEY (mensagem_id, empresa_id)
      REFERENCES mensagens (id, empresa_id) NOT VALID;
  END IF;
END $$;

ALTER TABLE empresas VALIDATE CONSTRAINT ck_empresas_phone_number_id;
ALTER TABLE empresas VALIDATE CONSTRAINT ck_empresas_whatsapp_token_encrypted;
ALTER TABLE contatos VALIDATE CONSTRAINT ck_contatos_atendimento_modo;
ALTER TABLE mensagens VALIDATE CONSTRAINT ck_mensagens_direcao;
ALTER TABLE mensagens VALIDATE CONSTRAINT fk_mensagens_contato_tenant;
ALTER TABLE outbox_messages VALIDATE CONSTRAINT fk_outbox_contato_tenant;
ALTER TABLE outbox_messages VALIDATE CONSTRAINT fk_outbox_mensagem_tenant;

ALTER TABLE contatos ALTER COLUMN empresa_id SET NOT NULL;
ALTER TABLE mensagens ALTER COLUMN empresa_id SET NOT NULL;
ALTER TABLE mensagens ALTER COLUMN contato_id SET NOT NULL;
ALTER TABLE mensagens ALTER COLUMN direcao SET NOT NULL;
ALTER TABLE mensagens ALTER COLUMN tipo SET NOT NULL;
ALTER TABLE fluxos ALTER COLUMN empresa_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_webhook_events_status'
  ) THEN
    ALTER TABLE webhook_events ADD CONSTRAINT ck_webhook_events_status
      CHECK (status IN ('received', 'processing', 'processed', 'failed')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_outbox_messages_status'
  ) THEN
    ALTER TABLE outbox_messages ADD CONSTRAINT ck_outbox_messages_status
      CHECK (status IN ('pending', 'processing', 'failed', 'sent', 'dead')) NOT VALID;
  END IF;
END $$;

ALTER TABLE webhook_events VALIDATE CONSTRAINT ck_webhook_events_status;
ALTER TABLE outbox_messages VALIDATE CONSTRAINT ck_outbox_messages_status;

CREATE TABLE IF NOT EXISTS admin_api_keys (
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_admin_api_key_permissions'
  ) THEN
    ALTER TABLE admin_api_keys ADD CONSTRAINT ck_admin_api_key_permissions
      CHECK (
        cardinality(permissions) > 0
        AND permissions <@ ARRAY['read', 'write', 'manage_keys', 'superadmin']::TEXT[]
      ) NOT VALID;
  END IF;
END $$;

ALTER TABLE admin_api_keys VALIDATE CONSTRAINT ck_admin_api_key_permissions;

CREATE INDEX IF NOT EXISTS ix_admin_api_keys_empresa
  ON admin_api_keys (empresa_id, enabled);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
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
