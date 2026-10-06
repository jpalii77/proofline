// NVIDIA Nemotron on Nebius Token Factory, through its OpenAI-compatible Chat Completions API.
// No SDK: one fetch call, so the request is easy to read and to fake in tests.

export const DEFAULT_BASE_URL = 'https://api.tokenfactory.nebius.com/v1/';
// Verified on nebius.com (Token Factory Nemotron page, Oct 2026). Override with NEBIUS_REASONING_MODEL.
export const DEFAULT_REASONING_MODEL = 'nvidia/nemotron-3-super-120b-a12b';

/** Pull the first JSON object out of a model reply (tolerates <think> blocks and ``` fences). */
export function parseJsonReply(text) {
  if (!text) throw new Error('empty model reply');
  let t = String(text).replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('no JSON object in model reply');
  return JSON.parse(t.slice(start, end + 1));
}

const num = (v) => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};

/**
 * Token counts from the `usage` field of an OpenAI-compatible Chat Completions reply (Token Factory):
 *   { prompt_tokens, completion_tokens, total_tokens, completion_tokens_details: { reasoning_tokens } }
 * Also accepts input_tokens / output_tokens. Missing or malformed fields become null, never a guess.
 * Returns null when the reply carried no usable usage at all.
 */
export function parseUsage(usage) {
  if (!usage || typeof usage !== 'object') return null;
  const tokensIn = num(usage.prompt_tokens ?? usage.input_tokens);
  const tokensOut = num(usage.completion_tokens ?? usage.output_tokens);
  let total = num(usage.total_tokens);
  if (total === null && tokensIn !== null && tokensOut !== null) total = tokensIn + tokensOut;
  const reasoning = num(usage.completion_tokens_details?.reasoning_tokens ?? usage.output_tokens_details?.reasoning_tokens);
  if (tokensIn === null && tokensOut === null && total === null) return null;
  return { in: tokensIn, out: tokensOut, total, reasoning };
}

/** An Error that still carries what is known about the call (model, latency, usage) for the trace. */
function callError(message, call) {
  const err = new Error(message);
  err.call = call;
  return err;
}

export function createTokenFactoryClient({
  apiKey, baseUrl = DEFAULT_BASE_URL, reasoningModel = DEFAULT_REASONING_MODEL, fastModel,
  fetchImpl = globalThis.fetch, timeoutMs = 60000,
}) {
  if (!apiKey) throw new Error('NEBIUS_API_KEY is not set');
  const root = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const models = { reasoning: reasoningModel, fast: fastModel || reasoningModel };

  async function chat({ tier = 'reasoning', system, user, maxTokens = 1200, temperature = 0.2 }) {
    const model = models[tier] || models.reasoning;
    const started = Date.now();
    let res;
    try {
      res = await fetchImpl(new URL('chat/completions', root), {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          temperature,
          max_tokens: maxTokens,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: typeof user === 'string' ? user : JSON.stringify(user) },
          ],
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      const why = e.name === 'TimeoutError' ? `no answer within ${Math.round(timeoutMs / 1000)} s` : (e.message || String(e));
      throw callError(`Token Factory: ${why}`, { model, ms: Date.now() - started, usage: null });
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw callError(`Token Factory HTTP ${res.status}: ${body.slice(0, 200)}`, { model, ms: Date.now() - started, usage: null });
    }
    let data;
    try { data = await res.json(); } catch {
      throw callError('Token Factory reply was not JSON', { model, ms: Date.now() - started, usage: null });
    }
    const usage = parseUsage(data.usage);
    const ms = Date.now() - started;
    const content = data.choices?.[0]?.message?.content ?? '';
    let json;
    try { json = parseJsonReply(content); } catch (e) {
      const cut = data.choices?.[0]?.finish_reason === 'length' ? ' (reply cut off at the token limit)' : '';
      throw callError(`model reply had no valid JSON${cut}: ${e.message}`, { model, ms, usage });
    }
    return { json, model, usage, ms };
  }

  async function listModels() {
    const res = await fetchImpl(new URL('models', root), { headers: { authorization: `Bearer ${apiKey}` } });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Token Factory HTTP ${res.status} at ${root}: ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    return (data.data || []).map((m) => m.id);
  }

  return { kind: 'token-factory', models, chat, listModels };
}
