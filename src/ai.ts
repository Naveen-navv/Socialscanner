export const genReplyAI = async (thread: any, tone: string, len: string, brandVoice: string, intelData: any) => {
  const apiKey = (import.meta as any).env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("VITE_ANTHROPIC_API_KEY not set — falling back to template reply.");
    return null;
  }

  const toneGuide = { helpful: "Be friendly, informative, and genuinely helpful. Share personal experience.", casual: "Be conversational and relatable. Use casual language like you're chatting with a friend.", expert: "Be authoritative with specific data points and structured advice. Show deep knowledge.", subtle: "Be completely natural. Mention the product only if it fits organically. No pitch feel at all." }[tone] || "";
  const lenGuide = { short: "Keep it under 60 words. One concise paragraph.", medium: "2-3 paragraphs, around 100-150 words.", long: "Detailed response with sections/bullet points, 200-300 words." }[len] || "";

  let intelContext = "";
  if (intelData) {
    intelContext = `\n\nSUBREDDIT INTELLIGENCE for ${intelData.sub}:
- Rules: ${intelData.rules.join("; ")}
- Preferred tone: ${intelData.toneProfile.preferred}
- Avoid tone: ${intelData.toneProfile.avoid}
- What works: ${intelData.whatWorks.map((w: any) => w.insight).join("; ")}
- What fails: ${intelData.whatFails.map((w: any) => w.insight).join("; ")}
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
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
    });
    const data = await res.json();
    const text = data.content?.map((b: any) => b.type === "text" ? b.text : "").join("") || "";
    return text.trim() || null;
  } catch (e) {
    console.error("AI generation failed:", e);
    return null;
  }
};

type IntentFilterOptions = {
  allowPassThroughOnError?: boolean;
};

type IntentFilterResult = {
  pass: boolean;
  reason: string;
  matchedIntent: string;
  matchedKeywords: string[];
  status: "matched" | "filtered" | "error" | "passed_through";
};

const INTENT_STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "how", "i",
  "if", "in", "into", "is", "it", "me", "my", "of", "on", "or", "our", "so", "someone",
  "that", "the", "their", "them", "they", "this", "to", "trying", "want", "who", "with",
]);

const summarizeIntent = (intentDescription: string) => {
  const clean = String(intentDescription || "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const firstSentence = clean.split(/[.!?\n]/)[0]?.trim() || clean;
  return firstSentence.length <= 140 ? firstSentence : `${firstSentence.slice(0, 137).trim()}...`;
};

const normalizeKeyword = (value: string) => String(value || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

const extractIntentKeywords = (intentDescription: string) => {
  const phraseMatches = Array.from(String(intentDescription || "").matchAll(/"([^"]+)"/g))
    .map((match) => normalizeKeyword(match[1]))
    .filter(Boolean);
  const wordMatches = normalizeKeyword(intentDescription)
    .split(" ")
    .filter((word) => word.length >= 4 && !INTENT_STOP_WORDS.has(word));
  return Array.from(new Set([...phraseMatches, ...wordMatches]));
};

const inferMatchedKeywords = (post: any, intentDescription: string) => {
  const text = normalizeKeyword(`${post?.title || ""} ${post?.body || ""}`);
  if (!text) return [];
  return extractIntentKeywords(intentDescription)
    .filter((keyword) => keyword && text.includes(keyword))
    .slice(0, 6);
};

const extractJsonPayload = (text: string) => {
  const cleaned = String(text || "").replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  return (jsonMatch?.[0] || cleaned).trim();
};

const buildIntentFilterResult = (
  parsed: any,
  post: any,
  intentDescription: string,
): IntentFilterResult => {
  const pass = Boolean(parsed?.pass);
  const matchedIntent = typeof parsed?.matchedIntent === "string" && parsed.matchedIntent.trim()
    ? parsed.matchedIntent.trim()
    : (pass ? summarizeIntent(intentDescription) : "");
  const inferredKeywords = inferMatchedKeywords(post, intentDescription);
  const matchedKeywords = Array.isArray(parsed?.matchedKeywords)
    ? Array.from(new Set(parsed.matchedKeywords.map((keyword: any) => String(keyword || "").trim()).filter(Boolean))).slice(0, 6)
    : inferredKeywords;
  const reason = typeof parsed?.reason === "string" && parsed.reason.trim()
    ? parsed.reason.trim()
    : (pass
      ? "Matched the target intent."
      : "Did not match the target intent.");
  return {
    pass,
    reason,
    matchedIntent,
    matchedKeywords: matchedKeywords.length ? matchedKeywords : inferredKeywords,
    status: pass ? "matched" : "filtered",
  };
};

export const filterByIntent = async (post: any, intentDescription: string, options: IntentFilterOptions = {}): Promise<IntentFilterResult> => {
  const allowPassThroughOnError = options.allowPassThroughOnError ?? true;
  if (!intentDescription?.trim()) {
    return {
      pass: true,
      reason: "No intent filter set",
      matchedIntent: "",
      matchedKeywords: [],
      status: "matched",
    };
  }

  const apiKey = (import.meta as any).env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("VITE_ANTHROPIC_API_KEY not set - intent filter unavailable.");
    return {
      pass: allowPassThroughOnError,
      reason: allowPassThroughOnError
        ? "Intent filter unavailable, so this post was passed through."
        : "Intent filter unavailable. Add VITE_ANTHROPIC_API_KEY to test this filter.",
      matchedIntent: "",
      matchedKeywords: [],
      status: allowPassThroughOnError ? "passed_through" : "error",
    };
  }

  const prompt = `You are filtering Reddit posts for a personal budgeting app.

Target audience intent: "${intentDescription}"

Reddit Post:
Title: ${post?.title || ""}
Body: ${post?.body || ""}
Subreddit: ${post?.sub || ""}

Decide whether the Reddit post matches the target audience intent.
Return ONLY valid JSON in this exact shape:
{"pass": true, "reason": "one sentence", "matchedIntent": "short phrase from the target intent that matched", "matchedKeywords": ["keyword 1", "keyword 2"]}

Rules:
- "reason" must explain why it matches or does not match.
- "matchedIntent" must be empty when pass is false.
- "matchedKeywords" must contain the relevant words or phrases from the Reddit post that drove the decision.
- Do not include markdown fences or extra text.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 220,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await res.json();
    const text = data.content?.map((b: any) => b.type === "text" ? b.text : "").join("").trim() || "";
    const parsed = JSON.parse(extractJsonPayload(text));
    return buildIntentFilterResult(parsed, post, intentDescription);
  } catch (e) {
    console.error("Intent filter failed:", e);
    return {
      pass: allowPassThroughOnError,
      reason: allowPassThroughOnError
        ? "Intent filter could not validate this post, so it was passed through to avoid missing a lead."
        : "Intent filter could not evaluate this post. Try again and check the AI response format.",
      matchedIntent: "",
      matchedKeywords: [],
      status: allowPassThroughOnError ? "passed_through" : "error",
    };
  }
};

