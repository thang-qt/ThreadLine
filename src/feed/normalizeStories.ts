import type { Story } from '../types';
import { SOURCE_ORIGIN } from '../lib/sources';

type UnknownRecord = Record<string, unknown>;

export function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : null;
}

export function string(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return undefined;
}

export function number(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

function isoFromUnixSeconds(value: unknown): string {
  const parsed = number(value, 0);
  return new Date(parsed > 0 ? parsed * 1000 : 0).toISOString();
}

export function normalizeHnFirebaseStory(value: unknown, index: number): Story | null {
  const item = record(value);
  if (!item || item.deleted || item.dead || item.type !== 'story') return null;
  const id = string(item.id);
  const title = string(item.title);
  if (!id || !title) return null;
  return {
    id: `hn-${id}`,
    source: 'hn',
    sourceId: id,
    sourceRank: index,
    title,
    url: string(item.url) ?? `${SOURCE_ORIGIN.hn}/item?id=${id}`,
    discussionUrl: `${SOURCE_ORIGIN.hn}/item?id=${id}`,
    author: string(item.by),
    points: number(item.score),
    commentsCount: number(item.descendants, Array.isArray(item.kids) ? item.kids.length : 0),
    createdAt: isoFromUnixSeconds(item.time),
    tags: ['HN']
  };
}

export function normalizeLobstersJsonStory(value: unknown, index: number): Story | null {
  const item = record(value);
  if (!item) return null;
  const sourceId = string(item.short_id) ?? string(item.id);
  const title = string(item.title);
  if (!sourceId || !title) return null;
  const tags = Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === 'string') : [];
  const discussionUrl = string(item.comments_url) ?? string(item.short_id_url) ?? `${SOURCE_ORIGIN.lobsters}/s/${sourceId}`;
  return {
    id: `lobsters-${sourceId}`,
    source: 'lobsters',
    sourceId,
    sourceRank: index,
    title,
    url: string(item.url) ?? discussionUrl,
    discussionUrl,
    author: string(item.submitter_user) ?? string(item.user),
    points: number(item.score),
    commentsCount: number(item.comments_count, number(item.comment_count, Array.isArray(item.comments) ? item.comments.length : 0)),
    createdAt: string(item.created_at) ?? new Date(0).toISOString(),
    tags: ['Lobsters', ...tags]
  };
}
