const axios = require("axios");
const logger = require("../utils/logger");

function maskPhone(value) {
  if (!value) return "<missing>";
  const s = String(value);
  const last4 = s.slice(-4);
  return `***${last4}`;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Variável de ambiente ausente: ${name}`);
  }
  return String(value).trim();
}

function classifyGraphError(graphError) {
  if (!graphError) return null;

  const code = Number(graphError.code);
  const subcode = Number(graphError.error_subcode);
  const message = String(graphError.message || "");
  const messageLower = message.toLowerCase();

  // Erros típicos de janela de atendimento (24h) / re-engagement.
  // Observação: códigos podem variar; deixamos um fallback por texto.
  const looksLikeOutsideWindowByCode = code === 131047 || subcode === 131047;
  const looksLikeOutsideWindowByText =
    /24\s*hour|24h|outside\s+the\s+allowed\s+window|customer\s+care\s+window|re-engagement|reengagement|template\s+message/i.test(
      messageLower,
    );

  if (looksLikeOutsideWindowByCode || looksLikeOutsideWindowByText) {
    return {
      reason: "outside_24h_window",
      code: Number.isFinite(code) ? code : null,
      subcode: Number.isFinite(subcode) ? subcode : null,
      message,
    };
  }

  return null;
}

function resolveValue(preferredValue, envName) {
  if (preferredValue !== undefined && preferredValue !== null) {
    const s = String(preferredValue).trim();
    if (s) return s;
  }
  return requiredEnv(envName);
}

function buildAuthHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
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
        headers: buildAuthHeaders(token),
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

    const classified = classifyGraphError(graphError);
    if (classified?.reason === "outside_24h_window") {
      logger.warn("WhatsApp recusou envio (fora da janela 24h)", {
        status,
        url,
        to: maskPhone(to),
        phoneId,
        graph: {
          code: classified.code,
          error_subcode: classified.subcode,
          message: classified.message,
          fbtrace_id: graphError?.fbtrace_id,
        },
      });

      err.whatsappReason = classified.reason;
      err.whatsappGraph = {
        code: classified.code,
        error_subcode: classified.subcode,
        message: classified.message,
      };

      throw err;
    }

    logger.error("Erro ao enviar mensagem", {
      status,
      url,
      to: maskPhone(to),
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

/**
 * Envia template message (necessário para retomar conversa fora da janela 24h).
 * https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
 */
exports.enviarTemplateMensagem = async (to, templateName, options = {}) => {
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

    const languageCode = String(
      options.languageCode || process.env.WHATSAPP_TEMPLATE_LANG || "pt_BR",
    ).trim();

    const components = Array.isArray(options.components)
      ? options.components
      : undefined;

    const res = await axios.post(
      url,
      {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: String(templateName).trim(),
          language: { code: languageCode },
          ...(components ? { components } : null),
        },
      },
      {
        headers: buildAuthHeaders(token),
        timeout: 15000,
      },
    );

    logger.info("Template enviado", {
      to: maskPhone(to),
      phoneId,
      template: String(templateName).trim(),
      languageCode,
      messageId: res.data?.messages?.[0]?.id || null,
    });

    return res.data;
  } catch (err) {
    const status = err.response?.status;
    const data = err.response?.data;
    const graphError = data?.error;

    logger.error("Erro ao enviar template", {
      status,
      url,
      to: maskPhone(to),
      phoneId,
      template: templateName,
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
