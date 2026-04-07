const Conversa = require("../models/Conversa");
const Contato = require("../models/Contato");
const Empresa = require("../models/Empresa");
const Mensagem = require("../models/Mensagem");
const whatsappService = require("../services/whatsappService");

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
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
      contato.telefone,
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

    res
      .status(201)
      .json({
        mensagem,
        whatsappMessageId: whatsapp?.messages?.[0]?.id || null,
      });
  } catch (err) {
    next(err);
  }
};
