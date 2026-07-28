import { describe, expect, it } from 'vitest';
import { nextNewCommentId } from './commentNavigation';

describe('nextNewCommentId', () => {
  it('selects the next new comment after the clicked badge', () => {
    expect(nextNewCommentId(['one', 'two', 'three', 'four'], new Set(['two', 'four']), 'two')).toBe('four');
  });

  it('wraps to the first new comment after the last new badge', () => {
    expect(nextNewCommentId(['one', 'two', 'three', 'four'], new Set(['two', 'four']), 'four')).toBe('two');
  });

  it('returns no target when there are no visible new comments', () => {
    expect(nextNewCommentId(['one', 'two'], new Set(['three']), 'one')).toBeUndefined();
  });
});
