const axios = require("axios");
const logger = require("../utils/logger");

function maskPhone(value) {
  if (!value) return "<missing>";
  const s = String(value);
  const last4 = s.slice(-4);
  return `***${last4}`;
}

function maskToken(token) {
  if (!token) return "<missing>";
  const trimmed = String(token).trim();
  if (trimmed.length <= 12) return "<set:" + trimmed.length + ">";
  return (
    trimmed.slice(0, 6) +
    "..." +
    trimmed.slice(-4) +
    " (len=" +
    trimmed.length +
    ")"
  );
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Variável de ambiente ausente: ${name}`);
  }
  return String(value).trim();
}

function resolveValue(preferredValue, envName) {
  if (preferredValue !== undefined && preferredValue !== null) {
    const s = String(preferredValue).trim();
    if (s) return s;
  }
  return requiredEnv(envName);
}

exports.enviarMensagem = async (to, text, options = {}) => {
  let url;
  let phoneId;
  let token;
  try {
    const baseUrl = resolveValue(options.baseUrl, "WHATSAPP_URL").replace(
      /\/$/,
      "",
    );
    phoneId = resolveValue(options.phoneId, "WHATSAPP_PHONE_ID");
    token = resolveValue(options.token, "WHATSAPP_TOKEN");
    url = `${baseUrl}/${phoneId}/messages`;

    const res = await axios.post(
      url,
      {
        messaging_product: "whatsapp",
        to: to,
        type: "text",
        text: { body: text },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      },
    );

    logger.info("Mensagem enviada", {
      to: maskPhone(to),
      phoneId,
      messageId: res.data?.messages?.[0]?.id || null,
    });

    return res.data;
  } catch (err) {
    const status = err.response?.status;
    const data = err.response?.data;
    const graphError = data?.error;

    logger.error("Erro ao enviar mensagem", {
      status,
      url,
      to,
      token: maskToken(token),
      phoneId,
      graph: graphError
        ? {
            message: graphError.message,
            type: graphError.type,
            code: graphError.code,
            error_subcode: graphError.error_subcode,
            fbtrace_id: graphError.fbtrace_id,
          }
        : data,
      message: err.message,
    });

    throw err;
  }
};
