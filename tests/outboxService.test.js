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
        token: "token-antigo",
        phoneId: "PHONE_ANTIGO",
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
      findById: jest.fn(async () => ({ id: 1, whatsapp_token: "token-atual", phone_number_id: "PHONE_ATUAL" })),
    }));
    jest.doMock("../src/models/Contato", () => ({
      setBotStatus: jest.fn(async () => ({})),
    }));
    const enviarMensagem = jest.fn(async () => ({
      messages: [{ id: "wamid.OUT" }],
    }));
    jest.doMock("../src/services/whatsappService", () => ({
      enviarMensagem,
      enviarTemplateMensagem: jest.fn(async () => ({ messages: [{ id: "wamid.TPL" }] })),
    }));
    jest.doMock("../src/utils/logger", () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }));

    const { processOutboxBatch } = require("../src/services/outboxService");

    const summary = await processOutboxBatch({ limit: 10, leaseSeconds: 60 });

    expect(listRetryable).toHaveBeenCalledWith({ limit: 10, maxAttempts: 8 });
    expect(markProcessing).toHaveBeenCalledWith(1, {
      leaseSeconds: 60,
      maxAttempts: 8,
    });
    expect(enviarMensagem).toHaveBeenCalledWith("5511999999999", "Resposta", {
      token: "token-atual",
      phoneId: "PHONE_ATUAL",
    });
    expect(markSent).toHaveBeenCalledWith(1, "wamid.OUT", "lease-1");
    expect(summary).toEqual({
      scanned: 1,
      claimed: 1,
      sent: 1,
      failed: 0,
      dead: 0,
    });
  });
});

describe("outboxService.retryOutboxMessageById", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test("reabre item dead e tenta enviar imediatamente", async () => {
    const item = {
      id: 7,
      empresa_id: 1,
      contato_id: 10,
      status: "dead",
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
    expect(markProcessing).toHaveBeenCalledWith(7, {
      leaseSeconds: 90,
      maxAttempts: 8,
    });
    expect(markSent).toHaveBeenCalledWith(7, "wamid.OUT", "lease-7");
    expect(result).toEqual(expect.objectContaining({ sent: true, skipped: false }));
  });
});

describe("outboxService error policy", () => {
  beforeEach(() => {
    jest.resetModules();
    delete process.env.OUTBOX_MAX_ATTEMPTS;
    delete process.env.OUTBOX_RETRY_BASE_SECONDS;
    delete process.env.OUTBOX_RETRY_JITTER_RATIO;
  });

  function setupFailure({ status, code, networkCode, attemptCount = 1 }) {
    const item = {
      id: 31,
      empresa_id: 1,
      contato_id: 10,
      recipient: "5511999999999",
      content: "Resposta",
      payload_json: { useEnvWhatsApp: false },
    };
    const error = Object.assign(new Error("Graph API falhou"), {
      ...(status ? { response: { status, data: { error: { code } } } } : null),
      ...(networkCode ? { code: networkCode } : null),
    });
    const markFailed = jest.fn(async () => ({}));
    const markDead = jest.fn(async () => ({}));

    jest.doMock("../src/models/OutboxMessage", () => ({
      listRetryable: jest.fn(async () => [item]),
      markProcessing: jest.fn(async () => ({
        ...item,
        attempt_count: attemptCount,
        lease_token: "lease-31",
      })),
      markSent: jest.fn(),
      markFailed,
      markDead,
    }));
    jest.doMock("../src/models/Empresa", () => ({
      findById: jest.fn(async () => ({
        id: 1,
        whatsapp_token: "token-atual",
        phone_number_id: "PHONE_ATUAL",
      })),
    }));
    jest.doMock("../src/models/Contato", () => ({ setBotStatus: jest.fn() }));
    jest.doMock("../src/services/whatsappService", () => ({
      enviarMensagem: jest.fn(async () => {
        throw error;
      }),
      enviarTemplateMensagem: jest.fn(),
    }));
    jest.doMock("../src/utils/logger", () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }));

    return { markFailed, markDead };
  }

  test.each([
    [400, 131030],
    [401, 190],
    [403, 10],
  ])("encerra erro permanente HTTP %s sem retry automático", async (status, code) => {
    const { markFailed, markDead } = setupFailure({ status, code });
    const { processOutboxBatch } = require("../src/services/outboxService");

    const summary = await processOutboxBatch();

    expect(markFailed).not.toHaveBeenCalled();
    expect(markDead).toHaveBeenCalledWith(
      31,
      expect.any(Error),
      expect.objectContaining({
        errorClass: "permanent",
        errorCode: String(code),
        terminalReason: `permanent_error_${code}`,
      }),
    );
    expect(summary.dead).toBe(1);
  });

  test("mantém 429 como falha temporária por limite", async () => {
    process.env.OUTBOX_RETRY_JITTER_RATIO = "0";
    const { markFailed, markDead } = setupFailure({ status: 429, code: 4 });
    const { processOutboxBatch } = require("../src/services/outboxService");

    await processOutboxBatch();

    expect(markDead).not.toHaveBeenCalled();
    expect(markFailed).toHaveBeenCalledWith(
      31,
      expect.any(Error),
      expect.objectContaining({
        errorClass: "rate_limit",
        errorCode: "4",
      }),
    );
  });

  test("mantém timeout de rede como falha temporária", async () => {
    process.env.OUTBOX_RETRY_JITTER_RATIO = "0";
    const { markFailed, markDead } = setupFailure({
      networkCode: "ETIMEDOUT",
    });
    const { processOutboxBatch } = require("../src/services/outboxService");

    await processOutboxBatch();

    expect(markDead).not.toHaveBeenCalled();
    expect(markFailed).toHaveBeenCalledWith(
      31,
      expect.any(Error),
      expect.objectContaining({
        errorClass: "transient",
        errorCode: "ETIMEDOUT",
      }),
    );
  });

  test("agenda erro 5xx com backoff exponencial", async () => {
    process.env.OUTBOX_RETRY_BASE_SECONDS = "10";
    process.env.OUTBOX_RETRY_JITTER_RATIO = "0";
    const { markFailed, markDead } = setupFailure({
      status: 503,
      code: 2,
      attemptCount: 3,
    });
    const { processOutboxBatch } = require("../src/services/outboxService");

    const summary = await processOutboxBatch();

    expect(markDead).not.toHaveBeenCalled();
    expect(markFailed).toHaveBeenCalledWith(
      31,
      expect.any(Error),
      expect.objectContaining({
        errorClass: "transient",
        errorCode: "2",
        backoffSeconds: 40,
      }),
    );
    expect(summary.failed).toBe(1);
  });

  test("encerra erro transitório ao alcançar o limite", async () => {
    const { markFailed, markDead } = setupFailure({
      status: 503,
      code: 2,
      attemptCount: 8,
    });
    const { processOutboxBatch } = require("../src/services/outboxService");

    await processOutboxBatch();

    expect(markFailed).not.toHaveBeenCalled();
    expect(markDead).toHaveBeenCalledWith(
      31,
      expect.any(Error),
      expect.objectContaining({
        errorClass: "transient",
        terminalReason: "max_attempts_exceeded",
      }),
    );
  });
});
