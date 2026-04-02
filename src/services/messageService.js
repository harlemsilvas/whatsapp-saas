const Contato = require("../models/Contato");
const Empresa = require("../models/Empresa");
const Mensagem = require("../models/Mensagem");
const fluxoService = require("./fluxoService");
const iaService = require("./iaService");
const whatsappService = require("./whatsappService");
const logger = require("../utils/logger");
const env = require("../config/env");

function maskPhone(value) {
  if (!value) return "<missing>";
  const s = String(value);
  const last4 = s.slice(-4);
  return `***${last4}`;
}

exports.processar = async (payload) => {
  const value = payload?.entry?.[0]?.changes?.[0]?.value;
  const msg = value?.messages?.[0];
  const status = value?.statuses?.[0];
  const metaPhoneNumberId = value?.metadata?.phone_number_id;

  // Eventos de status (delivered/read/etc) não exigem resposta do bot.
  if (!msg && status) {
    logger.info("Evento de status ignorado", {
      status: status.status,
      id: status.id,
    });
    return;
  }

  if (!msg) return;

  const mensagem = msg.text?.body;
  const numero = msg.from;

  if (!mensagem) return;

  let empresa;
  let useEnvWhatsApp = false;
  if (metaPhoneNumberId) {
    empresa = await Empresa.findByPhoneNumberId(String(metaPhoneNumberId));
    if (!empresa) {
      const isProd = process.env.NODE_ENV === "production";
      const allowFallback = env.toBool(
        process.env.ALLOW_PHONE_ID_FALLBACK,
        !isProd,
      );

      if (!allowFallback) {
        logger.warn("Empresa não encontrada para phone_number_id", {
          phone_number_id: metaPhoneNumberId,
        });
        return;
      }

      const fallbackEmpresaId = Number(process.env.DEFAULT_EMPRESA_ID || 1);
      empresa = await Empresa.findById(fallbackEmpresaId);
      if (!empresa) {
        logger.warn("Fallback de empresa falhou", {
          fallbackEmpresaId,
          phone_number_id: metaPhoneNumberId,
        });
        return;
      }

      useEnvWhatsApp = true;
      logger.warn(
        "Empresa não encontrada para phone_number_id; usando fallback",
        {
          phone_number_id: metaPhoneNumberId,
          fallbackEmpresaId,
        },
      );
    }
  } else {
    // Compatibilidade: se o payload não trouxer metadata, mantém o MVP fixo.
    empresa = await Empresa.findById(1);
    if (!empresa) return;
  }

  const empresa_id = empresa.id;

  logger.info("Mensagem recebida", { empresaId: empresa_id });

  // 🔹 1. buscar ou criar contato
  const contato = await Contato.findOrCreate(empresa_id, numero);

  // 🔹 2. salvar mensagem de entrada
  await Mensagem.create({
    empresa_id,
    contato_id: contato.id,
    direcao: "entrada",
    conteudo: mensagem,
  });

  // 🔹 3. verificar fluxo
  let resposta = await fluxoService.verificar(empresa_id, mensagem);

  // 🔹 4. fallback IA
  if (!resposta) {
    resposta = await iaService.gerarResposta(mensagem);
  }

  // 🔹 5. enviar resposta
  let sendTo = numero;
  if (useEnvWhatsApp) {
    const isProd = process.env.NODE_ENV === "production";
    const meuTelefone = String(process.env.MEU_TELEFONE || "").trim();

    // Quando o payload é exemplo (phone_number_id fake), o "from" costuma ser um número
    // que não está na lista permitida do ambiente de teste. Em dev, redireciona para o
    // número cadastrado em MEU_TELEFONE para validar o pipeline.
    if (!isProd && meuTelefone) {
      if (meuTelefone !== numero) {
        logger.warn("Fallback ativo: redirecionando envio para MEU_TELEFONE", {
          originalTo: maskPhone(numero),
          redirectedTo: maskPhone(meuTelefone),
        });
      }
      sendTo = meuTelefone;
    }

    await whatsappService.enviarMensagem(sendTo, resposta);
  } else {
    await whatsappService.enviarMensagem(sendTo, resposta, {
      token: empresa.whatsapp_token || null,
      phoneId: empresa.phone_number_id || null,
    });
  }

  // 🔹 6. salvar resposta
  await Mensagem.create({
    empresa_id,
    contato_id: contato.id,
    direcao: "saida",
    conteudo: resposta,
  });

  logger.info("Mensagem respondida", { empresaId: empresa_id });
};
