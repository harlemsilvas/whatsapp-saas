const Empresa = require("../models/Empresa");

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

exports.listar = async (req, res, next) => {
  try {
    const limit = toInt(req.query?.limit) ?? 50;
    const offset = toInt(req.query?.offset) ?? 0;
    const empresas = await Empresa.list({ limit, offset });
    res.json(empresas);
  } catch (err) {
    next(err);
  }
};

exports.obter = async (req, res, next) => {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ error: "id inválido" });

    const empresa = await Empresa.findById(id);
    if (!empresa)
      return res.status(404).json({ error: "Empresa não encontrada" });

    res.json(empresa);
  } catch (err) {
    next(err);
  }
};

exports.criar = async (req, res, next) => {
  try {
    const {
      nome,
      telefone = null,
      whatsapp_token = null,
      phone_number_id = null,
    } = req.body || {};
    if (!nome) return res.status(400).json({ error: "nome é obrigatório" });

    const empresa = await Empresa.create({
      nome,
      telefone,
      whatsapp_token,
      phone_number_id,
    });
    res.status(201).json(empresa);
  } catch (err) {
    next(err);
  }
};

exports.atualizar = async (req, res, next) => {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ error: "id inválido" });

    const payload = req.body || {};
    const empresa = await Empresa.update(id, payload);
    if (!empresa)
      return res.status(404).json({ error: "Empresa não encontrada" });

    res.json(empresa);
  } catch (err) {
    next(err);
  }
};

exports.remover = async (req, res, next) => {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ error: "id inválido" });

    const removed = await Empresa.remove(id);
    if (!removed)
      return res.status(404).json({ error: "Empresa não encontrada" });

    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
};
const db = require("../config/database");

exports.create = async (req, res, next) => {
  try {
    const { nome, telefone } = req.body;

    const result = await db.query(
      `INSERT INTO empresas (nome, telefone)
       VALUES ($1, $2)
       RETURNING *`,
      [nome, telefone],
    );

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
};

exports.list = async (req, res, next) => {
  try {
    const result = await db.query(`SELECT * FROM empresas`);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await db.query(`SELECT * FROM empresas WHERE id = $1`, [id]);

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { nome, telefone } = req.body;

    const result = await db.query(
      `UPDATE empresas
       SET nome = $1, telefone = $2
       WHERE id = $3
       RETURNING *`,
      [nome, telefone, id],
    );

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
};

exports.delete = async (req, res, next) => {
  try {
    const { id } = req.params;

    await db.query(`DELETE FROM empresas WHERE id = $1`, [id]);

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
