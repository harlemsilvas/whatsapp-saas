const crypto = require("crypto");

describe("credentialCrypto", () => {
  const previousKey = process.env.CREDENTIALS_ENCRYPTION_KEY;

  afterEach(() => {
    if (previousKey === undefined) delete process.env.CREDENTIALS_ENCRYPTION_KEY;
    else process.env.CREDENTIALS_ENCRYPTION_KEY = previousKey;
    jest.resetModules();
  });

  test("criptografa e descriptografa sem expor o segredo no payload", () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
    const { decryptSecret, encryptSecret } = require("../src/utils/credentialCrypto");

    const encrypted = encryptSecret("sk-test-secret");

    expect(encrypted.ciphertext).not.toContain("sk-test-secret");
    expect(encrypted.fingerprint).toHaveLength(12);
    expect(decryptSecret(encrypted)).toBe("sk-test-secret");
  });

  test("rejeita chave mestra com tamanho incorreto", () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = "curta";
    const { encryptSecret } = require("../src/utils/credentialCrypto");

    expect(() => encryptSecret("sk-test-secret")).toThrow("32 bytes");
  });
});
