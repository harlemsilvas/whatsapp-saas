describe("apiKeyAuth", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  function createRes() {
    return {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return this;
      },
    };
  }

  test("permite acesso fora de producao quando ADMIN_API_KEY nao existe", () => {
    process.env.NODE_ENV = "development";
    delete process.env.ADMIN_API_KEY;
    delete process.env.REQUIRE_ADMIN_API_KEY;

    const middleware = require("../src/middlewares/apiKeyAuth")();
    const req = { headers: {}, query: {} };
    const res = createRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
  });

  test("bloqueia acesso em producao quando ADMIN_API_KEY nao existe", () => {
    process.env.NODE_ENV = "production";
    delete process.env.ADMIN_API_KEY;
    delete process.env.REQUIRE_ADMIN_API_KEY;

    const middleware = require("../src/middlewares/apiKeyAuth")();
    const req = { headers: {}, query: {} };
    const res = createRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Não autorizado" });
  });

  test("aceita x-api-key valida com comparacao segura", () => {
    process.env.NODE_ENV = "production";
    process.env.ADMIN_API_KEY = "segredo-forte";

    const middleware = require("../src/middlewares/apiKeyAuth")();
    const req = { headers: { "x-api-key": "segredo-forte" }, query: {} };
    const res = createRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
  });

  test("aceita key pela query quando configurado para a UI", () => {
    process.env.ADMIN_API_KEY = "ui-secret";

    const middleware = require("../src/middlewares/apiKeyAuth")({
      queryParamName: "key",
    });
    const req = { headers: {}, query: { key: "ui-secret" } };
    const res = createRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
