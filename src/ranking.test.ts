import { describe, expect, it } from 'vitest';
import { defaultSettings } from './settings';
import { rankStories } from './ranking';
import type { Story } from './types';

const now = Date.parse('2026-07-11T12:00:00Z');

function story(overrides: Partial<Story>): Story {
  return {
    id: 'hn-1',
    source: 'hn',
    sourceId: '1',
    sourceRank: 0,
    title: 'Example',
    url: 'https://example.com',
    discussionUrl: 'https://news.ycombinator.com/item?id=1',
    author: 'alice',
    points: 10,
    commentsCount: 2,
    createdAt: '2026-07-11T11:00:00Z',
    ...overrides
  };
}

describe('rankStories', () => {
  it('keeps ranking source-relative instead of letting raw HN scores dominate', () => {
    const ranked = rankStories(
      [
        story({ id: 'hn-1', source: 'hn', sourceId: '1', points: 500, commentsCount: 80, sourceRank: 0 }),
        story({ id: 'lobsters-a', source: 'lobsters', sourceId: 'a', points: 25, commentsCount: 10, sourceRank: 0 })
      ],
      defaultSettings,
      now
    );

    expect(ranked.map((item) => item.source)).toEqual(['hn', 'lobsters']);
    expect(ranked[1].rankScore).toBeGreaterThan(ranked[0].rankScore * 0.85);
  });

  it('honors source weights', () => {
    const ranked = rankStories(
      [
        story({ id: 'hn-1', source: 'hn', sourceId: '1', points: 100, sourceRank: 0 }),
        story({ id: 'lobsters-a', source: 'lobsters', sourceId: 'a', points: 8, sourceRank: 0 })
      ],
      { ...defaultSettings, sourceWeight: { hn: 0.25, lobsters: 2 } },
      now
    );

    expect(ranked[0].source).toBe('lobsters');
  });

  it('filters disabled sources', () => {
    const ranked = rankStories(
      [story({ id: 'hn-1', source: 'hn' }), story({ id: 'lobsters-a', source: 'lobsters', sourceId: 'a' })],
      { ...defaultSettings, sourceEnabled: { hn: false, lobsters: true } },
      now
    );

    expect(ranked).toHaveLength(1);
    expect(ranked[0].source).toBe('lobsters');
  });

  it('fair-merges enabled sources after strong runs from one source', () => {
    const ranked = rankStories(
      [
        story({ id: 'hn-1', source: 'hn', sourceId: '1', points: 500, sourceRank: 0 }),
        story({ id: 'hn-2', source: 'hn', sourceId: '2', points: 450, sourceRank: 1 }),
        story({ id: 'hn-3', source: 'hn', sourceId: '3', points: 400, sourceRank: 2 }),
        story({ id: 'hn-4', source: 'hn', sourceId: '4', points: 350, sourceRank: 3 }),
        story({ id: 'lobsters-a', source: 'lobsters', sourceId: 'a', points: 5, sourceRank: 4 })
      ],
      defaultSettings,
      now
    );

    expect(ranked.slice(0, 4).map((item) => item.source)).toEqual(['hn', 'hn', 'hn', 'lobsters']);
  });

  it('boosts active comment threads when comment weight increases', () => {
    const quiet = story({ id: 'hn-quiet', sourceId: 'quiet', commentsCount: 0, points: 50, sourceRank: 1 });
    const busy = story({ id: 'hn-busy', sourceId: 'busy', commentsCount: 80, points: 20, sourceRank: 1 });

    const low = rankStories([quiet, busy], { ...defaultSettings, commentWeight: 0 }, now);
    const high = rankStories([quiet, busy], { ...defaultSettings, commentWeight: 1.2 }, now);

    expect(low[0].id).toBe('hn-quiet');
    expect(high[0].id).toBe('hn-busy');
  });
});
