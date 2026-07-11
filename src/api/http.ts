export async function checkedJson<T>(url: URL | string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error(`Could not reach ${url.toString()}`);
  }
  if (!response.ok) {
    let detail = '';
    try {
      const payload = await response.json() as { error?: unknown };
      detail = typeof payload.error === 'string' ? payload.error : '';
    } catch { /* ignore non-json errors */ }
    throw new Error(`Request failed with ${response.status}${detail ? `: ${detail}` : ''}`);
  }
  try {
    return await response.json() as T;
  } catch {
    throw new Error('Response was not valid JSON');
  }
}
