describe("messageService.processar", () => {
  const basePayload = {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: "PHONE_ID" },
              contacts: [{ wa_id: "5511999999999" }],
              messages: [
                {
                  id: "wamid.TEST1",
                  from: "5511999999999",
                  text: { body: "oi" },
                  type: "text",
                },
              ],
            },
          },
        ],
      },
    ],
  };

  function loadServiceWithMocks({
    empresa = { id: 1, whatsapp_token: "tok", phone_number_id: "PHONE_ID" },
    contatoAtual = {
      id: 10,
      telefone: "5511999999999",
      atendimento_modo: "bot",
      atendimento_pausado_ate: null,
    },
    fluxoResposta = "Olá!",
    iaResposta = null,
  } = {}) {
    jest.resetModules();

    process.env.NODE_ENV = "test";
    process.env.ALLOW_PHONE_ID_FALLBACK = "0";
    process.env.DEFAULT_EMPRESA_ID = "1";
    delete process.env.MEU_TELEFONE;

    const logger = require("../src/utils/logger");
    jest.spyOn(logger, "info").mockImplementation(() => {});
    jest.spyOn(logger, "warn").mockImplementation(() => {});
    jest.spyOn(logger, "error").mockImplementation(() => {});

    jest.doMock("../src/models/Empresa", () => ({
      findByPhoneNumberId: jest.fn(async () => empresa),
      findById: jest.fn(async () => empresa),
    }));

    jest.doMock("../src/models/Contato", () => ({
      findOrCreate: jest.fn(async () => contatoAtual),
      findById: jest.fn(async () => contatoAtual),
      findByTelefone: jest.fn(async () => contatoAtual),
      setBotStatus: jest.fn(async () => ({ ...contatoAtual })),
    }));

    jest.doMock("../src/models/Mensagem", () => ({
      existsByWaMessageId: jest.fn(async () => false),
      create: jest.fn(async () => ({ id: 999 })),
    }));

    jest.doMock("../src/models/OutboxMessage", () => ({
      markProviderStatus: jest.fn(async () => null),
    }));

    jest.doMock("../src/services/outgoingMessageService", () => ({
      enqueueOutgoingTextMessage: jest.fn(async () => ({
        mensagemSaida: { id: 999 },
        outbox: { id: 321 },
        sendTo: "5511999999999",
      })),
    }));

    jest.doMock("../src/models/Conversa", () => ({
      listMensagensByContato: jest.fn(async () => []),
    }));

    jest.doMock("../src/services/fluxoService", () => ({
      verificar: jest.fn(async () => fluxoResposta),
    }));

    jest.doMock("../src/services/iaService", () => ({
      gerarRespostaComMeta: jest.fn(async () => iaResposta),
    }));

    jest.doMock("../src/services/whatsappService", () => ({
      enviarMensagem: jest.fn(async () => ({
        messages: [{ id: "wamid.OUT" }],
      })),
      enviarTemplateMensagem: jest.fn(async () => ({
        messages: [{ id: "wamid.TPL" }],
      })),
    }));

    const messageService = require("../src/services/messageService");

    return {
      messageService,
      mocks: {
        Empresa: require("../src/models/Empresa"),
        Contato: require("../src/models/Contato"),
        Mensagem: require("../src/models/Mensagem"),
        OutboxMessage: require("../src/models/OutboxMessage"),
        outgoingMessageService: require("../src/services/outgoingMessageService"),
        Conversa: require("../src/models/Conversa"),
        fluxoService: require("../src/services/fluxoService"),
        iaService: require("../src/services/iaService"),
        whatsappService: require("../src/services/whatsappService"),
      },
    };
  }

  test("ignora eventos de status", async () => {
    const { messageService, mocks } = loadServiceWithMocks();

    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [{ status: "delivered", id: "wamid.STATUS" }],
              },
            },
          ],
        },
      ],
    };

    await messageService.processar(payload);

    expect(mocks.whatsappService.enviarMensagem).not.toHaveBeenCalled();
    expect(mocks.Mensagem.create).not.toHaveBeenCalled();
    expect(mocks.OutboxMessage.markProviderStatus).toHaveBeenCalledWith(
      "wamid.STATUS",
      "delivered",
      expect.objectContaining({
        id: "wamid.STATUS",
        status: "delivered",
      }),
    );
  });

  test("processa todas as mensagens e statuses do payload em lote", async () => {
    const { messageService, mocks } = loadServiceWithMocks({
      fluxoResposta: "Resposta em lote",
    });

    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "PHONE_ID" },
                messages: [
                  {
                    id: "wamid.TEST1",
                    from: "5511999999999",
                    text: { body: "oi 1" },
                    type: "text",
                  },
                  {
                    id: "wamid.TEST2",
                    from: "5511888888888",
                    text: { body: "oi 2" },
                    type: "text",
                  },
                ],
                statuses: [{ status: "delivered", id: "wamid.STATUS1" }],
              },
            },
          ],
        },
      ],
    };

    await messageService.processar(payload);

    expect(mocks.whatsappService.enviarMensagem).not.toHaveBeenCalled();
    expect(
      mocks.outgoingMessageService.enqueueOutgoingTextMessage,
    ).toHaveBeenCalledTimes(2);
    expect(mocks.Mensagem.create).toHaveBeenCalledTimes(2);
  });

  test("não responde quando atendimento humano ativo", async () => {
    const { messageService, mocks } = loadServiceWithMocks({
      contatoAtual: {
        id: 10,
        telefone: "5511999999999",
        atendimento_modo: "humano",
        atendimento_pausado_ate: null,
      },
    });

    await messageService.processar(JSON.parse(JSON.stringify(basePayload)));

    expect(mocks.whatsappService.enviarMensagem).not.toHaveBeenCalled();
    expect(mocks.Contato.setBotStatus).toHaveBeenCalled();
  });

  test("não responde quando bot está pausado", async () => {
    const future = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const { messageService, mocks } = loadServiceWithMocks({
      contatoAtual: {
        id: 10,
        telefone: "5511999999999",
        atendimento_modo: "bot",
        atendimento_pausado_ate: future,
      },
    });

    await messageService.processar(JSON.parse(JSON.stringify(basePayload)));

    expect(mocks.whatsappService.enviarMensagem).not.toHaveBeenCalled();
    expect(mocks.Contato.setBotStatus).toHaveBeenCalled();
  });

  test("idempotência: ignora wa_message_id duplicado", async () => {
    const { messageService, mocks } = loadServiceWithMocks();
    mocks.Mensagem.existsByWaMessageId.mockResolvedValueOnce(true);

    await messageService.processar(JSON.parse(JSON.stringify(basePayload)));

    expect(mocks.whatsappService.enviarMensagem).not.toHaveBeenCalled();
    expect(mocks.Mensagem.create).not.toHaveBeenCalled();
  });

  test("fluxo sem erro enfileira mensagem para envio posterior", async () => {
    const { messageService, mocks } = loadServiceWithMocks({
      fluxoResposta: "Olá!",
    });

    await messageService.processar(JSON.parse(JSON.stringify(basePayload)));

    expect(mocks.whatsappService.enviarMensagem).not.toHaveBeenCalled();
    expect(
      mocks.outgoingMessageService.enqueueOutgoingTextMessage,
    ).toHaveBeenCalledTimes(1);
  });

  test("fluxo responde e salva mensagem de saída", async () => {
    const { messageService, mocks } = loadServiceWithMocks({
      fluxoResposta: "Resposta do fluxo",
    });

    await messageService.processar(JSON.parse(JSON.stringify(basePayload)));

    expect(mocks.whatsappService.enviarMensagem).not.toHaveBeenCalled();
    expect(
      mocks.outgoingMessageService.enqueueOutgoingTextMessage,
    ).toHaveBeenCalledTimes(1);

    // Apenas entrada é criada diretamente aqui; a saída é responsabilidade do serviço compartilhado.
    expect(mocks.Mensagem.create).toHaveBeenCalledTimes(1);
  });
});
