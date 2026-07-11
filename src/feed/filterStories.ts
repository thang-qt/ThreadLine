import type { ReaderSettings, Story } from '../types';
import { normalizeHostname } from '../lib/sources';

function normalizeBlockedDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^www\./, '');
}

export function domainIsBlocked(hostname: string | undefined, blockedDomains: readonly string[]): boolean {
  if (!hostname) return false;
  const normalized = normalizeBlockedDomain(hostname);
  return blockedDomains.some(blocked => {
    const domain = normalizeBlockedDomain(blocked);
    return Boolean(domain) && (normalized === domain || normalized.endsWith(`.${domain}`));
  });
}

export function storyMatchesLobstersTags(story: Story, selectedTags: readonly string[]): boolean {
  if (story.source !== 'lobsters' || selectedTags.length === 0) return true;
  const tags = new Set((story.tags ?? []).map(tag => tag.toLowerCase()));
  return selectedTags.some(tag => tags.has(tag.toLowerCase()));
}

export function filterStories(stories: readonly Story[], settings: ReaderSettings): Story[] {
  return stories.filter(story => {
    if (!settings.sourceEnabled[story.source]) return false;
    if (domainIsBlocked(normalizeHostname(story.url), settings.blockedDomains)) return false;
    if (!storyMatchesLobstersTags(story, settings.lobstersTags)) return false;
    return true;
  });
}
