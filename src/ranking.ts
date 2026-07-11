import type { RankedStory, ReaderSettings, Source, Story } from './types';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hoursSince(isoDate: string, nowMs: number): number {
  const created = Date.parse(isoDate);
  if (Number.isNaN(created)) return 0;
  return Math.max(0, (nowMs - created) / 3_600_000);
}

function sourceMaxima(stories: Story[]): Record<Source, { engagement: number; count: number }> {
  const maxima: Record<Source, { engagement: number; count: number }> = {
    hn: { engagement: 1, count: 0 },
    lobsters: { engagement: 1, count: 0 }
  };

  for (const story of stories) {
    const rawEngagement = Math.log1p(story.points) + Math.log1p(story.commentsCount);
    maxima[story.source].engagement = Math.max(maxima[story.source].engagement, rawEngagement);
    maxima[story.source].count += 1;
  }

  return maxima;
}

export function fairMerge(sortedStories: RankedStory[], maxConsecutivePerSource = 3): RankedStory[] {
  const remaining = [...sortedStories];
  const merged: RankedStory[] = [];
  const maxRun = Math.max(1, maxConsecutivePerSource);

  while (remaining.length > 0) {
    const recent = merged.slice(-maxRun);
    const blockedSource = recent.length === maxRun && recent.every((story) => story.source === recent[0].source) ? recent[0].source : null;
    const nextIndex = blockedSource === null ? 0 : remaining.findIndex((story) => story.source !== blockedSource);
    const index = nextIndex === -1 ? 0 : nextIndex;
    const [next] = remaining.splice(index, 1);
    merged.push(next);
  }

  return merged;
}

export function rankStories(
  stories: Story[],
  settings: Pick<ReaderSettings, 'sourceEnabled' | 'sourceWeight' | 'halfLifeHours' | 'commentWeight'>,
  nowMs = Date.now()
): RankedStory[] {
  const visible = stories.filter((story) => settings.sourceEnabled[story.source]);
  const maxima = sourceMaxima(visible);
  const halfLife = Math.max(1, settings.halfLifeHours);
  const commentWeight = clamp(settings.commentWeight, 0, 2);

  const scored = visible
    .map((story) => {
      const sourceRankPart = 1 / Math.sqrt(story.sourceRank + 1);
      const engagementRaw = Math.log1p(Math.max(0, story.points)) + commentWeight * Math.log1p(Math.max(0, story.commentsCount));
      const engagementPart = clamp(engagementRaw / maxima[story.source].engagement, 0, 1.5);
      const ageHours = hoursSince(story.createdAt, nowMs);
      const recencyPart = 1 / (1 + ageHours / 24);
      const decay = Math.pow(0.5, ageHours / halfLife);
      const sourceWeight = Math.max(0, settings.sourceWeight[story.source] ?? 1);
      const rankScore = sourceWeight * decay * (0.58 * sourceRankPart + 0.3 * engagementPart + 0.12 * recencyPart);

      return {
        ...story,
        rankScore,
        rankParts: {
          sourceRank: sourceRankPart,
          engagement: engagementPart,
          recency: recencyPart,
          decay
        }
      };
    })
    .sort((a, b) => {
      if (b.rankScore !== a.rankScore) return b.rankScore - a.rankScore;
      return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    });

  return fairMerge(scored);
}

export function sourceCounts(stories: Story[]): Record<Source, number> {
  return stories.reduce<Record<Source, number>>(
    (counts, story) => {
      counts[story.source] += 1;
      return counts;
    },
    { hn: 0, lobsters: 0 }
  );
}
