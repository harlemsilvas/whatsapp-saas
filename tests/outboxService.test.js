describe("outboxService.processOutboxBatch", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test("envia item retryable e marca sent", async () => {
    const item = {
      id: 1,
      empresa_id: 1,
      contato_id: 10,
      recipient: "5511999999999",
      content: "Resposta",
      payload_json: {
        useEnvWhatsApp: false,
        token: "tok",
        phoneId: "PHONE_ID",
      },
    };

    const listRetryable = jest.fn(async () => [item]);
    const markProcessing = jest.fn(async () => ({
      ...item,
      lease_token: "lease-1",
    }));
    const markSent = jest.fn(async () => ({}));

    jest.doMock("../src/models/OutboxMessage", () => ({
      listRetryable,
      markProcessing,
      markSent,
      markFailed: jest.fn(async () => ({})),
    }));
    jest.doMock("../src/models/Empresa", () => ({
      findById: jest.fn(async () => ({ id: 1, whatsapp_token: "tok", phone_number_id: "PHONE_ID" })),
    }));
    jest.doMock("../src/models/Contato", () => ({
      setBotStatus: jest.fn(async () => ({})),
    }));
    jest.doMock("../src/services/whatsappService", () => ({
      enviarMensagem: jest.fn(async () => ({ messages: [{ id: "wamid.OUT" }] })),
      enviarTemplateMensagem: jest.fn(async () => ({ messages: [{ id: "wamid.TPL" }] })),
    }));
    jest.doMock("../src/utils/logger", () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }));

    const { processOutboxBatch } = require("../src/services/outboxService");

    const summary = await processOutboxBatch({ limit: 10, leaseSeconds: 60 });

    expect(listRetryable).toHaveBeenCalledWith({ limit: 10 });
    expect(markProcessing).toHaveBeenCalledWith(1, { leaseSeconds: 60 });
    expect(markSent).toHaveBeenCalledWith(1, "wamid.OUT", "lease-1");
    expect(summary).toEqual({ scanned: 1, claimed: 1, sent: 1, failed: 0 });
  });
});

describe("outboxService.retryOutboxMessageById", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test("reabre item failed e tenta enviar imediatamente", async () => {
    const item = {
      id: 7,
      empresa_id: 1,
      contato_id: 10,
      status: "failed",
      recipient: "5511999999999",
      content: "Resposta",
      payload_json: {
        useEnvWhatsApp: false,
        token: "tok",
        phoneId: "PHONE_ID",
      },
    };

    const findById = jest.fn(async () => item);
    const resetForRetry = jest.fn(async () => item);
    const markProcessing = jest.fn(async () => ({
      ...item,
      status: "processing",
      lease_token: "lease-7",
    }));
    const markSent = jest.fn(async () => ({}));

    jest.doMock("../src/models/OutboxMessage", () => ({
      findById,
      resetForRetry,
      markProcessing,
      markSent,
      markFailed: jest.fn(async () => ({})),
      listRetryable: jest.fn(async () => []),
    }));
    jest.doMock("../src/models/Empresa", () => ({
      findById: jest.fn(async () => ({
        id: 1,
        whatsapp_token: "tok",
        phone_number_id: "PHONE_ID",
      })),
    }));
    jest.doMock("../src/models/Contato", () => ({
      setBotStatus: jest.fn(async () => ({})),
    }));
    jest.doMock("../src/services/whatsappService", () => ({
      enviarMensagem: jest.fn(async () => ({ messages: [{ id: "wamid.OUT" }] })),
      enviarTemplateMensagem: jest.fn(async () => ({ messages: [{ id: "wamid.TPL" }] })),
    }));
    jest.doMock("../src/utils/logger", () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }));

    const { retryOutboxMessageById } = require("../src/services/outboxService");

    const result = await retryOutboxMessageById(7, { leaseSeconds: 90 });

    expect(findById).toHaveBeenCalledWith(7);
    expect(resetForRetry).toHaveBeenCalledWith(7);
    expect(markProcessing).toHaveBeenCalledWith(7, { leaseSeconds: 90 });
    expect(markSent).toHaveBeenCalledWith(7, "wamid.OUT", "lease-7");
    expect(result).toEqual(expect.objectContaining({ sent: true, skipped: false }));
  });
});
