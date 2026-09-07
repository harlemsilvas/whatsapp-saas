describe("OutboxMessage provider status reconciliation", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test.each([
    [null, "sent", true],
    ["sent", "delivered", true],
    ["delivered", "read", true],
    ["read", "delivered", false],
    ["delivered", "sent", false],
    ["failed", "sent", false],
  ])(
    "decide transição %s -> %s como applied=%s",
    (current, incoming, expected) => {
      jest.doMock("../src/config/database", () => ({}));
      const OutboxMessage = require("../src/models/OutboxMessage");

      expect(
        OutboxMessage.shouldApplyProviderStatus(current, incoming),
      ).toBe(expected);
    },
  );

  test("gera chave pela origem e não pelo conteúdo da resposta", () => {
    jest.doMock("../src/config/database", () => ({}));
    const OutboxMessage = require("../src/models/OutboxMessage");
    const base = {
      empresaId: 1,
      contatoId: 10,
      to: "5511999999999",
      content: "Mesmo texto",
      webhookEventId: 77,
    };

    const first = OutboxMessage.buildDedupKey(base);
    const repeated = OutboxMessage.buildDedupKey({
      ...base,
      content: "Texto recalculado",
    });
    const anotherEvent = OutboxMessage.buildDedupKey({
      ...base,
      webhookEventId: 78,
    });

    expect(repeated).toBe(first);
    expect(anotherEvent).not.toBe(first);
  });

  test("atualiza outbox e mensagem associada na mesma transação", async () => {
    const current = {
      id: 9,
      empresa_id: 2,
      mensagem_id: 33,
      provider_message_id: "wamid.OUT",
      provider_status: "sent",
    };
    const updated = { ...current, provider_status: "delivered" };
    const query = jest
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [current] })
      .mockResolvedValueOnce({ rows: [updated] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({});
    const client = { query, release: jest.fn() };

    jest.doMock("../src/config/database", () => ({
      connect: jest.fn(async () => client),
    }));
    const OutboxMessage = require("../src/models/OutboxMessage");

    const result = await OutboxMessage.markProviderStatus(
      "wamid.OUT",
      "delivered",
      { id: "wamid.OUT", status: "delivered" },
      { empresaId: 2 },
    );

    expect(query.mock.calls[1][0]).toContain("FOR UPDATE");
    expect(query.mock.calls[1][1]).toEqual(["wamid.OUT", 2]);
    expect(query.mock.calls[3][0]).toContain("UPDATE mensagens");
    expect(query.mock.calls[3][1]).toEqual([
      33,
      2,
      "wamid.OUT",
      "delivered",
      JSON.stringify({ id: "wamid.OUT", status: "delivered" }),
    ]);
    expect(result).toEqual(
      expect.objectContaining({
        id: 9,
        provider_status: "delivered",
        reconciliation_applied: true,
      }),
    );
    expect(client.release).toHaveBeenCalled();
  });

  test("ignora regressão de read para delivered", async () => {
    const current = {
      id: 9,
      empresa_id: 2,
      mensagem_id: 33,
      provider_message_id: "wamid.OUT",
      provider_status: "read",
    };
    const query = jest
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [current] })
      .mockResolvedValueOnce({});
    const client = { query, release: jest.fn() };

    jest.doMock("../src/config/database", () => ({
      connect: jest.fn(async () => client),
    }));
    const OutboxMessage = require("../src/models/OutboxMessage");

    const result = await OutboxMessage.markProviderStatus(
      "wamid.OUT",
      "delivered",
      null,
      { empresaId: 2 },
    );

    expect(query).toHaveBeenCalledTimes(3);
    expect(result).toEqual(
      expect.objectContaining({
        provider_status: "read",
        incoming_provider_status: "delivered",
        reconciliation_applied: false,
      }),
    );
  });

  test("vincula o ID da Graph API à mensagem ao marcar envio", async () => {
    const sent = {
      id: 15,
      empresa_id: 2,
      mensagem_id: 44,
      status: "sent",
      provider_message_id: "wamid.SENT",
    };
    const query = jest
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [sent] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({});
    const client = { query, release: jest.fn() };

    jest.doMock("../src/config/database", () => ({
      connect: jest.fn(async () => client),
    }));
    const OutboxMessage = require("../src/models/OutboxMessage");

    const result = await OutboxMessage.markSent(
      15,
      "wamid.SENT",
      "lease-15",
    );

    expect(query.mock.calls[2][0]).toContain("UPDATE mensagens");
    expect(query.mock.calls[2][1]).toEqual([44, 2, "wamid.SENT"]);
    expect(result).toEqual(sent);
    expect(client.release).toHaveBeenCalled();
  });
});
