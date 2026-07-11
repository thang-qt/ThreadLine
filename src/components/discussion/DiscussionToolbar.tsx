import type { ReaderSettings } from '../../types';
import { QuickSettings } from '../reader/QuickSettings';

interface DiscussionToolbarProps {
  commentsCount: number;
  readHere: boolean;
  settings: ReaderSettings;
  onChange: (settings: ReaderSettings) => void;
  onCloseReader: () => void;
}

export function DiscussionToolbar({ commentsCount, readHere, settings, onChange, onCloseReader }: DiscussionToolbarProps) {
  return <div className="discussion-heading">
    <h2>Discussion</h2>
    <div className="discussion-meta-group">
      <span className="comments-count">{commentsCount} comments</span>
      <QuickSettings settings={settings} onChange={onChange} />
      {readHere && <button className="reader-close-btn" onClick={onCloseReader} title="Close split reader" aria-label="Close reader and return to feed">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="close-icon" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>}
    </div>
  </div>;
}
