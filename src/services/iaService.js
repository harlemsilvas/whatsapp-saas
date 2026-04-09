const axios = require("axios");
const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger");
const env = require("../config/env");

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
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  const post = (body) => axios.post(url, body, { headers, timeout: timeoutMs });

  // Preferência: modelos novos usam max_completion_tokens
  const base = {
    model,
    messages,
    response_format: { type: "json_object" },
    max_completion_tokens: maxOutputTokens,
    temperature,
  };

  try {
    const res = await post(base);
    const content = res.data?.choices?.[0]?.message?.content || "";
    const reply = extractReplyFromContent(content) || String(content).trim();
    return { reply: reply || null, usage: res.data?.usage || null };
  } catch (err) {
    const status = err.response?.status;
    const data = err.response?.data;
    const message = data?.error?.message || err.message;

    // Retry sem temperature se o modelo não suportar custom
    if (status === 400 && /temperature/i.test(String(message || ""))) {
      logger.warn("OpenAI chat/completions: retry sem temperature", { model });
      const res2 = await post({ ...base, temperature: undefined });
      const content2 = res2.data?.choices?.[0]?.message?.content || "";
      const reply2 =
        extractReplyFromContent(content2) || String(content2).trim();
      return { reply: reply2 || null, usage: res2.data?.usage || null };
    }

    // Retry com max_tokens se max_completion_tokens não for aceito
    if (
      status === 400 &&
      /max_completion_tokens/i.test(String(message || ""))
    ) {
      logger.warn("OpenAI chat/completions: retry com max_tokens", { model });
      const res3 = await post({
        model,
        messages,
        response_format: { type: "json_object" },
        max_tokens: maxOutputTokens,
        temperature,
      });
      const content3 = res3.data?.choices?.[0]?.message?.content || "";
      const reply3 =
        extractReplyFromContent(content3) || String(content3).trim();
      return { reply: reply3 || null, usage: res3.data?.usage || null };
    }

    throw err;
  }
}

async function callOpenAI({
  messageText,
  contextMessages = [],
  contato = null,
}) {
  const apiKey = env.optional("OPENAI_API_KEY", null);
  if (!apiKey) return { reply: null, disabled: true };

  const baseUrl = env
    .optional("OPENAI_BASE_URL", "https://api.openai.com/v1")
    .replace(/\/+$/, "");
  const model = env.optional("OPENAI_MODEL", "gpt-4o-mini");

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

  const apiStyle = String(
    env.optional("OPENAI_API_STYLE", "responses"),
  ).toLowerCase();

  try {
    if (apiStyle !== "chat") {
      const r = await callOpenAIResponses({
        apiKey,
        baseUrl,
        model,
        temperature,
        maxOutputTokens,
        timeoutMs,
        systemPrompt,
        userText,
        contextMessages: ctx,
      });
      return { ...r, disabled: false };
    }

    const r2 = await callOpenAIChatCompletions({
      apiKey,
      baseUrl,
      model,
      temperature,
      maxOutputTokens,
      timeoutMs,
      systemPrompt,
      userText,
      contextMessages: ctx,
    });

    return { ...r2, disabled: false };
  } catch (err) {
    const status = err.response?.status;
    const data = err.response?.data;
    const message = data?.error?.message || err.message;

    logger.warn("OpenAI falhou (tentando fallback de endpoint)", {
      status,
      message,
      model,
      apiStyle,
    });

    try {
      if (apiStyle !== "chat") {
        const r2 = await callOpenAIChatCompletions({
          apiKey,
          baseUrl,
          model,
          temperature,
          maxOutputTokens,
          timeoutMs,
          systemPrompt,
          userText,
          contextMessages: ctx,
        });
        return { ...r2, disabled: false };
      }

      const r = await callOpenAIResponses({
        apiKey,
        baseUrl,
        model,
        temperature,
        maxOutputTokens,
        timeoutMs,
        systemPrompt,
        userText,
        contextMessages: ctx,
      });
      return { ...r, disabled: false };
    } catch (err2) {
      const status2 = err2.response?.status;
      const data2 = err2.response?.data;
      logger.error("OpenAI fallback falhou", {
        status: status2,
        message: data2?.error?.message || err2.message,
        model,
      });
      return { reply: null, disabled: false };
    }
  }
}

exports.gerarResposta = async (input) => {
  const fallbackText =
    env.optional("AI_FALLBACK_TEXT", null) ||
    "No momento não consegui responder automaticamente. Você pode detalhar um pouco mais ou aguardar um atendente?";

  const isObj = input && typeof input === "object";
  const mensagem = isObj ? input.mensagem : String(input || "");
  const contextoMensagens = isObj ? input.contextoMensagens || [] : [];
  const contato = isObj ? input.contato || null : null;

  try {
    const result = await callOpenAI({
      messageText: mensagem,
      contextMessages: contextoMensagens,
      contato,
    });

    if (result.disabled) return fallbackText;

    const reply = result.reply ? String(result.reply).trim() : "";
    if (!reply) return fallbackText;

    if (result.usage) {
      logger.info("OpenAI usage", {
        prompt_tokens: result.usage.prompt_tokens,
        completion_tokens: result.usage.completion_tokens,
        total_tokens: result.usage.total_tokens,
      });
    }

    return reply;
  } catch (err) {
    logger.error("Erro inesperado no iaService", { message: err.message });
    return fallbackText;
  }
};
