const axios = require("axios");
const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger");
const env = require("../config/env");
const {
  listRuntimeCandidates,
  markFailure: markCredentialFailure,
  markSuccess: markCredentialSuccess,
  providerHeaders,
  safeProviderError,
  shouldTryNext,
} = require("./aiCredentialService");

function coerceNumber(value, defaultValue) {
  const n = Number(value);
  return Number.isFinite(n) ? n : defaultValue;
}

let cachedCompanyProfile = null;
let cachedCompanyProfileAt = 0;
let cachedCompanyProfileKey = null;

function loadCompanyProfileText() {
  const inline = env.optional("AI_COMPANY_PROFILE_TEXT", null);
  if (inline) {
    const text = String(inline);
    cachedCompanyProfile = text;
    cachedCompanyProfileAt = Date.now();
    cachedCompanyProfileKey = "inline";
    return text;
  }

  let relPath = env.optional("AI_COMPANY_PROFILE_PATH", null);
  if (!relPath) {
    const defaultRelPath = "src/ai/perfil-empresa.md";
    const defaultAbs = path.join(process.cwd(), defaultRelPath);
    if (fs.existsSync(defaultAbs)) {
      relPath = defaultRelPath;
    } else {
      return null;
    }
  }

  const cacheMs = Math.max(
    0,
    Math.trunc(
      coerceNumber(env.optional("AI_COMPANY_PROFILE_CACHE_MS", "30000"), 30000),
    ),
  );

  const now = Date.now();
  const cacheKey = `file:${relPath}`;
  if (
    cachedCompanyProfile &&
    cachedCompanyProfileKey === cacheKey &&
    cacheMs > 0 &&
    now - cachedCompanyProfileAt < cacheMs
  ) {
    return cachedCompanyProfile;
  }

  try {
    const absolute = path.isAbsolute(relPath)
      ? relPath
      : path.join(process.cwd(), relPath);
    const text = fs.readFileSync(absolute, "utf8");
    cachedCompanyProfile = text;
    cachedCompanyProfileAt = now;
    cachedCompanyProfileKey = cacheKey;
    return text;
  } catch (err) {
    logger.warn("Não foi possível ler AI_COMPANY_PROFILE_PATH", {
      path: relPath,
      message: err.message,
    });
    cachedCompanyProfile = null;
    cachedCompanyProfileAt = now;
    cachedCompanyProfileKey = cacheKey;
    return null;
  }
}

function formatCompanyProfileForPrompt(raw) {
  if (!raw) return null;
  const maxChars = Math.max(
    500,
    Math.trunc(
      coerceNumber(env.optional("AI_COMPANY_PROFILE_MAX_CHARS", "4000"), 4000),
    ),
  );
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  const sanitized = trimmed.replace(/\{\{[A-Z0-9_]+\}\}/g, "[NÃO DEFINIDO]");

  if (sanitized.length <= maxChars) return sanitized;
  return sanitized.slice(0, maxChars) + "\n\n[PERFIL TRUNCADO]";
}

function buildSystemPrompt({ contato } = {}) {
  const serviceName = env.optional("SERVICE_NAME", "WhatsApp SaaS");
  const legalName = env.optional("LEGAL_ENTITY_NAME", "");

  const profileText = formatCompanyProfileForPrompt(loadCompanyProfileText());

  const contatoBits = [];
  if (contato?.nome) contatoBits.push(`nome=${String(contato.nome).trim()}`);
  if (Array.isArray(contato?.tags) && contato.tags.length) {
    contatoBits.push(`tags=${contato.tags.filter(Boolean).join(", ")}`);
  }

  return [
    `Você é um atendente virtual no WhatsApp para ${serviceName}.`,
    legalName ? `A empresa/entidade é: ${legalName}.` : null,
    profileText
      ? "\nPERFIL DA EMPRESA (use como fonte de verdade; se algo não estiver aqui, peça confirmação ao usuário):\n" +
        profileText
      : null,
    contatoBits.length
      ? `Contexto do contato: ${contatoBits.join(" | ")}.`
      : null,
    "Responda sempre em pt-BR.",
    "Regra do perfil: qualquer campo não definido deve ser tratado como desconhecido. Se o perfil tiver placeholders como {{...}}, eles significam NÃO DEFINIDO — nunca copie/repita o placeholder; faça no máximo 1 pergunta objetiva para obter o dado que falta.",
    "Se a mensagem do usuário estiver ambígua, faça 1 pergunta objetiva para destravar.",
    "Não invente fatos, preços, prazos ou políticas. Se não souber, diga que precisa confirmar.",
    "Não peça nem exponha dados sensíveis (senhas, tokens, documentos).",
    "Se o usuário pedir algo fora do escopo (ex.: suporte técnico avançado), encaminhe para um humano.",
    "Seja curto e direto (1–3 frases), sem emojis.",
    "\nFORMATO DE SAÍDA (OBRIGATÓRIO): responda SOMENTE com JSON válido no formato:",
    '{"reply":"..."}',
  ]
    .filter(Boolean)
    .join("\n");
}

