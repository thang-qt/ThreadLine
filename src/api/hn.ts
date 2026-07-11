import type { CommentNode, HnFeed, Story } from '../types';
import { checkedJson } from './http';
import { hnFirebaseEndpoint } from '../lib/sources';
import { normalizeHnFirebaseStory } from '../feed/normalizeStories';
import { normalizeHnComments } from '../comments/normalize';

const HN_FIREBASE = 'https://hacker-news.firebaseio.com/v0';
const HN_ALGOLIA = 'https://hn.algolia.com/api/v1';

interface AlgoliaItem {
  id?: number | string;
  author?: string | null;
  text?: string | null;
  created_at?: string | null;
  children?: AlgoliaItem[];
}

export async function fetchHackerNewsStories(feed: HnFeed, limit = 45, signal?: AbortSignal): Promise<Story[]> {
  const ids = await checkedJson<unknown>(`${HN_FIREBASE}/${hnFirebaseEndpoint(feed)}.json`, { signal });
  if (!Array.isArray(ids)) throw new Error('Hacker News returned invalid story ids');
  const selectedIds = ids.slice(0, limit);

  const items = await Promise.all(
    selectedIds.map(async (id, index) => {
      try {
        const item = await checkedJson<unknown>(`${HN_FIREBASE}/item/${encodeURIComponent(String(id))}.json`, { signal });
        return normalizeHnFirebaseStory(item, index);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error;
        return null;
      }
    })
  );

  return items.filter((story): story is Story => Boolean(story));
}

export async function fetchHackerNewsComments(story: Story, signal?: AbortSignal): Promise<CommentNode[]> {
  const root = await checkedJson<AlgoliaItem>(`${HN_ALGOLIA}/items/${encodeURIComponent(story.sourceId)}`, { signal });
  return normalizeHnComments(root.children ?? []);
}
