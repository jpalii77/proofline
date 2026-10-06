// Tavily Search API client (https://docs.tavily.com). Called at runtime by the agent to
// discover the business's domain/phone and to look for closure signals.

export function createTavilyClient({ apiKey, fetchImpl = globalThis.fetch, timeoutMs = 15000 }) {
  if (!apiKey) throw new Error('TAVILY_API_KEY is not set');
  return {
    kind: 'tavily',
    async search(query, { maxResults = 5, depth = 'basic' } = {}) {
      try {
        const res = await fetchImpl('https://api.tavily.com/search', {
          method: 'POST',
          headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({ query, max_results: maxResults, search_depth: depth, include_answer: false }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) return { error: `Tavily HTTP ${res.status}` };
        const data = await res.json();
        return {
          results: (data.results || []).map((r) => ({ title: r.title, url: r.url, content: (r.content || '').slice(0, 600), score: r.score })),
        };
      } catch (e) {
        return { error: e.message };
      }
    },
  };
}
