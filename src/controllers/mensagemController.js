const Mensagem = require("../models/Mensagem");

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

exports.listar = async (req, res, next) => {
  try {
    const empresaId = toInt(req.params.empresaId);
    if (!empresaId) return res.status(400).json({ error: "empresaId inválido" });

    const contatoId = req.query?.contatoId ? toInt(req.query.contatoId) : null;
    const direcao = req.query?.direcao ? String(req.query.direcao) : null;
    const limit = toInt(req.query?.limit) ?? 50;
    const offset = toInt(req.query?.offset) ?? 0;

    const mensagens = await Mensagem.listByEmpresaId(empresaId, {
      contatoId,
      direcao,
      limit,
      offset,
    });

    res.json(mensagens);
  } catch (err) {
    next(err);
  }
};

exports.obter = async (req, res, next) => {
  try {
    const empresaId = toInt(req.params.empresaId);
    const id = toInt(req.params.id);
    if (!empresaId) return res.status(400).json({ error: "empresaId inválido" });
    if (!id) return res.status(400).json({ error: "id inválido" });

    const mensagem = await Mensagem.findById(empresaId, id);
    if (!mensagem) return res.status(404).json({ error: "Mensagem não encontrada" });

    res.json(mensagem);
  } catch (err) {
    next(err);
  }
};

exports.criar = async (req, res, next) => {
  try {
    const empresaId = toInt(req.params.empresaId);
    if (!empresaId) return res.status(400).json({ error: "empresaId inválido" });

    const { contato_id = null, direcao, conteudo, tipo = "text" } = req.body || {};
    if (!direcao) return res.status(400).json({ error: "direcao é obrigatório" });
    if (!conteudo) return res.status(400).json({ error: "conteudo é obrigatório" });

    const mensagem = await Mensagem.create(empresaId, { contato_id, direcao, conteudo, tipo });
    res.status(201).json(mensagem);
  } catch (err) {
    next(err);
  }
};

exports.remover = async (req, res, next) => {
  try {
    const empresaId = toInt(req.params.empresaId);
    const id = toInt(req.params.id);
    if (!empresaId) return res.status(400).json({ error: "empresaId inválido" });
    if (!id) return res.status(400).json({ error: "id inválido" });

    const removed = await Mensagem.remove(empresaId, id);
    if (!removed) return res.status(404).json({ error: "Mensagem não encontrada" });

    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
};
