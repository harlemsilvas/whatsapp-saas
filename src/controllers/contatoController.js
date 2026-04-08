const Contato = require("../models/Contato");
const { normalizeTelefoneBR, isTelefoneE164Like } = require("../utils/phone");

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

exports.listar = async (req, res, next) => {
  try {
    const empresaId = toInt(req.params.empresaId);
    if (!empresaId)
      return res.status(400).json({ error: "empresaId inválido" });

    const limit = toInt(req.query?.limit) ?? 50;
    const offset = toInt(req.query?.offset) ?? 0;

    const contatos = await Contato.listByEmpresaId(empresaId, {
      limit,
      offset,
    });
    res.json(contatos);
  } catch (err) {
    next(err);
  }
};

exports.obter = async (req, res, next) => {
  try {
    const empresaId = toInt(req.params.empresaId);
    const contatoId = toInt(req.params.id);
    if (!empresaId)
      return res.status(400).json({ error: "empresaId inválido" });
    if (!contatoId) return res.status(400).json({ error: "id inválido" });

    const contato = await Contato.findById(empresaId, contatoId);
    if (!contato)
      return res.status(404).json({ error: "Contato não encontrado" });

    res.json(contato);
  } catch (err) {
    next(err);
  }
};

exports.criar = async (req, res, next) => {
  try {
    const empresaId = toInt(req.params.empresaId);
    if (!empresaId)
      return res.status(400).json({ error: "empresaId inválido" });

    const { nome = null, telefone, tags = null } = req.body || {};
    if (!telefone)
      return res.status(400).json({ error: "telefone é obrigatório" });

    const telefoneNorm = normalizeTelefoneBR(telefone);
    if (!telefoneNorm || !isTelefoneE164Like(telefoneNorm)) {
      return res.status(400).json({ error: "telefone inválido" });
    }

    const contato = await Contato.create(empresaId, {
      nome,
      telefone: telefoneNorm,
      tags,
    });
    res.status(201).json(contato);
  } catch (err) {
    next(err);
  }
};

exports.atualizar = async (req, res, next) => {
  try {
    const empresaId = toInt(req.params.empresaId);
    const contatoId = toInt(req.params.id);
    if (!empresaId)
      return res.status(400).json({ error: "empresaId inválido" });
    if (!contatoId) return res.status(400).json({ error: "id inválido" });

    const body = req.body || {};
    if (Object.prototype.hasOwnProperty.call(body, "telefone")) {
      const telefoneNorm = normalizeTelefoneBR(body.telefone);
      if (!telefoneNorm || !isTelefoneE164Like(telefoneNorm)) {
        return res.status(400).json({ error: "telefone inválido" });
      }
      body.telefone = telefoneNorm;
    }

    const contato = await Contato.update(empresaId, contatoId, body);
    if (!contato)
      return res.status(404).json({ error: "Contato não encontrado" });

    res.json(contato);
  } catch (err) {
    next(err);
  }
};

exports.remover = async (req, res, next) => {
  try {
    const empresaId = toInt(req.params.empresaId);
    const contatoId = toInt(req.params.id);
    if (!empresaId)
      return res.status(400).json({ error: "empresaId inválido" });
    if (!contatoId) return res.status(400).json({ error: "id inválido" });

    const removed = await Contato.remove(empresaId, contatoId);
    if (!removed)
      return res.status(404).json({ error: "Contato não encontrado" });

    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
};
