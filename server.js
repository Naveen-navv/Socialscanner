import express from "express";
import "dotenv/config";
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

// ── Reddit OAuth token cache ─────────────────────────────────
let cachedToken = null;
let tokenExpiry = 0;
let lastRedditAuthError = null;
const REDDIT_RESULT_TTL_MS = 5 * 60 * 1000;
const SUBREDDIT_EMPTY_TTL_MS = 3 * 60 * 1000;
const REDDIT_USER_AGENT = "SocialScanner/1.0";
const redditResultCache = new Map();
const subredditCooldowns = new Map();

function buildRedditTokenRequest(grantType, extraParams = {}) {
  const params = new URLSearchParams({ grant_type: grantType });
  for (const [key, value] of Object.entries(extraParams)) {
    if (value) params.set(key, value);
  }
  return params.toString();
}

async function readRedditResponse(res) {
  const contentType = res.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/json")) return await res.json();
    return await res.text();
  } catch {
    return null;
  }
}

function formatRedditHttpError(status, payload) {
  if (payload && typeof payload === "object") {
    const message = payload.message || payload.error_description || payload.reason || payload.error;
    if (message) return `HTTP ${status}: ${message}`;
  }
  if (typeof payload === "string" && payload.trim()) {
    return `HTTP ${status}: ${payload.trim().slice(0, 160)}`;
  }
  return `HTTP ${status}`;
}

async function getRedditToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  const refreshToken = process.env.REDDIT_REFRESH_TOKEN;
  if (!clientId || !clientSecret) {
    lastRedditAuthError = "Missing REDDIT_CLIENT_ID or REDDIT_CLIENT_SECRET";
    return null;
  }

  const attempts = refreshToken
    ? [
        { label: "refresh_token", body: buildRedditTokenRequest("refresh_token", { refresh_token: refreshToken }) },
        { label: "client_credentials", body: buildRedditTokenRequest("client_credentials") },
      ]
    : [{ label: "client_credentials", body: buildRedditTokenRequest("client_credentials") }];
  const errors = [];

  for (const attempt of attempts) {
    try {
      const res = await fetch("https://www.reddit.com/api/v1/access_token", {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": REDDIT_USER_AGENT,
        },
        body: attempt.body,
      });
      const data = await readRedditResponse(res);
      if (!res.ok || !data?.access_token) {
        errors.push(`${attempt.label}: ${formatRedditHttpError(res.status, data)}`);
        continue;
      }
      cachedToken = data.access_token;
      tokenExpiry = Date.now() + Math.max(60, (Number(data.expires_in) || 3600) - 60) * 1000;
      lastRedditAuthError = null;
      return cachedToken;
    } catch (err) {
      errors.push(`${attempt.label}: ${(err && err.message) || "network error"}`);
    }
  }

  cachedToken = null;
  tokenExpiry = 0;
  lastRedditAuthError = errors.length ? errors.join(" | ") : "Unknown Reddit auth error";
  console.warn("Reddit token fetch failed:", lastRedditAuthError);
  return null;
}

