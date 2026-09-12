describe("iaService credential failover", () => {
  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
    delete process.env.AI_MAX_CREDENTIAL_ATTEMPTS;
  });

  test("tenta Gemini, NVIDIA e por ultimo OpenAI", async () => {
    process.env.NODE_ENV = "test";
    process.env.AI_MAX_CREDENTIAL_ATTEMPTS = "3";
    const first = {
      source: "database",
      credentialId: 1,
      empresaId: 7,
      fingerprint: "first0000001",
      apiKey: "gemini-key",
      provider: "gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      model: "gemini-3.5-flash-lite",
      apiStyle: "chat",
    };
    const second = {
      ...first,
      credentialId: 2,
      fingerprint: "second000002",
      apiKey: "nvidia-key",
      provider: "nvidia",
      baseUrl: "https://integrate.api.nvidia.com/v1",
      model: "nvidia/nemotron-3.5-lightning-30b-a3b",
    };
    const third = {
      ...first,
      credentialId: 3,
      fingerprint: "third0000003",
      apiKey: "openai-key",
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      apiStyle: "responses",
    };
    const markFailure = jest.fn(async () => ({}));
    const markSuccess = jest.fn(async () => ({}));

    jest.doMock("../src/services/aiCredentialService", () => ({
      listRuntimeCandidates: jest.fn(async () => [first, second, third]),
      markFailure,
      markSuccess,
      providerHeaders: (provider, apiKey) => ({ Authorization: `Bearer ${apiKey}`, "x-provider": provider }),
      safeProviderError: (err) => ({ status: err.response?.status || null, code: String(err.response?.status), message: "failed" }),
      shouldTryNext: (err) => [429, 500].includes(err.response?.status),
    }));
    const post = jest
      .fn()
      .mockRejectedValueOnce({ response: { status: 429, data: { error: { message: "limit" } } } })
      .mockRejectedValueOnce({ response: { status: 500, data: { error: { message: "unavailable" } } } })
      .mockResolvedValueOnce({ data: { output_text: '{"reply":"Resposta pela OpenAI"}' } });
    jest.doMock("axios", () => ({ post }));
    jest.doMock("../src/utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

    const iaService = require("../src/services/iaService");
    const result = await iaService.gerarRespostaComMeta({
      mensagem: "Olá",
      empresaId: 7,
    });

    expect(result.reply).toBe("Resposta pela OpenAI");
    expect(result.meta.isFallback).toBe(false);
    expect(post).toHaveBeenCalledTimes(3);
    expect(markFailure).toHaveBeenCalledWith(first, expect.anything());
    expect(markFailure).toHaveBeenCalledWith(second, expect.anything());
    expect(markSuccess).toHaveBeenCalledWith(third);
  });
});