function normalizeContextMessages(contextMessages, { maxMessages = 8 } = {}) {
  if (!Array.isArray(contextMessages) || contextMessages.length === 0)
    return [];
  const cleaned = contextMessages
    .map((m) => {
      if (!m) return null;
      const role = m.role === "assistant" ? "assistant" : "user";
      const content = String(m.content || "").trim();
      if (!content) return null;
      return { role, content };
    })
    .filter(Boolean);

  return cleaned.slice(-maxMessages);
}

function extractReplyFromContent(content) {
  const text = content ? String(content).trim() : "";
  if (!text) return null;

  try {
    const obj = JSON.parse(text);
    const reply = obj && typeof obj.reply === "string" ? obj.reply.trim() : "";
    return reply || null;
  } catch (_) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const maybeJson = text.slice(start, end + 1);
      try {
        const obj = JSON.parse(maybeJson);
        const reply =
          obj && typeof obj.reply === "string" ? obj.reply.trim() : "";
        return reply || null;
      } catch (_) {
        return null;
      }
    }
    return null;
  }
}

function extractOutputTextFromResponses(data) {
  if (!data) return "";
  if (typeof data.output_text === "string") return data.output_text;

  const output = Array.isArray(data.output) ? data.output : [];
  for (const item of output) {
    const contentArr = Array.isArray(item?.content) ? item.content : [];
    for (const c of contentArr) {
      if (typeof c?.text === "string" && c.text.trim()) return c.text;
      if (typeof c?.text?.value === "string" && c.text.value.trim())
        return c.text.value;
      if (typeof c?.output_text === "string" && c.output_text.trim())
        return c.output_text;
    }
  }

  return "";
}

async function callOpenAIResponses({
  apiKey,
  baseUrl,
  model,
  temperature,
  maxOutputTokens,
  timeoutMs,
  systemPrompt,
  userText,
  contextMessages,
}) {
  const url = `${baseUrl}/responses`;

  const historyBlock = contextMessages.length
    ? contextMessages
        .map(
          (m) =>
            `${m.role === "assistant" ? "Assistente" : "Usuário"}: ${m.content}`,
        )
        .join("\n")
    : "";

  const input = [
    systemPrompt,
    historyBlock ? `\n\nHISTÓRICO (mensagens recentes):\n${historyBlock}` : "",
    `\n\nMENSAGEM ATUAL DO USUÁRIO:\n${userText}`,
  ]
    .filter(Boolean)
    .join("");

  const payloadBase = {
    model,
    input,
    max_output_tokens: maxOutputTokens,
    reasoning: {
      effort: String(env.optional("OPENAI_REASONING_EFFORT", "low")),
    },
  };

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  const post = (body) => axios.post(url, body, { headers, timeout: timeoutMs });

  const parse = (data) => {
    const out = extractOutputTextFromResponses(data);
    const reply = extractReplyFromContent(out) || String(out || "").trim();
    return { reply: reply || null, usage: data?.usage || null, raw: data };
  };

  try {
    const res = await post({ ...payloadBase, temperature });
    const parsed = parse(res.data);

    if (
      parsed.raw?.status === "incomplete" &&
      parsed.raw?.incomplete_details?.reason === "max_output_tokens"
    ) {
      const retryMax = Math.min(Math.max(maxOutputTokens * 4, 500), 2000);
      logger.warn("OpenAI responses: retry por max_output_tokens", {
        model,
        maxOutputTokens,
        retryMax,
      });

      const resRetry = await post({
        ...payloadBase,
        max_output_tokens: retryMax,
        temperature,
      });
      const parsedRetry = parse(resRetry.data);
      return { reply: parsedRetry.reply, usage: parsedRetry.usage };
    }

    return { reply: parsed.reply, usage: parsed.usage };
  } catch (err) {
    const status = err.response?.status;
    const data = err.response?.data;
    const message = data?.error?.message || err.message;

    const shouldRetryNoTemp =
      status === 400 && /temperature/i.test(String(message || ""));

    if (!shouldRetryNoTemp) throw err;

    logger.warn("OpenAI responses: retry sem temperature", { model });

    const res2 = await post(payloadBase);
    const parsed2 = parse(res2.data);

    if (
      parsed2.raw?.status === "incomplete" &&
      parsed2.raw?.incomplete_details?.reason === "max_output_tokens"
    ) {
      const retryMax = Math.min(Math.max(maxOutputTokens * 4, 500), 2000);
      logger.warn("OpenAI responses: retry por max_output_tokens (sem temp)", {
        model,
        maxOutputTokens,
        retryMax,
      });

      const resRetry = await post({
        ...payloadBase,
        max_output_tokens: retryMax,
      });
      const parsedRetry = parse(resRetry.data);
      return { reply: parsedRetry.reply, usage: parsedRetry.usage };
    }

    return { reply: parsed2.reply, usage: parsed2.usage };
  }
}

