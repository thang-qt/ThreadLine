import { Link } from 'react-router-dom';
import type { RankedStory } from '../types';
import { hostnameLabel, articleUrl, sourceLabel } from '../lib/sources';
import { timeAgo } from '../lib/format';

interface StoryCardProps { story: RankedStory; featured?: boolean; onReadHere?: (story: RankedStory) => void; }

export function StoryCard({ story, featured = false, onReadHere }: StoryCardProps) {
  const host = hostnameLabel(story.url);
  const hasExternalUrl = Boolean(articleUrl(story));
  return <article className={`story-card ${featured ? 'featured' : ''} source-${story.source}`}>
    <div className="story-kicker"><span className={`source-badge badge-${story.source}`}>{sourceLabel(story.source)}</span><span className="story-points">{story.points} pts</span></div>
    <h2 className="story-title">
      <a href={story.url ?? story.discussionUrl} target="_blank" rel="noreferrer noopener" className="story-link">{story.title}</a>
      {host && <span className="title-host">({host})</span>}
      {story.tags && story.tags.length > 1 ? <span className="title-tags">{story.tags.slice(1, 5).map(tag => <span key={tag} className={`tag tag-${tag.toLowerCase()}`}>{tag}</span>)}</span> : null}
    </h2>
    <div className="story-meta">
      <span className="story-author">by {story.author ?? 'unknown'}</span>
      <span className="story-time">{timeAgo(story.createdAt)}</span>
      <span className="meta-separator">•</span>
      <Link to={`/story/${story.source}/${encodeURIComponent(story.sourceId)}`} state={{ story }} className="story-comments-link">{story.commentsCount} comments</Link>
      {hasExternalUrl ? <><span className="meta-separator story-read-separator">•</span><button type="button" className="story-read-link" onClick={() => onReadHere?.(story)}>read here</button></> : null}
    </div>
  </article>;
}
