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
