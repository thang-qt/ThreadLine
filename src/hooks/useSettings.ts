import { useEffect, useState } from 'react';
import type { ReaderSettings } from '../types';
import { defaultSettings, loadSettings, resetSettings, saveSettings } from '../settings';

export function useSettings() {
  const [settings, setSettings] = useState<ReaderSettings>(loadSettings);
  useEffect(() => saveSettings(settings), [settings]);
  const reset = () => {
    resetSettings();
    setSettings(defaultSettings);
  };
  return { settings, setSettings, reset };
}
