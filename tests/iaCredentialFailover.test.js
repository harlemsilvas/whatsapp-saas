describe("iaService credential failover", () => {
  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
    delete process.env.AI_MAX_CREDENTIAL_ATTEMPTS;
  });

  test("usa a proxima credencial quando a primeira retorna 401", async () => {
    process.env.NODE_ENV = "test";
    process.env.AI_MAX_CREDENTIAL_ATTEMPTS = "2";
    const first = {
      source: "database",
      credentialId: 1,
      empresaId: 7,
      fingerprint: "first0000001",
      apiKey: "sk-first",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      apiStyle: "responses",
    };
    const second = { ...first, credentialId: 2, fingerprint: "second000002", apiKey: "sk-second" };
    const markFailure = jest.fn(async () => ({}));
    const markSuccess = jest.fn(async () => ({}));

    jest.doMock("../src/services/aiCredentialService", () => ({
      listRuntimeCandidates: jest.fn(async () => [first, second]),
      markFailure,
      markSuccess,
      safeProviderError: (err) => ({ status: err.response?.status || null, code: "401", message: "invalid" }),
      shouldTryNext: (err) => err.response?.status === 401,
    }));
    const post = jest
      .fn()
      .mockRejectedValueOnce({ response: { status: 401, data: { error: { message: "invalid" } } } })
      .mockResolvedValueOnce({ data: { output_text: '{"reply":"Resposta pela segunda chave"}' } });
    jest.doMock("axios", () => ({ post }));
    jest.doMock("../src/utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

    const iaService = require("../src/services/iaService");
    const result = await iaService.gerarRespostaComMeta({
      mensagem: "Olá",
      empresaId: 7,
    });

    expect(result.reply).toBe("Resposta pela segunda chave");
    expect(result.meta.isFallback).toBe(false);
    expect(post).toHaveBeenCalledTimes(2);
    expect(markFailure).toHaveBeenCalledWith(first, expect.anything());
    expect(markSuccess).toHaveBeenCalledWith(second);
  });
});
