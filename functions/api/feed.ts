import type { HnFeed, LobstersFeed } from '../../src/types';
import { fetchAggregatedFeed } from '../../src/server/feed/fetchFeed';
import { isHnFeed, isLobstersFeed, sourceEnabledFromSearch } from '../../src/lib/sources';
import { edgeCache, JSON_HEADERS, jsonError, jsonResponse } from './http';

function parseHnMode(value: string | null): HnFeed | Response {
  if (!value) return 'top';
  if (isHnFeed(value)) return value;
  return jsonError('Unsupported Hacker News feed', 400);
}

function parseLobstersMode(value: string | null): LobstersFeed | Response {
  if (!value) return 'hottest';
  if (isLobstersFeed(value)) return value;
  return jsonError('Unsupported Lobsters feed', 400);
}

export const onRequestOptions: PagesFunction = async () => new Response(null, { status: 204, headers: JSON_HEADERS });

export const onRequestGet: PagesFunction = async (context) => {
  const url = new URL(context.request.url);
  const hn = parseHnMode(url.searchParams.get('hn'));
  if (hn instanceof Response) return hn;
  const lobsters = parseLobstersMode(url.searchParams.get('lobsters'));
  if (lobsters instanceof Response) return lobsters;
  const sourceEnabled = sourceEnabledFromSearch(url.searchParams);

  const cacheUrl = new URL(context.request.url);
  cacheUrl.searchParams.delete('refresh');
  cacheUrl.searchParams.set('hn', hn);
  cacheUrl.searchParams.set('lobsters', lobsters);
  cacheUrl.searchParams.set('hnEnabled', sourceEnabled.hn ? '1' : '0');
  cacheUrl.searchParams.set('lobstersEnabled', sourceEnabled.lobsters ? '1' : '0');
  const cacheKey = new Request(cacheUrl.toString(), context.request);
  const cache = edgeCache();
  const bypassCache = url.searchParams.has('refresh');
  const cached = bypassCache ? undefined : await cache.match(cacheKey);
  if (cached) return cached;

  const payload = await fetchAggregatedFeed({ hn, lobsters, sourceEnabled });
  const status = payload.stories.length ? 200 : 502;
  const response = jsonResponse(payload, {
    status,
    headers: { 'Cache-Control': 'public, max-age=180, stale-while-revalidate=1800' }
  });
  if (payload.stories.length) context.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
};
