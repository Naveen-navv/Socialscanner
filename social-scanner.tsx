import { useState, useEffect, useRef } from "react";

const st = {
  async get(k) { try { const r = await window.storage.get(k); return r ? JSON.parse(r.value) : null; } catch { return null; } },
  async set(k, v) { try { await window.storage.set(k, JSON.stringify(v)); } catch {} },
  async del(k) { try { await window.storage.delete(k); } catch {} }
};

const C = { bg: "#0f1117", sb: "#161822", card: "#1c1f2e", border: "#2a2d3e", text: "#e2e8f0", muted: "#94a3b8", accent: "#14b8a6", accentBg: "rgba(20,184,166,0.1)", danger: "#ef4444", warn: "#f59e0b", purple: "#8b5cf6", green: "#22c55e", blue: "#3b82f6", orange: "#f97316" };

const Badge = ({ children, color = C.accent, onRemove }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, padding: "4px 10px", borderRadius: 6, background: `${color}18`, color, border: `1px solid ${color}35`, fontWeight: 500 }}>
    {children}{onRemove && <span onClick={e => { e.stopPropagation(); onRemove(); }} style={{ cursor: "pointer", opacity: 0.7, fontWeight: 700, marginLeft: 2 }}>×</span>}
  </span>
);
const Spark = ({ data, color = C.accent, w = 80, h = 24 }) => {
  if (!data?.length) return null;
  const mx = Math.max(...data), mn = Math.min(...data);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - mn) / (mx - mn || 1)) * h}`).join(" ");
  return <svg width={w} height={h} style={{ display: "block" }}><polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" /></svg>;
};

// ── DATA ──────────────────────────────────────────────────────
const SUBS_DB = [
  { name: "r/PersonalFinance", m: "19.5M" }, { name: "r/Budgeting", m: "320K" }, { name: "r/FinancialPlanning", m: "180K" },
  { name: "r/IndiaInvestments", m: "450K" }, { name: "r/SaaS", m: "98K" }, { name: "r/startups", m: "1.2M" },
  { name: "r/indiehackers", m: "45K" }, { name: "r/Entrepreneur", m: "2.1M" }, { name: "r/microsaas", m: "32K" }, { name: "r/nocode", m: "89K" },
];
const DEF_FA = [{ id: "fa_1", name: "Kedil - Budgeting", icon: "💰", brandKeywords: ["Kedil", "kedil.money"], competitors: ["YNAB", "Mint", "Goodbudget", "Walnut"], subreddits: [{ name: "r/PersonalFinance", members: "19.5M" }, { name: "r/Budgeting", members: "320K" }, { name: "r/IndiaInvestments", members: "450K" }], intentPatterns: ["best", "vs", "alternative", "switching from", "review", "recommend", "looking for"] }];
const DEF_THREADS = [
  { id: "t1", title: "Best budgeting app for someone in India?", sub: "r/PersonalFinance", subMembers: "19.5M", score: 892, comments: 345, time: "1h ago", intent: "High", matchedPattern: "best", author: "u/mumbaidev", authorKarma: "12.4K", body: "I've been using Mint but it never synced properly with my Indian bank accounts. Looking for something that actually works with UPI and Indian banks.", replyTo: { text: "Honestly the best part about switching was that my UPI transactions finally showed up correctly. Everything just syncs.", upvotes: 47, author: "u/financegeek" }, reply: null, status: "new", performance: null },
  { id: "t2", title: "Frustrated with Mint shutting down — what should I switch to?", sub: "r/Budgeting", subMembers: "320K", score: 567, comments: 201, time: "2h ago", intent: "High", matchedPattern: "switching from", author: "u/mintrefugee", authorKarma: "8.2K", body: "I've been using Mint for 8 years and now that it's gone, I need something that syncs with my bank and categorizes expenses automatically.", replyTo: { text: "I tried YNAB after Mint died and couldn't handle the zero-based budgeting approach. Too much work.", upvotes: 89, author: "u/budgetfrustrated" }, reply: "I was in the same boat — 6 years on Mint. Switched to Kedil about 3 months ago and it's been solid. Auto-categorizes everything including UPI transactions.\n\nThe budget nudges warn you before you overspend instead of just showing red numbers after.\n\nDisclaimer: not affiliated, just a user who found something that works.", status: "posted", performance: { upvotes: 23, replies: 4, views: 2100 } },
  { id: "t3", title: "YNAB vs alternatives — what actually sticks?", sub: "r/PersonalFinance", subMembers: "19.5M", score: 1234, comments: 456, time: "3h ago", intent: "High", matchedPattern: "vs", author: "u/budgetseeker", authorKarma: "5.7K", body: "I keep seeing YNAB recommended everywhere but at $15/month it feels steep. What are you all using? I need auto-categorization and a clean mobile app.", replyTo: null, reply: null, status: "new", performance: null },
  { id: "t4", title: "Any tool that gives a financial health score?", sub: "r/FinancialPlanning", subMembers: "180K", score: 345, comments: 123, time: "5h ago", intent: "High", matchedPattern: "looking for", author: "u/scoreme", authorKarma: "3.1K", body: "I want something that looks at my spending patterns and tells me how I'm doing overall. Not just tracking, but scoring my financial health.", replyTo: null, reply: null, status: "new", performance: null },
  { id: "t5", title: "Walnut app alternative for expense tracking in India?", sub: "r/IndiaInvestments", subMembers: "450K", score: 456, comments: 156, time: "6h ago", intent: "High", matchedPattern: "alternative", author: "u/delhifinance", authorKarma: "6.3K", body: "Walnut has been getting worse with every update. Looking for something that reads SMS, categorizes UPI payments, and gives me a monthly breakdown.", replyTo: null, reply: null, status: "new", performance: null },
  { id: "t6", title: "How do you actually stick to a budget?", sub: "r/Budgeting", subMembers: "320K", score: 678, comments: 234, time: "8h ago", intent: "Medium", matchedPattern: "recommend", author: "u/budgetfail", authorKarma: "1.8K", body: "I've tried YNAB, Goodbudget, and spreadsheets. Nothing sticks past 2 weeks. Is it a willpower problem or wrong tools?", replyTo: null, reply: null, status: "new", performance: null },
];
const DEF_METRICS = [
  { id: "traffic", name: "Website Traffic", value: "2,847", change: "+23%", trend: "up", icon: "🌐", data: [120,135,142,155,168,180,195,210,225,240,260,285] },
  { id: "google", name: "Google Rankings", value: "14 kw", change: "+3", trend: "up", icon: "🔍", data: [5,6,7,7,8,9,9,10,11,12,13,14] },
  { id: "llm", name: "LLM Mentions", value: "89", change: "+41%", trend: "up", icon: "🤖", data: [12,18,22,28,35,40,48,55,62,70,78,89] },
  { id: "engagement", name: "Engagement", value: "8.4%", change: "+1.2%", trend: "up", icon: "💬", data: [4.2,4.8,5.1,5.5,6.0,6.3,6.8,7.1,7.5,7.8,8.1,8.4] },
  { id: "mentions", name: "Brand Mentions", value: "156", change: "+28%", trend: "up", icon: "📣", data: [45,52,58,65,72,80,88,95,105,120,138,156] },
  { id: "leads_m", name: "Leads", value: "34", change: "+12", trend: "up", icon: "🎯", data: [8,10,12,14,16,18,20,22,25,28,31,34] },
];
const DEF_INTEL = [
  { id: "si_1", sub: "r/PersonalFinance", members: "19.5M", lastScanned: "2h ago", confidence: 92, rules: ["No self-promotion or affiliate links", "No referral codes", "Posts must be about personal finance", "Be helpful and respectful"], bestTimes: { peak: "Tue & Thu 9-11am EST", avoid: "Saturday late night" }, toneProfile: { preferred: "Expert & educational", avoid: "Salesy or casual" }, topFormats: [{ format: "Personal experience + data", avgScore: 342 }, { format: "Step-by-step breakdown", avgScore: 289 }, { format: "Comparison/review", avgScore: 234 }], whatWorks: [{ insight: "First-person stories with real numbers get 3x more upvotes", score: 95 }, { insight: "Mentioning tools framed as personal experience is accepted", score: 88 }, { insight: "Actionable steps get saved 4x more", score: 82 }, { insight: "Responses under 150 words perform better", score: 76 }], whatFails: [{ insight: "Direct product pitches get downvoted and removed within 2h", score: 94 }, { insight: "Generic advice like 'just budget more' gets negative reactions", score: 87 }, { insight: "Links in first comment flagged by AutoMod", score: 83 }], keywords: { positive: ["helped me", "game changer", "finally", "switched to", "honest review"], negative: ["scam", "ad", "shill", "spam", "affiliate"] }, modStrictness: 84, sentimentBreakdown: { positive: 42, neutral: 38, negative: 20 }, learningLog: [{ date: "Mar 18", entry: "Posts mentioning 'Indian banks' getting 2x engagement" }, { date: "Mar 16", entry: "AutoMod now removes comments with 2+ URLs" }] },
  { id: "si_2", sub: "r/Budgeting", members: "320K", lastScanned: "3h ago", confidence: 87, rules: ["Be kind and supportive", "No judgmental comments", "Self-promo in weekly thread only", "Flair your posts"], bestTimes: { peak: "Mon & Wed 12-2pm EST", avoid: "Friday evening" }, toneProfile: { preferred: "Supportive & relatable", avoid: "Condescending or preachy" }, topFormats: [{ format: "Vulnerability + solution", avgScore: 456 }, { format: "Tool recommendation with disclaimer", avgScore: 312 }], whatWorks: [{ insight: "Empathetic tone ('I've been there') gets 4x engagement", score: 93 }, { insight: "Disclaimers like 'not affiliated' build trust", score: 89 }, { insight: "Sharing specific $ amounts feels authentic", score: 81 }], whatFails: [{ insight: "Unsolicited product recs without context", score: 91 }, { insight: "Judgmental tone ('you should have saved more')", score: 88 }, { insight: "Long technical breakdowns — sub prefers concise", score: 74 }], keywords: { positive: ["finally clicked", "life changing", "simple", "helped me"], negative: ["just stop spending", "it's easy", "obviously"] }, modStrictness: 62, sentimentBreakdown: { positive: 55, neutral: 30, negative: 15 }, learningLog: [{ date: "Mar 17", entry: "Vulnerability posts getting record engagement" }, { date: "Mar 15", entry: "New flair: 'Tool Recommendation' for app mentions" }] },
  { id: "si_3", sub: "r/IndiaInvestments", members: "450K", lastScanned: "5h ago", confidence: 79, rules: ["English only", "No referral links", "Use search before posting", "Flair required"], bestTimes: { peak: "Mon-Fri 10am-1pm IST", avoid: "Weekends" }, toneProfile: { preferred: "Knowledgeable & India-specific", avoid: "Generic US-centric advice" }, topFormats: [{ format: "India-specific comparison", avgScore: 389 }, { format: "Regional bank experience", avgScore: 201 }], whatWorks: [{ insight: "India-specific context (UPI, NEFT, tax) gives credibility", score: 96 }, { insight: "Mentioning exact Indian banks shows authenticity", score: 91 }, { insight: "Rupee amounts not USD", score: 85 }], whatFails: [{ insight: "US-centric tool recs (Mint, YNAB without India context)", score: 93 }, { insight: "Posts without Indian regulatory context", score: 86 }, { insight: "Using $ instead of ₹ signals non-Indian user", score: 80 }], keywords: { positive: ["UPI", "Indian banks", "₹", "ITR", "80C", "SIP"], negative: ["USD", "US only", "not available in India"] }, modStrictness: 76, sentimentBreakdown: { positive: 38, neutral: 45, negative: 17 }, learningLog: [{ date: "Mar 18", entry: "Tax season driving surge in 80C/80D threads" }, { date: "Mar 12", entry: "Community shifting away from Walnut after update" }] },
];
const TONES = [{ id: "helpful", label: "🤝 Helpful" }, { id: "casual", label: "😄 Casual" }, { id: "expert", label: "🎓 Expert" }, { id: "subtle", label: "🎭 Subtle" }];
// ── AI REPLY GENERATION ───────────────────────────────────────
const genReplyAI = async (thread, tone, len, brandVoice, intelData) => {
  const toneGuide = { helpful: "Be friendly, informative, and genuinely helpful. Share personal experience.", casual: "Be conversational and relatable. Use casual language like you're chatting with a friend.", expert: "Be authoritative with specific data points and structured advice. Show deep knowledge.", subtle: "Be completely natural. Mention the product only if it fits organically. No pitch feel at all." }[tone] || "";
  const lenGuide = { short: "Keep it under 60 words. One concise paragraph.", medium: "2-3 paragraphs, around 100-150 words.", long: "Detailed response with sections/bullet points, 200-300 words." }[len] || "";

  let intelContext = "";
  if (intelData) {
    intelContext = `\n\nSUBREDDIT INTELLIGENCE for ${intelData.sub}:
