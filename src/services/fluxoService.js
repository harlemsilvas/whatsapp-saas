const Fluxo = require("../models/Fluxo");

exports.verificar = async (empresaId, mensagem) => {
  // Compatibilidade: verificar(mensagem)
  if (mensagem === undefined) {
    mensagem = empresaId;
    empresaId = null;
  }

  if (!mensagem) return null;
  const msg = String(mensagem).toLowerCase();

  if (empresaId) {
    const match = await Fluxo.findMatch(empresaId, mensagem);
    if (match?.resposta) return match.resposta;
  }

  // Fallback do MVP (mantém comportamento atual caso não exista fluxo cadastrado)
  if (msg.includes("menu")) {
    return "1 - Produtos\n2 - Suporte\n3 - Pedidos";
  }

  return null;
};
