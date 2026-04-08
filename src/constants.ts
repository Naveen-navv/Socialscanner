export const C = { bg: "#0f1117", sb: "#161822", card: "#1c1f2e", border: "#2a2d3e", text: "#e2e8f0", muted: "#94a3b8", accent: "#14b8a6", accentBg: "rgba(20,184,166,0.1)", danger: "#ef4444", warn: "#f59e0b", purple: "#8b5cf6", green: "#22c55e", blue: "#3b82f6", orange: "#f97316" };

export const SUBS_DB = [
  { name: "r/PersonalFinance", m: "19.5M" }, { name: "r/Budgeting", m: "320K" }, { name: "r/FinancialPlanning", m: "180K" },
  { name: "r/IndiaInvestments", m: "450K" }, { name: "r/SaaS", m: "98K" }, { name: "r/startups", m: "1.2M" },
  { name: "r/indiehackers", m: "45K" }, { name: "r/Entrepreneur", m: "2.1M" }, { name: "r/microsaas", m: "32K" }, { name: "r/nocode", m: "89K" },
];

export const DEF_FA = [{ id: "fa_1", name: "Kedil - Budgeting", icon: "💰", brandKeywords: ["Kedil", "kedil.money"], competitors: ["YNAB", "Mint", "Goodbudget", "Walnut"], subreddits: [{ name: "r/PersonalFinance", members: "19.5M" }, { name: "r/Budgeting", members: "320K" }, { name: "r/IndiaInvestments", members: "450K" }], intentDescription: "Someone struggling to track monthly salary, household expenses, or EMIs and looking for a better or simpler budgeting method", intentPatterns: ["best", "vs", "alternative", "switching from", "review", "recommend", "looking for"] }];

export const DEF_THREADS: any[] = [];

export const DEF_TOOL_TERMS = [
  "app", "tool", "software", "tracker", "tracking", "budgeting app",
  "expense tracker", "finance app", "money app", "categorize", "categorization",
  "sync", "bank sync", "transaction", "plaid", "open banking",
  "ynab", "mint", "copilot", "monarch", "simplifi", "pocketguard",
  "goodbudget", "walnut", "monefy", "spendee", "toshl", "cleo",
  "empower", "personal capital", "quicken", "tiller",
  "net worth", "cash flow", "spending report", "auto categoriz",
  "budget nudge", "overdraft", "upi", "bank statement",
];

export const DEF_METRICS = [
  { id: "traffic", name: "Website Traffic", value: "2,847", change: "+23%", trend: "up", icon: "🌐", data: [120,135,142,155,168,180,195,210,225,240,260,285] },
  { id: "google", name: "Google Rankings", value: "14 kw", change: "+3", trend: "up", icon: "🔍", data: [5,6,7,7,8,9,9,10,11,12,13,14] },
  { id: "llm", name: "LLM Mentions", value: "89", change: "+41%", trend: "up", icon: "🤖", data: [12,18,22,28,35,40,48,55,62,70,78,89] },
  { id: "engagement", name: "Engagement", value: "8.4%", change: "+1.2%", trend: "up", icon: "💬", data: [4.2,4.8,5.1,5.5,6.0,6.3,6.8,7.1,7.5,7.8,8.1,8.4] },
  { id: "mentions", name: "Brand Mentions", value: "156", change: "+28%", trend: "up", icon: "📣", data: [45,52,58,65,72,80,88,95,105,120,138,156] },
  { id: "leads_m", name: "Leads", value: "34", change: "+12", trend: "up", icon: "🎯", data: [8,10,12,14,16,18,20,22,25,28,31,34] },
];

