import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../settings';
import type { Story } from '../types';
import { domainIsBlocked, filterStories } from './filterStories';

const baseStory: Story = { id: 'hn-1', source: 'hn', sourceId: '1', sourceRank: 0, title: 'Story', url: 'https://example.com/a', discussionUrl: 'https://news.ycombinator.com/item?id=1', points: 1, commentsCount: 0, createdAt: new Date(0).toISOString(), tags: ['HN'] };
const lobstersStory: Story = { ...baseStory, id: 'lobsters-a', source: 'lobsters', sourceId: 'a', discussionUrl: 'https://lobste.rs/s/a', tags: ['Lobsters', 'programming', 'security'] };

describe('filterStories', () => {
  it('blocks exact domains, www, and subdomains without blocking lookalikes', () => {
    expect(domainIsBlocked('example.com', ['example.com'])).toBe(true);
    expect(domainIsBlocked('www.example.com', ['example.com'])).toBe(true);
    expect(domainIsBlocked('blog.example.com', ['example.com'])).toBe(true);
    expect(domainIsBlocked('badexample.com', ['example.com'])).toBe(false);
  });

  it('keeps malformed or self-post urls visible', () => {
    const story = { ...baseStory, url: 'not a url' };
    expect(filterStories([story], { ...defaultSettings, blockedDomains: ['example.com'] })).toHaveLength(1);
  });

  it('honors source disabling', () => {
    expect(filterStories([baseStory, lobstersStory], { ...defaultSettings, sourceEnabled: { hn: false, lobsters: true } })).toEqual([lobstersStory]);
  });

  it('filters Lobsters by matching any selected tag case-insensitively', () => {
    expect(filterStories([baseStory, lobstersStory], { ...defaultSettings, lobstersTags: ['SECURITY'] })).toContain(lobstersStory);
    expect(filterStories([lobstersStory], { ...defaultSettings, lobstersTags: ['linux'] })).toHaveLength(0);
    expect(filterStories([lobstersStory], { ...defaultSettings, lobstersTags: [] })).toHaveLength(1);
  });
});
