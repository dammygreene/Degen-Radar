import type { XPost } from "../../domain/types";
import { HttpClient } from "../http";
import type { XProvider, XSearchOptions } from "../types";

/** Internal X API v2 recent-search response shapes (kept adapter-local). */
interface XApiResponse {
  data?: {
    id: string;
    author_id: string;
    text: string;
    created_at: string;
    public_metrics?: {
      like_count?: number;
      reply_count?: number;
      retweet_count?: number;
      quote_count?: number;
    };
  }[];
  includes?: {
    users?: { id: string; username: string; name?: string }[];
  };
  meta?: { next_token?: string; result_count?: number };
}

export interface XPostPage {
  posts: XPost[];
  nextToken: string | null;
}

/**
 * Official X API v2 Recent Search adapter. Covers the last 7 days, up to 100
 * posts per request, with pagination. No scraping, no undocumented endpoints.
 * (blueprint §21–22)
 */
export class XAdapter implements XProvider {
  readonly name = "x";
  private readonly http: HttpClient;

  constructor(baseUrl: string, bearerToken: string) {
    this.http = new HttpClient({
      provider: this.name,
      baseUrl,
      timeoutMs: 10_000,
      defaultHeaders: { authorization: `Bearer ${bearerToken}` },
    });
  }

  async searchRecent(
    query: string,
    options: {
      startTime?: Date;
      endTime?: Date;
      maxResults?: number;
      nextToken?: string;
    } = {},
  ): Promise<XPostPage> {
    const res = await this.http.getJson<XApiResponse>(`/2/tweets/search/recent`, {
      query: {
        query,
        max_results: Math.min(Math.max(options.maxResults ?? 50, 10), 100),
        "tweet.fields": "created_at,public_metrics,author_id",
        expansions: "author_id",
        "user.fields": "username,name",
        start_time: options.startTime?.toISOString(),
        end_time: options.endTime?.toISOString(),
        next_token: options.nextToken,
      },
    });

    const userById = new Map<string, { username: string; name?: string }>();
    for (const u of res.includes?.users ?? []) {
      userById.set(u.id, { username: u.username, name: u.name });
    }

    const posts: XPost[] = (res.data ?? []).map((d) => ({
      id: d.id,
      authorId: d.author_id,
      authorHandle: userById.get(d.author_id)?.username ?? null,
      text: d.text,
      createdAt: new Date(d.created_at),
      likes: d.public_metrics?.like_count ?? 0,
      replies: d.public_metrics?.reply_count ?? 0,
      reposts: d.public_metrics?.retweet_count ?? 0,
      quotes: d.public_metrics?.quote_count ?? 0,
    }));

    return { posts, nextToken: res.meta?.next_token ?? null };
  }

  /** Interface method used by the scan orchestrator (single page). */
  async searchPosts(query: string, options?: XSearchOptions): Promise<XPost[]> {
    const startTime = options?.sinceMinutes
      ? new Date(Date.now() - options.sinceMinutes * 60_000)
      : undefined;
    const page = await this.searchRecent(query, {
      maxResults: options?.maxResults,
      startTime,
    });
    return page.posts;
  }
}
