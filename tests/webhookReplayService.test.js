describe("webhookReplayService.reprocessFailedEvents", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test("reprocessa eventos failed e marca processed quando da certo", async () => {
    const record = {
      event_key: "message:PHONE_ID:wamid.TEST1",
      event_kind: "message",
      payload_json: {
        kind: "message",
        metadata: { phone_number_id: "PHONE_ID" },
        payload: {
          metadata: { phone_number_id: "PHONE_ID" },
          messages: [
            {
              id: "wamid.TEST1",
              from: "5511999999999",
              text: { body: "oi" },
              type: "text",
            },
          ],
          statuses: [],
        },
      },
    };

    const listRetryable = jest.fn(async () => [record]);
    const markProcessing = jest.fn(async () => ({ lease_token: "lease-1" }));
    const markProcessed = jest.fn(async () => ({}));

    jest.doMock("../src/models/WebhookEvent", () => ({
      listByStatus: jest.fn(async () => []),
      listRetryable,
      markProcessing,
      hydrateEvent: jest.requireActual("../src/models/WebhookEvent").hydrateEvent,
      markProcessed,
      markFailed: jest.fn(async () => ({})),
    }));
    jest.doMock("../src/services/messageService", () => ({
      processarEvento: jest.fn(async () => {}),
    }));
    jest.doMock("../src/utils/logger", () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }));

    const { reprocessFailedEvents } = require("../src/services/webhookReplayService");
    const messageService = require("../src/services/messageService");

    const summary = await reprocessFailedEvents({ limit: 10 });

    expect(listRetryable).toHaveBeenCalledWith({ limit: 10 });
    expect(markProcessing).toHaveBeenCalledWith(record.event_key, {
      leaseSeconds: 60,
    });
    expect(messageService.processarEvento).toHaveBeenCalledTimes(1);
    expect(markProcessed).toHaveBeenCalledWith(record.event_key, "lease-1");
    expect(summary).toEqual({ scanned: 1, claimed: 1, processed: 1, failed: 0 });
  });

  test("mantem failed e contabiliza erro quando reprocessamento falha", async () => {
    const record = {
      event_key: "message:PHONE_ID:wamid.TEST2",
      event_kind: "message",
      payload_json: {
        kind: "message",
        metadata: { phone_number_id: "PHONE_ID" },
        payload: {
          metadata: { phone_number_id: "PHONE_ID" },
          messages: [
            {
              id: "wamid.TEST2",
              from: "5511999999999",
              text: { body: "oi" },
              type: "text",
            },
          ],
          statuses: [],
        },
      },
    };

    const err = new Error("processamento falhou");
    const listRetryable = jest.fn(async () => [record]);
    const markProcessing = jest.fn(async () => ({ lease_token: "lease-2" }));
    const markFailed = jest.fn(async () => ({}));
    const loggerError = jest.fn();

    jest.doMock("../src/models/WebhookEvent", () => ({
      listByStatus: jest.fn(async () => []),
      listRetryable,
      markProcessing,
      hydrateEvent: jest.requireActual("../src/models/WebhookEvent").hydrateEvent,
      markProcessed: jest.fn(async () => ({})),
      markFailed,
    }));
    jest.doMock("../src/services/messageService", () => ({
      processarEvento: jest.fn(async () => {
        throw err;
      }),
    }));
    jest.doMock("../src/utils/logger", () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: loggerError,
    }));

    const { reprocessFailedEvents } = require("../src/services/webhookReplayService");

    const summary = await reprocessFailedEvents({ limit: 5 });

    expect(markProcessing).toHaveBeenCalledWith(record.event_key, {
      leaseSeconds: 60,
    });
    expect(markFailed).toHaveBeenCalledWith(record.event_key, err, {
      leaseToken: "lease-2",
    });
    expect(loggerError).toHaveBeenCalledWith(
      "Falha ao reprocessar webhook_event",
      expect.objectContaining({
        eventKey: record.event_key,
        message: "processamento falhou",
      }),
    );
    expect(summary).toEqual({ scanned: 1, claimed: 1, processed: 0, failed: 1 });
  });

  test("ignora evento quando claim nao consegue lease", async () => {
    const record = {
      event_key: "message:PHONE_ID:wamid.TEST3",
      event_kind: "message",
      payload_json: {
        kind: "message",
        metadata: { phone_number_id: "PHONE_ID" },
        payload: { messages: [{ id: "wamid.TEST3" }], statuses: [] },
      },
    };

    const listRetryable = jest.fn(async () => [record]);
    const markProcessing = jest.fn(async () => null);

    jest.doMock("../src/models/WebhookEvent", () => ({
      listByStatus: jest.fn(async () => []),
      listRetryable,
      markProcessing,
      hydrateEvent: jest.requireActual("../src/models/WebhookEvent").hydrateEvent,
      markProcessed: jest.fn(async () => ({})),
      markFailed: jest.fn(async () => ({})),
    }));
    jest.doMock("../src/services/messageService", () => ({
      processarEvento: jest.fn(async () => {}),
    }));
    jest.doMock("../src/utils/logger", () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }));

    const { reprocessFailedEvents } = require("../src/services/webhookReplayService");
    const messageService = require("../src/services/messageService");

    const summary = await reprocessFailedEvents({ limit: 5 });

    expect(messageService.processarEvento).not.toHaveBeenCalled();
    expect(summary).toEqual({ scanned: 1, claimed: 0, processed: 0, failed: 0 });
  });
});
