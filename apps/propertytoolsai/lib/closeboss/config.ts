export function getCloseBossConfig() {
  const openaiModel = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const openaiApiKey = process.env.OPENAI_API_KEY || "";
  const aiTimeoutMs = Math.max(3000, Number(process.env.LEADSMART_AI_TIMEOUT_MS || "12000"));
  const aiMaxRetries = Math.max(0, Number(process.env.LEADSMART_AI_RETRIES || "2"));
  const refreshBatchSize = Math.max(10, Number(process.env.LEADSMART_REFRESH_BATCH_SIZE || "200"));

  return {
    openaiModel,
    openaiApiKey,
    aiTimeoutMs,
    aiMaxRetries,
    refreshBatchSize,
  };
}
