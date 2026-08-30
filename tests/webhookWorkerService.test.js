describe("webhookWorkerService", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test("processWebhookBatch delega para o replay service", async () => {
    const reprocessFailedEvents = jest.fn(async () => ({
      scanned: 2,
      claimed: 1,
      processed: 1,
      failed: 0,
    }));

    jest.doMock("../src/services/webhookReplayService", () => ({
      reprocessFailedEvents,
    }));
    jest.doMock("../src/services/outboxService", () => ({
      processOutboxBatch: jest.fn(async () => ({
        scanned: 0,
        claimed: 0,
        sent: 0,
        failed: 0,
      })),
    }));
    jest.doMock("../src/utils/logger", () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }));

    const {
      processWebhookBatch,
    } = require("../src/services/webhookWorkerService");

    const summary = await processWebhookBatch({
      limit: 50,
      leaseSeconds: 90,
      statuses: ["failed", "received"],
    });

    expect(reprocessFailedEvents).toHaveBeenCalledWith({
      limit: 50,
      leaseSeconds: 90,
      statuses: ["failed", "received"],
    });
    expect(summary).toEqual({
      scanned: 2,
      claimed: 1,
      processed: 1,
      failed: 0,
    });
  });

  test("processWorkerCycle processa webhook e outbox no mesmo ciclo", async () => {
    const reprocessFailedEvents = jest.fn(async () => ({
      scanned: 2,
      claimed: 1,
      processed: 1,
      failed: 0,
    }));
    const processOutboxBatch = jest.fn(async () => ({
      scanned: 1,
      claimed: 1,
      sent: 1,
      failed: 0,
    }));

    jest.doMock("../src/services/webhookReplayService", () => ({
      reprocessFailedEvents,
    }));
    jest.doMock("../src/services/outboxService", () => ({
      processOutboxBatch,
    }));
    jest.doMock("../src/utils/logger", () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }));

    const { processWorkerCycle } = require("../src/services/webhookWorkerService");

    const summary = await processWorkerCycle({
      webhookLimit: 10,
      webhookLeaseSeconds: 60,
      webhookStatuses: ["failed"],
      outboxLimit: 5,
      outboxLeaseSeconds: 90,
    });

    expect(reprocessFailedEvents).toHaveBeenCalledWith({
      limit: 10,
      leaseSeconds: 60,
      statuses: ["failed"],
    });
    expect(processOutboxBatch).toHaveBeenCalledWith({
      limit: 5,
      leaseSeconds: 90,
    });
    expect(summary).toEqual({
      webhook: { scanned: 2, claimed: 1, processed: 1, failed: 0 },
      outbox: { scanned: 1, claimed: 1, sent: 1, failed: 0 },
    });
  });

  test("startWebhookWorker roda tick e encerra sem esperar todo o poll interval", async () => {
    const reprocessFailedEvents = jest
      .fn()
      .mockResolvedValueOnce({
        scanned: 1,
        claimed: 1,
        processed: 1,
        failed: 0,
      })
      .mockResolvedValueOnce({
        scanned: 0,
        claimed: 0,
        processed: 0,
        failed: 0,
      });
    const loggerInfo = jest.fn();
    const processOutboxBatch = jest.fn(async () => ({
      scanned: 0,
      claimed: 0,
      sent: 0,
      failed: 0,
    }));

    jest.doMock("../src/services/webhookReplayService", () => ({
      reprocessFailedEvents,
    }));
    jest.doMock("../src/services/outboxService", () => ({
      processOutboxBatch,
    }));
    jest.doMock("../src/utils/logger", () => ({
      info: loggerInfo,
      warn: jest.fn(),
      error: jest.fn(),
    }));

    const {
      startWebhookWorker,
    } = require("../src/services/webhookWorkerService");

    const worker = startWebhookWorker({
      pollIntervalMs: 10000,
      limit: 10,
      leaseSeconds: 60,
      statuses: ["failed"],
      runOnStart: false,
    });

    await worker.tick();

    expect(reprocessFailedEvents).toHaveBeenCalledTimes(1);
    expect(processOutboxBatch).toHaveBeenCalledTimes(1);
    expect(loggerInfo).toHaveBeenCalledWith(
      "Webhook worker processou ciclo",
      expect.objectContaining({
        webhook: expect.objectContaining({
          scanned: 1,
          claimed: 1,
          processed: 1,
          failed: 0,
        }),
        outbox: expect.objectContaining({
          scanned: 0,
          claimed: 0,
          sent: 0,
          failed: 0,
        }),
      }),
    );

    await worker.stop();

    expect(reprocessFailedEvents).toHaveBeenCalledTimes(1);
  });
});
