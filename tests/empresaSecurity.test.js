describe("Empresa WhatsApp token encryption", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...OLD_ENV,
      CREDENTIALS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
    };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  test("descriptografa token ao carregar empresa", async () => {
    const { encryptSecret } = require("../src/utils/credentialCrypto");
    const encrypted = encryptSecret("token-secreto");
    jest.doMock("../src/config/database", () => ({
      query: jest.fn(async () => ({
        rows: [
          {
            id: 1,
            whatsapp_token: null,
            whatsapp_token_ciphertext: encrypted.ciphertext,
            whatsapp_token_iv: encrypted.iv,
            whatsapp_token_auth_tag: encrypted.authTag,
          },
        ],
      })),
    }));
    const Empresa = require("../src/models/Empresa");

    const empresa = await Empresa.findById(1);

    expect(empresa.whatsapp_token).toBe("token-secreto");
    expect(empresa).not.toHaveProperty("whatsapp_token_ciphertext");
    expect(empresa).not.toHaveProperty("whatsapp_token_iv");
    expect(empresa).not.toHaveProperty("whatsapp_token_auth_tag");
  });

  test("lista empresas sem descriptografar tokens", async () => {
    const query = jest.fn(async () => ({
      rows: [{ id: 1, whatsapp_token_ciphertext: "não-descriptografar" }],
    }));
    jest.doMock("../src/config/database", () => ({ query }));
    const Empresa = require("../src/models/Empresa");

    const empresas = await Empresa.list();

    expect(empresas[0].whatsapp_token_ciphertext).toBe("não-descriptografar");
  });

  test("rotaciona token sem enviar texto puro ao banco", async () => {
    const query = jest.fn(async () => ({ rows: [{ id: 1 }] }));
    jest.doMock("../src/config/database", () => ({ query }));
    const Empresa = require("../src/models/Empresa");

    await Empresa.update(1, { whatsapp_token: "token-novo" });

    const params = query.mock.calls[0][1];
    expect(params).not.toContain("token-novo");
    expect(params[4]).toEqual(expect.any(String));
    expect(params[5]).toEqual(expect.any(String));
    expect(params[6]).toEqual(expect.any(String));
    expect(query.mock.calls[0][0]).toContain("whatsapp_token = CASE");
  });

  test("revoga campos legado e criptografados", async () => {
    const query = jest.fn(async () => ({ rows: [{ id: 1 }] }));
    jest.doMock("../src/config/database", () => ({ query }));
    const Empresa = require("../src/models/Empresa");

    await Empresa.revokeWhatsappToken(1);

    const sql = query.mock.calls[0][0];
    expect(sql).toContain("whatsapp_token = NULL");
    expect(sql).toContain("whatsapp_token_ciphertext = NULL");
    expect(sql).toContain("whatsapp_token_revoked_at = NOW()");
  });
});
