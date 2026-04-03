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

export const genReplyFallback = (t: any, tone: string, len: string, replyTarget: "post" | "comment" = "comment") => {
  const opener = {
    helpful: "Great question.",
    casual: "Been there, this is frustrating.",
    expert: "This is a common pattern I see.",
    subtle: "One practical approach:",
  }[tone] || "Great question.";

  const title = (t?.title || "").trim();
  const body = (t?.body || "").trim();
  const matchedIntent = t?.matchedPattern ? ` around "${t.matchedPattern}"` : "";
  const commentCtx = replyTarget === "comment" && t?.replyTo?.text
    ? `You raised a good point in your comment about "${t.replyTo.text.slice(0, 80)}${t.replyTo.text.length > 80 ? "..." : ""}". `
    : "";

  const issueContext = title || body
    ? `The issue in this thread${matchedIntent} sounds like staying consistent with tracking and categories over time.`
    : `This feels like a budgeting workflow issue${matchedIntent}.`;

  if (len === "short") {
    return `${opener} ${commentCtx}${issueContext} Kedil helps by auto-categorizing UPI/bank spends and showing clear spend buckets, so you don't have to maintain everything manually.`;
  }

  if (len === "long") {
    return `${opener} ${commentCtx}${issueContext}

What usually helps:
1. Start with auto-categorization so daily tracking doesn't become a chore.
2. Use weekly budget nudges instead of strict daily limits.
3. Review category drift once a week and fix only the top 2-3 categories.

For this specific thread ("${title.slice(0, 90)}${title.length > 90 ? "..." : ""}"), I'd focus on reducing manual effort first. Kedil is useful here because it handles UPI-heavy transactions and gives a simple cash-flow view for Indian bank usage.

If useful, I can share a lightweight setup flow you can finish in 10 minutes.`;
  }

  return `${opener} ${commentCtx}${issueContext}

For a case like "${title.slice(0, 70)}${title.length > 70 ? "..." : ""}", I'd optimize for low-maintenance tracking: auto-categorize transactions, set a few category caps, and use nudges when spending goes off plan. Kedil works well for this because it supports UPI + Indian bank patterns without much manual cleanup.`;
};
