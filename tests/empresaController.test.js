describe("empresaController WhatsApp credentials", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...OLD_ENV,
      WHATSAPP_URL: "https://graph.facebook.test/v23.0",
    };
  });

  afterAll(() => {
    process.env = OLD_ENV;
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

  test("valida antes de salvar e nunca devolve o token", async () => {
    const update = jest.fn(async (_id, payload) => ({
      id: 1,
      nome: "Empresa Teste",
      phone_number_id: payload.phone_number_id,
      whatsapp_token: payload.whatsapp_token,
      whatsapp_token_ciphertext: "ciphertext",
      whatsapp_token_iv: "iv",
      whatsapp_token_auth_tag: "auth-tag",
    }));
    const axiosGet = jest.fn(async () => ({
      data: {
        display_phone_number: "+1 555 1613563",
        verified_name: "Empresa Teste",
      },
    }));

    jest.doMock("../src/models/Empresa", () => ({
      findById: jest.fn(async () => ({ id: 1, nome: "Empresa Teste" })),
      update,
    }));
    jest.doMock("axios", () => ({ get: axiosGet }));

    const controller = require("../src/controllers/empresaController");
    const req = {
      params: { id: "1" },
      body: {
        phone_number_id: "123456789",
        whatsapp_token: "secret-token",
        validate: true,
      },
    };
    const res = createRes();
    const next = jest.fn();

    await controller.atualizarWhatsApp(req, res, next);

    expect(axiosGet).toHaveBeenCalledWith(
      "https://graph.facebook.test/v23.0/123456789?fields=display_phone_number,verified_name",
      expect.objectContaining({
        headers: { Authorization: "Bearer secret-token" },
      }),
    );
    expect(update).toHaveBeenCalledWith(1, {
      phone_number_id: "123456789",
      whatsapp_token: "secret-token",
    });
    expect(res.payload).toEqual(
      expect.objectContaining({
        ok: true,
        empresa: expect.objectContaining({
          id: 1,
          phone_number_id: "123456789",
          whatsapp_token_configured: true,
        }),
        verified: {
          display_phone_number: "+1 555 1613563",
          verified_name: "Empresa Teste",
        },
      }),
    );
    expect(res.payload.empresa).not.toHaveProperty("whatsapp_token");
    expect(res.payload.empresa).not.toHaveProperty(
      "whatsapp_token_ciphertext",
    );
    expect(res.payload.empresa).not.toHaveProperty("whatsapp_token_iv");
    expect(res.payload.empresa).not.toHaveProperty(
      "whatsapp_token_auth_tag",
    );
    expect(next).not.toHaveBeenCalled();
  });

  test("nao altera o banco quando a Graph API rejeita as credenciais", async () => {
    const update = jest.fn();
    const graphError = new Error("Request failed with status code 401");
    graphError.response = {
      status: 401,
      data: { error: { message: "Invalid OAuth access token" } },
    };

    jest.doMock("../src/models/Empresa", () => ({
      findById: jest.fn(async () => ({ id: 1, nome: "Empresa Teste" })),
      update,
    }));
    jest.doMock("axios", () => ({
      get: jest.fn(async () => {
        throw graphError;
      }),
    }));

    const controller = require("../src/controllers/empresaController");
    const req = {
      params: { id: "1" },
      body: {
        phone_number_id: "123456789",
        whatsapp_token: "invalid-token",
        validate: true,
      },
    };
    const res = createRes();

    await controller.atualizarWhatsApp(req, res, jest.fn());

    expect(res.statusCode).toBe(400);
    expect(res.payload).toEqual(
      expect.objectContaining({
        error: "Credenciais inválidas na Graph API",
        status: 401,
        graph: { message: "Invalid OAuth access token" },
      }),
    );
    expect(update).not.toHaveBeenCalled();
  });
});

describe("empresaController tenant deletion", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test("impede exclusão da empresa por chave de operação", async () => {
    const remove = jest.fn();
    jest.doMock("../src/models/Empresa", () => ({ remove }));
    jest.doMock("axios", () => ({}));
    const controller = require("../src/controllers/empresaController");
    const req = {
      params: { id: "1" },
      adminActor: { permissions: ["read", "write"] },
    };
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json: jest.fn(),
    };

    await controller.remover(req, res, jest.fn());

    expect(res.statusCode).toBe(403);
    expect(remove).not.toHaveBeenCalled();
  });
});
