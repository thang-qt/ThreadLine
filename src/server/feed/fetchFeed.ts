import type { FeedResult, HnFeed, LobstersFeed, Source, Story } from '../../types';
import { hnHtmlPath, lobstersHtmlPath, normalizeSourceEnabled, SOURCE_ORIGIN, type SourceEnabled } from '../../lib/sources';
import { parseHnHtml, parseLobstersHtml } from './parseHtml';
import { fetchHnFirebaseFallback, fetchLobstersJsonFallback } from './normalize';

export interface FetchFeedOptions {
  hn: HnFeed;
  lobsters: LobstersFeed;
  minimumHtmlStories?: number;
  sourceEnabled?: Partial<SourceEnabled>;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { headers: { Accept: 'text/html,application/xhtml+xml' } });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.text();
}

async function scrapeOrFallback(
  source: Source,
  scrape: () => Promise<Story[]>,
  fallback: () => Promise<Story[]>,
  minimumHtmlStories: number
): Promise<{ stories: Story[]; error?: string }> {
  try {
    const stories = await scrape();
    if (stories.length >= minimumHtmlStories) return { stories };
    throw new Error(`${source} parser returned too few stories`);
  } catch (scrapeError) {
    try {
      return { stories: await fallback() };
    } catch (fallbackError) {
      const error = fallbackError instanceof Error ? fallbackError.message : scrapeError instanceof Error ? scrapeError.message : `${source} unavailable`;
      return { stories: [], error };
    }
  }
}

export async function fetchAggregatedFeed(options: FetchFeedOptions): Promise<FeedResult> {
  const minimumHtmlStories = options.minimumHtmlStories ?? 10;
  const sourceEnabled = normalizeSourceEnabled(options.sourceEnabled);
  const jobs: Promise<[Source, { stories: Story[]; error?: string }]>[] = [];

  if (sourceEnabled.hn) {
    jobs.push(scrapeOrFallback(
      'hn',
      () => fetchText(`${SOURCE_ORIGIN.hn}/${hnHtmlPath(options.hn)}`).then(parseHnHtml),
      () => fetchHnFirebaseFallback(options.hn),
      minimumHtmlStories
    ).then(result => ['hn', result] as const));
  }
  if (sourceEnabled.lobsters) {
    jobs.push(scrapeOrFallback(
      'lobsters',
      () => fetchText(`${SOURCE_ORIGIN.lobsters}/${lobstersHtmlPath(options.lobsters)}`).then(parseLobstersHtml),
      () => fetchLobstersJsonFallback(options.lobsters),
      minimumHtmlStories
    ).then(result => ['lobsters', result] as const));
  }

  const results = await Promise.all(jobs);
  const errors: FeedResult['errors'] = {};
  const stories: Story[] = [];
  for (const [source, result] of results) {
    stories.push(...result.stories);
    if (result.error) errors[source] = result.error;
  }
  return { stories, errors };
}