- Rules: ${intelData.rules.join("; ")}
- Preferred tone: ${intelData.toneProfile.preferred}
- Avoid tone: ${intelData.toneProfile.avoid}
- What works: ${intelData.whatWorks.map(w => w.insight).join("; ")}
- What fails: ${intelData.whatFails.map(w => w.insight).join("; ")}
- Use these keywords naturally: ${intelData.keywords.positive.join(", ")}
- NEVER use these words: ${intelData.keywords.negative.join(", ")}`;
  }

  const prompt = `You are writing a Reddit reply for a personal finance app called Kedil (kedil.money). Kedil helps users in India with budgeting, expense tracking, UPI transaction categorization, and financial discipline.

THREAD TO REPLY TO:
Title: ${thread.title}
Subreddit: ${thread.sub}
Post: ${thread.body}
${thread._replyTarget === "comment" && thread.replyTo ? `\nYOU ARE REPLYING TO THIS COMMENT:\n"${thread.replyTo.text}" by ${thread.replyTo.author} (${thread.replyTo.upvotes} upvotes)\nYour reply should directly address this comment's point.` : `\nYOU ARE REPLYING DIRECTLY TO THE ORIGINAL POST.\nYour reply should address the post author's question/problem directly.`}

TONE: ${tone} — ${toneGuide}
LENGTH: ${len} — ${lenGuide}
${intelContext}

CRITICAL RULES:
- ${brandVoice ? "HIGHEST PRIORITY: Follow the Brand Voice guidelines below EXACTLY. They override all other instructions." : "Write as a real Reddit user, NOT as a brand account. Frame as personal experience."}
- Match the subreddit's culture and tone
- Never sound like a generic ad
- Use markdown formatting if the length is "long"
- Do NOT include any preamble — just the reply text directly
${brandVoice ? `\nBRAND VOICE (MUST FOLLOW — THIS OVERRIDES ALL OTHER RULES):\n${brandVoice}` : ""}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, messages: [{ role: "user", content: prompt }] })
    });
    const data = await res.json();
    const text = data.content?.map(b => b.type === "text" ? b.text : "").join("") || "";
    return text.trim();
  } catch (e) {
    console.error("AI generation failed:", e);
    return null;
  }
};

// Fallback for when API fails
const genReplyFallback = (t, tone, len) => {
  const o = { helpful: "Great question!", casual: "Oh man, I feel this.", expert: "This is a common challenge.", subtle: "" }[tone] || "";
  if (len === "short") return `${o} Have you looked at Kedil? It auto-categorizes UPI transactions and has budget nudges. Worth checking out.`;
  if (len === "long") return `${o} I've tried 6-7 apps for this.\n\n**What didn't work:**\n- YNAB: Learning curve killed it\n- Mint (RIP): Good tracking, bad for behavior\n- Walnut: Gets worse every update\n\n**What's working:**\nSwitched to Kedil ~3 months ago:\n\n1. **Auto-categorization** — AI tags transactions, even UPI\n2. **Cash flow view** — Money in vs out that makes sense\n3. **Budget nudges** — Warns BEFORE you overspend\n4. **Indian banks** — UPI, NEFT, all syncs\n\nDisclaimer: not affiliated, just a user.`;
  return `${o} Switched to Kedil about 3 months ago and it's been solid.\n\nAuto-categorizes everything including UPI, dashboard shows where money goes without manual entry. Budget nudges warn you before you overspend.\n\nWorks with Indian banks. Not affiliated, just a user.`;
};

