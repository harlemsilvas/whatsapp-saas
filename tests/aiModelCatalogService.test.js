describe("aiModelCatalogService", () => {
  let axios;
  let service;

  beforeEach(() => {
    jest.resetModules();
    axios = { get: jest.fn() };
    jest.doMock("axios", () => axios);
    jest.doMock("../src/models/AiModelCatalog", () => ({
      db: {},
    }));
    jest.doMock("../src/utils/credentialCrypto", () => ({
      decryptSecret: jest.fn(() => "provider-secret"),
    }));
    jest.doMock("../src/services/aiCredentialService", () => ({
      safeProviderError: jest.fn((error) => ({
        status: error.response?.status || null,
        code: "provider_error",
        message: error.message,
      })),
    }));
    service = require("../src/services/aiModelCatalogService");
  });

  test("normaliza capacidades declaradas e limites do catálogo Gemini", () => {
    const model = service.normalizeGeminiModel({
      name: "models/gemini-2.5-flash",
      baseModelId: "gemini-2.5-flash",
      displayName: "Gemini 2.5 Flash",
      description: "Multimodal model",
      inputTokenLimit: 1048576,
      outputTokenLimit: 65536,
      supportedGenerationMethods: ["generateContent", "countTokens"],
    });

    expect(model).toEqual(expect.objectContaining({
      modelId: "gemini-2.5-flash",
      chatCompatible: true,
      inputTokenLimit: 1048576,
      outputTokenLimit: 65536,
      declaredCapabilities: ["chat", "text", "token_counting"],
      inferredCapabilities: ["vision"],
    }));
  });

  test("não anuncia embeddings como modelo de chat", () => {
    const model = service.normalizeGeminiModel({
      name: "models/gemini-embedding-001",
      supportedGenerationMethods: ["embedContent"],
    });

    expect(model.chatCompatible).toBe(false);
    expect(model.capabilities).toContain("embeddings");
    expect(model.capabilities).not.toContain("chat");
  });

  test("marca como inferidas as capacidades do catálogo OpenAI compatível", () => {
    const model = service.normalizeOpenAiModel(
      { id: "nvidia/llama-3.3-nemotron-super-49b-v1", owned_by: "nvidia" },
      "nvidia",
    );

    expect(model).toEqual(expect.objectContaining({
      modelId: "nvidia/llama-3.3-nemotron-super-49b-v1",
      chatCompatible: true,
      declaredCapabilities: [],
      inferredCapabilities: ["chat", "text"],
      endpoints: ["chat.completions"],
    }));
  });

  test("percorre todas as páginas do catálogo Gemini usando a chave descriptografada", async () => {
    axios.get
      .mockResolvedValueOnce({
        data: {
          models: [{
            name: "models/gemini-first",
            supportedGenerationMethods: ["generateContent"],
          }],
          nextPageToken: "next-page",
        },
      })
      .mockResolvedValueOnce({
        data: {
          models: [{
            name: "models/gemini-second",
            supportedGenerationMethods: ["generateContent"],
          }],
        },
      });

    const models = await service.fetchCredentialModels({
      provider: "gemini",
      api_key_ciphertext: "ciphertext",
      api_key_iv: "iv",
      api_key_auth_tag: "tag",
    }, 4321);

    expect(models.map((item) => item.modelId)).toEqual([
      "gemini-first",
      "gemini-second",
    ]);
    expect(axios.get).toHaveBeenNthCalledWith(
      2,
      "https://generativelanguage.googleapis.com/v1beta/models",
      expect.objectContaining({
        params: { key: "provider-secret", pageSize: 1000, pageToken: "next-page" },
        timeout: 4321,
      }),
    );
  });

  test("consulta o endpoint models da credencial OpenAI compatível", async () => {
    axios.get.mockResolvedValue({ data: { data: [{ id: "gpt-4o-mini" }] } });

    const models = await service.fetchCredentialModels({
      provider: "openai",
      base_url: "https://api.openai.com/v1/",
      api_key_ciphertext: "ciphertext",
      api_key_iv: "iv",
      api_key_auth_tag: "tag",
    });

    expect(models[0].modelId).toBe("gpt-4o-mini");
    expect(axios.get).toHaveBeenCalledWith(
      "https://api.openai.com/v1/models",
      expect.objectContaining({
        headers: { Authorization: "Bearer provider-secret" },
      }),
    );
  });
});
