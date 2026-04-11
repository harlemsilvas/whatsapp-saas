-- Migração: observabilidade do bot (último motivo de não-resposta)

ALTER TABLE contatos
  ADD COLUMN IF NOT EXISTS bot_status_reason VARCHAR(40) NULL,
  ADD COLUMN IF NOT EXISTS bot_status_details TEXT NULL,
  ADD COLUMN IF NOT EXISTS bot_status_at TIMESTAMP NULL;
