describe("outgoingMessageService idempotency", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  function setup({ outbox }) {
    const query = jest.fn(async (sql) => {
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
        return {};
      }
      return { rows: [] };
    });
    const client = { query, release: jest.fn() };
    const createPending = jest.fn(async () => outbox);
    const attachMensagem = jest.fn(async () => ({
      ...outbox,
      mensagem_id: 501,
    }));
    const create = jest.fn(async () => ({ id: 501 }));
    const findById = jest.fn(async () => ({ id: outbox.mensagem_id }));

    jest.doMock("../src/config/database", () => ({
      connect: jest.fn(async () => client),
    }));
    jest.doMock("../src/models/OutboxMessage", () => ({
      createPending,
      attachMensagem,
    }));
    jest.doMock("../src/models/Mensagem", () => ({ create, findById }));
    jest.doMock("../src/utils/logger", () => ({ warn: jest.fn() }));

    return {
      service: require("../src/services/outgoingMessageService"),
      client,
      createPending,
      attachMensagem,
      create,
      findById,
    };
  }

  const input = {
    empresa: { whatsapp_token: "tok", phone_number_id: "PHONE_ID" },
    empresaId: 1,
    contato: { id: 10 },
    webhookEventId: 77,
    responseText: "Resposta",
    originalNumber: "5511999999999",
    useEnvWhatsApp: false,
  };

  test("reserva outbox antes de criar e vincular a mensagem", async () => {
    const mocks = setup({ outbox: { id: 301, inserted: true } });

    const result = await mocks.service.enqueueOutgoingTextMessage(input);

    expect(mocks.createPending).toHaveBeenCalledWith(
      expect.objectContaining({
        webhookEventId: 77,
        mensagemId: null,
      }),
      mocks.client,
    );
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.attachMensagem).toHaveBeenCalledWith(301, 501, mocks.client);
    expect(result).toEqual(expect.objectContaining({ duplicate: false }));
  });

  test("reutiliza outbox existente sem criar mensagem órfã", async () => {
    const mocks = setup({
      outbox: { id: 301, inserted: false, mensagem_id: 500 },
    });

    const result = await mocks.service.enqueueOutgoingTextMessage(input);

    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.attachMensagem).not.toHaveBeenCalled();
    expect(mocks.findById).toHaveBeenCalledWith(1, 500, mocks.client);
    expect(result).toEqual(
      expect.objectContaining({
        duplicate: true,
        outbox: expect.objectContaining({ id: 301 }),
      }),
    );
  });
});
