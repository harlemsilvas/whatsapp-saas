describe("webhookController.receberMensagem", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test("nao registra preview do texto recebido no log", async () => {
    const processarEvento = jest.fn(async () => {});
    const createReceived = jest.fn(async () => ({
      event_key: "message::wamid.TEST",
      event_kind: "message",
      status: "received",
      inserted: true,
    }));
    const markProcessing = jest.fn(async () => ({ lease_token: "lease-1" }));
    const markProcessed = jest.fn(async () => ({}));
    const info = jest.fn();
    const error = jest.fn();

    jest.doMock("../src/services/messageService", () => ({ processarEvento }));
    jest.doMock("../src/models/WebhookEvent", () => ({
      createReceived,
      markProcessing,
      markProcessed,
      markFailed: jest.fn(async () => ({})),
    }));
    jest.doMock("../src/models/Empresa", () => ({
      findByPhoneNumberId: jest.fn(async () => null),
    }));
    jest.doMock("../src/utils/logger", () => ({
      info,
      error,
      warn: jest.fn(),
    }));

    const controller = require("../src/controllers/webhookController");

    const req = {
      body: {
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      id: "wamid.TEST",
                      from: "5511999999999",
                      type: "text",
                      text: { body: "mensagem sensivel" },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    };

    const res = {
      sendStatus: jest.fn(() => 200),
    };

    await controller.receberMensagem(req, res);

    expect(createReceived).toHaveBeenCalledTimes(1);
    expect(markProcessing).toHaveBeenCalledWith("message::wamid.TEST", {
      leaseSeconds: 60,
    });
    expect(processarEvento).toHaveBeenCalledTimes(1);
    expect(markProcessed).toHaveBeenCalledWith("message::wamid.TEST", "lease-1");
    expect(info).toHaveBeenCalledWith(
      "Webhook mensagem recebida",
      expect.objectContaining({
        from: "***9999",
        messageId: "wamid.TEST",
        type: "text",
      }),
    );

    const webhookLog = info.mock.calls.find(
      ([message]) => message === "Webhook mensagem recebida",
    );
    expect(webhookLog[1]).not.toHaveProperty("textPreview");
    expect(res.sendStatus).toHaveBeenCalledWith(200);
  });

  test("processa todos os eventos extraidos do webhook em lote", async () => {
    const processarEvento = jest.fn(async () => {});
    const createReceived = jest
      .fn()
      .mockResolvedValueOnce({
        event_key: "message:1",
        event_kind: "message",
        status: "received",
        inserted: true,
      })
      .mockResolvedValueOnce({
        event_key: "message:2",
        event_kind: "message",
        status: "received",
        inserted: true,
      })
      .mockResolvedValueOnce({
        event_key: "status:1",
        event_kind: "status",
        status: "received",
        inserted: true,
      });
    const markProcessed = jest.fn(async () => ({}));
    const markProcessing = jest
      .fn()
      .mockResolvedValueOnce({ lease_token: "lease-1" })
      .mockResolvedValueOnce({ lease_token: "lease-2" })
      .mockResolvedValueOnce({ lease_token: "lease-3" });
    const info = jest.fn();

    jest.doMock("../src/services/messageService", () => ({ processarEvento }));
    jest.doMock("../src/models/WebhookEvent", () => ({
      createReceived,
      markProcessing,
      markProcessed,
      markFailed: jest.fn(async () => ({})),
    }));
    jest.doMock("../src/models/Empresa", () => ({
      findByPhoneNumberId: jest.fn(async () => ({ id: 1 })),
    }));
    jest.doMock("../src/utils/logger", () => ({
      info,
      error: jest.fn(),
      warn: jest.fn(),
    }));

    const controller = require("../src/controllers/webhookController");
    const req = {
      body: {
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: "PHONE_ID" },
                  messages: [
                    {
                      id: "wamid.M1",
                      from: "5511999999999",
                      type: "text",
                      text: { body: "oi 1" },
                    },
                    {
                      id: "wamid.M2",
                      from: "5511888888888",
                      type: "text",
                      text: { body: "oi 2" },
                    },
                  ],
                  statuses: [
                    {
                      id: "wamid.S1",
                      status: "delivered",
                      recipient_id: "5511777777777",
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    };
    const res = { sendStatus: jest.fn(() => 200) };

    await controller.receberMensagem(req, res);

    expect(createReceived).toHaveBeenCalledTimes(3);
    expect(markProcessing).toHaveBeenCalledTimes(3);
    expect(processarEvento).toHaveBeenCalledTimes(3);
    expect(markProcessed).toHaveBeenCalledTimes(3);
    expect(info).toHaveBeenCalledWith(
      "Webhook recebido",
      expect.objectContaining({ eventCount: 3 }),
    );
  });

  test("nao registra stack ao capturar falha de processamento", async () => {
    const processarEvento = jest.fn(async () => {
      const err = new Error("falha controlada");
      err.code = "E_TEST";
      err.stack = "stack sensivel";
      throw err;
    });
    const createReceived = jest.fn(async () => ({
      event_key: "message::wamid.TEST",
      event_kind: "message",
      status: "received",
      inserted: true,
    }));
    const markProcessing = jest.fn(async () => ({ lease_token: "lease-4" }));
    const markFailed = jest.fn(async () => ({}));
    const error = jest.fn();

    jest.doMock("../src/services/messageService", () => ({ processarEvento }));
    jest.doMock("../src/models/WebhookEvent", () => ({
      createReceived,
      markProcessing,
      markProcessed: jest.fn(async () => ({})),
      markFailed,
    }));
    jest.doMock("../src/models/Empresa", () => ({
      findByPhoneNumberId: jest.fn(async () => null),
    }));
    jest.doMock("../src/utils/logger", () => ({
      info: jest.fn(),
      error,
      warn: jest.fn(),
    }));

    const controller = require("../src/controllers/webhookController");
    const req = {
      body: {
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      id: "wamid.TEST",
                      from: "5511999999999",
                      type: "text",
                      text: { body: "oi" },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    };
    const res = { sendStatus: jest.fn(() => 200) };

    await controller.receberMensagem(req, res);

    expect(createReceived).toHaveBeenCalledTimes(1);
    expect(markFailed).toHaveBeenCalledWith(
      "message::wamid.TEST",
      expect.objectContaining({ message: "falha controlada" }),
      { leaseToken: "lease-4" },
    );
    expect(error).toHaveBeenCalledWith(
      "Erro ao processar webhook",
      expect.objectContaining({
        message: "falha controlada",
        code: "E_TEST",
      }),
    );
    expect(error.mock.calls[0][1]).not.toHaveProperty("stack");
    expect(res.sendStatus).toHaveBeenCalledWith(200);
  });

  test("retorna 500 quando falha ao registrar o evento recebido", async () => {
    const createReceived = jest.fn(async () => {
      const err = new Error("db offline");
      err.code = "ECONNREFUSED";
      throw err;
    });
    const processarEvento = jest.fn(async () => {});
    const error = jest.fn();

    jest.doMock("../src/services/messageService", () => ({ processarEvento }));
    jest.doMock("../src/models/WebhookEvent", () => ({
      createReceived,
      markProcessing: jest.fn(async () => ({ lease_token: "lease-5" })),
      markProcessed: jest.fn(async () => ({})),
      markFailed: jest.fn(async () => ({})),
    }));
    jest.doMock("../src/models/Empresa", () => ({
      findByPhoneNumberId: jest.fn(async () => null),
    }));
    jest.doMock("../src/utils/logger", () => ({
      info: jest.fn(),
      error,
      warn: jest.fn(),
    }));

    const controller = require("../src/controllers/webhookController");
    const req = {
      body: {
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      id: "wamid.TEST",
                      from: "5511999999999",
                      type: "text",
                      text: { body: "oi" },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    };
    const res = { sendStatus: jest.fn(() => 500) };

    await controller.receberMensagem(req, res);

    expect(processarEvento).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      "Erro ao registrar webhook recebido",
      expect.objectContaining({
        message: "db offline",
        code: "ECONNREFUSED",
      }),
    );
    expect(res.sendStatus).toHaveBeenCalledWith(500);
  });
});
