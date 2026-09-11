-- Amplia as credenciais de IA para provedores OpenAI-compatible.

ALTER TABLE ai_provider_credentials
  DROP CONSTRAINT IF EXISTS ck_ai_provider;

ALTER TABLE ai_provider_credentials
  ADD CONSTRAINT ck_ai_provider
  CHECK (provider IN ('gemini', 'nvidia', 'openai'));
