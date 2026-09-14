const db = require("../config/database");

const PUBLIC_COLUMNS = `
  id, empresa_id, credential_id, provider, model_id, display_name, description,
  owned_by, capabilities, declared_capabilities, inferred_capabilities,
  endpoints, input_token_limit, output_token_limit, context_window,
  chat_compatible, available, metadata_source, first_seen_at, last_seen_at,
  unavailable_since, updated_at
`;

exports.listCredentials = async ({ empresaId = null, credentialId = null } = {}) => {
  const result = await db.query(
    `SELECT * FROM ai_provider_credentials
     WHERE ($1::int IS NULL OR empresa_id = $1)
       AND ($2::bigint IS NULL OR id = $2)
       AND enabled = TRUE
     ORDER BY empresa_id, priority, id`,
    [empresaId, credentialId],
  );
  return result.rows;
};

exports.listPublic = async (
  empresaId,
  { credentialId = null, provider = null, available = true, chatCompatible = null } = {},
) => {
  const result = await db.query(
    `SELECT ${PUBLIC_COLUMNS}
     FROM ai_credential_models
     WHERE empresa_id = $1
       AND ($2::bigint IS NULL OR credential_id = $2)
       AND ($3::text IS NULL OR provider = $3)
       AND ($4::boolean IS NULL OR available = $4)
       AND ($5::boolean IS NULL OR chat_compatible = $5)
     ORDER BY provider, model_id`,
    [empresaId, credentialId, provider, available, chatCompatible],
  );
  return result.rows;
};

exports.syncCredential = async (credential, models) => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const modelIds = [];
    for (const model of models) {
      modelIds.push(model.modelId);
      await client.query(
        `INSERT INTO ai_credential_models (
           empresa_id, credential_id, provider, model_id, display_name,
           description, owned_by, capabilities, declared_capabilities,
           inferred_capabilities, endpoints, input_token_limit,
           output_token_limit, context_window, chat_compatible,
           metadata_source, raw_metadata
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb
         )
         ON CONFLICT (credential_id, model_id) DO UPDATE SET
           provider = EXCLUDED.provider,
           display_name = EXCLUDED.display_name,
           description = EXCLUDED.description,
           owned_by = EXCLUDED.owned_by,
           capabilities = EXCLUDED.capabilities,
           declared_capabilities = EXCLUDED.declared_capabilities,
           inferred_capabilities = EXCLUDED.inferred_capabilities,
           endpoints = EXCLUDED.endpoints,
           input_token_limit = EXCLUDED.input_token_limit,
           output_token_limit = EXCLUDED.output_token_limit,
           context_window = EXCLUDED.context_window,
           chat_compatible = EXCLUDED.chat_compatible,
           available = TRUE,
           metadata_source = EXCLUDED.metadata_source,
           raw_metadata = EXCLUDED.raw_metadata,
           last_seen_at = NOW(),
           unavailable_since = NULL,
           updated_at = NOW()`,
        [
          credential.empresa_id,
          credential.id,
          credential.provider,
          model.modelId,
          model.displayName,
          model.description,
          model.ownedBy,
          model.capabilities,
          model.declaredCapabilities,
          model.inferredCapabilities,
          model.endpoints,
          model.inputTokenLimit,
          model.outputTokenLimit,
          model.contextWindow,
          model.chatCompatible,
          model.metadataSource,
          JSON.stringify(model.rawMetadata || {}),
        ],
      );
    }

    const unavailable = await client.query(
      `UPDATE ai_credential_models
       SET available = FALSE,
           unavailable_since = COALESCE(unavailable_since, NOW()),
           updated_at = NOW()
       WHERE empresa_id = $1 AND credential_id = $2
         AND available = TRUE
         AND NOT (model_id = ANY($3::text[]))
       RETURNING id`,
      [credential.empresa_id, credential.id, modelIds],
    );
    await client.query("COMMIT");
    return { available: models.length, unavailable: unavailable.rowCount };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

exports.createRun = async ({ empresaId, credentialId, provider, dryRun }) => {
  const result = await db.query(
    `INSERT INTO ai_model_catalog_sync_runs (
       empresa_id, credential_id, provider, dry_run
     ) VALUES ($1,$2,$3,$4) RETURNING *`,
    [empresaId, credentialId, provider, dryRun],
  );
  return result.rows[0];
};

exports.finishRun = async (runId, status, summary = {}) => {
  const result = await db.query(
    `UPDATE ai_model_catalog_sync_runs
     SET status = $2, discovered_count = $3, available_count = $4,
         unavailable_count = $5, error_code = $6, error_message = $7,
         finished_at = NOW()
     WHERE id = $1 RETURNING *`,
    [
      runId,
      status,
      summary.discovered || 0,
      summary.available || 0,
      summary.unavailable || 0,
      summary.errorCode || null,
      String(summary.errorMessage || "").slice(0, 500) || null,
    ],
  );
  return result.rows[0];
};

exports.tryLock = async (client) => {
  const result = await client.query(
    "SELECT pg_try_advisory_lock($1) AS acquired",
    [74819326],
  );
  return result.rows[0]?.acquired === true;
};

exports.unlock = async (client) => {
  await client.query("SELECT pg_advisory_unlock($1)", [74819326]);
};

exports.db = db;
