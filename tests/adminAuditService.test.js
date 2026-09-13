const EventEmitter = require("events");

describe("adminAuditService", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test("registra mutação concluída sem copiar corpo ou segredo", async () => {
    const create = jest.fn(async () => ({}));
    jest.doMock("../src/models/AdminAuditLog", () => ({ create }));
    jest.doMock("../src/utils/logger", () => ({ error: jest.fn() }));
    const { registerAudit } = require("../src/services/adminAuditService");
    const req = {
      method: "PUT",
      originalUrl: "/api/empresas/7/whatsapp",
      path: "/7/whatsapp",
      params: {},
      body: { whatsapp_token: "nunca-auditar" },
      adminActor: {
        type: "tenant_api_key",
        id: 4,
        label: "Operação",
      },
      get: () => "request-123",
    };
    const res = new EventEmitter();
    res.statusCode = 200;

    registerAudit(req, res);
    res.emit("finish");
    await new Promise((resolve) => setImmediate(resolve));

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        empresaId: 7,
        actorId: 4,
        requestId: "request-123",
        metadata: { status: 200, access_denied: false },
      }),
    );
    expect(JSON.stringify(create.mock.calls[0][0])).not.toContain(
      "nunca-auditar",
    );
  });

  test("não audita resposta com erro", async () => {
    const create = jest.fn(async () => ({}));
    jest.doMock("../src/models/AdminAuditLog", () => ({ create }));
    jest.doMock("../src/utils/logger", () => ({ error: jest.fn() }));
    const { registerAudit } = require("../src/services/adminAuditService");
    const req = {
      method: "DELETE",
      originalUrl: "/api/empresas/7",
      params: { id: "7" },
      adminActor: { type: "env_api_key" },
    };
    const res = new EventEmitter();
    res.statusCode = 409;

    registerAudit(req, res);
    res.emit("finish");
    await new Promise((resolve) => setImmediate(resolve));

    expect(create).not.toHaveBeenCalled();
  });

  test("audita tentativa conhecida de acesso negado", async () => {
    const create = jest.fn(async () => ({}));
    jest.doMock("../src/models/AdminAuditLog", () => ({ create }));
    jest.doMock("../src/utils/logger", () => ({ error: jest.fn() }));
    const { registerAudit } = require("../src/services/adminAuditService");
    const req = {
      method: "GET",
      originalUrl: "/api/empresas/8/contatos",
      params: {},
      adminActor: {
        type: "tenant_api_key",
        id: 4,
        label: "Empresa 7",
        empresaId: 7,
      },
    };
    const res = new EventEmitter();
    res.statusCode = 403;

    registerAudit(req, res);
    res.emit("finish");
    await new Promise((resolve) => setImmediate(resolve));

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        empresaId: 7,
        metadata: {
          status: 403,
          access_denied: true,
          requested_empresa_id: 8,
        },
      }),
    );
  });
});
