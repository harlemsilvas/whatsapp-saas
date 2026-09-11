const crypto = require("crypto");

describe("aiCredentialService multi-provider", () => {
  const previousEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    process.env.CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
    process.env.GEMINI_API_KEY = "gemini-key";
    process.env.NVIDIA_API_KEY = "nvidia-key";
    process.env.OPENAI_API_KEY = "openai-key";
    delete process.env.GEMINI_MODEL;
    delete process.env.NVIDIA_MODEL;
    delete process.env.OPENAI_MODEL;
    delete process.env.OPENAI_API_STYLE;
    delete process.env.OPENAI_BASE_URL;
  });

  afterAll(() => {
    process.env = previousEnv;
  });

  test("ordena os fallbacks globais como Gemini, NVIDIA e OpenAI", async () => {
    jest.doMock("../src/models/AiProviderCredential", () => ({
      listUsable: jest.fn(async () => []),
      markValid: jest.fn(),
      markFailure: jest.fn(),
    }));
    jest.doMock("../src/utils/logger", () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }));

    const service = require("../src/services/aiCredentialService");
    const candidates = await service.listRuntimeCandidates(1);

    expect(candidates.map((item) => item.provider)).toEqual([
      "gemini",
      "nvidia",
      "openai",
    ]);
    expect(candidates.map((item) => item.priority)).toEqual([10, 20, 30]);
    expect(candidates[0]).toEqual(
      expect.objectContaining({
        model: "gemini-2.5-flash-lite",
        apiStyle: "chat",
      }),
    );
  });

  test("valida NVIDIA consultando o catálogo de modelos", async () => {
    const get = jest.fn(async () => ({
      data: { data: [{ id: "meta/llama-3.1-8b-instruct" }] },
    }));
    jest.doMock("axios", () => ({ get }));
    jest.doMock("../src/models/AiProviderCredential", () => ({}));

    const service = require("../src/services/aiCredentialService");
    const result = await service.validateCredential({
      apiKey: "nvapi-test",
      provider: "nvidia",
      model: "meta/llama-3.1-8b-instruct",
      apiStyle: "chat",
    });

    expect(result).toEqual({
      ok: true,
      provider: "nvidia",
      model: "meta/llama-3.1-8b-instruct",
    });
    expect(get).toHaveBeenCalledWith(
      "https://integrate.api.nvidia.com/v1/models",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer nvapi-test" }),
      }),
    );
  });

  test("valida Gemini com endpoint e identificação de cliente oficiais", async () => {
    const get = jest.fn(async () => ({ data: { id: "gemini-2.5-flash-lite" } }));
    jest.doMock("axios", () => ({ get }));
    jest.doMock("../src/models/AiProviderCredential", () => ({}));

    const service = require("../src/services/aiCredentialService");
    const result = await service.validateCredential({
      apiKey: "gemini-test",
      provider: "gemini",
      model: "gemini-2.5-flash-lite",
      apiStyle: "chat",
    });

    expect(result.provider).toBe("gemini");
    expect(get).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/openai/models/gemini-2.5-flash-lite",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer gemini-test",
          "x-goog-api-client": "hdev-whatsapp-saas/1.0",
        }),
      }),
    );
  });

  test("bloqueia base URL não oficial para Gemini e NVIDIA", () => {
    jest.doMock("../src/models/AiProviderCredential", () => ({}));
    const service = require("../src/services/aiCredentialService");

    expect(() => service.normalizeConfig({
      provider: "gemini",
      baseUrl: "https://example.com/v1",
    })).toThrow("Base URL não permitida");
  });
});
