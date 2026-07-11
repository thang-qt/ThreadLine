import type { CommentNode } from '../types';

type UnknownRecord = Record<string, unknown>;

export function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : null;
}
export function string(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return undefined;
}

function stableGeneratedId(prefix: string, path: readonly number[], html: string, author?: string): string {
  let hash = 5381;
  const input = `${author ?? ''}|${html}|${path.join('.')}`;
  for (let i = 0; i < input.length; i += 1) hash = ((hash << 5) + hash) ^ input.charCodeAt(i);
  return `${prefix}-${path.join('-') || 'root'}-${(hash >>> 0).toString(36)}`;
}

function uniqueId(base: string, seen: Map<string, number>): string {
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  return count === 0 ? base : `${base}-${count + 1}`;
}

interface AlgoliaItem {
  id?: number | string;
  author?: string | null;
  text?: string | null;
  created_at?: string | null;
  children?: AlgoliaItem[];
}

export function normalizeHnComments(comments: AlgoliaItem[], path: number[] = [], seen = new Map<string, number>()): CommentNode[] {
  return comments.map((comment, index): CommentNode | null => {
    const currentPath = [...path, index];
    const html = comment.text ?? '';
    const children = normalizeHnComments(comment.children ?? [], currentPath, seen);
    if (!html.trim() && children.length === 0) return null;
    const rawId = comment.id !== undefined ? String(comment.id) : stableGeneratedId('hn-comment', currentPath, html, comment.author ?? undefined);
    return {
      id: uniqueId(rawId, seen),
      author: comment.author ?? undefined,
      html,
      createdAt: comment.created_at ?? undefined,
      children
    } satisfies CommentNode;
  }).filter((comment): comment is CommentNode => comment !== null);
}

export function normalizeNestedLobstersComments(comments: unknown[], path: number[] = [], seen = new Map<string, number>()): CommentNode[] {
  return comments.map((value, index): CommentNode | null => {
    const comment = record(value);
    if (!comment || path.length > 100) return null;
    const currentPath = [...path, index];
    const html = string(comment.comment) ?? string(comment.text) ?? '';
    const rawChildren = Array.isArray(comment.comments) ? comment.comments : Array.isArray(comment.children) ? comment.children : [];
    const children = normalizeNestedLobstersComments(rawChildren, currentPath, seen);
    if (!html.trim() && children.length === 0) return null;
    const author = string(comment.commenting_user) ?? string(comment.commenter_user) ?? string(comment.user);
    const rawId = string(comment.short_id) ?? string(comment.id) ?? stableGeneratedId('lobsters-comment', currentPath, html, author);
    return { id: uniqueId(rawId, seen), author, html, createdAt: string(comment.created_at), children } satisfies CommentNode;
  }).filter((comment): comment is CommentNode => comment !== null);
}

export function normalizeFlatLobstersComments(comments: unknown[]): CommentNode[] {
  const sourceRows = comments.map(record).filter((comment): comment is UnknownRecord => comment !== null);
  const nodes = new Map<string, CommentNode>();
  const parents = new Map<string, string | undefined>();
  const order: string[] = [];
  const seen = new Map<string, number>();

  sourceRows.forEach((comment, index) => {
    const html = string(comment.comment) ?? string(comment.text) ?? '';
    const author = string(comment.commenting_user) ?? string(comment.commenter_user) ?? string(comment.user);
    const rawId = string(comment.short_id) ?? string(comment.id) ?? stableGeneratedId('lobsters-comment', [index], html, author);
    const id = uniqueId(rawId, seen);
    const node = { id, author, html, createdAt: string(comment.created_at), children: [] } satisfies CommentNode;
    nodes.set(id, node);
    order.push(id);
    parents.set(id, string(comment.parent_comment) ?? string(comment.parent_comment_id));
  });

  const roots: CommentNode[] = [];
  const attached = new Set<string>();
  for (const id of order) {
    const node = nodes.get(id);
    if (!node) continue;
    const parent = parents.get(id);
    if (parent && parent !== id && nodes.has(parent) && !wouldCreateCycle(parent, id, parents)) {
      nodes.get(parent)!.children.push(node);
      attached.add(id);
    }
  }
  for (const id of order) {
    const node = nodes.get(id);
    if (!node || attached.has(id)) continue;
    if (!node.html.trim() && node.children.length === 0) continue;
    roots.push(node);
  }
  return pruneEmpty(roots);
}

function wouldCreateCycle(parent: string, child: string, parents: Map<string, string | undefined>): boolean {
  let current: string | undefined = parent;
  const seen = new Set<string>([child]);
  while (current) {
    if (seen.has(current)) return true;
    seen.add(current);
    current = parents.get(current);
  }
  return false;
}

function pruneEmpty(nodes: CommentNode[]): CommentNode[] {
  return nodes.map(node => ({ ...node, children: pruneEmpty(node.children) }))
    .filter(node => node.html.trim() || node.children.length > 0);
}