async function callOpenAIChatCompletions({
  apiKey,
  provider,
  baseUrl,
  model,
  temperature,
  maxOutputTokens,
  timeoutMs,
  systemPrompt,
  userText,
  contextMessages,
}) {
  const url = `${baseUrl}/chat/completions`;

  const messages = [
    { role: "system", content: systemPrompt },
    ...contextMessages.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userText },
  ];

  const headers = {
    ...providerHeaders(provider, apiKey),
    "Content-Type": "application/json",
  };

  const post = (body) => axios.post(url, body, { headers, timeout: timeoutMs });

  let body = {
    model,
    messages,
    temperature,
    ...(provider === "openai"
      ? { max_completion_tokens: maxOutputTokens }
      : { max_tokens: maxOutputTokens }),
    ...(provider === "nvidia"
      ? {}
      : { response_format: { type: "json_object" } }),
  };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await post(body);
      const content = response.data?.choices?.[0]?.message?.content || "";
      const reply = extractReplyFromContent(content) || String(content).trim();
      return { reply: reply || null, usage: response.data?.usage || null };
    } catch (err) {
      const status = err.response?.status;
      const message = err.response?.data?.error?.message || err.message;
      if (status !== 400) throw err;

      if (/temperature/i.test(String(message || "")) && body.temperature !== undefined) {
        logger.warn("IA chat/completions: retry sem temperature", { provider, model });
        body = { ...body, temperature: undefined };
        continue;
      }
      if (/max_completion_tokens/i.test(String(message || "")) && body.max_completion_tokens) {
        logger.warn("IA chat/completions: retry com max_tokens", { provider, model });
        body = {
          ...body,
          max_completion_tokens: undefined,
          max_tokens: maxOutputTokens,
        };
        continue;
      }
      if (/response_format/i.test(String(message || "")) && body.response_format) {
        logger.warn("IA chat/completions: retry sem response_format", { provider, model });
        body = { ...body, response_format: undefined };
        continue;
      }
      throw err;
    }
  }

  return { reply: null, usage: null };
}

async function callOpenAI({
  messageText,
  contextMessages = [],
  contato = null,
  empresaId = null,
}) {
  const temperature = coerceNumber(env.optional("OPENAI_TEMPERATURE", "1"), 1);
  const maxOutputTokens = Math.max(
    32,
    Math.trunc(
      coerceNumber(env.optional("OPENAI_MAX_OUTPUT_TOKENS", "220"), 220),
    ),
  );
  const timeoutMs = Math.max(
    3000,
    Math.trunc(coerceNumber(env.optional("OPENAI_TIMEOUT_MS", "15000"), 15000)),
  );

  const systemPrompt = buildSystemPrompt({ contato });
  const userText = String(messageText || "").trim();
  if (!userText) return { reply: null, disabled: false };

  const maxContextMessages = Math.max(
    0,
    Math.trunc(
      coerceNumber(env.optional("OPENAI_MAX_CONTEXT_MESSAGES", "8"), 8),
    ),
  );
  const ctx = normalizeContextMessages(contextMessages, {
    maxMessages: maxContextMessages,
  });

  const candidates = await listRuntimeCandidates(empresaId);
  if (!candidates.length) return { reply: null, disabled: true };

  const configuredMaxAttempts = Math.max(
    1,
    Math.trunc(Number(process.env.AI_MAX_CREDENTIAL_ATTEMPTS) || 3),
  );
  const candidatesToTry = candidates.slice(0, configuredMaxAttempts);
  let lastFailure = null;

  for (let index = 0; index < candidatesToTry.length; index += 1) {
    const candidate = candidatesToTry[index];
    try {
      const params = {
        apiKey: candidate.apiKey,
        provider: candidate.provider,
        baseUrl: candidate.baseUrl,
        model: candidate.model,
        temperature,
        maxOutputTokens,
        timeoutMs,
        systemPrompt,
        userText,
        contextMessages: ctx,
      };
      const result =
        candidate.apiStyle === "chat"
          ? await callOpenAIChatCompletions(params)
          : await callOpenAIResponses(params);

      await markCredentialSuccess(candidate).catch(() => {});
      logger.info("Provedor de IA respondeu", {
        empresaId,
        provider: candidate.provider,
        credentialSource: candidate.source,
        credentialFingerprint: candidate.fingerprint,
        model: candidate.model,
        attempt: index + 1,
      });
      return {
        ...result,
        disabled: false,
        credentialFingerprint: candidate.fingerprint,
      };
    } catch (err) {
      const detail = safeProviderError(err);
      lastFailure = detail;
      await markCredentialFailure(candidate, err).catch(() => {});
      logger.warn("Provedor de IA falhou com credencial", {
        empresaId,
        provider: candidate.provider,
        credentialSource: candidate.source,
        credentialFingerprint: candidate.fingerprint,
        model: candidate.model,
        attempt: index + 1,
        status: detail.status,
        code: detail.code,
        message: detail.message,
      });

      if (!shouldTryNext(err)) break;
    }
  }

  return { reply: null, disabled: false, failure: lastFailure };
}

