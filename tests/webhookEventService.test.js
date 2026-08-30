describe("webhookEventService.extractEvents", () => {
  test("extrai mensagens e statuses de multiplos entries e changes", () => {
    const { extractEvents } = require("../src/services/webhookEventService");

    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "PHONE_1" },
                messages: [
                  { id: "wamid.M1", from: "5511999999999", type: "text" },
                  { id: "wamid.M2", from: "5511888888888", type: "text" },
                ],
                statuses: [{ id: "wamid.S1", status: "delivered" }],
              },
            },
          ],
        },
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "PHONE_2" },
                statuses: [{ id: "wamid.S2", status: "read" }],
              },
            },
          ],
        },
      ],
    };

    const events = extractEvents(payload);

    expect(events).toHaveLength(4);
    expect(events.map((event) => event.kind)).toEqual([
      "message",
      "message",
      "status",
      "status",
    ]);
    expect(events[0].metadata).toEqual({ phone_number_id: "PHONE_1" });
    expect(events[1].message.id).toBe("wamid.M2");
    expect(events[2].status.id).toBe("wamid.S1");
    expect(events[3].metadata).toEqual({ phone_number_id: "PHONE_2" });
  });

  test("retorna vazio quando o payload nao possui eventos", () => {
    const { extractEvents } = require("../src/services/webhookEventService");

    expect(extractEvents({})).toEqual([]);
    expect(extractEvents(null)).toEqual([]);
  });
});