// ── Fetch posts from a subreddit (hot + new) ─────────────────
async function fetchSubredditPosts(subName, token) {
  const name = subName.replace(/^r\//, "");
  const headers = { "User-Agent": REDDIT_USER_AGENT };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const base = token ? "https://oauth.reddit.com" : "https://www.reddit.com";
  const endpoints = [
    { label: "hot", url: `${base}/r/${name}/hot.json?limit=50&raw_json=1` },
    { label: "new", url: `${base}/r/${name}/new.json?limit=50&raw_json=1` },
  ];
  const results = await Promise.allSettled(endpoints.map((endpoint) => fetch(endpoint.url, { headers })));
  const posts = [];
  const seen = new Set();
  const errors = [];
  const statuses = [];
  for (let i = 0; i < results.length; i++) {
    const endpoint = endpoints[i];
    const result = results[i];
    if (result.status !== "fulfilled") {
      errors.push(`${endpoint.label}: ${result.reason?.message || "request failed"}`);
      continue;
    }
    const response = result.value;
    statuses.push(`${endpoint.label}:${response.status}`);
    const data = await readRedditResponse(response);
    if (!response.ok) {
      errors.push(`${endpoint.label}: ${formatRedditHttpError(response.status, data)}`);
      continue;
    }
    for (const child of data?.data?.children || []) {
      if (!seen.has(child.data.id)) { seen.add(child.data.id); posts.push(child.data); }
    }
  }
  return { posts, errors, statuses };
}

function getRedditCacheKey({ subreddits = [], intentPatterns = [], toolTerms = [], searchAll = false }) {
  const normalizedSubs = subreddits
    .map((sub) => (typeof sub === "string" ? sub : sub.name || ""))
    .filter(Boolean)
    .sort();
  const normalizedPatterns = [...intentPatterns].filter(Boolean).sort();
  const normalizedToolTerms = [...toolTerms].filter(Boolean).sort();
  return JSON.stringify({
    searchAll,
    subreddits: normalizedSubs,
    intentPatterns: normalizedPatterns,
    toolTerms: normalizedToolTerms,
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

// ── Search all of Reddit ─────────────────────────────────────
async function searchReddit(query, token) {
  const headers = { "User-Agent": REDDIT_USER_AGENT };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const base = token ? "https://oauth.reddit.com" : "https://www.reddit.com";
  const url = `${base}/search.json?q=${encodeURIComponent(query)}&sort=relevance&limit=100&type=link&t=week&raw_json=1`;
  const res = await fetch(url, { headers });
  const data = await readRedditResponse(res);
  if (!res.ok) throw new Error(formatRedditHttpError(res.status, data));
  return (data?.data?.children || []).map((c) => c.data);
}

// ── Fetch top comment ────────────────────────────────────────
async function fetchTopComment(postId, token) {
  const headers = { "User-Agent": REDDIT_USER_AGENT };
  const url = token
    ? `https://oauth.reddit.com/comments/${postId}.json?limit=3&depth=1&raw_json=1`
    : `https://www.reddit.com/comments/${postId}.json?limit=3&depth=1&raw_json=1`;
  if (token) headers["Authorization"] = `Bearer ${token}`;
  try {
    const res = await fetch(url, { headers });
    const data = await readRedditResponse(res);
    if (!res.ok || !Array.isArray(data)) return null;
    const comments = data?.[1]?.data?.children || [];
    const top = comments.find((c) => c.kind === "t1")?.data;
    if (!top || top.score < 1) return null;
    return { text: top.body?.slice(0, 250) || "", upvotes: top.score || 0, author: `u/${top.author}` };
  } catch { return null; }
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
    const { subreddits = [], keywords = [], intentPatterns = [], toolTerms = [], searchAll = false } = req.body;
    if (!searchAll && !subreddits.length) return res.json({ threads: [] });

    const cacheKey = getRedditCacheKey({ subreddits, intentPatterns, toolTerms, searchAll });
    const cachedResult = getCachedRedditResult(cacheKey);
    if (cachedResult) {
      return res.json({
        ...cachedResult,
        debug: `${cachedResult.debug} | Cache: hit`,
      });
    }

    const token = await getRedditToken();
    const hasOAuth = Boolean(token);
    const threads = [];
    let allPosts = [];
    const fetchErrors = [];
    if (!hasOAuth) {
      fetchErrors.push(
        lastRedditAuthError
          ? `Reddit OAuth unavailable (${lastRedditAuthError}), falling back to public endpoints`
          : "Reddit OAuth token unavailable, falling back to public endpoints"
      );
    }

    if (searchAll) {
      const queryTerms = intentPatterns.slice(0, 4).map((p) => `"${p}"`);
      const toolQuery = toolTerms.slice(0, 6).join(" OR ");
      const query = `(${queryTerms.join(" OR ")}) ${toolQuery ? `(${toolQuery})` : ""}`.trim();
      try {
        allPosts = await searchReddit(query, token);
        if (!allPosts.length) fetchErrors.push("Reddit search returned 0 results");
      } catch (err) {
        fetchErrors.push(`Reddit search failed: ${err.message}`);
      }
    } else {
      for (const sub of subreddits) {
        const subName = sub.name || sub;
        const cooldown = getSubredditCooldown(subName);
        if (cooldown) {
          fetchErrors.push(`${subName}: cooldown active (${cooldown.reason})`);
          continue;
        }
        try {
          const { posts, errors, statuses } = await fetchSubredditPosts(subName, token);
          if (posts.length === 0) {
            const rateLimited = errors.some((msg) => msg.includes("HTTP 429"));
            if (hasOAuth && rateLimited) setSubredditCooldown(subName, "rate limited");
            const detail = errors.length
              ? errors.join(", ")
              : `${hasOAuth ? "no posts returned from OAuth API" : "public endpoint returned no posts"}${statuses.length ? ` [${statuses.join(", ")}]` : ""}`;
            fetchErrors.push(`${subName}: ${detail}`);
          } else if (errors.length) {
            fetchErrors.push(`${subName}: partial fetch (${errors.join(", ")})`);
          }
          allPosts.push(...posts.map((p) => ({ ...p, _sub: sub })));
        } catch (err) {
          if (hasOAuth && String(err.message || "").includes("429")) setSubredditCooldown(subName, err.message);
          fetchErrors.push(`${subName}: ${err.message}`);
          console.warn(`Failed to fetch ${subName}:`, err.message);
        }
      }
    }

    let intentMatched = 0;
    let toolMatched = 0;

    for (const post of allPosts) {
      const text = `${post.title} ${post.selftext || ""}`.toLowerCase();
      const matchedPattern = intentPatterns.find((p) => text.includes(p.toLowerCase()));
      if (!matchedPattern) continue;
      intentMatched++;
      const isAboutTool = toolTerms.length === 0 ? true : toolTerms.some((t) => text.includes(t.toLowerCase()));
      if (!isAboutTool) continue;
      toolMatched++;

      // Only fetch top comment for first 15 matches to avoid rate limiting
      const replyTo = threads.length < 15 ? await fetchTopComment(post.id, token) : null;
      const subName = searchAll ? `r/${post.subreddit}` : (post._sub?.name || post._sub || `r/${post.subreddit}`);
      const subMembers = searchAll ? "?" : (post._sub?.members || "?");

      threads.push({
        id: post.id,
        title: post.title,
        sub: subName,
        subMembers,
        score: post.score,
        comments: post.num_comments,
        time: timeAgo(post.created_utc),
        intent: post.score > 500 ? "High" : "Medium",
        matchedPattern,
        author: `u/${post.author}`,
        authorKarma: "?",
        body: post.selftext?.trim() || post.title,
        replyTo,
        reply: null,
        status: "new",
        performance: null,
        url: `https://reddit.com${post.permalink}`,
      });
    }

    const debug = `Fetched ${allPosts.length} posts → ${intentMatched} matched intent → ${toolMatched} matched tool terms → ${threads.length} threads returned` + (fetchErrors.length ? ` | Errors: ${fetchErrors.join("; ")}` : "");
    console.log(debug);
    const responseBody = { threads, debug };
    const shouldCache = threads.length > 0 && fetchErrors.length === 0;
    if (shouldCache) setCachedRedditResult(cacheKey, responseBody);
    res.json(responseBody);
  } catch (err) {
    console.error("Reddit API error:", err);
    res.status(500).json({ error: "Failed to fetch Reddit threads" });
  }
});

// ── Health check ─────────────────────────────────────────────
app.get("/health", (req, res) => res.json({ status: "ok" }));

// ── Credential test ──────────────────────────────────────────
app.get("/api/test", async (req, res) => {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  const refreshToken = process.env.REDDIT_REFRESH_TOKEN;
  if (!clientId || !clientSecret) return res.json({ ok: false, error: "Missing REDDIT_CLIENT_ID or REDDIT_CLIENT_SECRET" });
  try {
    const body = refreshToken
      ? buildRedditTokenRequest("refresh_token", { refresh_token: refreshToken })
      : buildRedditTokenRequest("client_credentials");
    const r = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": REDDIT_USER_AGENT,
      },
      body,
    });
    const data = await readRedditResponse(r);
    if (r.ok && data?.access_token) {
      return res.json({
        ok: true,
        grantType: refreshToken ? "refresh_token" : "client_credentials",
        message: "Reddit credentials valid",
        tokenPreview: data.access_token.slice(0, 10) + "...",
      });
    }
    return res.json({
      ok: false,
      grantType: refreshToken ? "refresh_token" : "client_credentials",
      error: "Reddit rejected credentials",
      detail: formatRedditHttpError(r.status, data),
    });
  } catch (e) {
    return res.json({ ok: false, error: e.message });
  }
});

