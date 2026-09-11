describe("AiProviderCredential", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test("tipa explicitamente o status reutilizado no INSERT", async () => {
    const query = jest.fn(async () => ({ rows: [{ id: "1" }] }));
    jest.doMock("../src/config/database", () => ({ query }));
    const AiProviderCredential = require("../src/models/AiProviderCredential");

    const item = await AiProviderCredential.create({
      empresaId: 1,
      provider: "gemini",
      label: "Gemini principal",
      encrypted: {
        ciphertext: "ciphertext",
        iv: "iv",
        authTag: "tag",
        fingerprint: "fingerprint",
      },
      model: "gemini-2.5-flash-lite",
      apiStyle: "chat",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      priority: 10,
      enabled: true,
      status: "valid",
    });

    expect(item).toEqual({ id: "1" });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("$13::text"),
      expect.arrayContaining(["valid"]),
    );
  });
});
