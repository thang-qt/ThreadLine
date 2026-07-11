import type { HnFeed, LobstersFeed, Story } from '../../types';
import { hnFirebaseEndpoint, lobstersJsonPath, SOURCE_ORIGIN } from '../../lib/sources';
import { normalizeHnFirebaseStory, normalizeLobstersJsonStory } from '../../feed/normalizeStories';

export async function fetchHnFirebaseFallback(feed: HnFeed, limit = 30): Promise<Story[]> {
  const idsResponse = await fetch(`https://hacker-news.firebaseio.com/v0/${hnFirebaseEndpoint(feed)}.json`);
  if (!idsResponse.ok) throw new Error(`Hacker News returned ${idsResponse.status}`);
  const ids = await idsResponse.json() as unknown;
  if (!Array.isArray(ids)) throw new Error('Hacker News returned invalid story ids');
  const items = await Promise.all(ids.slice(0, limit).map(async (id, index) => {
    const response = await fetch(`https://hacker-news.firebaseio.com/v0/item/${encodeURIComponent(String(id))}.json`);
    if (!response.ok) return null;
    return normalizeHnFirebaseStory(await response.json(), index);
  }));
  return items.filter((story): story is Story => story !== null);
}

export async function fetchLobstersJsonFallback(feed: LobstersFeed, limit = 30): Promise<Story[]> {
  const response = await fetch(`${SOURCE_ORIGIN.lobsters}/${lobstersJsonPath(feed)}`, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Lobsters returned ${response.status}`);
  const payload = await response.json() as unknown;
  if (!Array.isArray(payload)) throw new Error('Lobsters returned invalid story list');
  return payload.slice(0, limit).map(normalizeLobstersJsonStory).filter((story): story is Story => story !== null);
}
