const Contato = require("../models/Contato");
const Empresa = require("../models/Empresa");
const Mensagem = require("../models/Mensagem");
const Conversa = require("../models/Conversa");
const fluxoService = require("./fluxoService");
const iaService = require("./iaService");
const whatsappService = require("./whatsappService");
const logger = require("../utils/logger");
const env = require("../config/env");
const { normalizeTelefoneBR } = require("../utils/phone");

function maskPhone(value) {
  if (!value) return "<missing>";
  const s = String(value);
  const last4 = s.slice(-4);
  return `***${last4}`;
}

async function maybeSendReengagementTemplate({
  sendTo,
  empresa,
  useEnvWhatsApp,
  outsideWindowGraph,
  empresaId,
  contatoId,
}) {
  const templateName = String(
    process.env.WHATSAPP_REENGAGE_TEMPLATE_NAME || "",
  ).trim();

  if (!templateName) {
    logger.warn("Fora da janela 24h: template não configurado", {
      empresaId,
      contatoId,
      to: maskPhone(sendTo),
      hint: "Defina WHATSAPP_REENGAGE_TEMPLATE_NAME e aprove um template na Meta",
      graph: outsideWindowGraph || null,
    });
    return {
      attempted: false,
      outcome: "not_configured",
      templateName: null,
      languageCode: null,
    };
  }

  const languageCode = String(
    process.env.WHATSAPP_REENGAGE_TEMPLATE_LANG ||
      process.env.WHATSAPP_TEMPLATE_LANG ||
      "pt_BR",
  ).trim();

  const options = {
    languageCode,
  };

  if (!useEnvWhatsApp) {
    options.token = empresa.whatsapp_token || null;
    options.phoneId = empresa.phone_number_id || null;
  }

  await whatsappService.enviarTemplateMensagem(sendTo, templateName, options);

  return {
    attempted: true,
    outcome: "sent",
    templateName,
    languageCode,
  };
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
  const numero = normalizeTelefoneBR(msg.from);
  const waMessageId = msg.id ? String(msg.id).trim() : null;

  if (!mensagem) return;
  if (!numero) return;

  let stage = "resolve_empresa";
  let contatoForDebug = null;
  let empresaIdForDebug = null;

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
      empresaIdForDebug = empresa_id;
      logger.warn(
        "Empresa não encontrada para phone_number_id; usando fallback",

      try {
        stage = "idempotencia";
        // 🔹 0. idempotência: WhatsApp pode reenviar o mesmo evento
        if (waMessageId) {
          const already = await Mensagem.existsByWaMessageId(empresa_id, waMessageId);
          if (already) {
            stage = "idempotencia_duplicate";
            const existingContato = await Contato.findByTelefone(empresa_id, numero);
            if (existingContato) {
              await Contato.setBotStatus(empresa_id, existingContato.id, {
                reason: "duplicate_wa_message_id",
                details: { wa_message_id: waMessageId },
              });
            }

            logger.info("Webhook duplicado ignorado (wa_message_id)", {
              empresaId: empresa_id,
              contatoId: existingContato?.id || null,
              botReason: "duplicate_wa_message_id",
              wa_message_id: waMessageId,
            });
            return;
          }
        }

        stage = "contato_find_or_create";
        // 🔹 1. buscar ou criar contato
        const contato = await Contato.findOrCreate(empresa_id, numero);
        if (!contato) return;
        contatoForDebug = contato;

        stage = "mensagem_create_in";
        // 🔹 2. salvar mensagem de entrada
        await Mensagem.create({
          empresa_id,
          contato_id: contato.id,
          direcao: "entrada",
          conteudo: mensagem,
          wa_message_id: waMessageId,
        });

        stage = "handoff_reload_contato";
        // 🔹 2.1 handoff: se humano assumiu ou bot está pausado, não responder
        // Recarrega o contato para evitar race (ex.: admin assume atendimento ao mesmo tempo que chega webhook).
        const contatoAtual = (await Contato.findById(empresa_id, contato.id)) || contato;
        contatoForDebug = contatoAtual;

        const modo = String(contatoAtual.atendimento_modo || "bot").toLowerCase();
        const pausadoAteMs = contatoAtual.atendimento_pausado_ate
          ? new Date(contatoAtual.atendimento_pausado_ate).getTime()
          : 0;
        if (modo === "humano") {
          stage = "handoff_human_active";
          await Contato.setBotStatus(empresa_id, contatoAtual.id, {
            reason: "human_active",
            details: { atendimento_modo: "humano" },
          });
          logger.info("Bot suprimido: atendimento humano ativo", {
            empresaId: empresa_id,
            contatoId: contatoAtual.id,
            botReason: "human_active",
          });
          return;
        }
        if (pausadoAteMs && pausadoAteMs > Date.now()) {
          stage = "handoff_paused";
          await Contato.setBotStatus(empresa_id, contatoAtual.id, {
            reason: "paused",
            details: { pausadoAte: contatoAtual.atendimento_pausado_ate },
          });
          logger.info("Bot suprimido: em pausa", {
            empresaId: empresa_id,
            contatoId: contatoAtual.id,
            pausadoAte: contatoAtual.atendimento_pausado_ate,
            botReason: "paused",
          });
          return;
        }
    });
    return;
  }
  if (pausadoAteMs && pausadoAteMs > Date.now()) {
    await Contato.setBotStatus(empresa_id, contatoAtual.id, {
      reason: "paused",
      details: { pausadoAte: contatoAtual.atendimento_pausado_ate },
    });
    logger.info("Bot suprimido: em pausa", {
      empresaId: empresa_id,
      contatoId: contatoAtual.id,
      pausadoAte: contatoAtual.atendimento_pausado_ate,
      botReason: "paused",
    });
    return;
  }

    stage = "fluxo_verificar";
    // 🔹 3. verificar fluxo
    let resposta = await fluxoService.verificar(empresa_id, mensagem);

    stage = "ia_or_fallback";
    // 🔹 4. fallback IA
    if (!resposta) {
    const maxCtx = Math.max(
      0,
      Math.trunc(Number(process.env.OPENAI_MAX_CONTEXT_MESSAGES || 8) || 8),
    );

    let contextoMensagens = [];
    if (maxCtx > 0) {
      const recent = await Conversa.listMensagensByContato(
        empresa_id,
        contato.id,
        {
          limit: maxCtx,
          offset: 0,
          order: "desc",
        },
      );

      // recent vem DESC; coloca em ordem cronológica
      const ordered = recent.slice().reverse();

      // evita duplicar a mensagem atual (já foi salva e virá no histórico)
      const withoutLast = ordered.length
        ? ordered.slice(0, ordered.length - 1)
        : ordered;

      contextoMensagens = withoutLast
        .map((m) => ({
          role: m.direcao === "saida" ? "assistant" : "user",
          content: m.conteudo,
        }))
        .filter((m) => m.content);
    }

      resposta = await iaService.gerarResposta({
        mensagem,
        contextoMensagens,
        contato,
      });
    }

    stage = "whatsapp_send";
    // 🔹 5. enviar resposta
    let sendTo = numero;
    if (useEnvWhatsApp) {
    const isProd = process.env.NODE_ENV === "production";
    const meuTelefone = normalizeTelefoneBR(process.env.MEU_TELEFONE);

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

    try {
      await whatsappService.enviarMensagem(sendTo, resposta);
    } catch (err) {
      if (err && err.whatsappReason === "outside_24h_window") {
        await Contato.setBotStatus(empresa_id, contato.id, {
          reason: "outside_24h_window",
          details: { graph: err.whatsappGraph || null },
        });
        logger.warn("Resposta não enviada (fora da janela 24h)", {
          empresaId: empresa_id,
          contatoId: contato.id,
          to: maskPhone(sendTo),
          graph: err.whatsappGraph || null,
          botReason: "outside_24h_window",
        });

        try {
          const templateResult = await maybeSendReengagementTemplate({
            sendTo,
            empresa,
            useEnvWhatsApp,
            outsideWindowGraph: err.whatsappGraph || null,
            empresaId: empresa_id,
            contatoId: contato.id,
          });

          await Contato.setBotStatus(empresa_id, contato.id, {
            reason: "outside_24h_window",
            details: {
              graph: err.whatsappGraph || null,
              template: templateResult,
            },
          });
        } catch (templateErr) {
          await Contato.setBotStatus(empresa_id, contato.id, {
            reason: "outside_24h_window",
            details: {
              graph: err.whatsappGraph || null,
              template: {
                attempted: true,
                outcome: "failed",
                message: templateErr.message,
              },
            },
          });
          logger.warn("Falha ao enviar template de retomada", {
            empresaId: empresa_id,
            contatoId: contato.id,
            to: maskPhone(sendTo),
            message: templateErr.message,
          });
        }
        return;
      }
      throw err;
    }
    } else {
    try {
      await whatsappService.enviarMensagem(sendTo, resposta, {
        token: empresa.whatsapp_token || null,
        phoneId: empresa.phone_number_id || null,
      });
    } catch (err) {
      if (err && err.whatsappReason === "outside_24h_window") {
        await Contato.setBotStatus(empresa_id, contato.id, {
          reason: "outside_24h_window",
          details: { graph: err.whatsappGraph || null },
        });
        logger.warn("Resposta não enviada (fora da janela 24h)", {
          empresaId: empresa_id,
          contatoId: contato.id,
          to: maskPhone(sendTo),
          graph: err.whatsappGraph || null,
          botReason: "outside_24h_window",
        });

        try {
          const templateResult = await maybeSendReengagementTemplate({
            sendTo,
            empresa,
            useEnvWhatsApp,
            outsideWindowGraph: err.whatsappGraph || null,
            empresaId: empresa_id,
            contatoId: contato.id,
          });

          await Contato.setBotStatus(empresa_id, contato.id, {
            reason: "outside_24h_window",
            details: {
              graph: err.whatsappGraph || null,
              template: templateResult,
            },
          });
        } catch (templateErr) {
          await Contato.setBotStatus(empresa_id, contato.id, {
            reason: "outside_24h_window",
            details: {
              graph: err.whatsappGraph || null,
              template: {
                attempted: true,
                outcome: "failed",
                message: templateErr.message,
              },
            },
          });
          logger.warn("Falha ao enviar template de retomada", {
            empresaId: empresa_id,
            contatoId: contato.id,
            to: maskPhone(sendTo),
            message: templateErr.message,
          });
        }
        return;
      }
      throw err;
    }
  }

    stage = "mensagem_create_out";
    // 🔹 6. salvar resposta
    await Mensagem.create({
      empresa_id,
      contato_id: contato.id,
      direcao: "saida",
      conteudo: resposta,
    });

    stage = "clear_bot_status";
    // Limpamos o último motivo de não-resposta quando o bot respondeu com sucesso.
    await Contato.setBotStatus(empresa_id, contato.id, {
      reason: null,
      details: null,
    });

    logger.info("Mensagem respondida", { empresaId: empresa_id });
  } catch (err) {
    const contatoId = contatoForDebug?.id || null;
    if (empresaIdForDebug && contatoId) {
      try {
        await Contato.setBotStatus(empresaIdForDebug, contatoId, {
          reason: "internal_error",
          details: {
            stage,
            message: err?.message || String(err),
          },
        });
      } catch {
        // best-effort: não deixar a falha de observabilidade quebrar o processamento
      }
    }
    throw err;
  }
};
