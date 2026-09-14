describe("aiModelCatalogController", () => {
  let Empresa;
  let AiModelCatalog;
  let runModelCatalogSync;
  let controller;

  function response() {
    return {
      statusCode: 200,
      payload: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.payload = payload;
        return this;
      },
    };
  }

  beforeEach(() => {
    jest.resetModules();
    Empresa = { findById: jest.fn(async (id) => ({ id, nome: "Tenant" })) };
    AiModelCatalog = { listPublic: jest.fn(async () => []) };
    runModelCatalogSync = jest.fn();
    jest.doMock("../src/models/Empresa", () => Empresa);
    jest.doMock("../src/models/AiModelCatalog", () => AiModelCatalog);
    jest.doMock("../src/services/aiModelCatalogService", () => ({
      runModelCatalogSync,
    }));
    controller = require("../src/controllers/aiModelCatalogController");
  });

  test("lista modelos sempre no escopo da empresa solicitada", async () => {
    AiModelCatalog.listPublic.mockResolvedValue([{ id: 3, empresa_id: 2 }]);
    const req = {
      params: { id: "2" },
      query: { provider: "Gemini", available: "true", chatCompatible: "1" },
    };
    const res = response();
    const next = jest.fn();

    await controller.listar(req, res, next);

    expect(AiModelCatalog.listPublic).toHaveBeenCalledWith(2, {
      credentialId: null,
      provider: "gemini",
      available: true,
      chatCompatible: true,
    });
    expect(res.payload.empresa.id).toBe(2);
    expect(next).not.toHaveBeenCalled();
  });

  test("rejeita provedor desconhecido antes de consultar o catálogo", async () => {
    const req = { params: { id: "1" }, query: { provider: "outro" } };
    const res = response();

    await controller.listar(req, res, jest.fn());

    expect(res.statusCode).toBe(400);
    expect(res.payload).toEqual({ error: "Provedor inválido" });
    expect(AiModelCatalog.listPublic).not.toHaveBeenCalled();
  });

  test("informa conflito quando outra sincronização está em andamento", async () => {
    runModelCatalogSync.mockResolvedValue({
      skipped: true,
      reason: "already_running",
      results: [],
    });
    const req = {
      params: { id: "1", credentialId: "9" },
      body: {},
    };
    const res = response();

    await controller.sincronizar(req, res, jest.fn());

    expect(runModelCatalogSync).toHaveBeenCalledWith({
      empresaId: 1,
      credentialId: 9,
      dryRun: false,
      timeoutMs: 15000,
    });
    expect(res.statusCode).toBe(409);
    expect(res.payload.reason).toBe("already_running");
  });
});
