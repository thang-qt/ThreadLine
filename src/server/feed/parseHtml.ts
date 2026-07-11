import type { Story } from '../../types';
import { absolutizeUrl, SOURCE_ORIGIN } from '../../lib/sources';

const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#x27': "'",
  '#39': "'",
  nbsp: ' '
};

export function decodeHtml(value = ''): string {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x?[\da-f]+|\w+);/gi, (_, key: string) => {
      const normalized = key.toLowerCase();
      if (HTML_ENTITIES[normalized]) return HTML_ENTITIES[normalized];
      if (normalized.startsWith('#x')) return String.fromCodePoint(Number.parseInt(normalized.slice(2), 16));
      if (normalized.startsWith('#')) return String.fromCodePoint(Number.parseInt(normalized.slice(1), 10));
      return `&${key};`;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function isoFromUnixSeconds(value: string | undefined): string {
  const parsed = Number(value);
  return new Date(Number.isFinite(parsed) && parsed > 0 ? parsed * 1000 : 0).toISOString();
}

export function parseHnHtml(html: string): Story[] {
  const rows = [...html.matchAll(/<tr class="athing[^>]*" id="(\d+)"[^>]*>([\s\S]*?)<\/tr>\s*<tr>([\s\S]*?)<\/tr>/g)];
  return rows.map((match, index): Story | null => {
    const [, id, titleRow, subRow] = match;
    const link = titleRow.match(/class="titleline">\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    const title = decodeHtml(link?.[2]);
    if (!title) return null;
    const rawUrl = decodeHtml(link?.[1] ?? `item?id=${id}`);
    const url = absolutizeUrl(rawUrl, SOURCE_ORIGIN.hn) ?? `${SOURCE_ORIGIN.hn}/item?id=${id}`;
    const epoch = subRow.match(/class="age" title="[^"]*\s(\d+)"/);
    return {
      id: `hn-${id}`,
      source: 'hn' as const,
      sourceId: id,
      sourceRank: index,
      title,
      url,
      discussionUrl: `${SOURCE_ORIGIN.hn}/item?id=${id}`,
      author: decodeHtml(subRow.match(/class="hnuser"[^>]*>([\s\S]*?)<\/a>/)?.[1]) || undefined,
      points: Number(subRow.match(/class="score"[^>]*>(\d+)/)?.[1] ?? 0),
      commentsCount: Number(subRow.match(/>(\d+)(?:&nbsp;|\s)+comments?<\/a>/)?.[1] ?? 0),
      createdAt: isoFromUnixSeconds(epoch?.[1]),
      tags: ['HN']
    } satisfies Story;
  }).filter((story): story is Story => story !== null);
}

export function parseLobstersHtml(html: string): Story[] {
  const blocks = [...html.matchAll(/<li id="story_([a-z0-9]+)"([\s\S]*?)(?=<li id="story_|<\/ol>)/gi)];
  return blocks.map((match, index): Story | null => {
    const id = match[1];
    const block = match[0];
    const link = block.match(/<a class="u-url" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    const title = decodeHtml(link?.[2]);
    if (!title) return null;
    const discussion = block.match(/class="comments_label"[\s\S]*?<a[^>]+href="([^"]+)"/);
    const epoch = block.match(/data-at-unix="(\d+)"/);
    const tags = [...block.matchAll(/class="tag [^"]+"[^>]*>([^<]+)<\/a>/g)].map(tag => decodeHtml(tag[1])).filter(Boolean);
    return {
      id: `lobsters-${id}`,
      source: 'lobsters' as const,
      sourceId: id,
      sourceRank: index,
      title,
      url: absolutizeUrl(decodeHtml(link?.[1] ?? `/s/${id}`), SOURCE_ORIGIN.lobsters) ?? `${SOURCE_ORIGIN.lobsters}/s/${id}`,
      discussionUrl: absolutizeUrl(decodeHtml(discussion?.[1] ?? `/s/${id}`), SOURCE_ORIGIN.lobsters) ?? `${SOURCE_ORIGIN.lobsters}/s/${id}`,
      author: decodeHtml(block.match(/<a href="\/~[^"]+">([^<]+)<\/a>\s*<time/)?.[1]) || undefined,
      points: Number(block.match(/class="upvoter"[^>]*>(\d+)/)?.[1] ?? 0),
      commentsCount: Number(block.match(/class="comments_label"[\s\S]*?>\s*(\d+)\s+comments?/)?.[1] ?? 0),
      createdAt: isoFromUnixSeconds(epoch?.[1]),
      tags: ['Lobsters', ...tags]
    } satisfies Story;
  }).filter((story): story is Story => story !== null);
}
