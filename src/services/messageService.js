const Contato = require("../models/Contato");
const Mensagem = require("../models/Mensagem");
const fluxoService = require("./fluxoService");
const iaService = require("./iaService");
const whatsappService = require("./whatsappService");

exports.processar = async (payload) => {
  const msg = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

  if (!msg) return;

  const mensagem = msg.text?.body;
  const numero = msg.from;

  if (!mensagem) return;

  const empresa_id = 1; // MVP fixo (depois multi-tenant)

  console.log("📩 Recebido:", mensagem);

  // 🔹 1. buscar ou criar contato
  const contato = await Contato.findOrCreate(empresa_id, numero);

  // 🔹 2. salvar mensagem de entrada
  await Mensagem.create({
    empresa_id,
    contato_id: contato.id,
    direcao: "entrada",
    conteudo: mensagem,
  });

  // 🔹 3. verificar fluxo
  let resposta = await fluxoService.verificar(mensagem);

  // 🔹 4. fallback IA
  if (!resposta) {
    resposta = await iaService.gerarResposta(mensagem);
  }

  // 🔹 5. enviar resposta
  await whatsappService.enviarMensagem(numero, resposta);

  // 🔹 6. salvar resposta
  await Mensagem.create({
    empresa_id,
    contato_id: contato.id,
    direcao: "saida",
    conteudo: resposta,
  });

  console.log("📤 Respondido:", resposta);
};
