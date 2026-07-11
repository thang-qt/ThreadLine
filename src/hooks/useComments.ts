import { useEffect, useState } from 'react';
import { fetchComments } from '../api';
import type { CommentNode, Story } from '../types';

export function useComments(story: Story) {
  const [comments, setComments] = useState<CommentNode[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(undefined);
    fetchComments(story, controller.signal)
      .then(setComments)
      .catch(reason => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setError(reason instanceof Error ? reason.message : 'Could not load comments');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [story.source, story.sourceId]);

  return { comments, error, loading };
}
