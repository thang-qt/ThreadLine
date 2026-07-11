import { useEffect, useRef, useState } from 'react';
import type { ReaderSettings } from '../../types';

interface QuickSettingsProps {
  settings: ReaderSettings;
  onChange: (settings: ReaderSettings) => void;
}

export function QuickSettings({ settings, onChange }: QuickSettingsProps) {
  const [showSettings, setShowSettings] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showSettings && popoverRef.current && !popoverRef.current.contains(event.target as Node)) setShowSettings(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSettings]);

  return <div className="quick-settings-container" ref={popoverRef}>
    <button className={`quick-settings-trigger ${showSettings ? 'active' : ''}`} onClick={() => setShowSettings(value => !value)} title="Typography & Theme options" aria-haspopup="true" aria-expanded={showSettings}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="gear-icon" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
    </button>
    {showSettings && <div className="quick-settings-popover">
      <div className="popover-row"><span className="popover-label">Theme</span><div className="quick-settings-group themes" role="group" aria-label="Theme selection">
        <button className={`quick-settings-btn theme-light-btn ${settings.theme === 'light' ? 'active' : ''}`} onClick={() => onChange({ ...settings, theme: 'light' })} title="Light Theme">A</button>
        <button className={`quick-settings-btn theme-sepia-btn ${settings.theme === 'sepia' ? 'active' : ''}`} onClick={() => onChange({ ...settings, theme: 'sepia' })} title="Sepia Theme">A</button>
        <button className={`quick-settings-btn theme-dark-btn ${settings.theme === 'dark' ? 'active' : ''}`} onClick={() => onChange({ ...settings, theme: 'dark' })} title="Dark Theme">A</button>
      </div></div>
      <div className="popover-row"><span className="popover-label">Font</span><div className="quick-settings-group fonts" role="group" aria-label="Font selection">
        <button className={`quick-settings-btn ${settings.font === 'serif' ? 'active' : ''}`} onClick={() => onChange({ ...settings, font: 'serif' })}>Serif</button>
        <button className={`quick-settings-btn ${settings.font === 'system' ? 'active' : ''}`} onClick={() => onChange({ ...settings, font: 'system' })}>Sans</button>
        <button className={`quick-settings-btn ${settings.font === 'mono' ? 'active' : ''}`} onClick={() => onChange({ ...settings, font: 'mono' })}>Mono</button>
      </div></div>
      <div className="popover-row"><span className="popover-label">Size</span><div className="quick-settings-group sizes" role="group" aria-label="Font size adjustment">
        <button className="quick-settings-btn" onClick={() => onChange({ ...settings, typeScale: Math.max(0.85, settings.typeScale - 0.05) })} title="Decrease font size">A−</button>
        <span className="current-scale">{Math.round(settings.typeScale * 100)}%</span>
        <button className="quick-settings-btn" onClick={() => onChange({ ...settings, typeScale: Math.min(1.30, settings.typeScale + 0.05) })} title="Increase font size">A+</button>
      </div></div>
    </div>}
  </div>;
}
