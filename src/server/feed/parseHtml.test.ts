import { describe, expect, it } from 'vitest';
import hn from './fixtures/hn.html?raw';
import lobsters from './fixtures/lobsters.html?raw';
import { parseHnHtml, parseLobstersHtml } from './parseHtml';

describe('feed html parsers', () => {
  it('parses Hacker News rows', () => {
    const stories = parseHnHtml(hn);
    expect(stories).toHaveLength(2);
    expect(stories[0]).toMatchObject({ id: 'hn-1', sourceId: '1', title: 'Example & Entity', url: 'https://example.com/a?x=1&y=2', author: 'alice', points: 42, commentsCount: 7 });
    expect(stories[1].url).toBe('https://news.ycombinator.com/item?id=2');
  });

  it('uses deterministic epoch timestamps when upstream omits times', () => {
    const stories = parseHnHtml('<tr class="athing submission" id="9"><td class="title"><span class="titleline"><a href="item?id=9">No time</a></span></td></tr><tr><td class="subtext"><span class="score">1 point</span></td></tr>');
    expect(stories[0].createdAt).toBe(new Date(0).toISOString());
  });

  it('parses Lobsters stories with tags and comments', () => {
    const stories = parseLobstersHtml(lobsters);
    expect(stories).toHaveLength(2);
    expect(stories[0]).toMatchObject({ id: 'lobsters-abc123', sourceId: 'abc123', title: 'Lob & Story', author: 'carol', points: 13, commentsCount: 4 });
    expect(stories[0].tags).toEqual(['Lobsters', 'programming', 'security']);
    expect(stories[0].discussionUrl).toBe('https://lobste.rs/s/abc123/lob_story');
    expect(stories[1].url).toBe('https://lobste.rs/s/def456/self');
  });
});
