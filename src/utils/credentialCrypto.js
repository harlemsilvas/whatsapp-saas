const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";

function getEncryptionKey() {
  const raw = String(process.env.CREDENTIALS_ENCRYPTION_KEY || "").trim();
  if (!raw) {
    throw new Error("CREDENTIALS_ENCRYPTION_KEY nao configurada");
  }

  let key;
  if (/^[a-f0-9]{64}$/i.test(raw)) {
    key = Buffer.from(raw, "hex");
  } else {
    key = Buffer.from(raw, "base64");
  }

  if (key.length !== 32) {
    throw new Error(
      "CREDENTIALS_ENCRYPTION_KEY deve ter 32 bytes em base64 ou 64 caracteres hex",
    );
  }
  return key;
}

function encryptSecret(secret) {
  const normalized = String(secret || "").trim();
  if (!normalized) throw new Error("Segredo vazio");

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(normalized, "utf8"),
    cipher.final(),
  ]);

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    fingerprint: fingerprintSecret(normalized),
  };
}

function fingerprintSecret(secret) {
  return crypto
    .createHash("sha256")
    .update(String(secret || "").trim())
    .digest("hex")
    .slice(-12);
}

function decryptSecret({ ciphertext, iv, authTag }) {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getEncryptionKey(),
    Buffer.from(iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

module.exports = {
  decryptSecret,
  encryptSecret,
  fingerprintSecret,
  getEncryptionKey,
};
