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
    const res = await fetchImpl(new URL('chat/completions', root), {
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
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Token Factory HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? '';
    return {
      json: parseJsonReply(content),
      model,
      usage: data.usage || null,
      ms: Date.now() - started,
    };
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