// ── SPA fallback ─────────────────────────────────────────────
app.get("*", (req, res) => {
  const indexPath = join(__dirname, "dist", "index.html");
  if (existsSync(indexPath)) res.sendFile(indexPath);
  else res.status(200).send("Building... please refresh in a moment.");
});

async function fetchSubredditAbout(subName, token) {
  const name = subName.replace(/^r\//i, "");
  const headers = { "User-Agent": REDDIT_USER_AGENT };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const base = token ? "https://oauth.reddit.com" : "https://www.reddit.com";
  const [aboutRes, rulesRes] = await Promise.allSettled([
    fetch(`${base}/r/${name}/about.json?raw_json=1`, { headers }),
    fetch(`${base}/r/${name}/about/rules.json?raw_json=1`, { headers }),
  ]);

  let members = "?";
  let rules = [];
  if (aboutRes.status === "fulfilled" && aboutRes.value.ok) {
    try {
      const aboutData = await readRedditResponse(aboutRes.value);
      const subscribers = aboutData?.data?.subscribers;
      if (typeof subscribers === "number") {
        if (subscribers >= 1000000) members = `${(subscribers / 1000000).toFixed(1)}M`;
        else if (subscribers >= 1000) members = `${Math.round(subscribers / 1000)}K`;
        else members = String(subscribers);
      }
    } catch {}
  }
  if (rulesRes.status === "fulfilled" && rulesRes.value.ok) {
    try {
      const rulesData = await readRedditResponse(rulesRes.value);
      rules = (rulesData?.rules || []).map((r) => r.short_name || r.description || "").filter(Boolean);
    } catch {}
  }
  return { members, rules };
}

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
    const sub = rawSub.startsWith("r/") ? rawSub : `r/${rawSub}`;
    const token = await getRedditToken();
    const { posts, errors } = await fetchSubredditPosts(sub, token);
    const meta = await fetchSubredditAbout(sub, token);
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