export const DEF_INTEL = [
  { id: "si_1", sub: "r/PersonalFinance", members: "19.5M", lastScanned: "2h ago", confidence: 92, rules: ["No self-promotion or affiliate links", "No referral codes", "Posts must be about personal finance", "Be helpful and respectful"], bestTimes: { peak: "Tue & Thu 9-11am EST", avoid: "Saturday late night" }, toneProfile: { preferred: "Expert & educational", avoid: "Salesy or casual" }, topFormats: [{ format: "Personal experience + data", avgScore: 342 }, { format: "Step-by-step breakdown", avgScore: 289 }, { format: "Comparison/review", avgScore: 234 }], whatWorks: [{ insight: "First-person stories with real numbers get 3x more upvotes", score: 95 }, { insight: "Mentioning tools framed as personal experience is accepted", score: 88 }, { insight: "Actionable steps get saved 4x more", score: 82 }, { insight: "Responses under 150 words perform better", score: 76 }], whatFails: [{ insight: "Direct product pitches get downvoted and removed within 2h", score: 94 }, { insight: "Generic advice like 'just budget more' gets negative reactions", score: 87 }, { insight: "Links in first comment flagged by AutoMod", score: 83 }], keywords: { positive: ["helped me", "game changer", "finally", "switched to", "honest review"], negative: ["scam", "ad", "shill", "spam", "affiliate"] }, modStrictness: 84, sentimentBreakdown: { positive: 42, neutral: 38, negative: 20 }, learningLog: [{ date: "Mar 18", entry: "Posts mentioning 'Indian banks' getting 2x engagement" }, { date: "Mar 16", entry: "AutoMod now removes comments with 2+ URLs" }] },
  { id: "si_2", sub: "r/Budgeting", members: "320K", lastScanned: "3h ago", confidence: 87, rules: ["Be kind and supportive", "No judgmental comments", "Self-promo in weekly thread only", "Flair your posts"], bestTimes: { peak: "Mon & Wed 12-2pm EST", avoid: "Friday evening" }, toneProfile: { preferred: "Supportive & relatable", avoid: "Condescending or preachy" }, topFormats: [{ format: "Vulnerability + solution", avgScore: 456 }, { format: "Tool recommendation with disclaimer", avgScore: 312 }], whatWorks: [{ insight: "Empathetic tone ('I've been there') gets 4x engagement", score: 93 }, { insight: "Disclaimers like 'not affiliated' build trust", score: 89 }, { insight: "Sharing specific $ amounts feels authentic", score: 81 }], whatFails: [{ insight: "Unsolicited product recs without context", score: 91 }, { insight: "Judgmental tone ('you should have saved more')", score: 88 }, { insight: "Long technical breakdowns — sub prefers concise", score: 74 }], keywords: { positive: ["finally clicked", "life changing", "simple", "helped me"], negative: ["just stop spending", "it's easy", "obviously"] }, modStrictness: 62, sentimentBreakdown: { positive: 55, neutral: 30, negative: 15 }, learningLog: [{ date: "Mar 17", entry: "Vulnerability posts getting record engagement" }, { date: "Mar 15", entry: "New flair: 'Tool Recommendation' for app mentions" }] },
  { id: "si_3", sub: "r/IndiaInvestments", members: "450K", lastScanned: "5h ago", confidence: 79, rules: ["English only", "No referral links", "Use search before posting", "Flair required"], bestTimes: { peak: "Mon-Fri 10am-1pm IST", avoid: "Weekends" }, toneProfile: { preferred: "Knowledgeable & India-specific", avoid: "Generic US-centric advice" }, topFormats: [{ format: "India-specific comparison", avgScore: 389 }, { format: "Regional bank experience", avgScore: 201 }], whatWorks: [{ insight: "India-specific context (UPI, NEFT, tax) gives credibility", score: 96 }, { insight: "Mentioning exact Indian banks shows authenticity", score: 91 }, { insight: "Rupee amounts not USD", score: 85 }], whatFails: [{ insight: "US-centric tool recs (Mint, YNAB without India context)", score: 93 }, { insight: "Posts without Indian regulatory context", score: 86 }, { insight: "Using $ instead of ₹ signals non-Indian user", score: 80 }], keywords: { positive: ["UPI", "Indian banks", "₹", "ITR", "80C", "SIP"], negative: ["USD", "US only", "not available in India"] }, modStrictness: 76, sentimentBreakdown: { positive: 38, neutral: 45, negative: 17 }, learningLog: [{ date: "Mar 18", entry: "Tax season driving surge in 80C/80D threads" }, { date: "Mar 12", entry: "Community shifting away from Walnut after update" }] },
];

export const TONES = [{ id: "helpful", label: "🤝 Helpful" }, { id: "casual", label: "😄 Casual" }, { id: "expert", label: "🎓 Expert" }, { id: "subtle", label: "🎭 Subtle" }];
