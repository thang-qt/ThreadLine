import type { CommentNode, LobstersFeed, Story } from '../types';
import { checkedJson } from './http';
import { normalizeLobstersJsonStory } from '../feed/normalizeStories';
import { normalizeFlatLobstersComments, normalizeNestedLobstersComments, record } from '../comments/normalize';
import { lobstersJsonPath } from '../lib/sources';

const DEFAULT_LOBSTERS_PROXY = '/api/lobsters';

function proxyBase(): string {
  const configured = import.meta.env.VITE_API_PROXY_URL?.trim();
  return (configured || DEFAULT_LOBSTERS_PROXY).replace(/\/+$/, '');
}
function lobstersUrl(path: string): string { return `${proxyBase()}/${path.replace(/^\//, '')}`; }

async function proxyJson(path: string, signal?: AbortSignal): Promise<unknown> {
  try {
    return await checkedJson<unknown>(lobstersUrl(path), { signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error(error instanceof Error ? error.message.replace('Request failed', 'Lobsters proxy returned') : `Could not reach the Lobsters proxy at ${proxyBase()}`);
  }
}

export async function fetchLobstersStories(feed: LobstersFeed, limit = 45, signal?: AbortSignal): Promise<Story[]> {
  const payload = await proxyJson(lobstersJsonPath(feed), signal);
  if (!Array.isArray(payload)) throw new Error('Lobsters proxy returned an unexpected feed payload');
  return payload.slice(0, limit).map(normalizeLobstersJsonStory).filter((story): story is Story => story !== null);
}

export async function fetchLobstersComments(story: Story, signal?: AbortSignal): Promise<CommentNode[]> {
  const detail = record(await proxyJson(`s/${encodeURIComponent(story.sourceId)}.json`, signal));
  if (!detail) throw new Error('Lobsters proxy returned an unexpected discussion payload');
  const comments = Array.isArray(detail.comments) ? detail.comments : [];
  const flat = comments.every(comment => record(comment)) && comments.some(comment => {
    const item = record(comment)!;
    return 'parent_comment' in item || 'parent_comment_id' in item;
  });
  return flat ? normalizeFlatLobstersComments(comments) : normalizeNestedLobstersComments(comments);
}
