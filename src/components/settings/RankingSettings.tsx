import type { ReaderSettings } from '../../types';
import { numberValue } from './settingsHelpers';

export function RankingSettings({ settings, onChange }: { settings: ReaderSettings; onChange: (settings: ReaderSettings) => void }) {
  return <div className="settings-section"><h2 className="section-title">Algorithm Tuning</h2><p className="section-description">Tune the combined feed ranking score based on age and discussion activity.</p><div className="settings-grid">
    <div className="settings-control"><div className="control-header"><span className="control-label">Decay half-life</span><output className="control-output">{settings.halfLifeHours}h</output></div><input type="range" min="4" max="72" value={settings.halfLifeHours} onChange={e => onChange({ ...settings, halfLifeHours: numberValue(e.target.value, settings.halfLifeHours) })}/></div>
    <div className="settings-control"><div className="control-header"><span className="control-label">Comment engagement weight</span><output className="control-output">{settings.commentWeight.toFixed(2)}</output></div><input type="range" min="0" max="1.5" step="0.05" value={settings.commentWeight} onChange={e => onChange({ ...settings, commentWeight: numberValue(e.target.value, settings.commentWeight) })}/></div>
  </div></div>;
}
