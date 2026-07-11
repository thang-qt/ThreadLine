import type { HnFeed, LobstersFeed, Source, Story } from '../types';

export const SOURCES = ['hn', 'lobsters'] as const satisfies readonly Source[];
export const HN_FEEDS = ['top', 'best', 'new'] as const satisfies readonly HnFeed[];
export const LOBSTERS_FEEDS = ['hottest', 'newest'] as const satisfies readonly LobstersFeed[];

export type SourceEnabled = Record<Source, boolean>;

export const SOURCE_LABEL: Record<Source, string> = {
  hn: 'Hacker News',
  lobsters: 'Lobsters'
};

export const SOURCE_ORIGIN: Record<Source, string> = {
  hn: 'https://news.ycombinator.com',
  lobsters: 'https://lobste.rs'
};

export function isSource(value: unknown): value is Source {
  return typeof value === 'string' && (SOURCES as readonly string[]).includes(value);
}

export function isHnFeed(value: unknown): value is HnFeed {
  return typeof value === 'string' && (HN_FEEDS as readonly string[]).includes(value);
}

export function isLobstersFeed(value: unknown): value is LobstersFeed {
  return typeof value === 'string' && (LOBSTERS_FEEDS as readonly string[]).includes(value);
}

export function hnHtmlPath(feed: HnFeed): string {
  if (feed === 'new') return 'newest';
  if (feed === 'best') return 'best';
  return 'news';
}

export function hnFirebaseEndpoint(feed: HnFeed): string {
  if (feed === 'best') return 'beststories';
  if (feed === 'new') return 'newstories';
  return 'topstories';
}

export function lobstersHtmlPath(feed: LobstersFeed): string {
  return feed === 'newest' ? 'newest' : '';
}

export function lobstersJsonPath(feed: LobstersFeed): string {
  return `${feed}.json`;
}

export function isAllowedLobstersProxyPath(path: string): boolean {
  return path === 'hottest.json' || path === 'newest.json' || /^s\/[a-z0-9]+\.json$/i.test(path);
}

export function normalizeSourceEnabled(value: Partial<Record<Source, boolean>> | undefined): SourceEnabled {
  const enabled: SourceEnabled = {
    hn: value?.hn !== false,
    lobsters: value?.lobsters !== false
  };
  if (!enabled.hn && !enabled.lobsters) enabled.hn = true;
  return enabled;
}

export function sourceEnabledFromSearch(search: URLSearchParams): SourceEnabled {
  return normalizeSourceEnabled({
    hn: search.get('hnEnabled') !== '0',
    lobsters: search.get('lobstersEnabled') !== '0'
  });
}

export function appendSourceEnabled(search: URLSearchParams, enabled: SourceEnabled): void {
  search.set('hnEnabled', enabled.hn ? '1' : '0');
  search.set('lobstersEnabled', enabled.lobsters ? '1' : '0');
}

export function normalizeHostname(url?: string): string | undefined {
  try {
    return url ? new URL(url).hostname.toLowerCase().replace(/^www\./, '') : undefined;
  } catch {
    return undefined;
  }
}

export function hostnameLabel(url?: string): string | undefined {
  return normalizeHostname(url);
}

export function isDiscussionUrl(url?: string): boolean {
  if (!url) return false;
  return url.includes('news.ycombinator.com/item') || url.includes('lobste.rs/s/');
}

export function articleUrl(story: Story): string | undefined {
  return story.url && !isDiscussionUrl(story.url) ? story.url : undefined;
}

export function sourceLabel(source: Source): string {
  return SOURCE_LABEL[source];
}

export function absolutizeUrl(url: string | undefined, origin: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url, origin).toString();
  } catch {
    return undefined;
  }
}

export function sourceFromParam(source: string | undefined): Source | undefined {
  return isSource(source) ? source : undefined;
}
