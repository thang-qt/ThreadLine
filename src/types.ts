export type Source = 'hn' | 'lobsters';
export type Theme = 'light' | 'dark' | 'sepia';
export type Density = 'relaxed' | 'comfortable' | 'compact';
export type FontChoice = 'system' | 'serif' | 'mono';

export type LayoutChoice = 'newspaper' | 'list';
export type HnFeed = 'top' | 'best' | 'new';
export type LobstersFeed = 'hottest' | 'newest';

export interface ReaderSettings {
  theme: Theme;
  font: FontChoice;
  typeScale: number;
  density: Density;
  columns: number;
  layout: LayoutChoice;
  sourceEnabled: Record<Source, boolean>;
  sourceWeight: Record<Source, number>;
  halfLifeHours: number;
  commentWeight: number;
  hnFeed: HnFeed;
  lobstersFeed: LobstersFeed;
  blockedDomains: string[];
  lobstersTags: string[];
  highlightThreads: boolean;
}

export interface Story {
  id: string;
  source: Source;
  sourceId: string;
  sourceRank: number;
  title: string;
  url?: string;
  discussionUrl: string;
  author?: string;
  points: number;
  commentsCount: number;
  createdAt: string;
  tags?: string[];
}

export interface FeedResult {
  stories: Story[];
  errors: Partial<Record<Source, string>>;
}

export interface RankedStory extends Story {
  rankScore: number;
  rankParts: {
    sourceRank: number;
    engagement: number;
    recency: number;
    decay: number;
  };
}

export interface CommentNode {
  id: string;
  author?: string;
  html: string;
  createdAt?: string;
  children: CommentNode[];
}

export interface StoryComments {
  story: Story;
  comments: CommentNode[];
}
