import { describe, expect, it } from 'vitest';
import { appendSourceEnabled, hnHtmlPath, isAllowedLobstersProxyPath, isHnFeed, isLobstersFeed, lobstersHtmlPath, normalizeSourceEnabled, sourceEnabledFromSearch, sourceFromParam } from './sources';

describe('source and feed helpers', () => {
  it('validates source and feed params without silently coercing invalid values', () => {
    expect(sourceFromParam('hn')).toBe('hn');
    expect(sourceFromParam('lobsters')).toBe('lobsters');
    expect(sourceFromParam('reddit')).toBeUndefined();
    expect(isHnFeed('best')).toBe(true);
    expect(isHnFeed('hottest')).toBe(false);
    expect(isLobstersFeed('newest')).toBe(true);
    expect(isLobstersFeed('new')).toBe(false);
  });

  it('maps feed modes to frontend paths', () => {
    expect(hnHtmlPath('top')).toBe('news');
    expect(hnHtmlPath('best')).toBe('best');
    expect(hnHtmlPath('new')).toBe('newest');
    expect(lobstersHtmlPath('hottest')).toBe('');
    expect(lobstersHtmlPath('newest')).toBe('newest');
  });

  it('keeps at least one enabled source when parsing API source intent', () => {
    const disabledBoth = new URLSearchParams('hnEnabled=0&lobstersEnabled=0');
    expect(sourceEnabledFromSearch(disabledBoth)).toEqual({ hn: true, lobsters: false });
    expect(normalizeSourceEnabled({ hn: false, lobsters: true })).toEqual({ hn: false, lobsters: true });

    const search = new URLSearchParams();
    appendSourceEnabled(search, { hn: false, lobsters: true });
    expect(search.toString()).toBe('hnEnabled=0&lobstersEnabled=1');
  });

  it('allows only safe Lobsters proxy paths', () => {
    expect(isAllowedLobstersProxyPath('hottest.json')).toBe(true);
    expect(isAllowedLobstersProxyPath('newest.json')).toBe(true);
    expect(isAllowedLobstersProxyPath('s/abc123.json')).toBe(true);
    expect(isAllowedLobstersProxyPath('s/../../x.json')).toBe(false);
    expect(isAllowedLobstersProxyPath('domains/example.com')).toBe(false);
  });
});
