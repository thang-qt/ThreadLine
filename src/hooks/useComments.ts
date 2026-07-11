import { useEffect, useState } from 'react';
import { fetchComments } from '../api';
import { readCachedComments, writeCachedComments } from '../cache';
import type { CommentNode, Story } from '../types';

export function useComments(story: Story) {
  const [comments, setComments] = useState<CommentNode[]>(() => readCachedComments(story.source, story.sourceId)?.comments ?? []);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const cached = readCachedComments(story.source, story.sourceId);
    if (cached) setComments(cached.comments);
    setLoading(true);
    setError(undefined);
    fetchComments(story, controller.signal)
      .then(nextComments => {
        setComments(nextComments);
        writeCachedComments(story.source, story.sourceId, nextComments);
      })
      .catch(reason => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        if (!cached) setComments([]);
        setError(reason instanceof Error ? reason.message : 'Could not load comments');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [story.source, story.sourceId]);

  return { comments, error, loading };
}
