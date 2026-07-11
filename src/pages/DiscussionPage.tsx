import { useLocation, useParams } from 'react-router-dom';
import { DiscussionView } from '../components/discussion/DiscussionView';
import { NotFoundPage } from './NotFoundPage';
import { sourceFromParam, SOURCE_ORIGIN } from '../lib/sources';
import type { ReaderSettings, Story } from '../types';

export function DiscussionPage({ settings, onChange }: { settings: ReaderSettings; onChange: (settings: ReaderSettings) => void }) {
  const { source, id } = useParams();
  const location = useLocation();
  const sourceName = sourceFromParam(source);
  if (!sourceName || !id) return <NotFoundPage />;
  const autoRead = new URLSearchParams(location.search).get('read') === '1' || Boolean((location.state as { autoRead?: boolean } | null)?.autoRead);
  const passed = (location.state as { story?: Story } | null)?.story;
  const story: Story = passed && passed.sourceId === id ? passed : {
    id: `${sourceName}-${id}`,
    source: sourceName,
    sourceId: id,
    sourceRank: 0,
    title: 'Discussion',
    discussionUrl: sourceName === 'lobsters' ? `${SOURCE_ORIGIN.lobsters}/s/${id}` : `${SOURCE_ORIGIN.hn}/item?id=${id}`,
    points: 0,
    commentsCount: 0,
    createdAt: new Date().toISOString()
  };

  return <main><DiscussionView story={story} settings={settings} onChange={onChange} initialReadHere={autoRead} /></main>;
}
