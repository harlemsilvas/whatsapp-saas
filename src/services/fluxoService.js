exports.verificar = async (mensagem) => {
  const msg = mensagem.toLowerCase();

  if (msg.includes("menu")) {
    return "1 - Produtos\n2 - Suporte\n3 - Pedidos";
  }

  return null;
};
