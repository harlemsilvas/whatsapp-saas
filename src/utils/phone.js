function normalizeTelefoneBR(value) {
  if (value === undefined || value === null) return null;

  let digits = String(value).replace(/\D+/g, "");
  if (!digits) return null;

  // Remove prefixo internacional "00" (ex.: 0055...)
  if (digits.startsWith("00") && digits.length > 2) {
    digits = digits.slice(2);
  }

  // Caso comum em telefonia: 0 + (operadora 2 dígitos) + DDD+numero
  // Ex.: 0411199999999 -> 11 99999 9999
  if (digits.startsWith("0") && digits.length >= 12) {
    const maybeCarrierStripped = digits.slice(3);
    if (
      maybeCarrierStripped.length === 10 ||
      maybeCarrierStripped.length === 11
    ) {
      digits = maybeCarrierStripped;
    }
  }

  // Caso simples: 0 + DDD+numero
  if (
    digits.startsWith("0") &&
    (digits.length === 11 || digits.length === 12)
  ) {
    const maybeStripped = digits.slice(1);
    if (maybeStripped.length === 10 || maybeStripped.length === 11) {
      digits = maybeStripped;
    }
  }

  // Se já tem DDI 55, mantém.
  if (digits.startsWith("55")) return digits;

  const ddd = digits.length >= 2 ? Number(digits.slice(0, 2)) : NaN;
  const hasValidDDD = Number.isFinite(ddd) && ddd >= 11 && ddd <= 99;

  // Se parece ser BR sem DDI:
  // - 10 dígitos: DDD + 8 dígitos (fixo)
  // - 11 dígitos: DDD + 9 dígitos (celular, normalmente começando com 9)
  if (hasValidDDD && digits.length === 10) {
    const firstLocalDigit = digits[2];
    // Evita casos improváveis (0/1) e ainda cobre a maioria dos padrões locais.
    if (firstLocalDigit && firstLocalDigit !== "0" && firstLocalDigit !== "1") {
      return `55${digits}`;
    }
  }

  if (hasValidDDD && digits.length === 11) {
    const firstLocalDigit = digits[2];
    // Para 11 dígitos, assume BR apenas se parecer celular (inicia com 9).
    if (firstLocalDigit === "9") {
      return `55${digits}`;
    }
  }

  // Outros países: mantém apenas dígitos.
  return digits;
}

function isTelefoneE164Like(digits) {
  if (!digits) return false;
  const s = String(digits);
  if (!/^\d+$/.test(s)) return false;
  // E.164: máximo 15 dígitos (sem '+'); mínimo varia, usa 10 como piso prático.
  return s.length >= 10 && s.length <= 15;
}

module.exports = {
  normalizeTelefoneBR,
  isTelefoneE164Like,
};
