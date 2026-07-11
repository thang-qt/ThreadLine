import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchCombinedFeed, type FeedResult } from '../api';
import { filterStories } from '../feed/filterStories';
import type { ReaderSettings } from '../types';

export function useFeed(settings: ReaderSettings) {
  const [feed, setFeed] = useState<FeedResult>({ stories: [], errors: {} });
  const [loading, setLoading] = useState(true);
  const [refreshToken, setRefreshToken] = useState(0);
  const refresh = useCallback(() => setRefreshToken(value => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetchCombinedFeed(settings, controller.signal)
      .then(result => setFeed(result))
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setFeed({ stories: [], errors: { hn: error instanceof Error ? error.message : 'Feed failed' } });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [settings.hnFeed, settings.lobstersFeed, settings.sourceEnabled.hn, settings.sourceEnabled.lobsters, refreshToken]);

  const filteredStories = useMemo(() => filterStories(feed.stories, settings), [feed.stories, settings]);
  return { feed, filteredStories, loading, refresh };
}
