const Conversa = require("../models/Conversa");
const Contato = require("../models/Contato");
const Empresa = require("../models/Empresa");
const Mensagem = require("../models/Mensagem");
const whatsappService = require("../services/whatsappService");
const { normalizeTelefoneBR, isTelefoneE164Like } = require("../utils/phone");

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function safeJsonParse(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  const s = String(value || "").trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return { message: s };
  }
}

exports.listarConversas = async (req, res, next) => {
  try {
    const empresaId = toInt(req.params.empresaId);
    if (!empresaId)
      return res.status(400).json({ error: "empresaId inválido" });

    const limit = toInt(req.query?.limit) ?? 50;
    const offset = toInt(req.query?.offset) ?? 0;

    const conversas = await Conversa.listByEmpresaId(empresaId, {
      limit,
      offset,
    });
    res.json(conversas);
  } catch (err) {
    next(err);
  }
};

exports.listarMensagens = async (req, res, next) => {
  try {
    const empresaId = toInt(req.params.empresaId);
    const contatoId = toInt(req.params.contatoId);
    if (!empresaId)
      return res.status(400).json({ error: "empresaId inválido" });
    if (!contatoId)
      return res.status(400).json({ error: "contatoId inválido" });

    const order = req.query?.order ? String(req.query.order) : "asc";
    const limit = toInt(req.query?.limit) ?? 100;
    const offset = toInt(req.query?.offset) ?? 0;

    const contato = await Contato.findById(empresaId, contatoId);
    if (!contato)
      return res.status(404).json({ error: "Contato não encontrado" });

    const mensagens = await Conversa.listMensagensByContato(
      empresaId,
      contatoId,
      {
        limit,
        offset,
        order,
      },
    );

    res.json({ contato, mensagens });
  } catch (err) {
    next(err);
  }
};

