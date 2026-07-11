import { useMemo, useRef, useState } from 'react';
import { StoryCard } from '../components/StoryCard';
import { DiscussionView } from '../components/discussion/DiscussionView';
import { editionDate } from '../lib/format';
import { rankStories } from '../ranking';
import { useFeed } from '../hooks/useFeed';
import type { ReaderSettings, Story } from '../types';

export function FeedPage({ settings, onChange }: { settings: ReaderSettings; onChange: (settings: ReaderSettings) => void }) {
  const [readerStory, setReaderStory] = useState<Story | null>(null);
  const readerReturnFocus = useRef<HTMLElement | null>(null);
  const { feed, filteredStories, loading, refresh } = useFeed(settings);
  const openReader = (story: Story) => {
    readerReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setReaderStory(story);
  };
  const closeReader = () => {
    setReaderStory(null);
    requestAnimationFrame(() => readerReturnFocus.current?.focus());
  };
  const ranked = useMemo(() => rankStories(filteredStories, settings), [filteredStories, settings]);

  return <main className="front-page">
    <div className="edition-bar">
      <strong>{editionDate()}</strong>
      <div className="edition-actions">
        <div className="layout-switcher" role="group" aria-label="Layout view selection">
          <button className={`layout-btn ${settings.layout === 'list' ? 'active' : ''}`} onClick={() => onChange({ ...settings, layout: 'list' })} title="Classic List view">List</button>
          <button className={`layout-btn ${settings.layout === 'newspaper' ? 'active' : ''}`} onClick={() => onChange({ ...settings, layout: 'newspaper' })} title="Newspaper Grid view">Grid</button>
        </div>
        <button className="text-button refresh-btn" onClick={refresh}>Refresh</button>
      </div>
    </div>
    {Object.entries(feed.errors).map(([source, error]) => <aside className="notice" key={source}><strong>{source === 'hn' ? 'Hacker News' : 'Lobsters'} unavailable.</strong> {error}</aside>)}
    {loading ? <p className="loader">Loading today’s stories…</p> : ranked.length ? (
      settings.layout === 'list' ? <section className="list-layout" aria-label="Combined news feed">
        {ranked.map((story, index) => <div key={story.id} className="list-row"><span className="story-rank">{index + 1}</span><StoryCard story={story} featured={false} onReadHere={openReader}/></div>)}
      </section> : <section className="newspaper-grid" aria-label="Combined news feed">
        {ranked.map((story, index) => <StoryCard key={story.id} story={story} featured={index === 0} onReadHere={openReader}/>) }
      </section>
    ) : <section className="empty-state"><h1>No stories available</h1><p>Enable a source or check the Lobsters proxy.</p></section>}
    {readerStory && <DiscussionView story={readerStory} settings={settings} onChange={onChange} initialReadHere overlay onClose={closeReader} />}
  </main>;
}
