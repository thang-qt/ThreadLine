import { afterEach, describe, expect, it, vi } from 'vitest';
import lobsters from './fixtures/lobsters.html?raw';
import { fetchAggregatedFeed } from './fetchFeed';

describe('fetchAggregatedFeed source selection', () => {
  afterEach(() => vi.restoreAllMocks());

  it('skips disabled upstreams and omits disabled-source errors', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith('https://lobste.rs/')) return new Response(lobsters, { status: 200 });
      return new Response('disabled source should not be fetched', { status: 500 });
    });

    const result = await fetchAggregatedFeed({ hn: 'top', lobsters: 'hottest', sourceEnabled: { hn: false, lobsters: true }, minimumHtmlStories: 1 });

    expect(result.errors).toEqual({});
    expect(result.stories.every(story => story.source === 'lobsters')).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://lobste.rs/');
  });
});
