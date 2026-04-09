-- Migração: estado de atendimento (bot/humano) + idempotência por message id

-- 1) Estado do atendimento no contato
ALTER TABLE contatos
  ADD COLUMN IF NOT EXISTS atendimento_modo VARCHAR(10) NOT NULL DEFAULT 'bot',
  ADD COLUMN IF NOT EXISTS atendimento_pausado_ate TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS ultimo_humano_em TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS atendimento_assumido_por VARCHAR(100) NULL;

-- 2) Idempotência por ID da mensagem do WhatsApp
ALTER TABLE mensagens
  ADD COLUMN IF NOT EXISTS wa_message_id VARCHAR(128) NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_mensagens_empresa_wa_message_id
  ON mensagens (empresa_id, wa_message_id)
  WHERE wa_message_id IS NOT NULL;
