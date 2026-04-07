const Empresa = require("../models/Empresa");
const axios = require("axios");

function sanitizeEmpresa(empresa) {
  if (!empresa) return empresa;
  const token = empresa.whatsapp_token
    ? String(empresa.whatsapp_token).trim()
    : "";
  const tokenLen = token ? token.length : 0;

  const sanitized = { ...empresa };
  delete sanitized.whatsapp_token;

  sanitized.whatsapp_token_configured = tokenLen > 0;
  sanitized.whatsapp_token_len = tokenLen > 0 ? tokenLen : null;

  return sanitized;
}

function toStringOrNull(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Variável de ambiente ausente: ${name}`);
  }
  return String(value).trim();
}

async function verifyWhatsAppCredentials({ baseUrl, phoneId, token }) {
  const url = `${baseUrl.replace(/\/$/, "")}/${phoneId}?fields=display_phone_number,verified_name`;
  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000,
  });
  return {
    display_phone_number: res.data?.display_phone_number ?? null,
    verified_name: res.data?.verified_name ?? null,
  };
}

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

exports.listar = async (req, res, next) => {
  try {
    const limit = toInt(req.query?.limit) ?? 50;
    const offset = toInt(req.query?.offset) ?? 0;
    const empresas = await Empresa.list({ limit, offset });
    res.json(empresas.map(sanitizeEmpresa));
  } catch (err) {
    next(err);
  }
};

exports.obter = async (req, res, next) => {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ error: "id inválido" });

    const empresa = await Empresa.findById(id);
    if (!empresa)
      return res.status(404).json({ error: "Empresa não encontrada" });

    res.json(sanitizeEmpresa(empresa));
  } catch (err) {
    next(err);
  }
};

exports.criar = async (req, res, next) => {
  try {
    const {
      nome,
      telefone = null,
      whatsapp_token = null,
      phone_number_id = null,
    } = req.body || {};
    if (!nome) return res.status(400).json({ error: "nome é obrigatório" });

    const empresa = await Empresa.create({
      nome,
      telefone,
      whatsapp_token,
      phone_number_id,
    });
    res.status(201).json(sanitizeEmpresa(empresa));
  } catch (err) {
    next(err);
  }
};

exports.atualizar = async (req, res, next) => {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ error: "id inválido" });

    const payload = req.body || {};
    const empresa = await Empresa.update(id, payload);
    if (!empresa)
      return res.status(404).json({ error: "Empresa não encontrada" });

    res.json(sanitizeEmpresa(empresa));
  } catch (err) {
    next(err);
  }
};

exports.remover = async (req, res, next) => {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ error: "id inválido" });

    const removed = await Empresa.remove(id);
    if (!removed)
      return res.status(404).json({ error: "Empresa não encontrada" });

    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
};

// ===== WhatsApp credentials (admin/onboarding) =====

exports.verificarWhatsApp = async (req, res, next) => {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ error: "id inválido" });

    const empresa = await Empresa.findById(id);
    if (!empresa)
      return res.status(404).json({ error: "Empresa não encontrada" });

    const baseUrl = requiredEnv("WHATSAPP_URL");
    const phoneId = toStringOrNull(empresa.phone_number_id);
    const token = toStringOrNull(empresa.whatsapp_token);

    if (!phoneId || !token) {
      return res.status(400).json({
        error: "Empresa sem credenciais completas",
        details: {
          phone_number_id_configured: Boolean(phoneId),
          whatsapp_token_configured: Boolean(token),
        },
      });
    }

    try {
      const info = await verifyWhatsAppCredentials({
        baseUrl,
        phoneId,
        token,
      });
      return res.json({ ok: true, empresa: sanitizeEmpresa(empresa), ...info });
    } catch (err) {
      const status = err.response?.status ?? null;
      const graph = err.response?.data?.error ?? err.response?.data ?? null;
      return res.status(502).json({
        ok: false,
        status,
        graph,
        message: err.message,
      });
    }
  } catch (err) {
    next(err);
  }
};

exports.atualizarWhatsApp = async (req, res, next) => {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ error: "id inválido" });

    const empresa = await Empresa.findById(id);
    if (!empresa)
      return res.status(404).json({ error: "Empresa não encontrada" });

    const whatsapp_token = toStringOrNull(req.body?.whatsapp_token);
    const phone_number_id = toStringOrNull(req.body?.phone_number_id);
    const validate = req.body?.validate === false ? false : true;

    if (!whatsapp_token && !phone_number_id) {
      return res.status(400).json({
        error: "Informe whatsapp_token e/ou phone_number_id",
      });
    }

    const candidateToken =
      whatsapp_token || toStringOrNull(empresa.whatsapp_token);
    const candidatePhoneId =
      phone_number_id || toStringOrNull(empresa.phone_number_id);

    let verified = null;
    if (validate) {
      const baseUrl = requiredEnv("WHATSAPP_URL");
      if (!candidateToken || !candidatePhoneId) {
        return res.status(400).json({
          error:
            "Para validar, a empresa precisa ter whatsapp_token e phone_number_id",
          details: {
            phone_number_id_configured: Boolean(candidatePhoneId),
            whatsapp_token_configured: Boolean(candidateToken),
          },
        });
      }

      try {
        verified = await verifyWhatsAppCredentials({
          baseUrl,
          phoneId: candidatePhoneId,
          token: candidateToken,
        });
      } catch (err) {
        const status = err.response?.status ?? null;
        const graph = err.response?.data?.error ?? err.response?.data ?? null;
        return res.status(400).json({
          error: "Credenciais inválidas na Graph API",
          status,
          graph,
          message: err.message,
        });
      }
    }

    const updated = await Empresa.update(id, {
      whatsapp_token: whatsapp_token || null,
      phone_number_id: phone_number_id || null,
    });

    return res.json({
      ok: true,
      empresa: sanitizeEmpresa(updated),
      verified,
    });
  } catch (err) {
    next(err);
  }
};

exports.onboarding = async (req, res, next) => {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ error: "id inválido" });

    const empresa = await Empresa.findById(id);
    if (!empresa)
      return res.status(404).json({ error: "Empresa não encontrada" });

    const base = toStringOrNull(process.env.APP_PUBLIC_BASE_URL);
    const normalizedBase = base ? base.replace(/\/$/, "") : null;

    const verifyTokenConfigured = Boolean(
      toStringOrNull(process.env.VERIFY_TOKEN),
    );
    const phoneIdConfigured = Boolean(toStringOrNull(empresa.phone_number_id));
    const tokenConfigured = Boolean(toStringOrNull(empresa.whatsapp_token));

    const external = {
      baseUrl: normalizedBase,
      apiBaseUrl: normalizedBase ? `${normalizedBase}/api` : null,
      webhookCallbackUrl: normalizedBase
        ? `${normalizedBase}/api/webhook`
        : null,
      privacyUrl: normalizedBase ? `${normalizedBase}/privacy` : null,
      termsUrl: normalizedBase ? `${normalizedBase}/terms` : null,
      dataDeletionUrl: normalizedBase
        ? `${normalizedBase}/data-deletion`
        : null,

      // Fallback quando você preferir publicar tudo via /api
      privacyUrlApi: normalizedBase ? `${normalizedBase}/api/privacy` : null,
      termsUrlApi: normalizedBase ? `${normalizedBase}/api/terms` : null,
      dataDeletionUrlApi: normalizedBase
        ? `${normalizedBase}/api/data-deletion`
        : null,
    };

    const adminApi = {
      getEmpresaUrl: `/api/empresas/${id}`,
      updateWhatsAppUrl: `/api/empresas/${id}/whatsapp`,
      verifyWhatsAppUrl: `/api/empresas/${id}/whatsapp/verify`,
      onboardingUrl: `/api/empresas/${id}/onboarding`,
    };

    const response = {
      empresa: sanitizeEmpresa(empresa),
      public: external,
      adminApi,
      meta: {
        verifyTokenConfigured,
        webhookPathInternal: "/api/webhook",
        // Importante: no painel da Meta, "Domínios do aplicativo" deve ser apenas o host,
        // sem https:// e sem path. Ex.: hrmmotos.com.br
        appDomainsExample: normalizedBase
          ? [new URL(normalizedBase).host]
          : ["seu-dominio.com"],
      },
      whatsapp: {
        phone_number_id_configured: phoneIdConfigured,
        whatsapp_token_configured: tokenConfigured,
      },
      steps: [
        {
          id: "set-public-base-url",
          title: "Definir APP_PUBLIC_BASE_URL",
          status: normalizedBase ? "done" : "todo",
          why: "Gera URLs externas prontas para colar no painel da Meta.",
          how: {
            env: "APP_PUBLIC_BASE_URL=https://SEU_DOMINIO/SUA_SUBPASTA (ex.: https://hrmmotos.com.br/wppsaas)",
          },
          outputs: {
            baseUrl: external.baseUrl,
            webhookCallbackUrl: external.webhookCallbackUrl,
          },
        },
        {
          id: "configure-verify-token",
          title: "Configurar VERIFY_TOKEN",
          status: verifyTokenConfigured ? "done" : "todo",
          why: "Necessário para o verify do webhook (GET /api/webhook com hub.*).",
          how: {
            env: "VERIFY_TOKEN=UM_TOKEN_FORTE_E_UNICO",
            verifyExample: external.webhookCallbackUrl
              ? `${external.webhookCallbackUrl}?hub.mode=subscribe&hub.verify_token=SEU_VERIFY_TOKEN&hub.challenge=123`
              : null,
          },
        },
        {
          id: "set-company-whatsapp-credentials",
          title: "Salvar credenciais do WhatsApp na empresa",
          status: phoneIdConfigured && tokenConfigured ? "done" : "todo",
          why: "A API envia mensagens usando as credenciais por empresa (multi-tenant).",
          how: {
            endpoint: adminApi.updateWhatsAppUrl,
            headers: {
              "Content-Type": "application/json",
              "x-api-key": "<ADMIN_API_KEY>",
            },
            bodyExample: {
              phone_number_id: "SEU_PHONE_NUMBER_ID",
              whatsapp_token: "SEU_TOKEN",
              validate: true,
            },
          },
        },
        {
          id: "verify-company-whatsapp-credentials",
          title: "Verificar credenciais na Graph API",
          status: phoneIdConfigured && tokenConfigured ? "todo" : "blocked",
          why: "Confirma que token/phone_number_id estão válidos sem expor o token.",
          how: {
            endpoint: adminApi.verifyWhatsAppUrl,
            method: "POST",
            headers: {
              "x-api-key": "<ADMIN_API_KEY>",
            },
          },
          expected: {
            ok: true,
            fields: ["display_phone_number", "verified_name"],
          },
        },
        {
          id: "meta-basic-settings",
          title: "Preencher URLs exigidas pela Meta",
          status: normalizedBase ? "todo" : "blocked",
          why: "Sem isso, o App pode bloquear permissões/revisão.",
          how: {
            appDomains:
              "Use apenas o domínio (host), sem https:// e sem /wppsaas.",
            policyUrls: {
              privacy: external.privacyUrl,
              terms: external.termsUrl,
              dataDeletion: external.dataDeletionUrl,
            },
            policyUrlsFallbackApi: {
              privacy: external.privacyUrlApi,
              terms: external.termsUrlApi,
              dataDeletion: external.dataDeletionUrlApi,
            },
          },
        },
        {
          id: "meta-webhook",
          title: "Configurar Webhook do WhatsApp",
          status: normalizedBase && verifyTokenConfigured ? "todo" : "blocked",
          why: "Sem webhook, a API não recebe eventos messages/statuses.",
          how: {
            callbackUrl: external.webhookCallbackUrl,
            verifyToken: "(o mesmo VERIFY_TOKEN do .env)",
            events: ["messages", "statuses"],
          },
        },
        {
          id: "end-to-end-test",
          title: "Teste ponta-a-ponta",
          status: "todo",
          why: "Garante recebimento do webhook e envio de resposta.",
          how: {
            checklist: [
              "Enviar uma mensagem real para o número do WhatsApp Cloud API",
              "Verificar logs: 'Webhook mensagem recebida' -> 'Mensagem enviada'",
              "Se falhar, o log 'Erro ao enviar mensagem' traz o erro do Graph",
            ],
          },
        },
      ],
      hints: {
        setPublicBaseUrlEnv:
          "Defina APP_PUBLIC_BASE_URL (ex.: https://hrmmotos.com.br/wppsaas) para gerar URLs prontas para colar na Meta.",
        adminHeader:
          "Quando ADMIN_API_KEY estiver definido, envie header x-api-key nas rotas /api/empresas.",
      },
    };

    res.json(response);
  } catch (err) {
    next(err);
  }
};
