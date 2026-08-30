const crypto = require("crypto");

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`);
    return `{${entries.join(",")}}`;
  }

  return JSON.stringify(value);
}

function extractEvents(payload) {
  const events = [];

  for (const entry of toArray(payload?.entry)) {
    for (const change of toArray(entry?.changes)) {
      const value = change?.value || {};
      const metadata = value?.metadata || null;

      for (const message of toArray(value?.messages)) {
        events.push({
          kind: "message",
          metadata,
          value,
          payload: {
            ...value,
            messages: [message],
            statuses: [],
          },
          message,
          status: null,
        });
      }

      for (const status of toArray(value?.statuses)) {
        events.push({
          kind: "status",
          metadata,
          value,
          payload: {
            ...value,
            messages: [],
            statuses: [status],
          },
          message: null,
          status,
        });
      }
    }
  }

  return events;
}

function buildPayloadHash(event) {
  return crypto
    .createHash("sha256")
    .update(stableJson(event?.payload || {}))
    .digest("hex");
}

module.exports = {
  buildPayloadHash,
  extractEvents,
};
