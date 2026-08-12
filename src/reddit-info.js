// Pure helpers for Reddit's /api/info listing, kept separate from server.js so
// the backfill path can be tested against a recorded payload.
import { parseUtcSeconds } from "./time.js";

export const REDDIT_INFO_MAX_IDS = 100;

export function normalizePostIds(ids = []) {
  const seen = new Set();
  for (const raw of ids) {
    const id = String(raw || "").trim().replace(/^t3_/, "");
    if (id) seen.add(id);
  }
  return [...seen].slice(0, REDDIT_INFO_MAX_IDS);
}

export function buildInfoUrl(ids = []) {
  const fullnames = normalizePostIds(ids).map((id) => `t3_${id}`);
  if (!fullnames.length) return "";
  return `https://www.reddit.com/api/info.json?id=${fullnames.join(",")}`;
}

// Apify input shapes for looking posts up by their permalink. Used when
// Reddit's own API refuses the request — it blocks datacenter IPs, so the
// server cannot reach it directly from Railway.
export function postUrlInputCandidates(urls = []) {
  const list = normalizePostUrls(urls);
  if (!list.length) return [];
  return [
    {
      urls: list,
      maxPostsPerSource: list.length,
      includeComments: false,
      filterKeywords: [],
      filterKeywordMode: "any",
      outputFormat: "default",
    },
    {
      startUrls: list.map((url) => ({ url })),
      maxPostsPerSource: list.length,
      includeComments: false,
      outputFormat: "default",
    },
  ];
}

// Apify's scraper rejects bare names and non-canonical hosts, so send full
// www.reddit.com permalinks only.
export function normalizePostUrls(urls = []) {
  const seen = new Set();
  for (const raw of urls) {
    const url = String(raw || "").trim();
    if (!/^https?:\/\/[^/]*reddit\.com\/.+\/comments\/[a-z0-9]+/i.test(url)) continue;
    seen.add(url.replace(/^https?:\/\/(?:www\.|old\.)?reddit\.com/i, "https://www.reddit.com"));
  }
  return [...seen].slice(0, REDDIT_INFO_MAX_IDS);
}

// { [postId]: createdUtcSeconds } for every listing child that carries a usable
// date. Posts Reddit no longer knows about are simply absent.
export function extractCreatedTimes(payload) {
  const times = {};
  for (const child of payload?.data?.children || []) {
    const post = child?.data;
    const utc = parseUtcSeconds(post?.created_utc);
    if (post?.id && utc !== null) times[post.id] = utc;
  }
  return times;
}
