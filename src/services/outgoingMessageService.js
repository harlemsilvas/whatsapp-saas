const db = require("../config/database");
const Mensagem = require("../models/Mensagem");
const OutboxMessage = require("../models/OutboxMessage");
const logger = require("../utils/logger");
const { normalizeTelefoneBR } = require("../utils/phone");

function maskPhone(value) {
  if (!value) return "<missing>";
  const s = String(value);
  const last4 = s.slice(-4);
  return `***${last4}`;
}

async function enqueueOutgoingTextMessage({
  empresa,
  empresaId,
  contato,
  webhookEventId = null,
  responseText,
  originalNumber,
  useEnvWhatsApp = false,
}) {
  let sendTo = originalNumber;

  if (useEnvWhatsApp) {
    const isProd = process.env.NODE_ENV === "production";
    const meuTelefone = normalizeTelefoneBR(process.env.MEU_TELEFONE);
    if (!isProd && meuTelefone) {
      if (meuTelefone !== originalNumber) {
        logger.warn("Fallback ativo: redirecionando envio para MEU_TELEFONE", {
          originalTo: maskPhone(originalNumber),
          redirectedTo: maskPhone(meuTelefone),
        });
      }
      sendTo = meuTelefone;
    }
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const mensagemSaida = await Mensagem.create({
      empresa_id: empresaId,
      contato_id: contato.id,
      direcao: "saida",
      conteudo: responseText,
      client,
    });

    const outbox = await OutboxMessage.createPending(
      {
        empresaId,
        contatoId: contato.id,
        mensagemId: mensagemSaida.id,
        webhookEventId,
        to: sendTo,
        content: responseText,
        options: {
          token: useEnvWhatsApp ? null : empresa?.whatsapp_token || null,
          phoneId: useEnvWhatsApp ? null : empresa?.phone_number_id || null,
          useEnvWhatsApp: Boolean(useEnvWhatsApp),
        },
      },
      client,
    );

    await client.query("COMMIT");
    return { mensagemSaida, outbox, sendTo };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  enqueueOutgoingTextMessage,
};
