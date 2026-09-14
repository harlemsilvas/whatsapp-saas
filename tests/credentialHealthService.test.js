jest.mock("axios", () => ({ get: jest.fn(), post: jest.fn() }));
jest.mock("../src/models/AiProviderCredential", () => ({
  markValid: jest.fn(),
  markHealthFailure: jest.fn(),
}));
jest.mock("../src/models/CredentialHealth", () => ({
  markWhatsappValid: jest.fn(),
  markWhatsappFailure: jest.fn(),
  upsertAlert: jest.fn(),
  markAlertNotified: jest.fn(),
  resolveAlerts: jest.fn(),
  resolveOtherExpirationAlerts: jest.fn(),
}));
jest.mock("../src/utils/credentialCrypto", () => ({
  decryptSecret: jest.fn(() => "secret-value"),
}));
jest.mock("../src/services/aiCredentialService", () => ({
  validateCredential: jest.fn(),
  safeProviderError: jest.fn((err) => ({
    status: err.status || null,
    code: String(err.status || "network_error"),
    message: err.message,
  })),
}));

const axios = require("axios");
const AiProviderCredential = require("../src/models/AiProviderCredential");
const CredentialHealth = require("../src/models/CredentialHealth");
const {
  safeProviderError,
  validateCredential,
} = require("../src/services/aiCredentialService");
const {
  checkAiCredential,
  checkWhatsappCredential,
  classifyFailure,
  expirationMilestone,
  healthOptions,
} = require("../src/services/credentialHealthService");

const options = healthOptions({
  timeoutMs: 1000,
  failureThreshold: 2,
  alertMilestones: "30,15,7,3,1",
  alertWebhookUrl: "",
});

function aiRecord(overrides = {}) {
  return {
    id: 9,
    empresa_id: 1,
    provider: "gemini",
    label: "Principal",
    model: "gemini-test",
    api_style: "chat",
    base_url: "https://example.test/v1",
    api_key_ciphertext: "cipher",
    api_key_iv: "iv",
    api_key_auth_tag: "tag",
    failure_count: 0,
    health_auth_failure_count: 0,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  safeProviderError.mockImplementation((err) => ({
    status: err.status || null,
    code: String(err.status || "network_error"),
    message: err.message,
  }));
  CredentialHealth.resolveAlerts.mockResolvedValue([]);
  CredentialHealth.upsertAlert.mockImplementation(async (item) => ({
    id: 10,
    notification_count: 0,
    last_notified_at: null,
    ...item,
  }));
  delete process.env.META_APP_ID;
  delete process.env.WHATSAPP_APP_SECRET;
  process.env.WHATSAPP_URL = "https://graph.example.test/v23.0";
});

test("classifica autenticação, limite e falha transitória", () => {
  safeProviderError
    .mockReturnValueOnce({ status: 401, code: "401", message: "expired" })
    .mockReturnValueOnce({ status: 429, code: "429", message: "limit" })
    .mockReturnValueOnce({ status: 500, code: "500", message: "down" });

  expect(classifyFailure(new Error("a"), "meta").kind).toBe("auth");
  expect(classifyFailure(new Error("b"), "gemini").kind).toBe("rate_limit");
  expect(classifyFailure(new Error("c"), "nvidia").kind).toBe("transient");
});

test("seleciona o marco de expiração sem repetir marcos maiores", () => {
  const now = new Date("2026-09-13T00:00:00Z");
  expect(
    expirationMilestone("2026-09-19T00:00:00Z", [30, 15, 7, 3, 1], now),
  ).toEqual({ code: "expires_7d", days: 6, milestone: 7 });
  expect(
    expirationMilestone("2026-11-01T00:00:00Z", [30, 15, 7, 3, 1], now),
  ).toBeNull();
});

test("marca credencial de IA válida e resolve alertas anteriores", async () => {
  validateCredential.mockResolvedValue({ ok: true });
  AiProviderCredential.markValid.mockResolvedValue({});

  const result = await checkAiCredential(aiRecord(), options);

  expect(result.status).toBe("valid");
  expect(AiProviderCredential.markValid).toHaveBeenCalledWith(1, 9);
  expect(CredentialHealth.resolveAlerts).toHaveBeenCalledWith({
    empresaId: 1,
    credentialType: "ai",
    credentialId: 9,
  });
});

test("primeiro 401 aplica cooldown sem desativar nem alertar", async () => {
  const error = Object.assign(new Error("token expired"), { status: 401 });
  validateCredential.mockRejectedValue(error);

  const result = await checkAiCredential(aiRecord(), options);

  expect(result.status).toBe("warning");
  expect(AiProviderCredential.markHealthFailure).toHaveBeenCalledWith(
    1,
    9,
    expect.objectContaining({ disable: false, authFailure: true }),
  );
  expect(CredentialHealth.upsertAlert).not.toHaveBeenCalled();
});

test("segundo 401 desativa a credencial e cria alerta crítico", async () => {
  const error = Object.assign(new Error("token expired"), { status: 401 });
  validateCredential.mockRejectedValue(error);

  const result = await checkAiCredential(
    aiRecord({ health_auth_failure_count: 1 }),
    options,
  );

  expect(result.status).toBe("invalid");
  expect(AiProviderCredential.markHealthFailure).toHaveBeenCalledWith(
    1,
    9,
    expect.objectContaining({ status: "invalid", disable: true }),
  );
  expect(CredentialHealth.upsertAlert).toHaveBeenCalledWith(
    expect.objectContaining({
      empresaId: 1,
      alertCode: "credential_invalid",
      severity: "critical",
    }),
  );
});

test("valida token Meta e cria alerta do marco de expiração", async () => {
  axios.get.mockResolvedValue({ data: {} });
  CredentialHealth.markWhatsappValid.mockResolvedValue({});
  const record = {
    id: 1,
    phone_number_id: "123",
    whatsapp_token_ciphertext: "cipher",
    whatsapp_token_iv: "iv",
    whatsapp_token_auth_tag: "tag",
    whatsapp_token_failure_count: 0,
    whatsapp_token_auth_failure_count: 0,
    whatsapp_token_expires_at: new Date(Date.now() + 6 * 86400000).toISOString(),
    whatsapp_token_expiry_source: "meta_debug_token",
  };

  const result = await checkWhatsappCredential(record, options);

  expect(result.status).toBe("warning");
  expect(CredentialHealth.markWhatsappValid).toHaveBeenCalled();
  expect(CredentialHealth.upsertAlert).toHaveBeenCalledWith(
    expect.objectContaining({ alertCode: "expires_7d", provider: "meta" }),
  );
});

test("segunda falha Meta desativa o token sem removê-lo", async () => {
  const error = Object.assign(new Error("session expired"), { status: 401 });
  axios.get.mockRejectedValue(error);
  const record = {
    id: 1,
    phone_number_id: "123",
    whatsapp_token_ciphertext: "cipher",
    whatsapp_token_iv: "iv",
    whatsapp_token_auth_tag: "tag",
    whatsapp_token_failure_count: 1,
    whatsapp_token_auth_failure_count: 1,
  };

  const result = await checkWhatsappCredential(record, options);

  expect(result.status).toBe("invalid");
  expect(CredentialHealth.markWhatsappFailure).toHaveBeenCalledWith(
    1,
    expect.objectContaining({
      status: "invalid",
      authFailure: true,
      disable: true,
    }),
  );
  expect(CredentialHealth.upsertAlert).toHaveBeenCalledWith(
    expect.objectContaining({
      alertCode: "credential_invalid",
      severity: "critical",
    }),
  );
});
