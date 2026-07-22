import { useMemo, useRef, useState } from 'react';
import type { CommentNode } from '../types';

export function useCommentNavigation(comments: CommentNode[], collapsed: Set<string>) {
  const [active, setActive] = useState<string | null>(null);
  const refs = useRef(new Map<string, HTMLElement>());
  const visibleIds = useMemo(() => {
    const result: string[] = [];
    const visit = (nodes: CommentNode[]) => nodes.forEach(node => {
      result.push(node.id);
      if (!collapsed.has(node.id)) visit(node.children);
    });
    visit(comments);
    return result;
  }, [comments, collapsed]);

  const focusId = (commentId: string) => {
    setActive(commentId);
    requestAnimationFrame(() => {
      const element = refs.current.get(commentId);
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element?.focus({ preventScroll: true });
    });
  };

  const moveFrom = (commentId: string, direction: number) => {
    const current = visibleIds.indexOf(commentId);
    const next = visibleIds[Math.max(0, Math.min(visibleIds.length - 1, current + direction))];
    if (next) focusId(next);
  };

  return { active, refs, visibleIds, moveFrom, focusId };
}
