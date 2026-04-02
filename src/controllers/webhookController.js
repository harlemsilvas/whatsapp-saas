const messageService = require("../services/messageService");

function maskPhone(value) {
  if (!value) return "<missing>";
  const s = String(value);
  const last4 = s.slice(-4);
  return `***${last4}`;
}

exports.receberMensagem = async (req, res, next) => {
  try {
    const from = req.body?.from;
    const text = req.body?.message?.text;
    console.log("Webhook recebido", {
      from: maskPhone(from),
      textPreview: text ? String(text).slice(0, 40) : null,
    });

    await messageService.processar(req.body);
    res.sendStatus(200);
  } catch (err) {
    next(err);
  }
};

exports.verificarWebhook = (req, res) => {
  const VERIFY_TOKEN = "123456";

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log("REQ QUERY:", req.query);

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verificado");
    return res.status(200).send(challenge);
  } else {
    console.log("❌ Token inválido");
    return res.sendStatus(403);
  }
};
