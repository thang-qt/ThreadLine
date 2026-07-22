import type { CommentNode, FeedResult, ReaderSettings, Source } from './types';

const FEED_CACHE_PREFIX = 'threadline.feed.v1';
const COMMENTS_CACHE_PREFIX = 'threadline.comments.v1';
const MAX_COMMENTS_AGE_MS = 30 * 60 * 1000;

export interface CachedFeed {
  result: FeedResult;
  cachedAt: number;
}

export interface CachedComments {
  comments: CommentNode[];
  cachedAt: number;
}

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function safeRead<T>(key: string): T | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: unknown): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota/private-mode failures; cache must never block reading.
  }
}

export function feedCacheKey(settings: ReaderSettings): string {
  const enabled = (Object.entries(settings.sourceEnabled) as [Source, boolean][])
    .filter(([, value]) => value)
    .map(([source]) => source)
    .sort()
    .join(',');
  return `${FEED_CACHE_PREFIX}:${settings.hnFeed}:${settings.lobstersFeed}:${enabled}`;
}

export function readCachedFeed(settings: ReaderSettings): CachedFeed | null {
  const cached = safeRead<CachedFeed>(feedCacheKey(settings));
  if (!cached || !Array.isArray(cached.result?.stories) || typeof cached.cachedAt !== 'number') return null;
  return cached;
}

export function writeCachedFeed(settings: ReaderSettings, result: FeedResult): void {
  if (!result.stories.length) return;
  safeWrite(feedCacheKey(settings), { result, cachedAt: Date.now() } satisfies CachedFeed);
}

export function commentsCacheKey(source: Source, sourceId: string): string {
  return `${COMMENTS_CACHE_PREFIX}:${source}:${sourceId}`;
}

export function readCachedComments(source: Source, sourceId: string): CachedComments | null {
  const cached = safeRead<CachedComments>(commentsCacheKey(source, sourceId));
  if (!cached || !Array.isArray(cached.comments) || typeof cached.cachedAt !== 'number') return null;
  if (Date.now() - cached.cachedAt > MAX_COMMENTS_AGE_MS) return null;
  return cached;
}

export function writeCachedComments(source: Source, sourceId: string, comments: CommentNode[]): void {
  safeWrite(commentsCacheKey(source, sourceId), { comments, cachedAt: Date.now() } satisfies CachedComments);
}

const SEEN_COMMENTS_PREFIX = 'threadline.seen.v1';
const SEEN_INDEX_KEY = 'threadline.seen_index.v1';
const MAX_SEEN_THREADS = 100;

export function seenCommentsKey(source: Source, sourceId: string): string {
  return `${SEEN_COMMENTS_PREFIX}:${source}:${sourceId}`;
}

export function hasSeenComments(source: Source, sourceId: string): boolean {
  if (!canUseStorage()) return false;
  return window.localStorage.getItem(seenCommentsKey(source, sourceId)) !== null;
}

export function readSeenComments(source: Source, sourceId: string): string[] {
  const key = seenCommentsKey(source, sourceId);
  const cached = safeRead<string[]>(key);
  if (!Array.isArray(cached)) return [];

  // Update LRU index position
  updateSeenIndex(key);

  return cached;
}

export function writeSeenComments(source: Source, sourceId: string, commentIds: string[]): void {
  const key = seenCommentsKey(source, sourceId);
  safeWrite(key, commentIds);
  updateSeenIndex(key, true);
}

function updateSeenIndex(key: string, isWrite = false): void {
  if (!canUseStorage()) return;
  try {
    const raw = window.localStorage.getItem(SEEN_INDEX_KEY);
    let index: string[] = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(index)) index = [];

    // Remove if already exists to push to front
    index = index.filter(k => k !== key);
    index.unshift(key);

    // Evict oldest if limit exceeded
    if (isWrite && index.length > MAX_SEEN_THREADS) {
      const toRemove = index.slice(MAX_SEEN_THREADS);
      for (const k of toRemove) {
        window.localStorage.removeItem(k);
      }
      index = index.slice(0, MAX_SEEN_THREADS);
    }

    window.localStorage.setItem(SEEN_INDEX_KEY, JSON.stringify(index));
  } catch {
    // Ignore storage issues
  }
}

export function ageLabel(timestamp: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} hr ago`;
}
