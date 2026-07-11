import { describe, expect, it } from 'vitest';
import { normalizeHnFirebaseStory, normalizeLobstersJsonStory } from './normalizeStories';

describe('story JSON normalizers', () => {
  it('uses deterministic conservative timestamps when JSON time is missing', () => {
    expect(normalizeHnFirebaseStory({ id: 1, type: 'story', title: 'HN' }, 0)?.createdAt).toBe(new Date(0).toISOString());
    expect(normalizeLobstersJsonStory({ short_id: 'a', title: 'Lobsters' }, 0)?.createdAt).toBe(new Date(0).toISOString());
  });
});
