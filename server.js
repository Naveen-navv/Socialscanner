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
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : null;

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

async function getRedditToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  try {
    const res = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "SocialScanner/1.0",
      },
      body: "grant_type=client_credentials",
    });
    const data = await res.json();
    if (!data.access_token) {
      console.warn("Reddit token refresh failed:", data);
      cachedToken = null; tokenExpiry = 0; // clear so retry actually retries
      return null;
    }
    cachedToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return cachedToken;
  } catch (err) {
    console.warn("Reddit token fetch error:", err.message);
    return null;
  }
}

// ── Fetch posts from a subreddit (hot + new) ─────────────────
async function fetchSubredditPosts(subName, token) {
  const name = subName.replace(/^r\//, "");
  const headers = { "User-Agent": "SocialScanner/1.0" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const base = token ? "https://oauth.reddit.com" : "https://www.reddit.com";
  const [hotRes, newRes] = await Promise.allSettled([
    fetch(`${base}/r/${name}/hot.json?limit=50`, { headers }),
    fetch(`${base}/r/${name}/new.json?limit=50`, { headers }),
  ]);
  const posts = [];
  const seen = new Set();
  for (const result of [hotRes, newRes]) {
    if (result.status !== "fulfilled") continue;
    const res = result.value;
    if (!res.ok) continue;
    let data;
    try { data = await res.json(); } catch { continue; }
    for (const child of data?.data?.children || []) {
      if (!seen.has(child.data.id)) { seen.add(child.data.id); posts.push(child.data); }
    }
  }
  return posts;
}

// ── Search all of Reddit ─────────────────────────────────────
async function searchReddit(query, token) {
  const headers = { "User-Agent": "SocialScanner/1.0" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const base = token ? "https://oauth.reddit.com" : "https://www.reddit.com";
  const url = `${base}/search.json?q=${encodeURIComponent(query)}&sort=relevance&limit=100&type=link&t=week`;
  const res = await fetch(url, { headers });
  if (!res.ok) return [];
  let data;
  try { data = await res.json(); } catch { return []; }
  return (data?.data?.children || []).map((c) => c.data);
}

// ── Fetch top comment ────────────────────────────────────────
async function fetchTopComment(postId, token) {
  const headers = { "User-Agent": "SocialScanner/1.0" };
  const url = token
    ? `https://oauth.reddit.com/comments/${postId}.json?limit=3&depth=1`
    : `https://www.reddit.com/comments/${postId}.json?limit=3&depth=1`;
  if (token) headers["Authorization"] = `Bearer ${token}`;
  try {
    const res = await fetch(url, { headers });
    const data = await res.json();
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

    let token = await getRedditToken();
    if (!token) token = await getRedditToken();
    const threads = [];
    let allPosts = [];
    const fetchErrors = [];
    if (!token) fetchErrors.push("Reddit OAuth token unavailable, falling back to public endpoints");

    if (searchAll) {
      const queryTerms = intentPatterns.slice(0, 4).map((p) => `"${p}"`);
      const toolQuery = toolTerms.slice(0, 6).join(" OR ");
      const query = `(${queryTerms.join(" OR ")}) ${toolQuery ? `(${toolQuery})` : ""}`.trim();
      allPosts = await searchReddit(query, token);
      if (!allPosts.length) fetchErrors.push("Reddit search returned 0 results");
    } else {
      for (const sub of subreddits) {
        const subName = sub.name || sub;
        try {
          const posts = await fetchSubredditPosts(subName, token);
          if (posts.length === 0) fetchErrors.push(`${subName}: 0 posts (possibly rate-limited)`);
          allPosts.push(...posts.map((p) => ({ ...p, _sub: sub })));
        } catch (err) {
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
    res.json({ threads, debug });
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
  if (!clientId || !clientSecret) return res.json({ ok: false, error: "Missing REDDIT_CLIENT_ID or REDDIT_CLIENT_SECRET" });
  try {
    const r = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "SocialScanner/1.0",
      },
      body: "grant_type=client_credentials",
    });
    const data = await r.json();
    if (data.access_token) return res.json({ ok: true, message: "Reddit credentials valid", tokenPreview: data.access_token.slice(0, 10) + "..." });
    return res.json({ ok: false, error: "Reddit rejected credentials", detail: data });
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`SocialScanner running on port ${PORT}`));
