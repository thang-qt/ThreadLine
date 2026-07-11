import { describe, expect, it } from 'vitest';
import { safeAbsoluteHref, sanitizeHtml } from './sanitize';

describe('sanitize helpers', () => {
  it('resolves safe relative comment links against the source origin', () => {
    expect(safeAbsoluteHref('item?id=1', 'https://news.ycombinator.com')).toBe('https://news.ycombinator.com/item?id=1');
    expect(safeAbsoluteHref('/s/abc/story', 'https://lobste.rs')).toBe('https://lobste.rs/s/abc/story');
  });

  it('rejects unsafe href protocols', () => {
    expect(safeAbsoluteHref('javascript:alert(1)', 'https://news.ycombinator.com')).toBeUndefined();
    expect(safeAbsoluteHref('data:text/html,hello', 'https://lobste.rs')).toBeUndefined();
  });

  it('escapes html in non-DOM environments', () => {
    expect(sanitizeHtml('<img src=x onerror=alert(1)>hi')).toBe('&lt;img src=x onerror=alert(1)&gt;hi');
  });
});