exports.gerarRespostaComMeta = async (input) => {
  function buildSmartFallback(messageText) {
    const text = String(messageText || "").trim();
    if (!text) return null;

    const lower = text.toLowerCase();

    const asksPrice =
      /(quanto custa|qual o pre[cç]o|pre[cç]o\?|valor\?|qual o valor|custa\?)/i.test(
        text,
      );
    if (asksPrice) {
      // Uma única pergunta objetiva para destravar.
      return "Para eu te passar o preço certinho, qual o código do produto (ex.: PH6017A ou PH6018)?";
    }

    const asksFrete = /(frete|entrega|envio)/i.test(text);
    if (asksFrete) {
      return "Para calcular o frete, me informe seu CEP.";
    }

    const asksEndereco = /(endereço|endere[cç]o|local|retirada)/i.test(text);
    if (asksEndereco) {
      // Evita inventar: pede confirmação em 1 pergunta.
      return "Você quer retirada no local ou entrega?";
    }

    const asksHorario =
      /(hor[aá]rio|atende(m)? hoje|voc[eê]s atendem|atendimento)/i.test(lower);
    if (asksHorario) {
      return "Você quer o horário de atendimento humano ou do atendimento automático?";
    }

    return null;
  }

  const fallbackText =
    env.optional("AI_FALLBACK_TEXT", null) ||
    "No momento não consegui responder automaticamente. Você pode detalhar um pouco mais ou aguardar um atendente?";

  const isObj = input && typeof input === "object";
  const mensagem = isObj ? input.mensagem : String(input || "");
  const contextoMensagens = isObj ? input.contextoMensagens || [] : [];
  const contato = isObj ? input.contato || null : null;
  const empresaId = isObj ? input.empresaId || null : null;

  try {
    const result = await callOpenAI({
      messageText: mensagem,
      contextMessages: contextoMensagens,
      contato,
      empresaId,
    });

    if (result.disabled) {
      const reply = buildSmartFallback(mensagem) || fallbackText;
      return {
        reply,
        meta: {
          isFallback: true,
          fallbackKind: reply === fallbackText ? "generic" : "smart",
          usedGenericFallback: reply === fallbackText,
          disabled: true,
        },
      };
    }

    const reply = result.reply ? String(result.reply).trim() : "";
    if (!reply) {
      const reply2 = buildSmartFallback(mensagem) || fallbackText;
      return {
        reply: reply2,
        meta: {
          isFallback: true,
          fallbackKind: reply2 === fallbackText ? "generic" : "smart",
          usedGenericFallback: reply2 === fallbackText,
          disabled: false,
          reason: result.failure?.code || "empty_reply",
        },
      };
    }

    if (result.usage) {
      logger.info("Uso do provedor de IA", {
        prompt_tokens: result.usage.prompt_tokens,
        completion_tokens: result.usage.completion_tokens,
        total_tokens: result.usage.total_tokens,
      });
    }

    return {
      reply,
      meta: {
        isFallback: false,
        usedGenericFallback: false,
        disabled: false,
      },
    };
  } catch (err) {
    logger.error("Erro inesperado no iaService", { message: err.message });
    const reply = buildSmartFallback(mensagem) || fallbackText;
    return {
      reply,
      meta: {
        isFallback: true,
        fallbackKind: reply === fallbackText ? "generic" : "smart",
        usedGenericFallback: reply === fallbackText,
        disabled: false,
        reason: "exception",
      },
    };
  }
};

// Mantém compatibilidade: quem usa gerarResposta() continua recebendo string
exports.gerarResposta = async (input) => {
  const r = await exports.gerarRespostaComMeta(input);
  return r?.reply || null;
};
