import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CommentNode, ReaderSettings, Story } from '../../types';
import { articleUrl, sourceLabel } from '../../lib/sources';
import { useComments } from '../../hooks/useComments';
import { useCommentNavigation } from '../../hooks/useCommentNavigation';
import { CommentThread } from './CommentThread';
import { DiscussionToolbar } from './DiscussionToolbar';
import { SplitReader } from '../reader/SplitReader';
import { hasSeenComments, readSeenComments, writeSeenComments } from '../../cache';

interface DiscussionViewProps {
  story: Story;
  settings: ReaderSettings;
  onChange: (settings: ReaderSettings) => void;
  initialReadHere?: boolean;
  overlay?: boolean;
  onClose?: () => void;
}

export function DiscussionView({ story, settings, onChange, initialReadHere = false, overlay = false, onClose }: DiscussionViewProps) {
  const [collapsed, setCollapsed] = useState(new Set<string>());
  const [readHere, setReadHere] = useState(initialReadHere);
  const dialogRef = useRef<HTMLDivElement>(null);
  const { comments, error, loading } = useComments(story);
  const { active, refs, visibleIds, moveFrom, focusId } = useCommentNavigation(comments, collapsed);
  const currentArticleUrl = articleUrl(story);

  const [newCommentIds, setNewCommentIds] = useState<Set<string>>(new Set());
  const initialSeenIdsRef = useRef<Set<string> | null>(null);
  const currentStoryKeyRef = useRef<string>('');

  const storyKey = `${story.source}:${story.sourceId}`;

  // Reset session refs if the user switches stories
  if (currentStoryKeyRef.current !== storyKey) {
    currentStoryKeyRef.current = storyKey;
    initialSeenIdsRef.current = null;
    setNewCommentIds(new Set());
  }

  useEffect(() => {
    if (loading || comments.length === 0) return;

    const getFlatCommentIds = (nodes: CommentNode[]): string[] => {
      const ids: string[] = [];
      const traverse = (list: CommentNode[]) => {
        for (const node of list) {
          ids.push(node.id);
          if (node.children) traverse(node.children);
        }
      };
      traverse(nodes);
      return ids;
    };

    const currentIds = getFlatCommentIds(comments);

    if (initialSeenIdsRef.current === null) {
      const hasHistory = hasSeenComments(story.source, story.sourceId);
      if (!hasHistory) {
        writeSeenComments(story.source, story.sourceId, currentIds);
        initialSeenIdsRef.current = new Set(currentIds);
        setNewCommentIds(new Set());
      } else {
        const seenIds = readSeenComments(story.source, story.sourceId);
        const seenSet = new Set(seenIds);
        initialSeenIdsRef.current = seenSet;

        const newIds = currentIds.filter(id => !seenSet.has(id));
        setNewCommentIds(new Set(newIds));

        const updatedSeen = new Set([...seenIds, ...currentIds]);
        writeSeenComments(story.source, story.sourceId, Array.from(updatedSeen));
      }
    } else {
      const seenSet = initialSeenIdsRef.current;
      const newIds = currentIds.filter(id => !seenSet.has(id));
      setNewCommentIds(new Set(newIds));

      const currentSeen = readSeenComments(story.source, story.sourceId);
      const updatedSeen = new Set([...currentSeen, ...currentIds]);
      writeSeenComments(story.source, story.sourceId, Array.from(updatedSeen));
    }
  }, [storyKey, comments, loading]);

  useEffect(() => setReadHere(initialReadHere), [story.source, story.sourceId, initialReadHere]);

  useEffect(() => {
    if (!overlay) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    dialogRef.current?.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [overlay, onClose]);

  const toggle = (commentId: string) => setCollapsed(old => {
    const next = new Set(old);
    next.has(commentId) ? next.delete(commentId) : next.add(commentId);
    return next;
  });
  const closeReader = () => onClose ? onClose() : setReadHere(false);

  const jumpToNextNew = () => {
    const visibleNewIds = visibleIds.filter(id => newCommentIds.has(id));
    if (visibleNewIds.length === 0) return;

    let targetId = visibleNewIds[0];
    if (active) {
      const currentIndex = visibleNewIds.indexOf(active);
      if (currentIndex !== -1 && currentIndex < visibleNewIds.length - 1) {
        targetId = visibleNewIds[currentIndex + 1];
      } else {
        const activeIndex = visibleIds.indexOf(active);
        const nextNew = visibleNewIds.find(id => visibleIds.indexOf(id) > activeIndex);
        if (nextNew) {
          targetId = nextNew;
        }
      }
    }
    focusId(targetId);
  };

  const discussionColumn = <section className="discussion-column" aria-label="Discussion" style={readHere ? { flex: 1 } : undefined}>
    <DiscussionToolbar commentsCount={visibleIds.length} newCommentsCount={newCommentIds.size} onJumpToNextNew={jumpToNextNew} readHere={readHere} settings={settings} onChange={onChange} onCloseReader={closeReader} />
    {loading && comments.length === 0 ? <p className="loader">Fetching discussion…</p> : error && comments.length === 0 ? <p className="error-card">{error}</p> : comments.length ? <ol className="comment-list">{comments.map(node => <CommentThread key={node.id} node={node} depth={0} collapsed={collapsed} active={active} visibleIds={visibleIds} refs={refs} toggle={toggle} moveFrom={moveFrom} storyAuthor={story.author} source={story.source} newCommentIds={newCommentIds} onJumpToNextNew={jumpToNextNew}/>)}</ol> : <p className="muted">No comments yet.</p>}
  </section>;

  return <div className={`discussion-page ${readHere ? 'reading' : ''} ${overlay ? 'discussion-overlay' : ''}`} ref={dialogRef} role={overlay ? 'dialog' : undefined} aria-modal={overlay ? true : undefined} aria-label={overlay ? `${story.title} reader and discussion` : undefined} tabIndex={overlay ? -1 : undefined}>
    {!overlay && <header className="story-header">
      <Link to="/" className="back">← Front page</Link>
      <p className="section-label">{sourceLabel(story.source)}</p>
      <h1>{story.title}</h1>
      <div className="story-actions">
        {currentArticleUrl && <button className={`read-here-action ${readHere ? 'selected' : ''}`} onClick={() => setReadHere(value => !value)}>{readHere ? 'Close reader' : 'Read here'}</button>}
        {currentArticleUrl && <a href={currentArticleUrl} target="_blank" rel="noreferrer">Open article ↗</a>}
        <a href={story.discussionUrl} target="_blank" rel="noreferrer">Original discussion ↗</a>
      </div>
    </header>}
    {readHere && currentArticleUrl ? <SplitReader articleUrl={currentArticleUrl} title={story.title}>{discussionColumn}</SplitReader> : <div className="reading-layout">{discussionColumn}</div>}
  </div>;
}