const hashText = (input: string) => {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
};

const pick = (items: string[], seed: number, offset = 0) => {
  if (!items.length) return "";
  return items[(seed + offset) % items.length];
};

const extractSignals = (text: string) => {
  const t = (text || "").toLowerCase();
  const hasUpi = /\bupi\b/.test(t);
  const hasBankSync = /\bbank\b|\bsync\b|\bstatement\b/.test(t);
  const hasCategory = /\bcategory|categori|split|bucket\b/.test(t);
  const hasManual = /\bmanual|manually|tedious|time|effort\b/.test(t);
  const hasOverwhelm = /\boverwhelm|messy|chaos|confus|inconsistent\b/.test(t);
  return { hasUpi, hasBankSync, hasCategory, hasManual, hasOverwhelm };
};

const buildActionLine = (signals: ReturnType<typeof extractSignals>, seed: number) => {
  const options = [
    "Start with auto-categorization first, then tune only the top few categories once a week.",
    "Set one weekly review block instead of checking every day so the system stays low effort.",
    "Use category caps and nudges so you only intervene when spending drifts off-plan.",
    "Keep your setup minimal at first: categories, recurring expenses, and one weekly check-in.",
  ];
  if (signals.hasManual) {
    return "Reduce manual work first: automate transaction tagging, then review exceptions in batches.";
  }
  if (signals.hasCategory) {
    return "Prioritize clean categories and weekly recategorization for edge cases instead of daily edits.";
  }
  return pick(options, seed, 3);
};

