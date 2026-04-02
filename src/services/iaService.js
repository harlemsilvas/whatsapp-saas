const axios = require("axios");

exports.gerarResposta = async (mensagem) => {
  // MOCK inicial (depois liga OpenAI)
  return `🤖 Resposta automática: ${mensagem}`;
};
