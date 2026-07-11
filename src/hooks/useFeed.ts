import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchCombinedFeed, type FeedResult } from '../api';
import { readCachedFeed, writeCachedFeed } from '../cache';
import { filterStories } from '../feed/filterStories';
import type { ReaderSettings } from '../types';

export function useFeed(settings: ReaderSettings) {
  const [feed, setFeed] = useState<FeedResult>(() => readCachedFeed(settings)?.result ?? { stories: [], errors: {} });
  const [cacheTimestamp, setCacheTimestamp] = useState<number | null>(() => readCachedFeed(settings)?.cachedAt ?? null);
  const [loading, setLoading] = useState(true);
  const [refreshToken, setRefreshToken] = useState(0);
  const refresh = useCallback(() => setRefreshToken(value => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    const cached = readCachedFeed(settings);
    if (cached) {
      setFeed(cached.result);
      setCacheTimestamp(cached.cachedAt);
    }
    setLoading(true);
    fetchCombinedFeed(settings, controller.signal, { bypassCache: refreshToken > 0 })
      .then(result => {
        setFeed(result);
        setCacheTimestamp(Date.now());
        writeCachedFeed(settings, result);
      })
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setFeed(current => current.stories.length ? { ...current, errors: { ...current.errors, hn: error instanceof Error ? error.message : 'Feed refresh failed' } } : { stories: [], errors: { hn: error instanceof Error ? error.message : 'Feed failed' } });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [settings.hnFeed, settings.lobstersFeed, settings.sourceEnabled.hn, settings.sourceEnabled.lobsters, refreshToken]);

  const filteredStories = useMemo(() => filterStories(feed.stories, settings), [feed.stories, settings]);
  return { feed, filteredStories, loading, refresh, cacheTimestamp };
}
