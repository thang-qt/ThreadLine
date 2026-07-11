import { describe, expect, it } from 'vitest';
import { normalizeFlatLobstersComments, normalizeHnComments, normalizeNestedLobstersComments } from './normalize';

describe('comment normalization', () => {
  it('normalizes HN empty parents with children', () => {
    const comments = normalizeHnComments([{ id: 1, author: null, text: '', children: [{ id: 2, author: 'a', text: '<p>reply</p>', children: [] }] }]);
    expect(comments).toHaveLength(1);
    expect(comments[0].children[0].author).toBe('a');
  });

  it('builds deterministic flat Lobsters trees with commenting_user', () => {
    const payload = [
      { short_id: 'a', parent_comment: null, comment: '<p>root</p>', commenting_user: 'alice' },
      { short_id: 'b', parent_comment: 'a', comment: '<p>child</p>', commenting_user: 'bob' }
    ];
    const first = normalizeFlatLobstersComments(payload);
    const second = normalizeFlatLobstersComments(payload);
    expect(first).toEqual(second);
    expect(first[0].children[0]).toMatchObject({ id: 'b', author: 'bob' });
  });

  it('keeps Lobsters orphans as roots and disambiguates duplicate ids', () => {
    const comments = normalizeFlatLobstersComments([
      { short_id: 'dup', parent_comment: 'missing', comment: '<p>orphan</p>' },
      { short_id: 'dup', parent_comment: null, comment: '<p>duplicate</p>' }
    ]);
    expect(comments.map(comment => comment.id)).toEqual(['dup', 'dup-2']);
  });

  it('uses stable fallback ids for nested Lobsters comments', () => {
    const payload = [{ comment: '<p>no id</p>', commenting_user: 'zoe', comments: [] }];
    expect(normalizeNestedLobstersComments(payload)[0].id).toBe(normalizeNestedLobstersComments(payload)[0].id);
  });
});