exports.marcarComoLida = async (req, res, next) => {
  try {
    const empresaId = toInt(req.params.empresaId);
    const contatoId = toInt(req.params.contatoId);
    if (!empresaId)
      return res.status(400).json({ error: "empresaId inválido" });
    if (!contatoId)
      return res.status(400).json({ error: "contatoId inválido" });

    const contato = await Contato.findById(empresaId, contatoId);
    if (!contato)
      return res.status(404).json({ error: "Contato não encontrado" });

    const result = await Conversa.markEntradaComoLida(empresaId, contatoId);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.enviarManual = async (req, res, next) => {
  try {
    const empresaId = toInt(req.params.empresaId);
    const contatoId = toInt(req.params.contatoId);
    if (!empresaId)
      return res.status(400).json({ error: "empresaId inválido" });
    if (!contatoId)
      return res.status(400).json({ error: "contatoId inválido" });

    const { text } = req.body || {};
    const messageText = text ? String(text).trim() : "";
    if (!messageText)
      return res.status(400).json({ error: "text é obrigatório" });

    const empresa = await Empresa.findById(empresaId);
    if (!empresa)
      return res.status(404).json({ error: "Empresa não encontrada" });

    const contato = await Contato.findById(empresaId, contatoId);
    if (!contato)
      return res.status(404).json({ error: "Contato não encontrado" });

    if (!empresa.whatsapp_token || !empresa.phone_number_id) {
      return res.status(400).json({
        error: "WhatsApp não configurado para esta empresa",
        details: {
          whatsapp_token_configured: Boolean(empresa.whatsapp_token),
          phone_number_id_configured: Boolean(empresa.phone_number_id),
        },
      });
    }

    const whatsapp = await whatsappService.enviarMensagem(
      (() => {
        const to = normalizeTelefoneBR(contato.telefone);
        if (!to || !isTelefoneE164Like(to)) {
          throw new Error("Telefone do contato inválido");
        }
        return to;
      })(),
      messageText,
      {
        token: empresa.whatsapp_token,
        phoneId: empresa.phone_number_id,
      },
    );

    const mensagem = await Mensagem.create(empresaId, {
      contato_id: contatoId,
      direcao: "saida",
      conteudo: messageText,
      tipo: "text",
    });

    // Ao enviar manualmente, assume atendimento humano e pausa o bot por um tempo.
    const pauseMinutes = Math.max(
      0,
      Math.trunc(Number(process.env.HUMAN_TAKEOVER_PAUSE_MINUTES || 60) || 60),
    );
    const contatoAtualizado = await Contato.assumirAtendimento(
      empresaId,
      contatoId,
      {
        assumidoPor: "admin",
        pauseMinutes,
      },
    );

    res.status(201).json({
      mensagem,
      contato: contatoAtualizado || contato,
      whatsappMessageId: whatsapp?.messages?.[0]?.id || null,
    });
  } catch (err) {
    next(err);
  }
};

exports.assumirAtendimento = async (req, res, next) => {
  try {
    const empresaId = toInt(req.params.empresaId);
    const contatoId = toInt(req.params.contatoId);
    if (!empresaId)
      return res.status(400).json({ error: "empresaId inválido" });
    if (!contatoId)
      return res.status(400).json({ error: "contatoId inválido" });

    const contato = await Contato.findById(empresaId, contatoId);
    if (!contato)
      return res.status(404).json({ error: "Contato não encontrado" });

    const pauseMinutes = Math.max(
      0,
      Math.trunc(Number(process.env.HUMAN_TAKEOVER_PAUSE_MINUTES || 60) || 60),
    );

    const updated = await Contato.assumirAtendimento(empresaId, contatoId, {
      assumidoPor: "admin",
      pauseMinutes,
    });

    res.json({ contato: updated });
  } catch (err) {
    next(err);
  }
};

exports.devolverParaBot = async (req, res, next) => {
  try {
    const empresaId = toInt(req.params.empresaId);
    const contatoId = toInt(req.params.contatoId);
    if (!empresaId)
      return res.status(400).json({ error: "empresaId inválido" });
    if (!contatoId)
      return res.status(400).json({ error: "contatoId inválido" });

    const contato = await Contato.findById(empresaId, contatoId);
    if (!contato)
      return res.status(404).json({ error: "Contato não encontrado" });

    const updated = await Contato.devolverParaBot(empresaId, contatoId);

    // Ao devolver para o bot, limpa imediatamente o último status/motivo persistido.
    // Isso evita exibir "humano ativo" como status antigo após o handoff.
    let contatoFinal = updated;
    try {
      contatoFinal =
        (await Contato.setBotStatus(empresaId, contatoId, {
          reason: null,
          details: null,
        })) || updated;
    } catch {
      // best-effort
      contatoFinal = updated;
    }

    res.json({ contato: contatoFinal });
  } catch (err) {
    next(err);
  }
};

exports.debugConversa = async (req, res, next) => {
  try {
    const empresaId = toInt(req.params.empresaId);
    const contatoId = toInt(req.params.contatoId);
    if (!empresaId)
      return res.status(400).json({ error: "empresaId inválido" });
    if (!contatoId)
      return res.status(400).json({ error: "contatoId inválido" });

    const empresa = await Empresa.findById(empresaId);
    if (!empresa)
      return res.status(404).json({ error: "Empresa não encontrada" });

    const contato = await Contato.findById(empresaId, contatoId);
    if (!contato)
      return res.status(404).json({ error: "Contato não encontrado" });

    const modo = String(contato.atendimento_modo || "bot").toLowerCase();
    const pausadoAte = contato.atendimento_pausado_ate
      ? new Date(contato.atendimento_pausado_ate)
      : null;
    const pausadoAteMs = pausadoAte?.getTime ? pausadoAte.getTime() : 0;
    const isPausado = Boolean(pausadoAteMs && pausadoAteMs > Date.now());
    const isHumano = modo === "humano";

    const botStatus = {
      reason: contato.bot_status_reason || null,
      at: contato.bot_status_at || null,
      details: safeJsonParse(contato.bot_status_details || null),
    };

    const suppressNow = isHumano ? "human_active" : isPausado ? "paused" : null;

    const hasBotStatusColumns =
      Object.prototype.hasOwnProperty.call(contato, "bot_status_reason") &&
      Object.prototype.hasOwnProperty.call(contato, "bot_status_details") &&
      Object.prototype.hasOwnProperty.call(contato, "bot_status_at");

    const botStatusEffective = (() => {
      if (botStatus.reason) return botStatus;
      if (!suppressNow) return botStatus;
      return {
        reason: suppressNow,
        at:
          suppressNow === "human_active"
            ? contato.ultimo_humano_em || null
            : null,
        details: {
          computed: true,
          source: "runtime",
          note: "Fallback: motivo efetivo baseado no estado atual quando bot_status_* está vazio.",
        },
      };
    })();

    const recent = await Conversa.listMensagensByContato(empresaId, contatoId, {
      limit: 30,
      offset: 0,
      order: "desc",
    });

    const lastInbound = recent.find((m) => m.direcao === "entrada") || null;
    const lastOutbound = recent.find((m) => m.direcao === "saida") || null;

    const lastInboundAt = lastInbound?.created_at
      ? new Date(lastInbound.created_at)
      : null;
    const lastInboundAtMs = lastInboundAt?.getTime
      ? lastInboundAt.getTime()
      : 0;
    const hoursSinceLastInbound = lastInboundAtMs
      ? (Date.now() - lastInboundAtMs) / (1000 * 60 * 60)
      : null;
    const likelyOutside24h =
      typeof hoursSinceLastInbound === "number" && hoursSinceLastInbound > 24;

    const telefoneNorm = normalizeTelefoneBR(contato.telefone);

    res.json({
      empresa: { id: empresa.id, nome: empresa.nome || null },
      contato: {
        id: contato.id,
        nome: contato.nome || null,
        telefone: contato.telefone,
        telefone_normalizado: telefoneNorm || null,
        tags: contato.tags || null,
        atendimento_modo: contato.atendimento_modo,
        atendimento_pausado_ate: contato.atendimento_pausado_ate,
        atendimento_assumido_por: contato.atendimento_assumido_por || null,
        ultimo_humano_em: contato.ultimo_humano_em || null,
      },
      runtime: {
        isHumano,
        isPausado,
        suppressReasonNow: suppressNow,
        window24h: {
          lastInboundAt: lastInboundAt ? lastInboundAt.toISOString() : null,
          hoursSinceLastInbound:
            typeof hoursSinceLastInbound === "number"
              ? Math.round(hoursSinceLastInbound * 100) / 100
              : null,
          likelyOutside24h,
          note: "Estimativa baseada no created_at da última mensagem de entrada salva no banco.",
        },
      },
      botStatus,
      botStatusEffective,
      mensagens: {
        count: recent.length,
        lastInbound: lastInbound
          ? {
              id: lastInbound.id,
              direcao: lastInbound.direcao,
              conteudo: lastInbound.conteudo,
              tipo: lastInbound.tipo,
              wa_message_id: lastInbound.wa_message_id || null,
              lida_em: lastInbound.lida_em || null,
              created_at: lastInbound.created_at,
            }
          : null,
        lastOutbound: lastOutbound
          ? {
              id: lastOutbound.id,
              direcao: lastOutbound.direcao,
              conteudo: lastOutbound.conteudo,
              tipo: lastOutbound.tipo,
              wa_message_id: lastOutbound.wa_message_id || null,
              lida_em: lastOutbound.lida_em || null,
              created_at: lastOutbound.created_at,
            }
          : null,
        sample: recent.map((m) => ({
          id: m.id,
          direcao: m.direcao,
          tipo: m.tipo,
          wa_message_id: m.wa_message_id || null,
          lida_em: m.lida_em || null,
          created_at: m.created_at,
          conteudo: m.conteudo,
        })),
      },
      hints: {
        note: "Se suppressReasonNow != null, o bot não deve responder agora. botStatus guarda o último motivo persistido pelo webhook.",
        bot_status_columns_present: hasBotStatusColumns,
        whatsapp_configured: Boolean(
          empresa.whatsapp_token && empresa.phone_number_id,
        ),
        signature_required:
          String(process.env.REQUIRE_WHATSAPP_WEBHOOK_SIGNATURE || "").trim() ||
          null,
        reengage_template:
          String(process.env.WHATSAPP_REENGAGE_TEMPLATE_NAME || "").trim() ||
          null,
        reengage_template_lang:
          String(
            process.env.WHATSAPP_REENGAGE_TEMPLATE_LANG ||
              process.env.WHATSAPP_TEMPLATE_LANG ||
              "",
          ).trim() || null,
      },
    });
  } catch (err) {
    next(err);
  }
};
