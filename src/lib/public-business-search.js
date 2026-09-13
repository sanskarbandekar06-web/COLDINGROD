import 'server-only';

/** Search yields candidate pages, never verified contact facts by itself. */
export async function searchPublicBusinessSources(lead) {
  const key = process.env.BRAVE_SEARCH_API_KEY?.trim();
  if (!key) return { urls: [], status: 'not_configured' };
  const name = String(lead.company_name ?? '').replace(/["\r\n]/g, ' ').slice(0,150);
  const location = String(lead.location ?? '').slice(0,150);
  const queries = [`"${name}" ${location} official contact WhatsApp`, `"${name}" ${location} owner founder contact`];
  const urls = new Set();
  let succeeded = false;
  for (const q of queries) {
    try {
      const url = new URL('https://api.search.brave.com/res/v1/web/search');
      url.searchParams.set('q', q);
      url.searchParams.set('count', '5');
      const response = await fetch(url, { headers: { Accept: 'application/json', 'X-Subscription-Token': key },
        cache: 'no-store', signal: AbortSignal.timeout(7000) });
      if (!response.ok) continue;
      const result = await response.json();
      succeeded = true;
      for (const item of result.web?.results ?? []) {
        try {
          const candidate = new URL(item.url);
          if (candidate.protocol === 'https:' && !candidate.username && !candidate.password) urls.add(candidate.toString());
        } catch { /* ignore invalid search results */ }
      }
    } catch { /* website research continues when search is unavailable */ }
  }
  return { urls: [...urls].slice(0,6), status: succeeded ? 'completed' : 'unavailable' };
}
