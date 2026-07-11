export const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  Vary: 'Origin'
};

export function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  return Response.json(value, { ...init, headers: { ...JSON_HEADERS, ...(init.headers ?? {}) } });
}

export function jsonError(message: string, status: number): Response {
  return jsonResponse({ error: message }, { status });
}

export function edgeCache(): Cache {
  return (caches as unknown as { default: Cache }).default;
}
