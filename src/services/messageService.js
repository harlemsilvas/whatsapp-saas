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

function normalizePhoneDigits(value) {
  const digits = String(value || "").replace(/\D+/g, "");
  if (!digits) return null;
  if (digits.startsWith("55")) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

async function notifyHumanAttendant({
  empresa,
  useEnvWhatsApp,
  empresaId,
  contato,
  inboundText,
}) {
  const toRaw = String(process.env.HUMAN_ALERT_WHATSAPP_TO || "").trim();
  if (!toRaw) {
    logger.info(
      "Alerta para atendente desativado (HUMAN_ALERT_WHATSAPP_TO vazio)",
      {
        empresaId,
        contatoId: contato?.id || null,
        hint: "Se você acabou de editar o .env, reinicie o processo (ex.: pm2 restart).",
      },
    );
    return;
  }

  const to = normalizePhoneDigits(toRaw);
  if (!to) return;

  // Evita enviar alerta para o próprio cliente por engano
  const contatoTelefone = normalizePhoneDigits(contato?.telefone);
  if (contatoTelefone && to === contatoTelefone) {
    logger.warn(
      "HUMAN_ALERT_WHATSAPP_TO aponta para o telefone do contato; ignorando alerta",
      {
        empresaId,
        contatoId: contato?.id || null,
      },
    );
    return;
  }

  const preview = String(inboundText || "")
    .trim()
    .slice(0, 220);
  const msgText =
    `ALERTA: IA não conseguiu responder automaticamente.\n` +
    `Empresa ${empresaId} • Contato #${contato?.id || "?"}\n` +
    (contato?.nome ? `Nome: ${String(contato.nome).trim()}\n` : "") +
    (contato?.telefone
      ? `Telefone: ${String(contato.telefone).trim()}\n`
      : "") +
    (preview ? `Última mensagem: ${preview}` : "");

  logger.info("Disparando alerta para atendente", {
    empresaId,
    contatoId: contato?.id || null,
    to: maskPhone(to),
    useEnvWhatsApp: Boolean(useEnvWhatsApp),
  });

  const templateName = String(
    process.env.HUMAN_ALERT_TEMPLATE_NAME || "",
  ).trim();
  const templateLang = String(
    process.env.HUMAN_ALERT_TEMPLATE_LANG ||
      process.env.WHATSAPP_TEMPLATE_LANG ||
      "pt_BR",
  ).trim();

  const attemptTemplateFallback = async (outsideWindowGraph) => {
    if (!templateName) {
      logger.warn("Alerta fora da janela 24h e template não configurado", {
        empresaId,
        contatoId: contato?.id || null,
        to: maskPhone(to),
        hint: "Defina HUMAN_ALERT_TEMPLATE_NAME (template aprovado na Meta) ou peça para o atendente mandar uma mensagem para abrir a janela 24h.",
        graph: outsideWindowGraph || null,
      });
      return;
    }

    const options = {
      languageCode: templateLang,
    };

    if (!useEnvWhatsApp) {
      options.token = empresa?.whatsapp_token || null;
      options.phoneId = empresa?.phone_number_id || null;
    }

    await whatsappService.enviarTemplateMensagem(to, templateName, options);
    logger.info("Template de alerta enviado para atendente", {
      empresaId,
      contatoId: contato?.id || null,
      to: maskPhone(to),
      templateName,
      languageCode: templateLang,
    });
  };

  try {
    if (useEnvWhatsApp) {
      await whatsappService.enviarMensagem(to, msgText);
      logger.info("Alerta enviado para atendente (env WhatsApp)", {
        empresaId,
        contatoId: contato?.id || null,
        to: maskPhone(to),
      });
      return;
    }

    await whatsappService.enviarMensagem(to, msgText, {
      token: empresa?.whatsapp_token || null,
      phoneId: empresa?.phone_number_id || null,
    });
    logger.info("Alerta enviado para atendente", {
      empresaId,
      contatoId: contato?.id || null,
      to: maskPhone(to),
    });
  } catch (err) {
    if (err && err.whatsappReason === "outside_24h_window") {
      try {
        await attemptTemplateFallback(err.whatsappGraph || null);
        return;
      } catch (templateErr) {
        logger.warn("Falha ao enviar template de alerta para atendente", {
          empresaId,
          contatoId: contato?.id || null,
          to: maskPhone(to),
          message: templateErr?.message || String(templateErr),
          code: templateErr?.code || null,
        });
      }
    }

    logger.warn("Falha ao enviar alerta para atendente", {
      empresaId,
      contatoId: contato?.id || null,
      to: maskPhone(to),
      message: err?.message || String(err),
      code: err?.code || null,
      whatsappReason: err?.whatsappReason || null,
    });
  }
}

async function setBotStatusSafe(empresaId, contatoId, payload, ctx = {}) {
  try {
    await Contato.setBotStatus(empresaId, contatoId, payload);
  } catch (err) {
    logger.warn("Falha ao atualizar bot_status_*", {
      empresaId,
      contatoId,
      reason: payload?.reason ?? null,
      stage: ctx?.stage || null,
      code: err?.code || null,
      message: err?.message || String(err),
    });
  }
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

  let stage = "start";
  let contatoIdForDebug = null;

  try {
    stage = "idempotencia";
    if (waMessageId) {
      const already = await Mensagem.existsByWaMessageId(
        empresa_id,
        waMessageId,
      );
      if (already) {
        const existingContato = await Contato.findByTelefone(
          empresa_id,
          numero,
        );
        if (existingContato) {
          await setBotStatusSafe(
            empresa_id,
            existingContato.id,
            {
              reason: "duplicate_wa_message_id",
              details: { wa_message_id: waMessageId },
            },
            { stage },
          );
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
    const contato = await Contato.findOrCreate(empresa_id, numero);
    if (!contato) return;
    contatoIdForDebug = contato.id;

    stage = "mensagem_create_in";
    await Mensagem.create({
      empresa_id,
      contato_id: contato.id,
      direcao: "entrada",
      conteudo: mensagem,
      wa_message_id: waMessageId,
    });

    stage = "handoff_reload_contato";
    // Recarrega o contato para evitar race (ex.: admin assume atendimento ao mesmo tempo que chega webhook).
    const contatoAtual =
      (await Contato.findById(empresa_id, contato.id)) || contato;
    contatoIdForDebug = contatoAtual.id;

    const modo = String(contatoAtual.atendimento_modo || "bot").toLowerCase();
    const pausadoAteMs = contatoAtual.atendimento_pausado_ate
      ? new Date(contatoAtual.atendimento_pausado_ate).getTime()
      : 0;

    if (modo === "humano") {
      stage = "handoff_human_active";
      await setBotStatusSafe(
        empresa_id,
        contatoAtual.id,
        {
          reason: "human_active",
          details: { atendimento_modo: "humano" },
        },
        { stage },
      );
      logger.info("Bot suprimido: atendimento humano ativo", {
        empresaId: empresa_id,
        contatoId: contatoAtual.id,
        botReason: "human_active",
      });
      return;
    }

    if (pausadoAteMs && pausadoAteMs > Date.now()) {
      stage = "handoff_paused";
      await setBotStatusSafe(
        empresa_id,
        contatoAtual.id,
        {
          reason: "paused",
          details: { pausadoAte: contatoAtual.atendimento_pausado_ate },
        },
        { stage },
      );
      logger.info("Bot suprimido: em pausa", {
        empresaId: empresa_id,
        contatoId: contatoAtual.id,
        pausadoAte: contatoAtual.atendimento_pausado_ate,
        botReason: "paused",
      });
      return;
    }

    stage = "fluxo_verificar";
    let resposta = await fluxoService.verificar(empresa_id, mensagem);

    stage = "ia_or_fallback";
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

        const ordered = recent.slice().reverse();
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

      const ia = await iaService.gerarRespostaComMeta({
        mensagem,
        contextoMensagens,
        contato,
      });
      resposta = ia?.reply;

      if (ia?.meta?.isFallback) {
        logger.warn("IA respondeu com fallback", {
          empresaId: empresa_id,
          contatoId: contato?.id || null,
          usedGenericFallback: Boolean(ia?.meta?.usedGenericFallback),
          reason: ia?.meta?.reason || null,
          fallbackKind: ia?.meta?.fallbackKind || null,
        });
      }

      // Se a IA caiu no fallback genérico ("No momento não consegui..."), notifica o atendente.
      if (ia?.meta?.usedGenericFallback) {
        logger.warn("Fallback genérico detectado; tentando alertar atendente", {
          empresaId: empresa_id,
          contatoId: contato?.id || null,
          envConfigured: Boolean(
            String(process.env.HUMAN_ALERT_WHATSAPP_TO || "").trim(),
          ),
        });
        await notifyHumanAttendant({
          empresa,
          useEnvWhatsApp,
          empresaId: empresa_id,
          contato,
          inboundText: mensagem,
        });
      }
    }

    stage = "whatsapp_send";
    let sendTo = numero;

    const sendAndHandleOutsideWindow = async (sendFn) => {
      try {
        await sendFn();
      } catch (err) {
        if (err && err.whatsappReason === "outside_24h_window") {
          await setBotStatusSafe(
            empresa_id,
            contato.id,
            {
              reason: "outside_24h_window",
              details: { graph: err.whatsappGraph || null },
            },
            { stage },
          );

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

            await setBotStatusSafe(
              empresa_id,
              contato.id,
              {
                reason: "outside_24h_window",
                details: {
                  graph: err.whatsappGraph || null,
                  template: templateResult,
                },
              },
              { stage },
            );
          } catch (templateErr) {
            await setBotStatusSafe(
              empresa_id,
              contato.id,
              {
                reason: "outside_24h_window",
                details: {
                  graph: err.whatsappGraph || null,
                  template: {
                    attempted: true,
                    outcome: "failed",
                    message: templateErr.message,
                  },
                },
              },
              { stage },
            );

            logger.warn("Falha ao enviar template de retomada", {
              empresaId: empresa_id,
              contatoId: contato.id,
              to: maskPhone(sendTo),
              message: templateErr.message,
            });
          }

          return { aborted: true };
        }
        throw err;
      }
      return { aborted: false };
    };

    if (useEnvWhatsApp) {
      const isProd = process.env.NODE_ENV === "production";
      const meuTelefone = normalizeTelefoneBR(process.env.MEU_TELEFONE);
      if (!isProd && meuTelefone) {
        if (meuTelefone !== numero) {
          logger.warn(
            "Fallback ativo: redirecionando envio para MEU_TELEFONE",
            {
              originalTo: maskPhone(numero),
              redirectedTo: maskPhone(meuTelefone),
            },
          );
        }
        sendTo = meuTelefone;
      }

      const result = await sendAndHandleOutsideWindow(() =>
        whatsappService.enviarMensagem(sendTo, resposta),
      );
      if (result.aborted) return;
    } else {
      const result = await sendAndHandleOutsideWindow(() =>
        whatsappService.enviarMensagem(sendTo, resposta, {
          token: empresa.whatsapp_token || null,
          phoneId: empresa.phone_number_id || null,
        }),
      );
      if (result.aborted) return;
    }

    stage = "mensagem_create_out";
    await Mensagem.create({
      empresa_id,
      contato_id: contato.id,
      direcao: "saida",
      conteudo: resposta,
    });

    stage = "clear_bot_status";
    await setBotStatusSafe(
      empresa_id,
      contato.id,
      {
        reason: null,
        details: null,
      },
      { stage },
    );

    logger.info("Mensagem respondida", { empresaId: empresa_id });
  } catch (err) {
    if (contatoIdForDebug) {
      await setBotStatusSafe(
        empresa_id,
        contatoIdForDebug,
        {
          reason: "internal_error",
          details: {
            stage,
            message: err?.message || String(err),
          },
        },
        { stage },
      );
    }
    throw err;
  }
};
