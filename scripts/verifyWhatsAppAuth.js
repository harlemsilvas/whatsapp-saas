const axios = require("axios");
require("dotenv").config();

function maskToken(token) {
  if (!token) return "<missing>";
  const trimmed = String(token).trim();
  if (trimmed.length <= 12) return `<set:${trimmed.length}>`;
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)} (len=${trimmed.length})`;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Variável de ambiente ausente: ${name}`);
  }
  return String(value).trim();
}

async function main() {
  const baseUrl = requiredEnv("WHATSAPP_URL").replace(/\/$/, "");
  const phoneId = requiredEnv("WHATSAPP_PHONE_ID");
  const token = requiredEnv("WHATSAPP_TOKEN");

  const url = `${baseUrl}/${phoneId}?fields=display_phone_number,verified_name`;

  try {
    const res = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      timeout: 15000,
    });

    console.log("✅ WhatsApp auth OK");
    console.log({
      phoneId,
      display_phone_number: res.data?.display_phone_number,
      verified_name: res.data?.verified_name,
    });
  } catch (err) {
    const status = err.response?.status;
    const data = err.response?.data;
    const graphError = data?.error;

    console.error("❌ WhatsApp auth FAIL", {
      status,
      url,
      phoneId,
      token: maskToken(token),
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

    process.exitCode = 1;
  }
}

main();
