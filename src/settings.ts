import type { Density, FontChoice, LayoutChoice, ReaderSettings, Source, Theme } from './types';
import { SOURCES, normalizeSourceEnabled as normalizeSharedSourceEnabled } from './lib/sources';

export const defaultSettings: ReaderSettings = {
  theme: 'light',
  font: 'serif',
  typeScale: 1,
  density: 'comfortable',
  columns: 3,
  layout: 'list',
  sourceEnabled: { hn: true, lobsters: true },
  sourceWeight: { hn: 1, lobsters: 1 },
  halfLifeHours: 18,
  commentWeight: 0.35,
  hnFeed: 'top',
  lobstersFeed: 'hottest',
  blockedDomains: [],
  lobstersTags: [],
  highlightThreads: true
};

// Compatibility key from the original HNster name. Do not change without migration.
export const STORAGE_KEY = 'hnster.preferences.v1';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && allowed.includes(value as T) ? (value as T) : fallback;
}

export function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string').map(item => item.trim().toLowerCase()).filter(Boolean))].slice(0, 100);
}

export function parseCommaList(value: string): string[] {
  return normalizeStringList(value.split(','));
}

export function normalizeSourceEnabled(value: unknown): Record<Source, boolean> {
  const record = isRecord(value) ? value : {};
  const enabled = SOURCES.reduce<Record<Source, boolean>>((result, source) => {
    result[source] = typeof record[source] === 'boolean' ? record[source] : defaultSettings.sourceEnabled[source];
    return result;
  }, { ...defaultSettings.sourceEnabled });
  return normalizeSharedSourceEnabled(enabled);
}

function sourceWeights(value: unknown): Record<Source, number> {
  const record = isRecord(value) ? value : {};
  return SOURCES.reduce<Record<Source, number>>((result, source) => {
    result[source] = clampNumber(record[source], defaultSettings.sourceWeight[source], 0, 2);
    return result;
  }, { ...defaultSettings.sourceWeight });
}

export function normalizeSettings(value: unknown): ReaderSettings {
  const record = isRecord(value) ? value : {};
  return {
    theme: enumValue<Theme>(record.theme, ['light', 'dark', 'sepia'], defaultSettings.theme),
    font: enumValue<FontChoice>(record.font, ['system', 'serif', 'mono'], defaultSettings.font),
    typeScale: clampNumber(record.typeScale, defaultSettings.typeScale, 0.85, 1.3),
    density: enumValue<Density>(record.density, ['relaxed', 'comfortable', 'compact'], defaultSettings.density),
    columns: Math.round(clampNumber(record.columns, defaultSettings.columns, 1, 5)),
    layout: enumValue<LayoutChoice>(record.layout, ['newspaper', 'list'], defaultSettings.layout),
    sourceEnabled: normalizeSourceEnabled(record.sourceEnabled),
    sourceWeight: sourceWeights(record.sourceWeight),
    halfLifeHours: Math.round(clampNumber(record.halfLifeHours, defaultSettings.halfLifeHours, 4, 72)),
    commentWeight: clampNumber(record.commentWeight, defaultSettings.commentWeight, 0, 1.5),
    hnFeed: enumValue<ReaderSettings['hnFeed']>(record.hnFeed, ['top', 'best', 'new'], defaultSettings.hnFeed),
    lobstersFeed: enumValue<ReaderSettings['lobstersFeed']>(record.lobstersFeed, ['hottest', 'newest'], defaultSettings.lobstersFeed),
    blockedDomains: normalizeStringList(record.blockedDomains),
    lobstersTags: normalizeStringList(record.lobstersTags),
    highlightThreads: typeof record.highlightThreads === 'boolean' ? record.highlightThreads : defaultSettings.highlightThreads
  };
}

export function toggleSource(settings: ReaderSettings, source: Source, enabled: boolean): ReaderSettings {
  const next = normalizeSourceEnabled({ ...settings.sourceEnabled, [source]: enabled });
  return { ...settings, sourceEnabled: next };
}

export function loadSettings(): ReaderSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeSettings(JSON.parse(raw) as unknown) : defaultSettings;
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(settings: ReaderSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeSettings(settings)));
}

export function resetSettings(): void {
  localStorage.removeItem(STORAGE_KEY);
}
