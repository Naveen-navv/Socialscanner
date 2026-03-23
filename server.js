import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, "dist")));

// ── Reddit OAuth token cache ──────────────────────────────────
let cachedToken = null;
let tokenExpiry = 0;

async function getRedditToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

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
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

// ── Fetch posts from a subreddit (hot + new combined) ────────
async function fetchSubredditPosts(subName, token) {
  const name = subName.replace(/^r\//, "");
  const headers = { "User-Agent": "SocialScanner/1.0" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const base = token ? `https://oauth.reddit.com` : `https://www.reddit.com`;

  const [hotRes, newRes] = await Promise.allSettled([
    fetch(`${base}/r/${name}/hot.json?limit=50`, { headers }),
    fetch(`${base}/r/${name}/new.json?limit=50`, { headers }),
  ]);

  const posts = [];
  const seen = new Set();
  for (const result of [hotRes, newRes]) {
    if (result.status !== "fulfilled") continue;
    const data = await result.value.json();
    for (const child of data?.data?.children || []) {
      if (!seen.has(child.data.id)) {
        seen.add(child.data.id);
        posts.push(child.data);
      }
    }
  }
  return posts;
}

// ── Fetch top comment for a post ──────────────────────────────
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
    return {
      text: top.body?.slice(0, 250) || "",
      upvotes: top.score || 0,
      author: `u/${top.author}`,
    };
  } catch {
    return null;
  }
}

function timeAgo(utc) {
  const diff = Date.now() / 1000 - utc;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── POST /api/reddit ──────────────────────────────────────────
app.post("/api/reddit", async (req, res) => {
  try {
    const { subreddits = [], keywords = [], intentPatterns = [] } = req.body;
    if (!subreddits.length) return res.json({ threads: [] });

    const token = await getRedditToken();
    const threads = [];

    for (const sub of subreddits) {
      const subName = sub.name || sub;
      let posts;
      try {
        posts = await fetchSubredditPosts(subName, token);
      } catch (err) {
        console.warn(`Failed to fetch ${subName}:`, err.message);
        continue;
      }

      for (const post of posts) {
        const text = `${post.title} ${post.selftext || ""}`.toLowerCase();

        // Must match at least one intent pattern
        const matchedPattern = intentPatterns.find((p) =>
          text.includes(p.toLowerCase())
        );
        if (!matchedPattern) continue;

        // Must be about a finance tool/app — not just any finance topic
        const toolTerms = [
          "app", "tool", "software", "tracker", "tracking", "budgeting app",
          "expense tracker", "finance app", "money app", "categorize", "categorization",
          "sync", "bank sync", "transaction", "plaid", "open banking",
          // common finance apps people compare
          "ynab", "mint", "copilot", "monarch", "simplifi", "pocketguard",
          "goodbudget", "walnut", "monefy", "spendee", "toshl", "cleo",
          "empower", "personal capital", "quicken", "tiller",
          // feature language
          "net worth", "cash flow", "spending report", "auto categoriz",
          "budget nudge", "overdraft", "upi", "bank statement",
        ];
        const isAboutTool = keywords.some((k: string) => text.includes(k.toLowerCase())) ||
          toolTerms.some((t) => text.includes(t));
        if (!isAboutTool) continue;

        const replyTo = await fetchTopComment(post.id, token);

        threads.push({
          id: post.id,
          title: post.title,
          sub: subName,
          subMembers: sub.members || "?",
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
    }

    res.json({ threads });
  } catch (err) {
    console.error("Reddit API error:", err);
    res.status(500).json({ error: "Failed to fetch Reddit threads" });
  }
});

// ── Health check ──────────────────────────────────────────────
app.get("/health", (req, res) => res.json({ status: "ok" }));

// ── Credential test endpoint ───────────────────────────────────
app.get("/api/test", async (req, res) => {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.json({ ok: false, error: "Missing REDDIT_CLIENT_ID or REDDIT_CLIENT_SECRET env vars" });
  }
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
    if (data.access_token) {
      return res.json({ ok: true, message: "Reddit credentials valid ✅", tokenPreview: data.access_token.slice(0, 10) + "..." });
    }
    return res.json({ ok: false, error: "Reddit rejected credentials", detail: data });
  } catch (e) {
    return res.json({ ok: false, error: e.message });
  }
});

// ── SPA fallback ──────────────────────────────────────────────
import { existsSync } from "fs";
app.get("*", (req, res) => {
  const indexPath = join(__dirname, "dist", "index.html");
  if (existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(200).send("Building... please refresh in a moment.");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`SocialScanner running on port ${PORT}`)
);
