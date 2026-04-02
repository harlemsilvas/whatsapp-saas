const axios = require("axios");

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

exports.enviarMensagem = async (to, text) => {
  let url;
  let phoneId;
  let token;
  try {
    const baseUrl = requiredEnv("WHATSAPP_URL").replace(/\/$/, "");
    phoneId = requiredEnv("WHATSAPP_PHONE_ID");
    token = requiredEnv("WHATSAPP_TOKEN");
    url = `${baseUrl}/${phoneId}/messages`;

    await axios.post(
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
  } catch (err) {
    const status = err.response?.status;
    const data = err.response?.data;
    const graphError = data?.error;

    console.error("Erro ao enviar mensagem", {
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
  }
};