function TagInput({ tags, setTags, placeholder, color = C.accent }) {
  const [v, setV] = useState("");
  const add = () => { if (v.trim() && !tags.includes(v.trim())) { setTags([...tags, v.trim()]); setV(""); } };
  return (<div>
    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
      <input value={v} onChange={e => setV(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} placeholder={placeholder} style={{ flex: 1, padding: "8px 12px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 13 }} />
      <button onClick={add} style={{ background: `${color}20`, color, border: `1px solid ${color}40`, borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontWeight: 600, fontSize: 12 }}>+ Add</button>
    </div>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{tags.map(t => <Badge key={t} color={color} onRemove={() => setTags(tags.filter(x => x !== t))}>{t}</Badge>)}{tags.length === 0 && <span style={{ fontSize: 12, color: C.muted, fontStyle: "italic" }}>None</span>}</div>
  </div>);
}
function SubAdd({ onAdd }) {
  const [v, setV] = useState("");
  const [loading, setLoading] = useState(false);
  const f = v.trim() ? SUBS_DB.filter(s => s.name.toLowerCase().includes(v.toLowerCase())) : [];

  const normalizeSubName = (raw) => {
    const t = raw.trim();
    return t.startsWith("r/") ? t : `r/${t}`;
  };

  const resolveMembers = async (normalizedName) => {
    const hit = SUBS_DB.find((s) => s.name.toLowerCase() === normalizedName.toLowerCase());
    if (hit) return hit.m;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      const res = await fetch("/api/subreddit-about", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sub: normalizedName }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json().catch(() => ({}));
      const m = data?.members;
      if (m !== undefined && m !== null && String(m).trim() !== "") return String(m);
    } catch {}
    return "?";
  };

  const submit = async () => {
    if (!v.trim() || loading) return;
    const name = normalizeSubName(v);
    setLoading(true);
    try {
      const members = await resolveMembers(name);
      onAdd(name, members);
      setV("");
    } finally {
      setLoading(false);
    }
  };

  return (<div style={{ position: "relative" }}>
    <div style={{ display: "flex", gap: 8, marginBottom: 0 }}>
      <input
        value={v}
        disabled={loading}
        onChange={e => setV(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void submit(); } }}
        placeholder={loading ? "Fetching member count…" : "Add subreddit…"}
        style={{ flex: 1, minWidth: 0, padding: "8px 12px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 13, boxSizing: "border-box", opacity: loading ? 0.75 : 1 }}
      />
      <button type="button" onClick={() => void submit()} disabled={loading || !v.trim()} style={{ flexShrink: 0, background: `${C.blue}20`, color: C.blue, border: `1px solid ${C.blue}40`, borderRadius: 8, padding: "8px 14px", cursor: loading || !v.trim() ? "not-allowed" : "pointer", fontWeight: 600, fontSize: 12, opacity: loading || !v.trim() ? 0.5 : 1 }}>+ Add</button>
    </div>
    {f.length > 0 && <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, marginTop: 4, zIndex: 10, maxHeight: 140, overflowY: "auto" }}>{f.map(p => <div key={p.name} onClick={() => { if (!loading) { onAdd(p.name, p.m); setV(""); } }} style={{ padding: "8px 12px", cursor: loading ? "default" : "pointer", display: "flex", justifyContent: "space-between", fontSize: 13, color: C.text }} onMouseEnter={e => e.currentTarget.style.background = C.accentBg} onMouseLeave={e => e.currentTarget.style.background = "transparent"}><span>{p.name}</span><span style={{ color: C.muted, fontSize: 12 }}>{p.m}</span></div>)}</div>}
  </div>);
}

// ── AUTH ──────────────────────────────────────────────────────
function Auth({ onLogin }) {
  const [mode, setMode] = useState("login"); const [email, setEmail] = useState(""); const [pw, setPw] = useState(""); const [name, setName] = useState(""); const [err, setErr] = useState(""); const [ld, setLd] = useState(false);
  const inp = { width: "100%", padding: "12px 14px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, fontSize: 14, boxSizing: "border-box", outline: "none" };
  const submit = async () => { setErr(""); if (!email.trim() || !pw.trim()) return setErr("Fill all fields"); if (mode === "signup" && !name.trim()) return setErr("Enter name"); setLd(true); const k = `user:${email.toLowerCase().trim()}`; if (mode === "signup") { const ex = await st.get(k); if (ex) { setErr("Account exists"); setLd(false); return; } const u = { email: email.toLowerCase().trim(), name: name.trim(), password: pw, plan: "Pro" }; await st.set(k, u); await st.set(`data:${u.email}`, { fa: DEF_FA, threads: DEF_THREADS, ec: { tone: "helpful", length: "medium", bv: "" }, metrics: DEF_METRICS, bm: [], intel: DEF_INTEL }); onLogin(u); } else { const u = await st.get(k); if (!u) { setErr("No account"); setLd(false); return; } if (u.password !== pw) { setErr("Wrong password"); setLd(false); return; } onLogin(u); } setLd(false); };
  return (<div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}><div style={{ width: "100%", maxWidth: 420, padding: 20 }}>
    <div style={{ textAlign: "center", marginBottom: 36 }}><div style={{ display: "inline-flex", alignItems: "center", gap: 12, marginBottom: 8 }}><div style={{ width: 44, height: 44, borderRadius: 12, background: `linear-gradient(135deg, ${C.accent}, #0d9488)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800, color: "#fff" }}>S</div><span style={{ fontSize: 28, fontWeight: 800, color: C.text, letterSpacing: -1 }}>SocialScanner</span></div><div style={{ fontSize: 14, color: C.muted }}>Monitor · Execute · Measure</div></div>
    <div style={{ background: C.card, borderRadius: 16, padding: 32, border: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", marginBottom: 24, background: C.bg, borderRadius: 10, padding: 4 }}>{["login", "signup"].map(m => <button key={m} onClick={() => { setMode(m); setErr(""); }} style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600, background: mode === m ? C.accent : "transparent", color: mode === m ? "#fff" : C.muted }}>{m === "login" ? "Log In" : "Sign Up"}</button>)}</div>
      {mode === "signup" && <div style={{ marginBottom: 16 }}><label style={{ display: "block", fontSize: 11, color: C.muted, marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>Name</label><input value={name} onChange={e => setName(e.target.value)} placeholder="Name" style={inp} /></div>}
      <div style={{ marginBottom: 16 }}><label style={{ display: "block", fontSize: 11, color: C.muted, marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>Email</label><input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="you@example.com" style={inp} /></div>
      <div style={{ marginBottom: 20 }}><label style={{ display: "block", fontSize: 11, color: C.muted, marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>Password</label><input value={pw} onChange={e => setPw(e.target.value)} type="password" placeholder="••••••" onKeyDown={e => e.key === "Enter" && submit()} style={inp} /></div>
      {err && <div style={{ fontSize: 13, color: C.danger, marginBottom: 14, padding: "8px 12px", background: `${C.danger}15`, borderRadius: 8 }}>{err}</div>}
      <button onClick={submit} disabled={ld} style={{ width: "100%", padding: "13px", background: C.accent, color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 15 }}>{ld ? "..." : mode === "login" ? "Log In" : "Create Account"}</button>
      <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border}`, textAlign: "center" }}><button onClick={() => onLogin({ email: "demo@google.com", name: "Mani", plan: "Pro" })} style={{ padding: "10px 24px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, cursor: "pointer", fontSize: 14 }}>Google Sign In</button></div>
    </div>
  </div></div>);
}

// ── DASHBOARD ─────────────────────────────────────────────────
function Dashboard({ user, onLogout }) {
  const [page, setPage] = useState("leads");
  const [dataLoaded, setDataLoaded] = useState(false);
  const [saving, setSaving] = useState(false); const [lastSaved, setLastSaved] = useState(null);
  const [showMenu, setShowMenu] = useState(false);
  const timer = useRef(null); const dk = `data:${user.email}`;

  const [fa, setFa] = useState([]); const [threads, setThreads] = useState([]); const [ec, setEc] = useState({ tone: "helpful", length: "medium", bv: "" }); const [metrics, setMetrics] = useState([]); const [bm, setBm] = useState([]); const [intel, setIntel] = useState([]);

  const [selFA, setSelFA] = useState(null); const [showNewFA, setShowNewFA] = useState(false); const [newFAName, setNewFAName] = useState("");
  const [activeThread, setActiveThread] = useState(null); const [draftText, setDraftText] = useState(""); const [threadFilter, setThreadFilter] = useState("all");
  const [newMetric, setNewMetric] = useState(""); const [measurePeriod, setMeasurePeriod] = useState("30d");
  const [copied, setCopied] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [replyTarget, setReplyTarget] = useState("comment"); // "post" or "comment"
  const [settingsTab, setSettingsTab] = useState("intelligence"); const [selIntel, setSelIntel] = useState(null); const [newIntelSub, setNewIntelSub] = useState("");

  useEffect(() => { (async () => { const d = await st.get(dk); if (d) { setFa(d.fa || DEF_FA); setThreads(d.threads || DEF_THREADS); setEc(d.ec || { tone: "helpful", length: "medium", bv: "" }); setMetrics(d.metrics || DEF_METRICS); setBm(d.bm || []); setIntel(d.intel || DEF_INTEL); } else { setFa(DEF_FA); setThreads(DEF_THREADS); setMetrics(DEF_METRICS); setIntel(DEF_INTEL); } setDataLoaded(true); })(); }, []);
  useEffect(() => { if (!dataLoaded) return; if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(async () => { setSaving(true); await st.set(dk, { fa, threads, ec, metrics, bm, intel }); setLastSaved(new Date().toLocaleTimeString()); setSaving(false); }, 800); return () => { if (timer.current) clearTimeout(timer.current); }; }, [fa, threads, ec, metrics, bm, intel, dataLoaded]);

  const updateFA = (id, u) => setFa(p => p.map(f => f.id === id ? { ...f, ...u } : f));

  // ── INTELLIGENCE VALIDATION ──────────────────────────────
  const validate = (text, subName) => {
    const si = intel.find(s => s.sub === subName);
    if (!si || !text.trim()) return null;
    const lw = text.toLowerCase(); const checks = [];
    const ruleIssues = []; si.rules.forEach(r => { if (r.toLowerCase().includes("self-promotion") && (lw.includes("check out my") || lw.includes("visit my"))) ruleIssues.push(r); if (r.toLowerCase().includes("referral") && lw.includes("referral")) ruleIssues.push(r); });
    checks.push({ label: "Rule Compliance", pass: ruleIssues.length === 0, score: ruleIssues.length === 0 ? 100 : 30, detail: ruleIssues.length === 0 ? "No violations detected" : `Issue: ${ruleIssues[0]}` });
    const ts = (si.toneProfile.preferred.toLowerCase().includes("expert") && (lw.includes("data") || lw.includes("months") || lw.includes("experience"))) ? 90 : (si.toneProfile.preferred.toLowerCase().includes("supportive") && (lw.includes("i've been") || lw.includes("same boat"))) ? 95 : (si.toneProfile.preferred.toLowerCase().includes("knowledgeable") && (lw.includes("upi") || lw.includes("indian"))) ? 92 : 65;
    checks.push({ label: "Tone Match", pass: ts >= 70, score: ts, detail: ts >= 70 ? `Aligns with "${si.toneProfile.preferred}"` : `Consider "${si.toneProfile.preferred}" tone` });
    const ph = si.keywords.positive.filter(k => lw.includes(k.toLowerCase()));
    checks.push({ label: "Signal Keywords", pass: ph.length > 0, score: Math.min(100, 40 + ph.length * 20), detail: ph.length > 0 ? `Contains: ${ph.join(", ")}` : "Add high-signal phrases" });
    const nh = si.keywords.negative.filter(k => lw.includes(k.toLowerCase()));
    checks.push({ label: "Trigger Words", pass: nh.length === 0, score: nh.length === 0 ? 100 : 20, detail: nh.length === 0 ? "No trigger words" : `Warning: "${nh.join(", ")}"` });
    const wc = text.split(/\s+/).filter(Boolean).length; const lok = wc > 30 && wc < 300;
    checks.push({ label: "Length", pass: lok, score: lok ? 85 : 50, detail: lok ? `${wc} words — good` : wc <= 30 ? "Too short" : "Consider shortening" });
    const hd = lw.includes("not affiliated") || lw.includes("disclaimer") || lw.includes("just a user");
    if (si.whatWorks.some(w => w.insight.toLowerCase().includes("disclaimer"))) checks.push({ label: "Disclaimer", pass: hd, score: hd ? 100 : 40, detail: hd ? "Trust disclaimer present" : "This sub rewards disclaimers" });
    const overall = Math.round(checks.reduce((s, c) => s + c.score, 0) / checks.length);
    return { checks, overall, subName: si.sub, confidence: si.confidence };
  };

  // ── MONITOR ──────────────────────────────────────────────
  const renderMonitor = () => {
    if (selFA) {
      const f = fa.find(x => x.id === selFA); if (!f) { setSelFA(null); return null; }
      return (<div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <button onClick={() => setSelFA(null)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 14 }}>← Back</button>
          <span style={{ fontSize: 24 }}>{f.icon}</span>
          <div><h2 style={{ margin: 0, fontSize: 20, color: C.text, fontWeight: 700 }}>{f.name}</h2><span style={{ fontSize: 12, color: C.muted }}>Monitoring Setup</span></div>
        </div>
        <div style={{ marginBottom: 28 }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}><span style={{ fontSize: 13, fontWeight: 700, color: C.text, textTransform: "uppercase", letterSpacing: 1 }}>Brand</span><span style={{ fontSize: 12, color: C.muted }}>{f.brandKeywords.length} keywords</span></div><TagInput tags={f.brandKeywords} setTags={t => updateFA(f.id, { brandKeywords: t })} placeholder="Brand keyword..." color={C.accent} /></div>
        <div style={{ marginBottom: 28 }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}><span style={{ fontSize: 13, fontWeight: 700, color: C.text, textTransform: "uppercase", letterSpacing: 1 }}>Competitors</span><span style={{ fontSize: 12, color: C.muted }}>{f.competitors.length} tracked</span></div><TagInput tags={f.competitors} setTags={t => updateFA(f.id, { competitors: t })} placeholder="Competitor..." color={C.orange} /></div>
        <div style={{ marginBottom: 28 }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}><span style={{ fontSize: 13, fontWeight: 700, color: C.text, textTransform: "uppercase", letterSpacing: 1 }}>Subreddits</span><span style={{ fontSize: 12, color: C.muted }}>{f.subreddits.length} active</span></div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>{f.subreddits.map(s => <span key={s.name} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, padding: "6px 12px", borderRadius: 8, background: `${C.blue}15`, color: C.blue, border: `1px solid ${C.blue}30` }}>{s.name} <span style={{ fontSize: 11, color: C.muted }}>{s.members}</span><span onClick={() => updateFA(f.id, { subreddits: f.subreddits.filter(x => x.name !== s.name) })} style={{ cursor: "pointer", opacity: 0.6, fontWeight: 700 }}>×</span></span>)}</div>
          <SubAdd onAdd={(n, m) => { if (!f.subreddits.find(s => s.name === n)) updateFA(f.id, { subreddits: [...f.subreddits, { name: n, members: m }] }); }} />
        </div>
        <div style={{ marginBottom: 28 }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}><span style={{ fontSize: 13, fontWeight: 700, color: C.text, textTransform: "uppercase", letterSpacing: 1 }}>Intent Patterns</span><span style={{ fontSize: 12, color: C.muted }}>{f.intentPatterns.length} patterns</span></div><TagInput tags={f.intentPatterns} setTags={t => updateFA(f.id, { intentPatterns: t })} placeholder='Pattern e.g. "best"...' color={C.purple} /></div>
      </div>);
    }
    return (<div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}><div><h2 style={{ margin: 0, fontSize: 22, color: C.text, fontWeight: 700 }}>Monitor</h2><p style={{ margin: "4px 0 0", fontSize: 13, color: C.muted }}>Setup focus areas with keywords, competitors & subreddits</p></div><button onClick={() => setShowNewFA(true)} style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", cursor: "pointer", fontWeight: 600, fontSize: 14 }}>+ New</button></div>
      {showNewFA && <div style={{ background: C.card, borderRadius: 12, padding: 20, marginBottom: 20, border: `1px solid ${C.border}` }}><input value={newFAName} onChange={e => setNewFAName(e.target.value)} placeholder="Focus area name..." onKeyDown={e => { if (e.key === "Enter" && newFAName.trim()) { setFa(p => [...p, { id: `fa_${Date.now()}`, name: newFAName.trim(), icon: "🎯", brandKeywords: [], competitors: [], subreddits: [], intentPatterns: ["best", "vs", "alternative", "review"] }]); setNewFAName(""); setShowNewFA(false); } }} style={{ width: "100%", padding: "10px 14px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 14, marginBottom: 12, boxSizing: "border-box" }} /><div style={{ display: "flex", gap: 8 }}><button onClick={() => { if (newFAName.trim()) { setFa(p => [...p, { id: `fa_${Date.now()}`, name: newFAName.trim(), icon: "🎯", brandKeywords: [], competitors: [], subreddits: [], intentPatterns: ["best", "vs", "alternative", "review"] }]); setNewFAName(""); setShowNewFA(false); } }} style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", cursor: "pointer", fontWeight: 600 }}>Create</button><button onClick={() => { setShowNewFA(false); setNewFAName(""); }} style={{ background: "transparent", color: C.muted, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 20px", cursor: "pointer" }}>Cancel</button></div></div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>{fa.map(f => <div key={f.id} onClick={() => setSelFA(f.id)} style={{ background: C.card, borderRadius: 12, padding: 20, cursor: "pointer", border: `1px solid ${C.border}`, borderLeft: `4px solid ${C.accent}`, transition: "transform 0.15s", position: "relative" }} onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"} onMouseLeave={e => e.currentTarget.style.transform = "none"}><button onClick={e => { e.stopPropagation(); setFa(p => p.filter(x => x.id !== f.id)); }} style={{ position: "absolute", top: 10, right: 12, background: "none", border: "none", color: C.muted, cursor: "pointer", opacity: 0.3 }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.3}>✕</button><div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}><span style={{ fontSize: 24 }}>{f.icon}</span><h3 style={{ margin: 0, fontSize: 18, color: C.text, fontWeight: 700 }}>{f.name}</h3></div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}><div style={{ color: C.muted }}><span style={{ color: C.accent, fontWeight: 700 }}>{f.brandKeywords.length}</span> brand</div><div style={{ color: C.muted }}><span style={{ color: C.orange, fontWeight: 700 }}>{f.competitors.length}</span> competitors</div><div style={{ color: C.muted }}><span style={{ color: C.blue, fontWeight: 700 }}>{f.subreddits.length}</span> subreddits</div><div style={{ color: C.muted }}><span style={{ color: C.purple, fontWeight: 700 }}>{f.intentPatterns.length}</span> patterns</div></div></div>)}</div>
      {fa.length === 0 && !showNewFA && <div style={{ textAlign: "center", padding: 60, color: C.muted }}>No focus areas</div>}
    </div>);
  };

  // ── LEADS ────────────────────────────────────────────────
  const renderLeads = () => {
    if (activeThread) return renderWorkspace();
    const fl = threadFilter === "all" ? threads : threads.filter(t => t.status === threadFilter);
    return (<div>
      <div style={{ marginBottom: 20 }}><h2 style={{ margin: 0, fontSize: 22, color: C.text, fontWeight: 700 }}>Leads</h2><p style={{ margin: "4px 0 0", fontSize: 13, color: C.muted }}>High-intent threads from Monitor</p></div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: 6 }}>{["all", "new", "posted"].map(f => <button key={f} onClick={() => setThreadFilter(f)} style={{ background: threadFilter === f ? C.accentBg : "transparent", color: threadFilter === f ? C.accent : C.muted, border: `1px solid ${threadFilter === f ? C.accent : C.border}`, borderRadius: 8, padding: "7px 16px", cursor: "pointer", fontSize: 13, fontWeight: 500, textTransform: "capitalize" }}>{f} ({threads.filter(t => f === "all" || t.status === f).length})</button>)}</div>
      </div>
      {fl.map(t => <div key={t.id} onClick={() => { setActiveThread(t); setDraftText(t.reply || genReply(t, ec.tone, ec.length)); }} style={{ background: C.card, borderRadius: 10, padding: "16px 18px", marginBottom: 8, border: `1px solid ${C.border}`, cursor: "pointer", transition: "border-color 0.15s" }} onMouseEnter={e => e.currentTarget.style.borderColor = C.accent} onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}><Badge color={C.blue}>{t.sub}</Badge><Badge color={t.intent === "High" ? C.green : C.warn}>{t.intent}</Badge><Badge color={C.purple}>{t.matchedPattern}</Badge>{t.status === "posted" && <Badge color={C.green}>✓ Posted</Badge>}<span style={{ fontSize: 11, color: C.muted }}>{t.time}</span></div>
            <div style={{ fontSize: 14, color: C.text, fontWeight: 600, lineHeight: 1.4, marginBottom: 4 }}>{t.title}</div>
            <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{t.body}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
            <div style={{ fontSize: 12, color: C.muted }}>▲ {t.score} • 💬 {t.comments}</div>
            <span style={{ fontSize: 11, color: C.muted }}>{t.author}</span>
            {t.performance && <div style={{ fontSize: 11, color: C.green }}>▲{t.performance.upvotes} • {t.performance.views.toLocaleString()} views</div>}
          </div>
        </div>
      </div>)}
    </div>);
  };

  // ── THREAD WORKSPACE ─────────────────────────────────────
  const renderWorkspace = () => {
    const t = activeThread; const isP = t.status === "posted";
    const copyR = () => { navigator.clipboard.writeText(draftText).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {}); };
    const markP = () => { const perf = { upvotes: 0, replies: 0, views: 0 }; setThreads(p => p.map(x => x.id === t.id ? { ...x, reply: draftText, status: "posted", performance: perf } : x)); setActiveThread({ ...t, reply: draftText, status: "posted", performance: perf }); };
    const regen = async (tone, len) => {
      const useTone = tone || ec.tone;
      const useLen = len || ec.length;
      setAiLoading(true);
      const si = intel.find(s => s.sub === t.sub);
      const threadWithTarget = { ...t, _replyTarget: replyTarget };
      const aiResult = await genReplyAI(threadWithTarget, useTone, useLen, ec.bv, si);
      if (aiResult) { setDraftText(aiResult); } else { setDraftText(genReplyFallback(t, useTone, useLen)); }
      setAiLoading(false);
    };
    const vld = validate(draftText, t.sub);

    return (<div>
      {/* Header */}
      <div style={{ background: C.card, borderRadius: 12, padding: "14px 20px", marginBottom: 16, border: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
          <button onClick={() => setActiveThread(null)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 14, flexShrink: 0 }}>←</button>
          <div style={{ minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.title}</div><div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}><Badge color={C.blue}>{t.sub}</Badge><span style={{ fontSize: 11, color: C.muted }}>{t.author} • ▲ {t.score} • 💬 {t.comments} • {t.time}</span></div></div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>{isP ? <Badge color={C.green}>✓ Posted</Badge> : <Badge color={C.warn}>Draft</Badge>}<button style={{ background: "transparent", color: C.accent, border: `1px solid ${C.accent}`, borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 12 }}>↗ View on Reddit</button></div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "5fr 7fr", gap: 16 }}>
        {/* LEFT */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div><div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Replying To</div>
            {/* Reply Target Selector */}
            {t.replyTo && <div style={{ display: "flex", gap: 4, marginBottom: 10, background: C.bg, borderRadius: 8, padding: 3 }}>
              <button onClick={() => setReplyTarget("post")} style={{ flex: 1, padding: "7px 0", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: replyTarget === "post" ? C.accent : "transparent", color: replyTarget === "post" ? "#fff" : C.muted, transition: "all 0.15s" }}>Original Post</button>
              <button onClick={() => setReplyTarget("comment")} style={{ flex: 1, padding: "7px 0", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: replyTarget === "comment" ? C.accent : "transparent", color: replyTarget === "comment" ? "#fff" : C.muted, transition: "all 0.15s" }}>Comment</button>
            </div>}
            <div style={{ background: C.card, borderRadius: 10, padding: 16, border: `1px solid ${replyTarget === "comment" && t.replyTo ? C.accent : C.border}`, borderLeft: `3px solid ${C.accent}` }}>
              {replyTarget === "comment" && t.replyTo ? (
                <><p style={{ margin: "0 0 8px", fontSize: 14, color: C.text, lineHeight: 1.6, fontStyle: "italic" }}>"{t.replyTo.text}"</p><div style={{ fontSize: 12, color: C.muted }}>👍 {t.replyTo.upvotes} • {t.replyTo.author}</div></>
              ) : (
                <><p style={{ margin: "0 0 8px", fontSize: 14, color: C.text, lineHeight: 1.6 }}>Replying directly to original post by {t.author}</p><div style={{ fontSize: 12, color: C.muted }}>👍 {t.score} upvotes • 💬 {t.comments} comments</div></>
              )}
            </div>
          </div>
          <div><div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Original Thread</div>
            <div style={{ background: C.card, borderRadius: 10, padding: 16, border: `1px solid ${C.border}` }}><h3 style={{ margin: "0 0 10px", fontSize: 15, color: C.text, fontWeight: 700, lineHeight: 1.4 }}>{t.title}</h3><p style={{ margin: 0, fontSize: 13, color: C.muted, lineHeight: 1.7 }}>{t.body}</p></div>
          </div>
          {isP && t.performance && <div><div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Performance (48h)</div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>{[{ icon: "👍", l: "upvotes", v: t.performance.upvotes }, { icon: "💬", l: "replies", v: t.performance.replies }, { icon: "👁", l: "views", v: t.performance.views.toLocaleString() }].map(m => <div key={m.l} style={{ background: C.card, borderRadius: 10, padding: "12px 8px", border: `1px solid ${C.border}`, textAlign: "center" }}><div style={{ fontSize: 16 }}>{m.icon}</div><div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>{m.v}</div><div style={{ fontSize: 10, color: C.muted }}>{m.l}</div></div>)}</div></div>}
        </div>

        {/* RIGHT */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Our Reply</div>
            <div style={{ background: C.card, borderRadius: 10, padding: 16, border: `1px solid ${isP ? C.green + "50" : C.border}`, flex: 1, display: "flex", flexDirection: "column" }}>
              {isP ? <div style={{ fontSize: 14, color: C.text, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{t.reply}</div> : <>
                {aiLoading ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 180, gap: 12 }}>
                    <div style={{ width: 32, height: 32, border: `3px solid ${C.border}`, borderTopColor: C.purple, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                    <div style={{ fontSize: 13, color: C.purple, fontWeight: 600 }}>🧠 AI generating reply...</div>
                    <div style={{ fontSize: 11, color: C.muted }}>Reading thread + subreddit intelligence + brand voice</div>
                  </div>
                ) : (
                  <textarea value={draftText} onChange={e => setDraftText(e.target.value)} style={{ width: "100%", padding: 0, background: "transparent", border: "none", color: C.text, fontSize: 14, lineHeight: 1.7, minHeight: 180, flex: 1, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit", outline: "none" }} />
                )}
                <div style={{ display: "flex", gap: 8, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}`, flexWrap: "wrap", alignItems: "center" }}>
                  <button onClick={copyR} disabled={aiLoading} style={{ background: copied ? C.green : C.accent, color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", cursor: "pointer", fontWeight: 600, fontSize: 13, opacity: aiLoading ? 0.5 : 1 }}>{copied ? "✓ Copied!" : "📋 Copy Reply"}</button>
                  <button onClick={() => regen()} disabled={aiLoading} style={{ background: "transparent", color: C.purple, border: `1px solid ${C.purple}`, borderRadius: 8, padding: "9px 16px", cursor: "pointer", fontWeight: 600, fontSize: 12, opacity: aiLoading ? 0.5 : 1 }}>{aiLoading ? "Generating..." : "🤖 AI Generate"}</button>
                  <button onClick={markP} disabled={aiLoading} style={{ background: "transparent", color: C.green, border: `1px solid ${C.green}50`, borderRadius: 8, padding: "9px 16px", cursor: "pointer", fontSize: 12, opacity: aiLoading ? 0.5 : 1 }}>✓ Mark Posted</button>
                  <span style={{ marginLeft: "auto", fontSize: 11, color: C.muted }}>{draftText.split(/\s+/).filter(Boolean).length} words</span>
                </div>
              </>}
            </div>
          </div>

          {/* Response Config */}
          {!isP && <div style={{ background: C.card, borderRadius: 10, padding: 16, border: `1px solid ${C.purple}20` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}><span style={{ fontSize: 10, fontWeight: 700, color: C.purple, textTransform: "uppercase", letterSpacing: 1 }}>Response Config</span><span style={{ fontSize: 11, color: C.muted }}>{ec.tone} • {ec.length}</span></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div><label style={{ fontSize: 11, color: C.muted, fontWeight: 600, display: "block", marginBottom: 6 }}>Tone</label><div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{TONES.map(tn => <button key={tn.id} onClick={() => { setEc(p => ({ ...p, tone: tn.id })); }} style={{ background: ec.tone === tn.id ? `${C.purple}20` : "transparent", color: ec.tone === tn.id ? C.purple : C.muted, border: `1px solid ${ec.tone === tn.id ? C.purple : C.border}`, borderRadius: 6, padding: "4px 9px", cursor: "pointer", fontSize: 11 }}>{tn.label}</button>)}</div></div>
              <div><label style={{ fontSize: 11, color: C.muted, fontWeight: 600, display: "block", marginBottom: 6 }}>Length</label><div style={{ display: "flex", gap: 4 }}>{["short", "medium", "long"].map(l => <button key={l} onClick={() => { setEc(p => ({ ...p, length: l })); }} style={{ background: ec.length === l ? `${C.purple}20` : "transparent", color: ec.length === l ? C.purple : C.muted, border: `1px solid ${ec.length === l ? C.purple : C.border}`, borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontSize: 11, textTransform: "capitalize" }}>{l}</button>)}</div></div>
            </div>
            <div style={{ marginTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <label style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>Brand Voice & Context</label>
                <span style={{ fontSize: 10, color: C.purple, cursor: "pointer" }} onClick={() => { if (!ec.bv) setEc(p => ({ ...p, bv: "I am responding from my company account (Kedil). Do NOT write as if I switched from another product — that looks fake from a brand account. Instead, acknowledge the user's problem and explain how Kedil solves it from the builder's perspective. Be genuine, helpful, and transparent about being the maker." })); }}>📝 Load default</span>
              </div>
              <textarea value={ec.bv} onChange={e => setEc(p => ({ ...p, bv: e.target.value }))}
                placeholder={"Add context that shapes every AI reply. Examples:\n• I'm responding from my company account — don't pretend I switched products\n• Always mention UPI & Indian bank support\n• Never be pushy or salesy\n• Acknowledge I'm the maker of Kedil, be transparent"}
                style={{ width: "100%", padding: "8px 12px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 12, minHeight: 64, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }} /></div>
          </div>}

          {/* 🧠 Intelligence Check */}
          {vld && <div style={{ background: C.card, borderRadius: 10, padding: 16, border: `1px solid ${vld.overall >= 75 ? C.green : vld.overall >= 50 ? C.warn : C.danger}30` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 16 }}>🧠</span><span style={{ fontSize: 10, fontWeight: 700, color: C.purple, textTransform: "uppercase", letterSpacing: 1 }}>Intelligence Check</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 11, color: C.muted }}>{vld.subName}</span><div style={{ background: `${vld.overall >= 75 ? C.green : vld.overall >= 50 ? C.warn : C.danger}20`, borderRadius: 8, padding: "4px 10px" }}><span style={{ fontSize: 16, fontWeight: 800, color: vld.overall >= 75 ? C.green : vld.overall >= 50 ? C.warn : C.danger }}>{vld.overall}</span><span style={{ fontSize: 10, color: C.muted }}>/100</span></div></div>
            </div>
            {vld.checks.map((ck, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, padding: "6px 0", borderBottom: i < vld.checks.length - 1 ? `1px solid ${C.border}50` : "none" }}>
              <span style={{ fontSize: 14, flexShrink: 0 }}>{ck.pass ? "✅" : "⚠️"}</span>
              <div style={{ flex: 1 }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}><span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{ck.label}</span><span style={{ fontSize: 11, fontWeight: 700, color: ck.score >= 70 ? C.green : ck.score >= 40 ? C.warn : C.danger }}>{ck.score}%</span></div><div style={{ fontSize: 11, color: ck.pass ? C.muted : C.warn }}>{ck.detail}</div></div>
            </div>)}
            <div style={{ marginTop: 8, padding: "8px 10px", background: `${vld.overall >= 75 ? C.green : C.warn}10`, borderRadius: 6, fontSize: 11, color: vld.overall >= 75 ? C.green : C.warn }}>{vld.overall >= 75 ? `✓ Approved by Intelligence — matches ${vld.subName} patterns` : "💡 Adjust reply to improve score"}</div>
          </div>}
          {!vld && !isP && <div style={{ background: C.card, borderRadius: 10, padding: 14, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}><span style={{ fontSize: 16 }}>🧠</span><div><div style={{ fontSize: 12, color: C.muted }}>Intelligence unavailable for {t.sub}</div><div style={{ fontSize: 11, color: C.muted }}>Add it in <span style={{ color: C.accent, cursor: "pointer" }} onClick={() => { setActiveThread(null); setPage("settings"); }}>Settings → Intelligence</span></div></div></div>}
        </div>
      </div>
    </div>);
  };

  // ── MEASURE ──────────────────────────────────────────────
  const renderMeasure = () => {
    const addM = () => { if (newMetric.trim()) { setMetrics(p => [...p, { id: `m_${Date.now()}`, name: newMetric.trim(), value: "0", change: "New", trend: "up", icon: "📌", data: [0,0,0,0,0,0,0,0,0,0,0,0] }]); setNewMetric(""); } };
    return (<div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}><span style={{ fontSize: 28 }}>📊</span><div><h2 style={{ margin: 0, fontSize: 22, color: C.text, fontWeight: 700 }}>Measure</h2><p style={{ margin: 0, fontSize: 13, color: C.muted }}>Track business impact</p></div></div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "16px 0", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 6 }}>{["7d", "30d", "90d"].map(p => <button key={p} onClick={() => setMeasurePeriod(p)} style={{ background: measurePeriod === p ? C.accentBg : "transparent", color: measurePeriod === p ? C.accent : C.muted, border: `1px solid ${measurePeriod === p ? C.accent : C.border}`, borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 13 }}>{p}</button>)}</div>
        <div style={{ display: "flex", gap: 8 }}><input value={newMetric} onChange={e => setNewMetric(e.target.value)} onKeyDown={e => e.key === "Enter" && addM()} placeholder="New metric..." style={{ padding: "8px 14px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 13, width: 160 }} /><button onClick={addM} style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>+ Add</button></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12, marginBottom: 24 }}>{metrics.map(m => <div key={m.id} style={{ background: C.card, borderRadius: 12, padding: 18, border: `1px solid ${C.border}`, position: "relative" }}><button onClick={() => setMetrics(p => p.filter(x => x.id !== m.id))} style={{ position: "absolute", top: 8, right: 10, background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 12, opacity: 0.3 }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.3}>✕</button><div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}><span style={{ fontSize: 18 }}>{m.icon}</span><span style={{ fontSize: 13, color: C.muted, fontWeight: 600 }}>{m.name}</span></div><div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}><div><div style={{ fontSize: 26, fontWeight: 800, color: C.text, lineHeight: 1 }}>{m.value}</div><span style={{ fontSize: 13, fontWeight: 600, color: m.trend === "up" ? C.green : C.danger }}>{m.change}</span></div><Spark data={m.data} color={m.trend === "up" ? C.green : C.danger} w={80} h={28} /></div></div>)}</div>
      <div style={{ background: C.card, borderRadius: 12, padding: 20, border: `1px solid ${C.border}` }}><h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: C.text }}>Pipeline</h3><div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>{[{ l: "Monitored", v: threads.length, c: C.accent, i: "🔍" }, { l: "Drafted", v: threads.filter(t => t.reply).length, c: C.purple, i: "✍️" }, { l: "Published", v: threads.filter(t => t.status === "posted").length, c: C.green, i: "📤" }].map((s, i) => <div key={s.l} style={{ display: "flex", alignItems: "center" }}><div style={{ textAlign: "center", padding: "12px 28px" }}><div style={{ fontSize: 22, marginBottom: 4 }}>{s.i}</div><div style={{ fontSize: 28, fontWeight: 800, color: s.c }}>{s.v}</div><div style={{ fontSize: 12, color: C.muted }}>{s.l}</div></div>{i < 2 && <div style={{ fontSize: 20, color: C.border }}>→</div>}</div>)}</div></div>
    </div>);
  };

  // ── SAVED ────────────────────────────────────────────────
  const renderSaved = () => (<div><h2 style={{ margin: "0 0 20px", fontSize: 22, color: C.text, fontWeight: 700 }}>Saved ({bm.length})</h2>{bm.length === 0 ? <div style={{ textAlign: "center", padding: 60, color: C.muted }}>No saved items</div> : bm.map(b => <div key={b.id || b.title} style={{ background: C.card, borderRadius: 10, padding: "14px 18px", marginBottom: 8, border: `1px solid ${C.border}` }}><div style={{ fontSize: 14, color: C.text, fontWeight: 600, marginBottom: 4 }}>{b.title}</div><div style={{ fontSize: 12, color: C.muted }}>{b.sub} • {b.time}</div></div>)}</div>);

  // ── SETTINGS + INTELLIGENCE ──────────────────────────────
  const renderSettings = () => {
    if (selIntel) {
      const si = intel.find(s => s.id === selIntel);
      if (!si) { setSelIntel(null); return null; }
      const ScoreBar = ({ score, color = C.accent }) => (<div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}><div style={{ flex: 1, height: 5, borderRadius: 3, background: C.border }}><div style={{ width: `${score}%`, height: "100%", borderRadius: 3, background: color }} /></div><span style={{ fontSize: 11, fontWeight: 700, color, minWidth: 28, textAlign: "right" }}>{score}%</span></div>);
      return (<div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}><button onClick={() => setSelIntel(null)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 14 }}>← Settings</button><span style={{ fontSize: 20 }}>🧠</span><div><h2 style={{ margin: 0, fontSize: 20, color: C.text, fontWeight: 700 }}>{si.sub}</h2><span style={{ fontSize: 12, color: C.muted }}>{si.members} • Scanned {si.lastScanned} • Confidence: <span style={{ color: si.confidence >= 80 ? C.green : C.warn, fontWeight: 700 }}>{si.confidence}%</span></span></div></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div style={{ background: C.card, borderRadius: 10, padding: 16, border: `1px solid ${C.border}` }}><div style={{ fontSize: 11, fontWeight: 700, color: C.danger, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>⚠️ Rules</div>{si.rules.map((r, i) => <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}><span style={{ fontSize: 11, color: C.danger }}>•</span><span style={{ fontSize: 13, color: C.text, lineHeight: 1.4 }}>{r}</span></div>)}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: C.card, borderRadius: 10, padding: 16, border: `1px solid ${C.border}` }}><div style={{ fontSize: 11, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Tone</div><div style={{ marginBottom: 6 }}><span style={{ fontSize: 11, color: C.muted }}>Preferred: </span><span style={{ fontSize: 13, color: C.green, fontWeight: 600 }}>{si.toneProfile.preferred}</span></div><div><span style={{ fontSize: 11, color: C.muted }}>Avoid: </span><span style={{ fontSize: 13, color: C.danger, fontWeight: 600 }}>{si.toneProfile.avoid}</span></div></div>
            <div style={{ background: C.card, borderRadius: 10, padding: 16, border: `1px solid ${C.border}` }}><div style={{ fontSize: 11, fontWeight: 700, color: C.blue, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Timing</div><div style={{ marginBottom: 6 }}><span style={{ fontSize: 11, color: C.muted }}>Peak: </span><span style={{ fontSize: 13, color: C.green }}>{si.bestTimes.peak}</span></div><div><span style={{ fontSize: 11, color: C.muted }}>Avoid: </span><span style={{ fontSize: 13, color: C.danger }}>{si.bestTimes.avoid}</span></div></div>
          </div>
          <div style={{ background: C.card, borderRadius: 10, padding: 16, border: `1px solid ${C.border}` }}><div style={{ fontSize: 11, fontWeight: 700, color: C.green, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>✅ What Works</div>{si.whatWorks.map((w, i) => <div key={i} style={{ marginBottom: 10 }}><div style={{ fontSize: 13, color: C.text, lineHeight: 1.4, marginBottom: 4 }}>{w.insight}</div><ScoreBar score={w.score} color={C.green} /></div>)}</div>
          <div style={{ background: C.card, borderRadius: 10, padding: 16, border: `1px solid ${C.border}` }}><div style={{ fontSize: 11, fontWeight: 700, color: C.danger, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>❌ What Fails</div>{si.whatFails.map((w, i) => <div key={i} style={{ marginBottom: 10 }}><div style={{ fontSize: 13, color: C.text, lineHeight: 1.4, marginBottom: 4 }}>{w.insight}</div><ScoreBar score={w.score} color={C.danger} /></div>)}</div>
          <div style={{ background: C.card, borderRadius: 10, padding: 16, border: `1px solid ${C.border}` }}><div style={{ fontSize: 11, fontWeight: 700, color: C.purple, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>🏆 Top Formats</div>{si.topFormats.map((f, i) => <div key={i} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: i < si.topFormats.length - 1 ? `1px solid ${C.border}` : "none" }}><div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{f.format}</span><span style={{ fontSize: 12, color: C.accent, fontWeight: 700 }}>avg ▲{f.avgScore}</span></div></div>)}</div>
          <div style={{ background: C.card, borderRadius: 10, padding: 16, border: `1px solid ${C.border}` }}><div style={{ fontSize: 11, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Keywords</div><div style={{ marginBottom: 10 }}><div style={{ fontSize: 11, color: C.muted, marginBottom: 6, fontWeight: 600 }}>Use these</div><div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>{si.keywords.positive.map(k => <Badge key={k} color={C.green}>{k}</Badge>)}</div></div><div><div style={{ fontSize: 11, color: C.muted, marginBottom: 6, fontWeight: 600 }}>Avoid these</div><div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>{si.keywords.negative.map(k => <Badge key={k} color={C.danger}>{k}</Badge>)}</div></div></div>
        </div>
        <div style={{ background: C.card, borderRadius: 10, padding: 16, border: `1px solid ${C.border}`, marginTop: 14 }}><div style={{ fontSize: 11, fontWeight: 700, color: C.purple, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>📓 Learning Log</div>{si.learningLog.map((l, i) => <div key={i} style={{ display: "flex", gap: 12, marginBottom: 8 }}><span style={{ fontSize: 11, color: C.accent, fontWeight: 700, minWidth: 50 }}>{l.date}</span><span style={{ fontSize: 13, color: C.text, lineHeight: 1.4 }}>{l.entry}</span></div>)}</div>
      </div>);
    }

    return (<div>
      <h2 style={{ margin: "0 0 16px", fontSize: 22, color: C.text, fontWeight: 700 }}>Settings</h2>
      <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>{[{ id: "intelligence", label: "🧠 Intelligence Agent" }, { id: "account", label: "👤 Account" }].map(t => <button key={t.id} onClick={() => setSettingsTab(t.id)} style={{ background: settingsTab === t.id ? C.accentBg : "transparent", color: settingsTab === t.id ? C.accent : C.muted, border: `1px solid ${settingsTab === t.id ? C.accent : C.border}`, borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13, fontWeight: 500 }}>{t.label}</button>)}</div>

      {settingsTab === "account" && <div style={{ background: C.card, borderRadius: 12, padding: 20, border: `1px solid ${C.border}` }}>
        <div style={{ marginBottom: 16 }}><div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>Name</div><div style={{ fontSize: 15, color: C.text, fontWeight: 600 }}>{user.name}</div></div>
        <div style={{ marginBottom: 16 }}><div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>Email</div><div style={{ fontSize: 15, color: C.text }}>{user.email}</div></div>
        <div><div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>Plan</div><Badge color={C.accent}>{user.plan || "Pro"}</Badge></div>
      </div>}

      {settingsTab === "intelligence" && <>
        <div style={{ background: `${C.purple}10`, borderRadius: 10, padding: 16, marginBottom: 16, border: `1px solid ${C.purple}25` }}>
          <div style={{ fontSize: 12, color: C.purple, fontWeight: 700, marginBottom: 8 }}>How Intelligence Agent works</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>{[{ i: "📖", l: "Reads rules", d: "Scrapes sidebar" }, { i: "📊", l: "Analyzes patterns", d: "What gets upvoted" }, { i: "🕐", l: "Tracks timing", d: "Best hours" }, { i: "🔄", l: "Learns daily", d: "Updates on shifts" }].map(s => <div key={s.l} style={{ textAlign: "center" }}><div style={{ fontSize: 20, marginBottom: 4 }}>{s.i}</div><div style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>{s.l}</div><div style={{ fontSize: 11, color: C.muted }}>{s.d}</div></div>)}</div>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input value={newIntelSub} onChange={e => setNewIntelSub(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && newIntelSub.trim()) { const n = newIntelSub.trim().startsWith("r/") ? newIntelSub.trim() : `r/${newIntelSub.trim()}`; if (!intel.find(s => s.sub === n)) setIntel(p => [...p, { id: `si_${Date.now()}`, sub: n, members: "?", lastScanned: "Scanning...", confidence: 0, rules: ["Scanning..."], bestTimes: { peak: "Learning...", avoid: "Learning..." }, toneProfile: { preferred: "Learning...", avoid: "Learning..." }, topFormats: [], whatWorks: [{ insight: "Analyzing...", score: 0 }], whatFails: [{ insight: "Analyzing...", score: 0 }], keywords: { positive: [], negative: [] }, modStrictness: 0, sentimentBreakdown: { positive: 33, neutral: 34, negative: 33 }, learningLog: [{ date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }), entry: "Agent started learning" }] }]); setNewIntelSub(""); } }} placeholder="Add subreddit to learn..." style={{ flex: 1, padding: "10px 14px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 14 }} />
          <button onClick={() => { if (newIntelSub.trim()) { const n = newIntelSub.trim().startsWith("r/") ? newIntelSub.trim() : `r/${newIntelSub.trim()}`; if (!intel.find(s => s.sub === n)) setIntel(p => [...p, { id: `si_${Date.now()}`, sub: n, members: "?", lastScanned: "Scanning...", confidence: 0, rules: ["Scanning..."], bestTimes: { peak: "Learning...", avoid: "Learning..." }, toneProfile: { preferred: "Learning...", avoid: "Learning..." }, topFormats: [], whatWorks: [{ insight: "Analyzing...", score: 0 }], whatFails: [{ insight: "Analyzing...", score: 0 }], keywords: { positive: [], negative: [] }, modStrictness: 0, sentimentBreakdown: { positive: 33, neutral: 34, negative: 33 }, learningLog: [{ date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }), entry: "Agent started learning" }] }]); setNewIntelSub(""); } }} style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", cursor: "pointer", fontWeight: 600 }}>+ Learn</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>{intel.map(si => <div key={si.id} onClick={() => setSelIntel(si.id)} style={{ background: C.card, borderRadius: 12, padding: 18, cursor: "pointer", border: `1px solid ${C.border}`, borderLeft: `4px solid ${si.confidence >= 80 ? C.green : si.confidence >= 50 ? C.warn : C.muted}`, transition: "transform 0.15s", position: "relative" }} onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"} onMouseLeave={e => e.currentTarget.style.transform = "none"}>
          <button onClick={e => { e.stopPropagation(); setIntel(p => p.filter(x => x.id !== si.id)); }} style={{ position: "absolute", top: 10, right: 12, background: "none", border: "none", color: C.muted, cursor: "pointer", opacity: 0.3 }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.3}>✕</button>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}><div><div style={{ fontSize: 17, fontWeight: 700, color: C.text }}>{si.sub}</div><div style={{ fontSize: 12, color: C.muted }}>{si.members} • {si.lastScanned}</div></div><div style={{ textAlign: "right" }}><div style={{ fontSize: 20, fontWeight: 800, color: si.confidence >= 80 ? C.green : si.confidence >= 50 ? C.warn : C.muted }}>{si.confidence}%</div><div style={{ fontSize: 10, color: C.muted }}>confidence</div></div></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}><div style={{ background: C.bg, borderRadius: 6, padding: "6px 8px", textAlign: "center" }}><div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{si.rules.length}</div><div style={{ fontSize: 10, color: C.muted }}>rules</div></div><div style={{ background: C.bg, borderRadius: 6, padding: "6px 8px", textAlign: "center" }}><div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{si.whatWorks.length}</div><div style={{ fontSize: 10, color: C.muted }}>insights</div></div><div style={{ background: C.bg, borderRadius: 6, padding: "6px 8px", textAlign: "center" }}><div style={{ fontSize: 14, fontWeight: 700, color: si.modStrictness >= 75 ? C.danger : C.warn }}>{si.modStrictness}%</div><div style={{ fontSize: 10, color: C.muted }}>strict</div></div></div>
          <div style={{ fontSize: 12, color: C.muted }}>Tone: <span style={{ color: C.green }}>{si.toneProfile.preferred}</span></div>
        </div>)}</div>
      </>}
    </div>);
  };

  // ── RENDER ───────────────────────────────────────────────
  if (!dataLoaded) return <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontFamily: "sans-serif" }}>Loading...</div>;

  const navItems = [
    { label: "ENGINES", items: [{ id: "monitor", label: "Monitor", icon: "🎯" }, { id: "leads", label: "Leads", icon: "🔍" }, { id: "measure", label: "Measure", icon: "📊" }] },
    { label: "OTHER", items: [{ id: "saved", label: "Saved", icon: "🔖" }, { id: "settings", label: "Settings", icon: "⚙️" }] },
  ];

  const curPage = (() => { switch (page) { case "monitor": return renderMonitor(); case "leads": return renderLeads(); case "measure": return renderMeasure(); case "saved": return renderSaved(); case "settings": return renderSettings(); default: return renderLeads(); } })();

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: C.bg, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", color: C.text }}>
      <div style={{ width: 220, background: C.sb, borderRight: `1px solid ${C.border}`, padding: "20px 0", flexShrink: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "0 20px", marginBottom: 28 }}><div style={{ display: "flex", alignItems: "center", gap: 10 }}><div style={{ width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg, ${C.accent}, #0d9488)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, color: "#fff" }}>S</div><div><div style={{ fontSize: 16, fontWeight: 800, color: C.text, letterSpacing: -0.5 }}>SocialScanner</div><div style={{ fontSize: 9, color: C.muted, letterSpacing: 1.5, textTransform: "uppercase" }}>Monitor · Execute · Measure</div></div></div></div>
        <nav style={{ flex: 1 }}>{navItems.map(sec => <div key={sec.label}><div style={{ padding: "10px 20px 4px", fontSize: 10, color: C.muted, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" }}>{sec.label}</div>{sec.items.map(item => { const active = page === item.id; return <button key={item.id} onClick={() => { setPage(item.id); setActiveThread(null); setSelFA(null); setSelIntel(null); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 20px", background: active ? C.accentBg : "transparent", border: "none", borderLeft: active ? `3px solid ${C.accent}` : "3px solid transparent", color: active ? C.accent : C.muted, cursor: "pointer", fontSize: 14, fontWeight: 500, textAlign: "left" }}><span style={{ fontSize: 15 }}>{item.icon}</span>{item.label}{item.id === "leads" && <span style={{ marginLeft: "auto", fontSize: 10, background: `${C.green}25`, color: C.green, borderRadius: 10, padding: "1px 7px", fontWeight: 700 }}>{threads.filter(t => t.status === "new").length}</span>}{item.id === "monitor" && <span style={{ marginLeft: "auto", fontSize: 10, background: `${C.accent}25`, color: C.accent, borderRadius: 10, padding: "1px 7px", fontWeight: 700 }}>{fa.length}</span>}</button>; })}</div>)}</nav>
        <div style={{ padding: "6px 20px", fontSize: 11, color: C.muted }}>{saving ? "⏳ Saving..." : lastSaved ? `✓ ${lastSaved}` : ""}</div>
        <div style={{ padding: "10px 20px", borderTop: `1px solid ${C.border}`, position: "relative" }}>
          <div onClick={() => setShowMenu(!showMenu)} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}><div style={{ width: 28, height: 28, borderRadius: "50%", background: C.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff" }}>{user.name?.[0]?.toUpperCase() || "U"}</div><div><div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{user.name}</div><div style={{ fontSize: 11, color: C.muted }}>Pro</div></div></div>
          {showMenu && <div style={{ position: "absolute", bottom: "100%", left: 12, right: 12, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 8, marginBottom: 4, zIndex: 10 }}><div style={{ padding: "6px 12px", fontSize: 12, color: C.muted, borderBottom: `1px solid ${C.border}`, marginBottom: 4 }}>{user.email}</div><button onClick={onLogout} style={{ display: "block", width: "100%", padding: "8px 12px", background: "none", border: "none", color: C.danger, cursor: "pointer", fontSize: 13, textAlign: "left", borderRadius: 6 }}>Log Out</button></div>}
        </div>
      </div>
      <div style={{ flex: 1, padding: "24px 32px", overflowY: "auto", maxHeight: "100vh" }}>{curPage}</div>
    </div>
  );
}

// ── ROOT ──────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null); const [chk, setChk] = useState(true);
  useEffect(() => { (async () => { const s = await st.get("session:current"); if (s?.email) { const u = await st.get(`user:${s.email}`); if (u) setUser(u); } setChk(false); })(); }, []);
  const login = async u => { setUser(u); await st.set("session:current", { email: u.email }); const ex = await st.get(`data:${u.email}`); if (!ex) await st.set(`data:${u.email}`, { fa: DEF_FA, threads: DEF_THREADS, ec: { tone: "helpful", length: "medium", bv: "" }, metrics: DEF_METRICS, bm: [], intel: DEF_INTEL }); };
  const logout = async () => { setUser(null); await st.del("session:current"); };
  if (chk) return <div style={{ minHeight: "100vh", background: "#0f1117", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontFamily: "sans-serif" }}>Loading...</div>;
  return user ? <Dashboard user={user} onLogout={logout} /> : <Auth onLogin={login} />;
}
