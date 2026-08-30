describe("adminConversaController.enviarManual", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test("enfileira envio manual na outbox e assume atendimento humano", async () => {
    const enqueueOutgoingTextMessage = jest.fn(async () => ({
      mensagemSaida: { id: 2001, conteudo: "Ola manual" },
      outbox: { id: 3001, status: "pending" },
      sendTo: "5511999999999",
    }));

    jest.doMock("../src/models/Empresa", () => ({
      findById: jest.fn(async () => ({
        id: 1,
        whatsapp_token: "tok",
        phone_number_id: "PHONE_ID",
      })),
    }));
    jest.doMock("../src/models/Contato", () => ({
      findById: jest.fn(async () => ({
        id: 10,
        telefone: "5511999999999",
      })),
      assumirAtendimento: jest.fn(async () => ({
        id: 10,
        telefone: "5511999999999",
        atendimento_modo: "humano",
      })),
    }));
    jest.doMock("../src/models/Conversa", () => ({}));
    jest.doMock("../src/services/outgoingMessageService", () => ({
      enqueueOutgoingTextMessage,
    }));

    const controller = require("../src/controllers/adminConversaController");
    const req = {
      params: { empresaId: "1", contatoId: "10" },
      body: { text: "Ola manual" },
    };
    const res = {
      status: jest.fn(function status(code) {
        this.statusCode = code;
        return this;
      }),
      json: jest.fn(function json(payload) {
        this.payload = payload;
        return this;
      }),
    };
    const next = jest.fn();

    await controller.enviarManual(req, res, next);

    expect(enqueueOutgoingTextMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        empresaId: 1,
        responseText: "Ola manual",
        originalNumber: "5511999999999",
        useEnvWhatsApp: false,
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        mensagem: expect.objectContaining({ id: 2001 }),
        outbox: expect.objectContaining({ id: 3001, status: "pending" }),
        contato: expect.objectContaining({ atendimento_modo: "humano" }),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });
});

describe("adminConversaController.listarOutbox", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test("retorna resumo e itens da outbox por empresa", async () => {
    jest.doMock("../src/models/Empresa", () => ({
      findById: jest.fn(async () => ({ id: 1, nome: "Empresa Teste" })),
    }));
    jest.doMock("../src/models/OutboxMessage", () => ({
      summaryByEmpresaId: jest.fn(async () => ({
        total: 3,
        pending: 1,
        processing: 0,
        failed: 1,
        sent: 1,
      })),
      listByEmpresaId: jest.fn(async () => [
        { id: 11, status: "pending" },
        { id: 12, status: "failed" },
      ]),
    }));
    jest.doMock("../src/models/Contato", () => ({}));
    jest.doMock("../src/models/Conversa", () => ({}));
    jest.doMock("../src/services/outgoingMessageService", () => ({
      enqueueOutgoingTextMessage: jest.fn(),
    }));

    const controller = require("../src/controllers/adminConversaController");
    const req = {
      params: { empresaId: "1" },
      query: { limit: "20", offset: "0", status: "failed" },
    };
    const res = {
      json: jest.fn(function json(payload) {
        this.payload = payload;
        return this;
      }),
      status: jest.fn(function status(code) {
        this.statusCode = code;
        return this;
      }),
    };
    const next = jest.fn();

    await controller.listarOutbox(req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        empresa: expect.objectContaining({ id: 1, nome: "Empresa Teste" }),
        summary: expect.objectContaining({
          total: 3,
          pending: 1,
          failed: 1,
          sent: 1,
        }),
        items: expect.arrayContaining([
          expect.objectContaining({ id: 11, status: "pending" }),
          expect.objectContaining({ id: 12, status: "failed" }),
        ]),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });
});

describe("adminConversaController.retryOutbox", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test("reenvia item da outbox da empresa e retorna estado atualizado", async () => {
    const findById = jest
      .fn()
      .mockResolvedValueOnce({ id: 22, empresa_id: 1, status: "failed" })
      .mockResolvedValueOnce({
        id: 22,
        empresa_id: 1,
        status: "sent",
        provider_message_id: "wamid.OUT",
      });
    const retryOutboxMessageById = jest.fn(async () => ({ sent: true }));

    jest.doMock("../src/models/Empresa", () => ({
      findById: jest.fn(async () => ({ id: 1, nome: "Empresa Teste" })),
    }));
    jest.doMock("../src/models/OutboxMessage", () => ({
      findById,
      summaryByEmpresaId: jest.fn(),
      listByEmpresaId: jest.fn(),
    }));
    jest.doMock("../src/models/Contato", () => ({}));
    jest.doMock("../src/models/Conversa", () => ({}));
    jest.doMock("../src/services/outgoingMessageService", () => ({
      enqueueOutgoingTextMessage: jest.fn(),
    }));
    jest.doMock("../src/services/outboxService", () => ({
      retryOutboxMessageById,
    }));

    const controller = require("../src/controllers/adminConversaController");
    const req = {
      params: { empresaId: "1", outboxId: "22" },
    };
    const res = {
      json: jest.fn(function json(payload) {
        this.payload = payload;
        return this;
      }),
      status: jest.fn(function status(code) {
        this.statusCode = code;
        return this;
      }),
    };
    const next = jest.fn();

    await controller.retryOutbox(req, res, next);

    expect(retryOutboxMessageById).toHaveBeenCalledWith(22, {
      leaseSeconds: 60,
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        result: expect.objectContaining({ sent: true }),
        item: expect.objectContaining({ id: 22, status: "sent" }),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });
});
