import { isAllowedLobstersProxyPath } from '../../../src/lib/sources';
import { edgeCache, JSON_HEADERS, jsonError } from '../http';

const LOBSTERS_ORIGIN = 'https://lobste.rs';

function pathFromParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param.join('/');
  return param ?? '';
}

export const onRequestOptions: PagesFunction = async () => new Response(null, { status: 204, headers: JSON_HEADERS });

export const onRequestGet: PagesFunction = async (context) => {
  const path = pathFromParam(context.params.path);
  if (!isAllowedLobstersProxyPath(path)) return jsonError('Unsupported Lobsters API path', 404);

  const cacheUrl = new URL(context.request.url);
  cacheUrl.search = '';
  const cacheKey = new Request(cacheUrl.toString(), context.request);
  const cache = edgeCache();
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  let upstream: Response;
  try {
    upstream = await fetch(`${LOBSTERS_ORIGIN}/${path}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'threadline-static-reader/0.1 (+https://github.com/)'
      },
      cf: { cacheTtl: path.startsWith('s/') ? 120 : 60, cacheEverything: true }
    });
  } catch {
    return jsonError('Could not reach Lobsters upstream', 502);
  }

  if (!upstream.ok) return jsonError(`Lobsters returned ${upstream.status}`, upstream.status);

  const headers = new Headers(JSON_HEADERS);
  headers.set('Content-Type', upstream.headers.get('Content-Type') ?? 'application/json; charset=utf-8');
  headers.set('Cache-Control', path.startsWith('s/') ? 'public, max-age=120, stale-while-revalidate=600' : 'public, max-age=60, stale-while-revalidate=300');

  const response = new Response(upstream.body, { status: upstream.status, headers });
  context.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
};
