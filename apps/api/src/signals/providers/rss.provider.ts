import Parser from 'rss-parser';
import type { RawSignal, RawSignalProvider } from './types';

const DEFAULT_FEEDS = [
  'https://feeds.bbci.co.uk/news/rss.xml',
  'https://www.nasa.gov/rss/dyn/breaking_news.rss',
];

function resolveFeedUrls(): string[] {
  const raw = process.env.SIGNAL_RSS_FEEDS;
  const parsed = raw
    ? raw
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    : [];

  if (parsed.length > 0) {
    return parsed;
  }

  return DEFAULT_FEEDS;
}

export class RssRawSignalProvider implements RawSignalProvider {
  private readonly parser: Parser<Record<string, unknown>, Record<string, unknown>>;
  private readonly feedUrls: string[];

  constructor(feedUrls: string[] = resolveFeedUrls()) {
    this.parser = new Parser<Record<string, unknown>, Record<string, unknown>>();
    this.feedUrls = feedUrls;
  }

  async fetch(params: {
    lat: number;
    lon: number;
    radiusKm: number;
    gridId: string;
  }): Promise<RawSignal[]> {
    const { gridId } = params;
    const results: RawSignal[] = [];

    for (const feedUrl of this.feedUrls) {
      try {
        const feed = await this.parser.parseURL(feedUrl);
        const items = Array.isArray(feed.items) ? feed.items : [];

        for (const item of items) {
          results.push({
            source: 'rss',
            fetchKey: `${gridId}:${feedUrl}`,
            rawPayload: item,
          });
        }
      } catch {
        continue;
      }
    }

    return results;
  }
}
