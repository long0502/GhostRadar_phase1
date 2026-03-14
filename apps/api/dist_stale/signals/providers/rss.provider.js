"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RssRawSignalProvider = void 0;
const rss_parser_1 = __importDefault(require("rss-parser"));
const DEFAULT_FEEDS = [
    'https://feeds.bbci.co.uk/news/rss.xml',
    'https://www.nasa.gov/rss/dyn/breaking_news.rss',
];
function resolveFeedUrls() {
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
class RssRawSignalProvider {
    constructor(feedUrls = resolveFeedUrls()) {
        this.parser = new rss_parser_1.default();
        this.feedUrls = feedUrls;
    }
    async fetch(params) {
        const { gridId } = params;
        const results = [];
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
            }
            catch {
                continue;
            }
        }
        return results;
    }
}
exports.RssRawSignalProvider = RssRawSignalProvider;
