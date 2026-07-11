import { fetchHackerNewsComments, fetchHackerNewsStories } from './hn';
import { fetchLobstersComments, fetchLobstersStories } from './lobsters';
import { checkedJson } from './http';
import { appendSourceEnabled } from '../lib/sources';
import type { FeedResult, ReaderSettings, Source, Story } from '../types';

export type { FeedResult } from '../types';

function feedApiUrl(settings: ReaderSettings): URL {
  const configured = import.meta.env.VITE_FEED_API_URL?.trim();
  const url = new URL(configured || '/api/feed', window.location.origin);
  url.searchParams.set('hn', settings.hnFeed);
  url.searchParams.set('lobsters', settings.lobstersFeed);
  appendSourceEnabled(url.searchParams, settings.sourceEnabled);
  return url;
}

export async function fetchCombinedFeed(settings: ReaderSettings, signal?: AbortSignal): Promise<FeedResult> {
  try {
    const payload = await checkedJson<FeedResult>(feedApiUrl(settings), { signal });
    if (Array.isArray(payload.stories)) {
      return {
        stories: payload.stories.filter(story => settings.sourceEnabled[story.source]),
        errors: Object.fromEntries(Object.entries(payload.errors ?? {}).filter(([source]) => settings.sourceEnabled[source as Source])) as FeedResult['errors']
      };
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    // Pure static hosts fall back to public APIs below.
  }

  const results = await Promise.allSettled([
    settings.sourceEnabled.hn ? fetchHackerNewsStories(settings.hnFeed, 24, signal) : Promise.resolve([]),
    settings.sourceEnabled.lobsters ? fetchLobstersStories(settings.lobstersFeed, 30, signal) : Promise.resolve([])
  ]);

  const errors: Partial<Record<Source, string>> = {};
  const stories: Story[] = [];

  const [hnResult, lobstersResult] = results;
  if (hnResult.status === 'fulfilled') stories.push(...hnResult.value);
  else errors.hn = hnResult.reason instanceof Error ? hnResult.reason.message : 'Hacker News failed';

  if (lobstersResult.status === 'fulfilled') stories.push(...lobstersResult.value);
  else errors.lobsters = lobstersResult.reason instanceof Error ? lobstersResult.reason.message : 'Lobsters failed';

  return { stories, errors };
}

export async function fetchComments(story: Story, signal?: AbortSignal) {
  return story.source === 'hn' ? fetchHackerNewsComments(story, signal) : fetchLobstersComments(story, signal);
}
