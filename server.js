import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";
import pg from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(express.static(join(__dirname, "dist")));

// ── PostgreSQL ───────────────────────────────────────────────
const pool = process.env.DATABASE_URL
  ? new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      max: 10,
    })
  : null;

if (process.env.DATABASE_URL) {
  const credsPart = process.env.DATABASE_URL.split("@")[0] || "";
  if (/[{};, ]/.test(credsPart)) {
    console.warn("DATABASE_URL may contain unescaped password characters. URL-encode special chars in DB password if connections time out.");
  }
}

async function initDB() {
  if (!pool) { console.warn("DATABASE_URL not set — DB features disabled"); return; }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ss_users (
      email TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      password TEXT NOT NULL,
      plan TEXT DEFAULT 'Pro',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS ss_data (
      email TEXT PRIMARY KEY,
      data JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log("DB tables ready");
}
initDB().catch((err) => console.warn("DB init failed:", err.message));

// ── Auth endpoints ───────────────────────────────────────────
app.post("/api/auth/signup", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "Database not configured" });
  const { email, password, name } = req.body;
  if (!email || !password || !name) return res.status(400).json({ error: "Fill all fields" });
  const e = email.toLowerCase().trim();
  try {
    const ex = await pool.query("SELECT email FROM ss_users WHERE email = $1", [e]);
    if (ex.rows.length) return res.status(409).json({ error: "Account exists" });
    await pool.query("INSERT INTO ss_users (email, name, password) VALUES ($1, $2, $3)", [e, name.trim(), password]);
    res.json({ email: e, name: name.trim(), plan: "Pro" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "Database not configured" });
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Fill all fields" });
  try {
    const result = await pool.query("SELECT * FROM ss_users WHERE email = $1", [email.toLowerCase().trim()]);
    if (!result.rows.length) return res.status(401).json({ error: "No account" });
    if (result.rows[0].password !== password) return res.status(401).json({ error: "Wrong password" });
    const u = result.rows[0];
    res.json({ email: u.email, name: u.name, plan: u.plan });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Data endpoints ───────────────────────────────────────────
app.get("/api/data", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "Database not configured" });
  const email = req.query.email;
  if (!email) return res.status(400).json({ error: "Missing email" });
  try {
    const result = await pool.query("SELECT data FROM ss_data WHERE email = $1", [email]);
    res.json(result.rows[0]?.data || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/data", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "Database not configured" });
  const { email, data } = req.body;
  if (!email) return res.status(400).json({ error: "Missing email" });
  try {
    await pool.query(
      `INSERT INTO ss_data (email, data, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (email) DO UPDATE SET data = $2, updated_at = NOW()`,
      [email, JSON.stringify(data)]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Apify Reddit scraping config/cache ───────────────────────
const REDDIT_RESULT_TTL_MS = 30 * 60 * 1000;
const SUBREDDIT_EMPTY_TTL_MS = 10 * 60 * 1000;
const APIFY_API_BASE = "https://api.apify.com/v2";
const APIFY_REQUEST_TIMEOUT_MS = Math.max(5000, Number(process.env.APIFY_REQUEST_TIMEOUT_MS || 60000));
const redditResultCache = new Map();
const subredditCooldowns = new Map();
const apifyPostCache = new Map();
let cachedWorkingApifyActorId = null;

function getApifyToken() {
  return String(process.env.APIFY_API_TOKEN || "").trim() || null;
}

function getApifyActorId() {
  return String(process.env.APIFY_REDDIT_ACTOR_ID || "automation-lab/reddit-scraper").trim();
}

function getApifyActorPathId(actorId = getApifyActorId()) {
  const id = String(actorId || "").trim();
  if (!id) return "";
  return id.includes("/") ? id.replace("/", "~") : id;
}

function getApifyActorCandidates() {
  const configured = getApifyActorId();
  const defaults = [
    "automation-lab/reddit-scraper",
  ];
  const candidates = [cachedWorkingApifyActorId, configured, ...defaults]
    .map((id) => String(id || "").trim())
    .filter(Boolean);
  return Array.from(new Set(candidates));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = APIFY_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function getApifyTokenError() {
  return "Missing APIFY_API_TOKEN. Add it in Railway environment variables.";
}

async function readJsonOrText(res) {
  const contentType = res.headers.get("content-type") || "";
  try {
    const text = await res.text();
    if (contentType.includes("application/json") || contentType.includes("+json")) {
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    }
    const trimmed = text.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return text;
      }
    }
    return text;
  } catch {
    return null;
  }
}

function formatRedditHttpError(status, payload) {
  if (payload && typeof payload === "object") {
    if (payload.reason === "private") return `HTTP ${status}: private or restricted subreddit`;
    const nested = payload.error && typeof payload.error === "object" ? payload.error : null;
    const message = payload.message || payload.error_description || payload.reason || nested?.message || nested?.type || payload.error;
    if (message) return `HTTP ${status}: ${message}`;
  }
  if (typeof payload === "string" && payload.trim()) {
    if (/<(?:!doctype|html|body|head|style)\b/i.test(payload)) {
      return `HTTP ${status}: blocked by Reddit public web endpoint`;
    }
    const normalized = payload.replace(/\s+/g, " ").trim();
    return `HTTP ${status}: ${normalized.slice(0, 160)}`;
  }
  return `HTTP ${status}`;
}

function parseUtc(value) {
  if (typeof value === "number") {
    return value > 1000000000000 ? Math.floor(value / 1000) : Math.floor(value);
  }
  if (typeof value === "string" && value.trim()) {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) return parseUtc(asNumber);
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return Math.floor(parsed / 1000);
  }
  return Math.floor(Date.now() / 1000);
}

function normalizeSubredditName(raw) {
  const text = String(raw || "").trim();
  if (!text) return "";
  if (text.startsWith("r/")) return text.slice(2);
  return text;
}

// Build an OR-quoted Reddit search query from an array of intent/tool terms.
// Reddit treats spaces as AND and supports OR/quoted phrases. Comma-joined
// strings are interpreted as one literal phrase and return ~0 matches.
function buildOrQuery(terms) {
  const seen = new Set();
  const parts = [];
  for (const t of terms || []) {
    const trimmed = String(t || "").trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(`"${trimmed.replace(/"/g, "")}"`);
    if (parts.length >= 8) break;
  }
  return parts.join(" OR ");
}

// Fire-and-forget abort of the most recent run for an actor. Used after the
// run-sync request times out client-side so we don't keep burning compute on
// an orphaned run.
async function abortLastApifyRun(actorPathId) {
  const token = getApifyToken();
  if (!token || !actorPathId) return;
  try {
    await fetchWithTimeout(
      `${APIFY_API_BASE}/acts/${encodeURIComponent(actorPathId)}/runs/last/abort?token=${encodeURIComponent(token)}`,
      { method: "POST" },
      5000,
    );
  } catch {
    // Best effort — we don't care if the abort fails.
  }
}

function decodeHtmlEntities(input = "") {
  return input
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#32;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function stripHtml(input = "") {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<li>/gi, "- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function extractXmlTag(block, tagName) {
  const match = block.match(new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match ? match[1] : "";
}

function extractXmlAttr(block, tagName, attrName) {
  const match = block.match(new RegExp(`<${tagName}[^>]*\\b${attrName}="([^"]+)"`, "i"));
  return match ? match[1] : "";
}

function parseRedditFeedPosts(feedText, subName) {
  const entries = feedText.match(/<entry>[\s\S]*?<\/entry>/gi) || [];
  return entries.map((entry) => {
    const rawTitle = decodeHtmlEntities(extractXmlTag(entry, "title"));
    const rawContent = decodeHtmlEntities(extractXmlTag(entry, "content"));
    const cleanedContent = rawContent
      .replace(/<!--\s*SC_OFF\s*-->|<!--\s*SC_ON\s*-->/gi, " ")
      .replace(/\s+submitted by[\s\S]*$/i, " ")
      .trim();
    const permalink = extractXmlAttr(entry, "link", "href") || "";
    const postId = extractXmlTag(entry, "id").replace(/^t3_/, "") || permalink.split("/comments/")[1]?.split("/")[0] || "";
    const published = extractXmlTag(entry, "published") || extractXmlTag(entry, "updated");
    const createdUtc = published ? Math.floor(new Date(published).getTime() / 1000) : Math.floor(Date.now() / 1000);
    const author = decodeHtmlEntities(extractXmlTag(entry, "name")).replace(/^\/u\//i, "") || "unknown";

    return {
      id: postId,
      title: rawTitle.trim(),
      selftext: stripHtml(cleanedContent),
      permalink: permalink.replace(/^https?:\/\/(?:www|old)\.reddit\.com/i, ""),
      created_utc: createdUtc,
      author,
      subreddit: subName.replace(/^r\//i, ""),
      score: null,
      num_comments: null,
      _source: "rss",
    };
  }).filter((post) => post.id && post.title);
}

function extractSubredditFromUrl(url) {
  const m = String(url || "").match(/\/r\/([^/]+)/i);
  return m ? m[1] : "";
}

function extractPermalink(item) {
  if (typeof item?.permalink === "string" && item.permalink.trim()) return item.permalink;
  const url = String(item?.url || item?.postUrl || item?.link || "").trim();
  if (!url) return "";
  try {
    const u = new URL(url);
    return u.pathname || "";
  } catch {
    return url.replace(/^https?:\/\/[^/]+/i, "");
  }
}

function extractTopComment(item) {
  const firstFromList = Array.isArray(item?.topComments) ? item.topComments[0] : null;
  const firstComment = firstFromList || item?.topComment || item?.comment;
  if (!firstComment) return null;
  const text = String(firstComment?.text || firstComment?.body || firstComment?.comment || "").trim();
  if (!text) return null;
  const upvotes = Number(firstComment?.score || firstComment?.upvotes || 0);
  const author = String(firstComment?.author || firstComment?.username || "unknown");
  return {
    text: text.slice(0, 250),
    upvotes: Number.isFinite(upvotes) ? upvotes : 0,
    author: `u/${author.replace(/^u\//i, "")}`,
  };
}

function normalizeApifyPost(item, fallbackSub = "") {
  // Filter out comment items — automation-lab/reddit-scraper returns both posts and comments
  if (item?.type === "comment") return null;

  const id = String(item?.id || item?.postId || item?.post_id || "").trim();
  const title = String(item?.title || item?.postTitle || "").trim();
  if (!id || !title) return null;

  const subreddit = normalizeSubredditName(
    item?.subreddit || item?.subredditName || item?.sub || extractSubredditFromUrl(item?.url || item?.postUrl || item?.permalink || "") || fallbackSub
  );
  const author = String(item?.author || item?.username || item?.user || "unknown").replace(/^u\//i, "");
  const scoreRaw = item?.score ?? item?.upVotes ?? item?.upvotes ?? item?.ups;
  const commentsRaw = item?.numComments ?? item?.num_comments ?? item?.commentsCount ?? item?.comments;

  const post = {
    id,
    title,
    selftext: String(item?.selfText || item?.selftext || item?.body || item?.text || item?.content || "").trim(),
    permalink: extractPermalink(item) || `/comments/${id}`,
    created_utc: parseUtc(item?.createdAt ?? item?.created_utc ?? item?.created ?? item?.timestamp),
    author: author || "unknown",
    subreddit: subreddit || normalizeSubredditName(fallbackSub),
    score: Number.isFinite(Number(scoreRaw)) ? Number(scoreRaw) : null,
    num_comments: Number.isFinite(Number(commentsRaw)) ? Number(commentsRaw) : null,
    _source: "apify",
    _topComment: extractTopComment(item),
    _subredditSubscribers: item?.subredditSubscribers ?? null,
    _raw: item,
  };

  apifyPostCache.set(post.id, post);
  return post;
}

function formatSubscriberCount(n) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(n);
}

async function runApifyActor(input) {
  const token = getApifyToken();
  if (!token) throw new Error(getApifyTokenError());
  const actorCandidates = getApifyActorCandidates();
  const errors = [];

  for (const actorId of actorCandidates) {
    const actorPathId = getApifyActorPathId(actorId);
    const endpoint = `${APIFY_API_BASE}/acts/${encodeURIComponent(actorPathId)}/run-sync-get-dataset-items`;
    const qs = new URLSearchParams({ token, clean: "true", format: "json", timeout: "60", maxItems: "50" });
    let res;
    let payload;
    try {
      res = await fetchWithTimeout(`${endpoint}?${qs.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      payload = await readJsonOrText(res);
    } catch (err) {
      const msg = err?.name === "AbortError"
        ? `timeout after ${APIFY_REQUEST_TIMEOUT_MS}ms`
        : ((err && err.message) || "request failed");
      errors.push(`${actorId}: ${msg}`);
      if (err?.name === "AbortError") {
        // Don't await — we just want to stop the orphan run from burning credits.
        void abortLastApifyRun(actorPathId);
      }
      continue;
    }
    if (!res.ok) {
      const detail = formatRedditHttpError(res.status, payload);
      errors.push(`${actorId}: ${detail}`);
      continue;
    }
    if (!Array.isArray(payload)) {
      errors.push(`${actorId}: Apify actor returned unexpected response shape`);
      continue;
    }
    cachedWorkingApifyActorId = actorId;
    return { items: payload, actorId };
  }

  throw new Error(errors.length ? errors.join(" | ") : "All Apify actor candidates failed");
}

async function runApifyWithInputCandidates(candidates, fallbackError) {
  const errors = [];
  for (const input of candidates) {
    try {
      const data = await runApifyActor(input);
      return { items: data.items, actorId: data.actorId, errors };
    } catch (err) {
      errors.push((err && err.message) || "Apify run failed");
    }
  }
  throw new Error(errors.length ? errors.join(" | ") : fallbackError);
}

// Build the actor input list for a single subreddit. We deliberately limit
// ourselves to the two documented-valid input shapes: a canonical subreddit URL
// and (optionally) an OR-quoted search query scoped via searchSubreddit. Bare
// names like `r/foo` or `foo` are not valid `urls` values for
// automation-lab/reddit-scraper and previously caused 25 s timeouts per run.
// `includeComments` is intentionally false at scan time; the top comment is
// fetched lazily for displayed threads via fetchPostSnapshot.
function subredditInputCandidates(subName, limit = 100, searchTerms = []) {
  const name = normalizeSubredditName(subName);
  const lower = name.toLowerCase();
  const subredditUrl = `https://www.reddit.com/r/${lower}/`;
  const orQuery = buildOrQuery(searchTerms);
  // Pass up to 10 terms as filterKeywords so Apify pre-filters at source
  const filterKeywords = searchTerms.slice(0, 10);

  const candidates = [];

  // Search-first: scoped subreddit search with relevance sort — much more precise
  if (orQuery) {
    candidates.push({
      searchQuery: orQuery,
      searchSubreddit: lower,
      maxPostsPerSource: limit,
      sort: "relevance",
      timeFilter: "week",
      includeComments: false,
      filterKeywords,
      filterKeywordMode: "any",
      outputFormat: "default",
    });
  }

  return candidates;
}

function searchInputCandidates(searchTerms, limit = 100) {
  const orQuery = buildOrQuery(Array.isArray(searchTerms) ? searchTerms : [searchTerms]);
  if (!orQuery) return [];
  return [
    {
      searchQuery: orQuery,
      maxPostsPerSource: limit,
      sort: "relevance",
      timeFilter: "week",
      includeComments: false,
      filterKeywords: [],
      filterKeywordMode: "any",
      outputFormat: "default",
    },
    {
      urls: [`https://www.reddit.com/search/?q=${encodeURIComponent(orQuery)}`],
      maxPostsPerSource: limit,
      includeComments: false,
      filterKeywords: [],
      filterKeywordMode: "any",
      outputFormat: "default",
    },
  ];
}

async function fetchSubredditPublicApi(subName) {
  const name = normalizeSubredditName(subName);
  const errors = [];
  const headers = { "User-Agent": "SocialScanner/1.0" };

  try {
    const url = `https://www.reddit.com/r/${name}/new.json?limit=100`;
    console.log(`[reddit] ${subName}: trying public JSON API`);
    const res = await fetchWithTimeout(url, { headers }, 15000);
    if (res.ok) {
      const data = await readJsonOrText(res);
      const children = data?.data?.children || [];
      const posts = children.map((child) => {
        const p = child.data;
        if (!p?.id || !p?.title) return null;
        return {
          id: p.id,
          title: p.title,
          selftext: p.selftext || "",
          permalink: p.permalink || `/comments/${p.id}`,
          created_utc: p.created_utc || Math.floor(Date.now() / 1000),
          author: p.author || "unknown",
          subreddit: p.subreddit || name,
          score: p.score ?? null,
          num_comments: p.num_comments ?? null,
          _source: "public_api",
          _topComment: null,
          _raw: p,
        };
      }).filter(Boolean);
      if (posts.length > 0) {
        console.log(`[reddit] ${subName}: public JSON API got ${posts.length} posts`);
        return { posts, errors };
      }
      errors.push("public JSON API: returned 0 posts");
    } else {
      const payload = await readJsonOrText(res);
      errors.push(`public JSON API: ${formatRedditHttpError(res.status, payload)}`);
    }
  } catch (err) {
    errors.push(`public JSON API: ${err.message}`);
  }

  try {
    const url = `https://www.reddit.com/r/${name}/new/.rss`;
    console.log(`[reddit] ${subName}: trying public RSS feed`);
    const res = await fetchWithTimeout(url, { headers }, 15000);
    if (res.ok) {
      const text = await res.text();
      const posts = parseRedditFeedPosts(text, name);
      if (posts.length > 0) {
        console.log(`[reddit] ${subName}: RSS feed got ${posts.length} posts`);
        return { posts, errors };
      }
      errors.push("RSS feed: returned 0 posts");
    } else {
      errors.push(`RSS feed: HTTP ${res.status}`);
    }
  } catch (err) {
    errors.push(`RSS feed: ${err.message}`);
  }

  return { posts: [], errors };
}

async function fetchSubredditPosts(subName, _token, searchTerms = []) {
  const name = normalizeSubredditName(subName);
  const errors = [];
  const statuses = [];
  const candidates = subredditInputCandidates(name, 30, searchTerms);

  for (let i = 0; i < candidates.length; i++) {
    const input = candidates[i];
    try {
      console.log(`[reddit] ${subName}: trying input candidate ${i + 1}/${candidates.length}`);
      const { items, actorId } = await runApifyActor(input);
      const normalized = items
        .map((item) => normalizeApifyPost(item, name))
        .filter(Boolean);
      const deduped = [];
      const seen = new Set();
      for (const post of normalized) {
        if (seen.has(post.id)) continue;
        seen.add(post.id);
        deduped.push(post);
      }
      statuses.push(`apify:${actorId || "unknown"}:${deduped.length}`);
      if (deduped.length > 0) {
        console.log(`[reddit] ${subName}: fetched ${deduped.length} posts with ${actorId}`);
        return { posts: deduped, errors, statuses };
      }
      errors.push(`${actorId || "unknown"}: actor returned 0 matching post items for input ${JSON.stringify(input).slice(0, 180)}`);
    } catch (err) {
      const msg = (err && err.message) || "Apify run failed";
      errors.push(msg);
      // All Apify actors hit hard rate limit — skip remaining input candidates
      if (msg.includes("Monthly usage hard limit exceeded")) break;
    }
  }

  return { posts: [], errors, statuses };
}

function getRedditCacheKey({ subreddits = [], intentPatterns = [], toolTerms = [], negativeKeywords = [], searchAll = false }) {
  const normalizedSubs = subreddits
    .map((sub) => (typeof sub === "string" ? sub : sub.name || ""))
    .filter(Boolean)
    .sort();
  const normalizedPatterns = [...intentPatterns].filter(Boolean).sort();
  const normalizedToolTerms = [...toolTerms].filter(Boolean).sort();
  const normalizedNegKws = [...negativeKeywords].filter(Boolean).sort();
  return JSON.stringify({
    searchAll,
    subreddits: normalizedSubs,
    intentPatterns: normalizedPatterns,
    toolTerms: normalizedToolTerms,
    negativeKeywords: normalizedNegKws,
  });
}

function getCachedRedditResult(cacheKey) {
  const entry = redditResultCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    redditResultCache.delete(cacheKey);
    return null;
  }
  return entry.value;
}

function setCachedRedditResult(cacheKey, value) {
  redditResultCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + REDDIT_RESULT_TTL_MS,
  });
}

function getSubredditCooldown(subName) {
  const entry = subredditCooldowns.get(subName);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    subredditCooldowns.delete(subName);
    return null;
  }
  return entry;
}

function setSubredditCooldown(subName, reason = "empty response") {
  subredditCooldowns.set(subName, {
    reason,
    expiresAt: Date.now() + SUBREDDIT_EMPTY_TTL_MS,
  });
}

// ── Search all of Reddit via Apify ───────────────────────────
async function searchReddit(searchTerms, _token) {
  const errors = [];
  const candidates = searchInputCandidates(searchTerms, 100);
  if (!candidates.length) {
    throw new Error("No search terms provided");
  }
  for (const input of candidates) {
    try {
      const { items } = await runApifyActor(input);
      const normalized = items
        .map((item) => normalizeApifyPost(item))
        .filter(Boolean);
      if (normalized.length > 0) return normalized;
      errors.push(`Apify returned 0 matching post items for search input ${JSON.stringify(input).slice(0, 180)}`);
    } catch (err) {
      errors.push((err && err.message) || "Apify run failed");
    }
  }
  throw new Error(errors.join(" | ") || "Apify failed to search Reddit");
}

// ── Fetch top comment ────────────────────────────────────────
function extractThreadListingPost(data) {
  return data?.[0]?.data?.children?.find((item) => item?.kind === "t3")?.data || null;
}

function extractThreadListingReply(data) {
  const comments = data?.[1]?.data?.children || [];
  const top = comments.find((c) => c?.kind === "t1")?.data;
  if (!top || top.score < 1) return null;
  return { text: top.body?.slice(0, 250) || "", upvotes: top.score || 0, author: `u/${top.author}` };
}

async function fetchPostSnapshot(postId, token) {
  const cached = apifyPostCache.get(postId);
  let replyTo = cached?._topComment || null;

  // Lazy top-comment fetch via Reddit's per-post JSON endpoint. This is needed
  // because the bulk subreddit scrape now runs with includeComments: false to
  // keep the actor fast, so cached posts have _topComment === null. Best
  // effort — silently ignore failures (replyTo simply stays null).
  if (!replyTo) {
    try {
      const url = `https://www.reddit.com/comments/${postId}.json?limit=1`;
      const res = await fetchWithTimeout(url, { headers: { "User-Agent": "SocialScanner/1.0" } }, 8000);
      if (res.ok) {
        const data = await readJsonOrText(res);
        if (Array.isArray(data)) {
          replyTo = extractThreadListingReply(data);
          if (cached && replyTo) cached._topComment = replyTo;
        }
      }
    } catch {
      // Best effort.
    }
  }

  return {
    post: cached || null,
    replyTo,
  };
}

function timeAgo(utc) {
  const diff = Date.now() / 1000 - utc;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── POST /api/reddit ─────────────────────────────────────────
app.post("/api/reddit", async (req, res) => {
  try {
    const { subreddits = [], keywords = [], searchKeywords = [], intentPatterns = [], toolTerms = [], negativeKeywords = [], searchAll = false } = req.body;
    if (!searchAll && !subreddits.length) return res.json({ threads: [] });
    if (!getApifyToken()) return res.status(503).json({ error: getApifyTokenError() });

    const startedAt = Date.now();
    console.log(`[reddit] scan started: searchAll=${Boolean(searchAll)} subCount=${subreddits.length}`);

    // No server-side cache — scans run on demand only

    const token = null;
    const threads = [];
    let allPosts = [];
    const fetchErrors = [];

    if (searchAll) {
      const searchTerms = [...intentPatterns, ...toolTerms];
      try {
        allPosts = await searchReddit(searchTerms, token);
        if (!allPosts.length) fetchErrors.push("Reddit search returned 0 results");
      } catch (err) {
        fetchErrors.push(`Reddit search failed: ${err.message}`);
      }
    } else {
      // Use explicit searchKeywords from new frontend if provided; fall back to toolTerms for backward compat
      const subredditSearchTerms = searchKeywords.length > 0 ? searchKeywords : (toolTerms.length > 0 ? toolTerms : intentPatterns);
      for (const sub of subreddits) {
        const subName = sub.name || sub;
        console.log(`[reddit] fetching subreddit: ${subName}`);
        const cooldown = getSubredditCooldown(subName);
        if (cooldown) {
          fetchErrors.push(`${subName}: cooldown active (${cooldown.reason})`);
          continue;
        }
        try {
          const { posts, errors, statuses } = await fetchSubredditPosts(subName, token, subredditSearchTerms);
          if (posts.length === 0) {
            const rateLimited = errors.some((msg) => msg.includes("HTTP 429"));
            if (rateLimited) setSubredditCooldown(subName, "rate limited");
            const detail = errors.length
              ? errors.join(", ")
              : `Apify returned no posts${statuses.length ? ` [${statuses.join(", ")}]` : ""}`;
            fetchErrors.push(`${subName}: ${detail}`);
          } else if (errors.length) {
            fetchErrors.push(`${subName}: partial fetch (${errors.join(", ")})`);
          }
          allPosts.push(...posts.map((p) => ({ ...p, _sub: sub })));
          console.log(`[reddit] ${subName}: got ${posts.length} posts`);
        } catch (err) {
          if (String(err.message || "").includes("429")) setSubredditCooldown(subName, err.message);
          fetchErrors.push(`${subName}: ${err.message}`);
          console.warn(`Failed to fetch ${subName}:`, err.message);
        }
      }
    }

    let intentMatched = 0;

    for (const post of allPosts) {
      const text = `${post.title} ${post.selftext || ""}`.toLowerCase();
      intentMatched++;

      // Exclude only if the negative keyword is the dominant topic:
      // appears in the title, OR appears 2+ times in the full text.
      const title = (post.title || "").toLowerCase();
      const isDominantNegKw = negativeKeywords.length > 0 && negativeKeywords.some((nk) => {
        const kw = nk.toLowerCase();
        if (title.includes(kw)) return true;
        const count = (text.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
        return count >= 2;
      });
      if (isDominantNegKw) continue;

      // Only fetch the snapshot (which now does a lazy Reddit call for the top
      // comment) for the threads we will actually display with replyTo.
      const willUseReplyTo = threads.length < 15;
      const snapshot = willUseReplyTo ? await fetchPostSnapshot(post.id, token) : { post: null, replyTo: null };
      const hydratedPost = snapshot.post ? { ...post, ...snapshot.post } : post;
      const replyTo = willUseReplyTo ? snapshot.replyTo : null;
      const subName = searchAll ? `r/${hydratedPost.subreddit}` : (hydratedPost._sub?.name || hydratedPost._sub || `r/${hydratedPost.subreddit}`);
      const subMembers = searchAll ? "?" : (hydratedPost._sub?.members || "?");

      threads.push({
        id: hydratedPost.id,
        title: hydratedPost.title,
        sub: subName,
        subMembers,
        score: Number.isFinite(hydratedPost.score) ? hydratedPost.score : null,
        comments: Number.isFinite(hydratedPost.num_comments) ? hydratedPost.num_comments : null,
        time: timeAgo(hydratedPost.created_utc),
        intent: (() => {
          const buyingSignals = ["looking for", "recommendation", "which app", "what do you use", "switching from", "alternative to", "need a", "any app", "suggest"];
          const competitors = ["ynab", "mint", "walnut", "fi money", "jupiter", "goodbudget"];
          const frustrationSignals = ["hate", "stopped", "doesn't work", "too expensive", "cancelled", "leaving", "frustrated", "gave up", "worst", "disappointed"];
          const isBuyingIntent = buyingSignals.some((s) => text.includes(s));
          const isCompetitorFrustration = competitors.some((c) => text.includes(c)) && frustrationSignals.some((s) => text.includes(s));
          if (isBuyingIntent || isCompetitorFrustration) return "High";
          return "Medium";
        })(),
        matchedPattern: "",
        author: `u/${hydratedPost.author}`,
        authorKarma: "?",
        body: hydratedPost.selftext?.trim() || hydratedPost.title,
        replyTo,
        reply: null,
        status: "new",
        performance: null,
        url: `https://reddit.com${hydratedPost.permalink || post.permalink || `/comments/${hydratedPost.id}`}`,
      });
    }

    const debug = `Fetched ${allPosts.length} posts → ${intentMatched} passed pre-filter → ${threads.length} threads returned` + (fetchErrors.length ? ` | Errors: ${fetchErrors.join("; ")}` : "");
    console.log(debug);
    console.log(`[reddit] scan finished in ${Date.now() - startedAt}ms`);
    const responseBody = { threads, debug };
    res.json(responseBody);
  } catch (err) {
    console.error("Reddit API error:", err);
    res.status(500).json({ error: "Failed to fetch Reddit threads" });
  }
});

// ── Health check ─────────────────────────────────────────────
app.get("/health", (req, res) => res.json({ status: "ok" }));

// ── Env debug ────────────────────────────────────────────────
app.get("/api/debug-env", (req, res) => {
  const allKeys = Object.keys(process.env).sort();
  res.json({
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? `set (${process.env.ANTHROPIC_API_KEY.length} chars)` : "NOT SET",
    APIFY_API_TOKEN: process.env.APIFY_API_TOKEN ? "set" : "NOT SET",
    NODE_ENV: process.env.NODE_ENV || "not set",
    allEnvKeys: allKeys,
  });
});

// ── Credential test ──────────────────────────────────────────
app.get("/api/test", async (req, res) => {
  const token = getApifyToken();
  const actorId = getApifyActorId();
  const actorCandidates = getApifyActorCandidates();
  if (!token) return res.json({ ok: false, error: getApifyTokenError() });
  try {
    const meRes = await fetch(`${APIFY_API_BASE}/users/me?token=${encodeURIComponent(token)}`);
    const meData = await readJsonOrText(meRes);
    if (!meRes.ok) {
      return res.json({
        ok: false,
        error: "Apify token rejected",
        detail: formatRedditHttpError(meRes.status, meData),
      });
    }

    let resolvedActorId = null;
    let resolvedActorPathId = null;
    const actorErrors = [];
    for (const candidate of actorCandidates) {
      const candidatePath = getApifyActorPathId(candidate);
      const actorRes = await fetch(`${APIFY_API_BASE}/acts/${encodeURIComponent(candidatePath)}?token=${encodeURIComponent(token)}`);
      const actorData = await readJsonOrText(actorRes);
      if (actorRes.ok) {
        resolvedActorId = candidate;
        resolvedActorPathId = candidatePath;
        break;
      }
      actorErrors.push(`${candidate}: ${formatRedditHttpError(actorRes.status, actorData)}`);
    }

    if (!resolvedActorId) {
      return res.json({
        ok: false,
        error: "Apify actor not accessible",
        actorId,
        actorCandidates,
        detail: actorErrors.join(" | "),
      });
    }

    return res.json({
      ok: true,
      actorId,
      actorPathId: resolvedActorPathId,
      resolvedActorId,
      actorCandidates,
      user: meData?.data?.username || meData?.username || "unknown",
      message: "Apify credentials valid",
    });
  } catch (e) {
    return res.json({ ok: false, error: e.message });
  }
});

function parseSubscribersFromAny(item) {
  if (!item || typeof item !== "object") return null;
  const candidates = [
    item.subscribers,
    item.subscriberCount,
    item.subscribersCount,
    item.communitySize,
    item.subredditSubscribers,
    item.subreddit_subscribers,
    item?.subreddit?.subscribers,
    item?.data?.subscribers,
    item?.data?.subreddit_subscribers,
  ];
  for (const value of candidates) {
    if (value == null || value === "") continue;
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

function extractRulesFromAny(item) {
  const raw = item?.rules || item?.subredditRules || item?.communityRules;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => {
      if (typeof r === "string") return r.trim();
      if (r && typeof r === "object") return String(r.short_name || r.name || r.description || "").trim();
      return "";
    })
    .filter(Boolean)
    .slice(0, 5);
}

async function fetchSubredditAboutDirect(subName) {
  const name = String(subName || "").replace(/^r\//i, "").trim();
  if (!name) return null;
  try {
    const url = `https://www.reddit.com/r/${name}/about.json`;
    const res = await fetchWithTimeout(url, { headers: { "User-Agent": "SocialScanner/1.0" } }, 8000);
    if (!res.ok) return null;
    const data = await readJsonOrText(res);
    const inner = data?.data || null;
    if (!inner) return null;
    const subs = parseSubscribersFromAny(inner);
    if (subs == null) return null;
    const rulesRaw = Array.isArray(inner.rules) ? inner.rules : [];
    const rules = rulesRaw
      .map((r) => (typeof r === "string" ? r : String(r?.short_name || r?.name || r?.description || "")).trim())
      .filter(Boolean)
      .slice(0, 5);
    return { members: formatSubscriberCount(subs), rules };
  } catch {
    return null;
  }
}

async function fetchSubredditAbout(subName, token) {
  const name = subName.replace(/^r\//i, "");
  const direct = await fetchSubredditAboutDirect(name);
  if (direct) return direct;
  const { posts } = await fetchSubredditPosts(name, token);
  const firstRaw = posts[0]?._raw || null;
  const n = parseSubscribersFromAny(firstRaw);
  const members = n != null ? formatSubscriberCount(n) : "?";
  const rules = extractRulesFromAny(firstRaw);
  return { members, rules };
}

function deriveMetaFromPosts(posts) {
  const firstRaw = posts?.[0]?._raw || null;
  const n = parseSubscribersFromAny(firstRaw);
  return {
    members: n != null ? formatSubscriberCount(n) : "?",
    rules: extractRulesFromAny(firstRaw),
  };
}

async function handleSubredditAboutRequest(req, res) {
  try {
    const rawSub = String(req.method === "GET" ? req.query.sub : req.body?.sub || "").trim();
    if (!rawSub) return res.status(400).json({ error: "Missing subreddit" });
    const sub = rawSub.startsWith("r/") ? rawSub : `r/${rawSub}`;
    // Try the direct Reddit public API first — no Apify token required.
    const direct = await fetchSubredditAboutDirect(sub);
    if (direct) {
      return res.json({ sub, members: direct.members });
    }
    // Fall back to Apify-based fetching only if a token is available.
    if (!getApifyToken()) {
      return res.json({ sub, members: "?" });
    }
    const token = null;
    const meta = await fetchSubredditAbout(sub, token);
    res.json({ sub, members: meta.members });
  } catch (err) {
    console.error("Subreddit about API error:", err);
    res.status(500).json({ error: "Failed to fetch subreddit stats" });
  }
}

app.get("/api/subreddit-about", handleSubredditAboutRequest);
app.post("/api/subreddit-about", handleSubredditAboutRequest);

// ── Anthropic proxy (keeps API key server-side) ───────────────
app.post("/api/anthropic", async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "ANTHROPIC_API_KEY not configured on server. Add it in Railway environment variables." });
  const { model = "claude-sonnet-4-6", max_tokens = 1000, messages } = req.body;
  if (!Array.isArray(messages) || !messages.length) return res.status(400).json({ error: "Missing messages" });
  try {
    const response = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens, messages }),
    }, 30000);
    const data = await readJsonOrText(response);
    if (!response.ok) {
      const errMsg = data?.error?.message || (typeof data?.error === "string" ? data.error : null) || `Anthropic HTTP ${response.status}`;
      console.error(`[anthropic] API error ${response.status}:`, errMsg);
      // Forward the full error body so the client can read data.error.message
      return res.status(response.status).json({ error: { message: errMsg, status: response.status, raw: data } });
    }
    res.json(data);
  } catch (err) {
    console.error("Anthropic proxy error:", err);
    res.status(500).json({ error: { message: err.message || "Anthropic proxy failed" } });
  }
});

// ── SPA fallback ─────────────────────────────────────────────
app.get("*", (req, res) => {
  const indexPath = join(__dirname, "dist", "index.html");
  if (existsSync(indexPath)) res.sendFile(indexPath);
  else res.status(200).send("Building... please refresh in a moment.");
});

function buildIntelProfile(posts, meta = {}) {
  const now = new Date();
  const dateLabel = now.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const timeLabel = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const safePosts = Array.isArray(posts) ? posts : [];
  const text = safePosts.map((p) => `${p?.title || ""} ${p?.selftext || ""}`.toLowerCase()).join(" ");
  const stop = new Set(["this", "that", "with", "from", "have", "your", "about", "they", "their", "into", "just", "will", "what", "when", "where", "which", "while", "there", "would", "could", "should", "after", "before", "using", "used"]);
  const words = text.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 3 && !stop.has(w));
  const freq = new Map();
  for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
  const topWords = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([w]) => w);

  const scores = safePosts.map((p) => Number(p?.score || 0));
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const highScoreCount = scores.filter((s) => s >= 100).length;
  const confidence = Math.min(95, 40 + safePosts.length * 2 + Math.min(15, highScoreCount * 2));

  const hours = new Array(24).fill(0);
  for (const p of safePosts) {
    const utc = Number(p?.created_utc || 0);
    if (!utc) continue;
    const h = new Date(utc * 1000).getUTCHours();
    hours[h] += 1;
  }
  const topHour = hours.indexOf(Math.max(...hours));
  const lowHour = hours.indexOf(Math.min(...hours));
  const rules = (meta.rules || []).slice(0, 5);

  return {
    members: meta.members || "?",
    lastScanned: `Analyzed at ${timeLabel}`,
    confidence,
    rules: rules.length ? rules : ["No explicit rules discovered", "Be helpful and specific", "Avoid promotion-heavy replies"],
    bestTimes: { peak: `Around ${topHour}:00 UTC`, avoid: `Around ${lowHour}:00 UTC` },
    toneProfile: { preferred: "Helpful and practical", avoid: "Salesy or aggressive" },
    topFormats: [
      { format: "Concrete examples + short guidance", avgScore: Math.max(1, avgScore) },
      { format: "Problem + step-by-step fix", avgScore: Math.max(1, Math.round(avgScore * 0.85)) },
    ],
    whatWorks: [{ insight: safePosts.length ? `Live scan analyzed ${safePosts.length} recent post(s) from subreddit.` : "Not enough post data yet", score: Math.max(50, confidence - 5) }],
    whatFails: [{ insight: "Generic promotion and non-contextual replies underperform.", score: 84 }],
    keywords: { positive: topWords.length ? topWords : ["budget", "tracking", "expense"], negative: ["spam", "scam", "promo"] },
    modStrictness: Math.min(95, 45 + rules.length * 8),
    sentimentBreakdown: { positive: 42, neutral: 40, negative: 18 },
    learningLog: [{ date: dateLabel, entry: safePosts.length ? `Live scan analyzed ${safePosts.length} Reddit post(s)` : "Live scan ran with limited subreddit data" }],
    scanStatus: "analyzed",
    scanMessage: null,
  };
}

app.post("/api/intel", async (req, res) => {
  try {
    const rawSub = String(req.body?.sub || "").trim();
    if (!rawSub) return res.status(400).json({ error: "Missing subreddit" });
    if (!getApifyToken()) return res.status(503).json({ error: getApifyTokenError() });
    const sub = rawSub.startsWith("r/") ? rawSub : `r/${rawSub}`;
    const token = null;
    const directMeta = await fetchSubredditAboutDirect(sub);
    const { posts, errors } = await fetchSubredditPosts(sub, token);
    const meta = directMeta || deriveMetaFromPosts(posts);
    if (!posts.length) {
      const detail = errors.length ? ` (${errors.join(", ")})` : "";
      return res.status(502).json({ error: `No recent posts fetched for ${sub}. Try again in a moment.${detail}` });
    }
    const profile = buildIntelProfile(posts, meta);
    res.json({ profile: { ...profile, sub } });
  } catch (err) {
    console.error("Intel API error:", err);
    res.status(500).json({ error: "Failed to analyze subreddit" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`SocialScanner running on port ${PORT}`));
