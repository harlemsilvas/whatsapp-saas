describe("env.validate", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  test("exige ADMIN_API_KEY em producao por padrao", () => {
    process.env.NODE_ENV = "production";
    process.env.DB_HOST = "localhost";
    process.env.DB_USER = "postgres";
    process.env.DB_PASS = "postgres";
    process.env.DB_NAME = "whatsapp_saas";
    process.env.WHATSAPP_URL = "https://graph.facebook.com/v23.0";
    process.env.WHATSAPP_TOKEN = "token";
    process.env.WHATSAPP_PHONE_ID = "123";
    process.env.VERIFY_TOKEN = "verify";
    process.env.WHATSAPP_APP_SECRET = "secret";
    delete process.env.ADMIN_API_KEY;

    const env = require("../src/config/env");

    expect(() => env.validate()).toThrow(/ADMIN_API_KEY/);
  });

  test("permite desabilitar a exigencia explicita via REQUIRE_ADMIN_API_KEY=0", () => {
    process.env.NODE_ENV = "production";
    process.env.REQUIRE_DB_ENV = "0";
    process.env.REQUIRE_WHATSAPP_ENV = "0";
    process.env.REQUIRE_VERIFY_TOKEN = "0";
    process.env.REQUIRE_WHATSAPP_WEBHOOK_SIGNATURE = "0";
    process.env.REQUIRE_ADMIN_API_KEY = "0";
    delete process.env.ADMIN_API_KEY;

    const env = require("../src/config/env");

    expect(() => env.validate()).not.toThrow();
  });
});
