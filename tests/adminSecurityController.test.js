describe("adminSecurityController", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  function createRes() {
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

  function setup() {
    const create = jest.fn(async (payload) => ({
      id: 10,
      empresa_id: payload.empresaId,
      label: payload.label,
      key_prefix: payload.keyPrefix,
      permissions: payload.permissions,
    }));
    const revoke = jest.fn(async () => ({ id: 10, revoked_at: new Date() }));
    jest.doMock("../src/models/Empresa", () => ({
      findById: jest.fn(async () => ({ id: 1, nome: "Empresa Teste" })),
    }));
    jest.doMock("../src/models/AdminApiKey", () => ({
      create,
      revoke,
      listByEmpresaId: jest.fn(async () => []),
    }));
    jest.doMock("../src/models/AdminAuditLog", () => ({
      listByEmpresaId: jest.fn(async () => []),
    }));
    return { controller: require("../src/controllers/adminSecurityController"), create, revoke };
  }

  test("gera chave uma vez e persiste somente hash", async () => {
    const { controller, create } = setup();
    const req = {
      params: { id: "1" },
      body: { label: "Operação", permissions: ["read", "write"] },
      adminActor: { permissions: ["superadmin"] },
    };
    const res = createRes();

    await controller.criarChave(req, res, jest.fn());

    expect(res.statusCode).toBe(201);
    expect(res.payload.api_key).toMatch(/^wsa_/);
    const stored = create.mock.calls[0][0];
    expect(stored.keyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.keyHash).not.toContain(res.payload.api_key);
    expect(stored.keyPrefix).toBe(res.payload.api_key.slice(0, 12));
  });

  test("impede gestão de chaves sem manage_keys", async () => {
    const { controller, create } = setup();
    const req = {
      params: { id: "1" },
      body: { label: "Operação" },
      adminActor: { permissions: ["read", "write"] },
    };
    const res = createRes();

    await controller.criarChave(req, res, jest.fn());

    expect(res.statusCode).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });

  test("revoga somente chave pertencente à empresa", async () => {
    const { controller, revoke } = setup();
    const req = {
      params: { id: "1", keyId: "10" },
      adminActor: { permissions: ["manage_keys"] },
    };
    const res = createRes();

    await controller.revogarChave(req, res, jest.fn());

    expect(revoke).toHaveBeenCalledWith(1, 10);
    expect(res.payload.ok).toBe(true);
  });
});
