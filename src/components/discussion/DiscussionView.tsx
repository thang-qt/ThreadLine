import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ReaderSettings, Story } from '../../types';
import { articleUrl, sourceLabel } from '../../lib/sources';
import { useComments } from '../../hooks/useComments';
import { useCommentNavigation } from '../../hooks/useCommentNavigation';
import { CommentThread } from './CommentThread';
import { DiscussionToolbar } from './DiscussionToolbar';
import { SplitReader } from '../reader/SplitReader';

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
  const { active, refs, visibleIds, moveFrom } = useCommentNavigation(comments, collapsed);
  const currentArticleUrl = articleUrl(story);

  useEffect(() => setReadHere(initialReadHere), [story.source, story.sourceId, initialReadHere]);

  useEffect(() => {
    if (!overlay) return;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [overlay, onClose]);

  const toggle = (commentId: string) => setCollapsed(old => {
    const next = new Set(old);
    next.has(commentId) ? next.delete(commentId) : next.add(commentId);
    return next;
  });
  const closeReader = () => onClose ? onClose() : setReadHere(false);

  const discussionColumn = <section className="discussion-column" aria-label="Discussion" style={readHere ? { flex: 1 } : undefined}>
    <DiscussionToolbar commentsCount={visibleIds.length} readHere={readHere} settings={settings} onChange={onChange} onCloseReader={closeReader} />
    {loading && comments.length === 0 ? <p className="loader">Fetching discussion…</p> : error && comments.length === 0 ? <p className="error-card">{error}</p> : comments.length ? <ol className="comment-list">{comments.map(node => <CommentThread key={node.id} node={node} depth={0} collapsed={collapsed} active={active} visibleIds={visibleIds} refs={refs} toggle={toggle} moveFrom={moveFrom} storyAuthor={story.author} source={story.source}/>)}</ol> : <p className="muted">No comments yet.</p>}
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
