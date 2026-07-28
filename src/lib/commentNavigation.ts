export function nextNewCommentId(visibleIds: string[], newCommentIds: Set<string>, fromCommentId?: string): string | undefined {
  const fromIndex = fromCommentId === undefined ? -1 : visibleIds.indexOf(fromCommentId);
  if (fromCommentId !== undefined && fromIndex === -1) return undefined;

  for (let offset = 1; offset <= visibleIds.length; offset += 1) {
    const commentId = visibleIds[(fromIndex + offset) % visibleIds.length];
    if (newCommentIds.has(commentId)) return commentId;
  }

  return undefined;
}