export const genReplyFallback = (t: any, tone: string, len: string, replyTarget: "post" | "comment" = "comment") => {
  const title = (t?.title || "").trim();
  const body = (t?.body || "").trim();
  const seed = hashText(`${t?.id || ""}|${title}|${body}|${tone}|${len}|${replyTarget}`);

  const openersByTone: Record<string, string[]> = {
    helpful: ["Great question.", "This is a solid question to ask.", "You’re focusing on the right problem."],
    casual: ["Been there, this is frustrating.", "Yeah, this can get annoying fast.", "Totally relatable problem."],
    expert: ["This is a common pattern I see.", "This usually comes down to workflow design.", "There’s a repeatable fix for this."],
    subtle: ["One practical approach:", "A low-friction way to handle this:", "A simple setup that works:"],
  };
  const opener = pick(openersByTone[tone] || openersByTone.helpful, seed);

  const matchedIntent = t?.matchedPattern ? ` around "${t.matchedPattern}"` : "";
  const commentCtx = replyTarget === "comment" && t?.replyTo?.text
    ? `You raised a good point in your comment about "${t.replyTo.text.slice(0, 80)}${t.replyTo.text.length > 80 ? "..." : ""}". `
    : "";
  const signals = extractSignals(`${title} ${body}`);
  const actionLine = buildActionLine(signals, seed);

  const contextVariants = [
    `The issue in this thread${matchedIntent} sounds like staying consistent with tracking and categories over time.`,
    `This looks like a sustainability problem${matchedIntent}: the workflow works for a week, then becomes heavy.`,
    `This thread${matchedIntent} points to maintenance overhead more than motivation.`,
  ];
  const issueContext = (title || body)
    ? pick(contextVariants, seed, 1)
    : `This feels like a budgeting workflow issue${matchedIntent}.`;

  const fitLine = signals.hasUpi || signals.hasBankSync
    ? "Kedil is useful here because it handles UPI and Indian bank transaction patterns with less manual cleanup."
    : "Kedil is useful here because it keeps tracking lightweight with auto-categorization and simple nudges.";

  if (len === "short") {
    return `${opener} ${commentCtx}${issueContext} ${actionLine} ${fitLine}`;
  }

  if (len === "long") {
    const close = pick([
      "If useful, I can share a 10-minute setup flow.",
      "Happy to share the exact category structure if that helps.",
      "If you want, I can suggest a starter template based on your use case.",
    ], seed, 2);
    return `${opener} ${commentCtx}${issueContext}

What usually helps:
1. Keep daily interaction minimal and automate the repetitive parts.
2. Review once a week, not continuously.
3. Fix only high-impact categories first.

For this specific thread ("${title.slice(0, 90)}${title.length > 90 ? "..." : ""}"), I’d focus on reducing manual effort first. ${fitLine}

${close}`;
  }

  const mediumClosers = [
    "That usually keeps the process consistent without feeling like extra admin.",
    "This tends to improve consistency while keeping effort low.",
    "It stays practical and avoids the burn-out cycle from over-tracking.",
  ];
  return `${opener} ${commentCtx}${issueContext}

For this case ("${title.slice(0, 70)}${title.length > 70 ? "..." : ""}"), I’d optimize for low-maintenance tracking. ${actionLine} ${fitLine}

${pick(mediumClosers, seed, 4)}`;
};
