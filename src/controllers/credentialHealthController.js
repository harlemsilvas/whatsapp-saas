const Empresa = require("../models/Empresa");
const CredentialHealth = require("../models/CredentialHealth");

function toInt(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

exports.obter = async (req, res, next) => {
  try {
    const empresaId = toInt(req.params.id);
    if (!empresaId) return res.status(400).json({ error: "id inválido" });
    const empresa = await Empresa.findById(empresaId);
    if (!empresa) {
      return res.status(404).json({ error: "Empresa não encontrada" });
    }
    const health = await CredentialHealth.listCompanyHealth(empresaId);
    return res.json({
      empresa: { id: empresa.id, nome: empresa.nome },
      ...health,
    });
  } catch (err) {
    next(err);
  }
};
