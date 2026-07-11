import type { ReaderSettings, Source } from '../../types';
import { SOURCES, sourceLabel } from '../../lib/sources';
import { parseCommaList, toggleSource } from '../../settings';
import { numberValue } from './settingsHelpers';

export function SourceSettings({ settings, onChange }: { settings: ReaderSettings; onChange: (settings: ReaderSettings) => void }) {
  return <div className="settings-section"><h2 className="section-title">Feeds & Sources</h2><div className="settings-grid">
    <div className="settings-control"><span className="control-label">Hacker News feed</span><select value={settings.hnFeed} onChange={e => onChange({ ...settings, hnFeed: e.target.value as ReaderSettings['hnFeed'] })}><option value="top">Top</option><option value="best">Best</option><option value="new">New</option></select></div>
    <div className="settings-control"><span className="control-label">Lobsters feed</span><select value={settings.lobstersFeed} onChange={e => onChange({ ...settings, lobstersFeed: e.target.value as ReaderSettings['lobstersFeed'] })}><option value="hottest">Hottest</option><option value="newest">Newest</option></select></div>
    <label className="settings-control"><span className="control-label">Hide domains</span><input type="text" defaultValue={settings.blockedDomains.join(', ')} placeholder="example.com, news.example.org" onBlur={e => onChange({ ...settings, blockedDomains: parseCommaList(e.target.value) })}/><span className="control-help">Comma-separated. Subdomains are hidden too.</span></label>
    <label className="settings-control"><span className="control-label">Only Lobsters tags</span><input type="text" defaultValue={settings.lobstersTags.join(', ')} placeholder="programming, security" onBlur={e => onChange({ ...settings, lobstersTags: parseCommaList(e.target.value) })}/><span className="control-help">Comma-separated. Leave empty to show every Lobsters tag.</span></label>
  </div>
  <fieldset className="sources-fieldset"><legend className="fieldset-legend">Active sources</legend><p className="section-description">Choose which communities appear in your feed. At least one source must remain active.</p>{SOURCES.map(source => <SourceControl key={source} source={source} settings={settings} onChange={onChange}/>)}</fieldset>
  </div>;
}

function SourceControl({ source, settings, onChange }: { source: Source; settings: ReaderSettings; onChange: (settings: ReaderSettings) => void }) {
  const otherSource = source === 'hn' ? 'lobsters' : 'hn';
  return <div className="source-control">
    <label className="checkbox-container"><input type="checkbox" checked={settings.sourceEnabled[source]} disabled={settings.sourceEnabled[source] && !settings.sourceEnabled[otherSource]} onChange={e => onChange(toggleSource(settings, source, e.target.checked))}/><span className="checkbox-label">{sourceLabel(source)}</span></label>
    <div className="slider-container"><input aria-label={`${source} source weight`} type="range" min="0" max="2" step="0.1" value={settings.sourceWeight[source]} disabled={!settings.sourceEnabled[source]} onChange={e => onChange({ ...settings, sourceWeight: { ...settings.sourceWeight, [source]: numberValue(e.target.value, 1) } })}/><output className="control-output">{settings.sourceWeight[source].toFixed(1)}×</output></div>
  </div>;
}
