import type { FontChoice } from '../types';

export function fontFamily(font: FontChoice): string {
  if (font === 'system') return '"Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  if (font === 'mono') return '"JetBrains Mono", ui-monospace, SFMono-Regular, Roboto Mono, monospace';
  return '"Lora", "Iowan Old Style", Georgia, serif';
}

export function timeAgo(date?: string): string {
  if (!date) return '';
  const timestamp = new Date(date).getTime();
  if (!Number.isFinite(timestamp)) return '';
  const seconds = Math.max(1, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function editionDate(date = new Date()): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  }).format(date);
}
