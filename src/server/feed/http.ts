export async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 4500): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error(`${url} timed out`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
