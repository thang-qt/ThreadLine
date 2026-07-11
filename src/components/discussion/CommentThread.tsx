import type { MutableRefObject } from 'react';
import type { CommentNode, Source } from '../../types';
import { SOURCE_ORIGIN } from '../../lib/sources';
import { timeAgo } from '../../lib/format';
import { sanitizeHtml } from '../../sanitize';

interface CommentThreadProps {
  node: CommentNode;
  depth: number;
  collapsed: Set<string>;
  active: string | null;
  visibleIds: string[];
  refs: MutableRefObject<Map<string, HTMLElement>>;
  toggle: (id: string) => void;
  moveFrom: (id: string, direction: number) => void;
  storyAuthor?: string;
  source: Source;
}

export function CommentThread({ node, depth, collapsed, active, visibleIds, refs, toggle, moveFrom, storyAuthor, source }: CommentThreadProps) {
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsed.has(node.id);
  const isAuthor = Boolean(node.author && storyAuthor && node.author === storyAuthor);
  const visibleIndex = visibleIds.indexOf(node.id);
  const hasPrevious = visibleIndex > 0;
  const hasNext = visibleIndex >= 0 && visibleIndex < visibleIds.length - 1;
  return <li className={`comment ${active === node.id ? 'active' : ''}`}>
    <div className="comment-content" ref={element => { if (element) refs.current.set(node.id, element); }} tabIndex={-1}>
      <div className="comment-byline">
        <button className="comment-toggle" onClick={() => toggle(node.id)} aria-expanded={!isCollapsed} title={isCollapsed ? 'Expand comment' : 'Collapse comment'}>{isCollapsed ? '+' : '−'}</button>
        <strong className={isAuthor ? 'comment-author op' : 'comment-author'}>{node.author ?? 'anonymous'}{isAuthor && <span className="op-badge">OP</span>}</strong>
        <time>{timeAgo(node.createdAt)}</time>
        {hasPrevious && <button onClick={() => moveFrom(node.id, -1)} aria-label={`Previous comment before ${node.author ?? 'anonymous'}`}>↑ prev</button>}
        {hasNext && <button onClick={() => moveFrom(node.id, 1)} aria-label={`Next comment after ${node.author ?? 'anonymous'}`}>↓ next</button>}
      </div>
      {!isCollapsed && <div className="comment-body" dangerouslySetInnerHTML={{ __html: sanitizeHtml(node.html, SOURCE_ORIGIN[source]) }}/>} 
    </div>
    {hasChildren && !isCollapsed && (depth >= 40 ? <p className="muted">Further replies are available on the original thread.</p> : <ol className="comment-list">{node.children.map(child => <CommentThread key={child.id} node={child} depth={depth + 1} collapsed={collapsed} active={active} visibleIds={visibleIds} refs={refs} toggle={toggle} moveFrom={moveFrom} storyAuthor={storyAuthor} source={source}/>)}</ol>)}
  </li>;
}
