describe("buildCorsOptions", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  test("em desenvolvimento permite qualquer origin quando a lista estiver vazia", (done) => {
    process.env.NODE_ENV = "development";
    delete process.env.CORS_ALLOWED_ORIGINS;

    const { buildCorsOptions } = require("../src/config/cors");
    const options = buildCorsOptions();

    options.origin("https://qualquer-site.com", (err, allowed) => {
      expect(err).toBeNull();
      expect(allowed).toBe(true);
      done();
    });
  });

  test("em producao bloqueia origin nao listada", (done) => {
    process.env.NODE_ENV = "production";
    process.env.CORS_ALLOWED_ORIGINS = "https://app.exemplo.com";

    const { buildCorsOptions } = require("../src/config/cors");
    const options = buildCorsOptions();

    options.origin("https://intruso.com", (err) => {
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe("CORS origin não permitida");
      expect(err.status).toBe(403);
      done();
    });
  });

  test("em producao permite origin listada", (done) => {
    process.env.NODE_ENV = "production";
    process.env.CORS_ALLOWED_ORIGINS =
      "https://app.exemplo.com,https://admin.exemplo.com";

    const { buildCorsOptions } = require("../src/config/cors");
    const options = buildCorsOptions();

    options.origin("https://admin.exemplo.com", (err, allowed) => {
      expect(err).toBeNull();
      expect(allowed).toBe(true);
      done();
    });
  });

  test("permite requisicoes sem origin por padrao", (done) => {
    process.env.NODE_ENV = "production";
    process.env.CORS_ALLOWED_ORIGINS = "https://app.exemplo.com";

    const { buildCorsOptions } = require("../src/config/cors");
    const options = buildCorsOptions();

    options.origin(undefined, (err, allowed) => {
      expect(err).toBeNull();
      expect(allowed).toBe(true);
      done();
    });
  });
});
