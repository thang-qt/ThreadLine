import type { ReaderSettings } from '../types';
import { AppearanceSettings } from './settings/AppearanceSettings';
import { SourceSettings } from './settings/SourceSettings';
import { RankingSettings } from './settings/RankingSettings';

interface SettingsPanelProps {
  settings: ReaderSettings;
  onChange: (settings: ReaderSettings) => void;
  onReset: () => void;
}

export function SettingsPanel({ settings, onChange, onReset }: SettingsPanelProps) {
  return <section className="settings-panel" aria-labelledby="settings-title">
    <div className="settings-header"><p className="eyebrow">Local Preferences</p><h1 id="settings-title">Reading settings</h1><p className="settings-subtitle">Stored locally in your browser. These settings adjust layout, typography, and feed ranking.</p></div>
    <AppearanceSettings settings={settings} onChange={onChange}/>
    <SourceSettings settings={settings} onChange={onChange}/>
    <RankingSettings settings={settings} onChange={onChange}/>
    <div className="settings-actions"><button type="button" className="reset-button" onClick={onReset}>Reset all preferences</button></div>
  </section>;
}
