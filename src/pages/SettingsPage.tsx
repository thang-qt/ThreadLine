import { SettingsPanel } from '../components/SettingsPanel';
import type { ReaderSettings } from '../types';

export function SettingsPage({ settings, onChange, onReset }: { settings: ReaderSettings; onChange: (settings: ReaderSettings) => void; onReset: () => void }) {
  return <main className="settings-page"><SettingsPanel settings={settings} onChange={onChange} onReset={onReset}/></main>;
}
