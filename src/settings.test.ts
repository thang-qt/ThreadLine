import { describe, expect, it } from 'vitest';
import { defaultSettings, normalizeSettings, normalizeSourceEnabled, parseCommaList, STORAGE_KEY, toggleSource } from './settings';

describe('settings normalization', () => {
  it('documents storage compatibility key', () => {
    expect(STORAGE_KEY).toBe('hnster.preferences.v1');
  });

  it('falls back from corrupt shapes and clamps values', () => {
    const settings = normalizeSettings({ theme: 'bad', columns: 99, typeScale: 2, sourceWeight: { hn: -1, lobsters: 10 } });
    expect(settings.theme).toBe(defaultSettings.theme);
    expect(settings.columns).toBe(5);
    expect(settings.typeScale).toBe(1.3);
    expect(settings.sourceWeight).toEqual({ hn: 0, lobsters: 2 });
  });

  it('deduplicates and lowercases list preferences', () => {
    expect(normalizeSettings({ blockedDomains: [' Example.COM ', 'example.com', '', 1], lobstersTags: ['Security', 'security'] }).blockedDomains).toEqual(['example.com']);
    expect(parseCommaList('A, b, a')).toEqual(['a', 'b']);
  });

  it('never allows all sources disabled', () => {
    expect(normalizeSourceEnabled({ hn: false, lobsters: false })).toEqual({ hn: true, lobsters: false });
    expect(toggleSource({ ...defaultSettings, sourceEnabled: { hn: true, lobsters: false } }, 'hn', false).sourceEnabled).toEqual({ hn: true, lobsters: false });
  });
});
