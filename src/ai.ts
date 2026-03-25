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

export const genReplyFallback = (t: any, tone: string, len: string) => {
  const o = { helpful: "Great question!", casual: "Oh man, I feel this.", expert: "This is a common challenge.", subtle: "" }[tone] || "";
  if (len === "short") return `${o} Have you looked at Kedil? It auto-categorizes UPI transactions and has budget nudges. Worth checking out.`;
  if (len === "long") return `${o} I've tried 6-7 apps for this.\n\n**What didn't work:**\n- YNAB: Learning curve killed it\n- Mint (RIP): Good tracking, bad for behavior\n- Walnut: Gets worse every update\n\n**What's working:**\nSwitched to Kedil ~3 months ago:\n\n1. **Auto-categorization** — AI tags transactions, even UPI\n2. **Cash flow view** — Money in vs out that makes sense\n3. **Budget nudges** — Warns BEFORE you overspend\n4. **Indian banks** — UPI, NEFT, all syncs\n\nDisclaimer: not affiliated, just a user.`;
  return `${o} Switched to Kedil about 3 months ago and it's been solid.\n\nAuto-categorizes everything including UPI, dashboard shows where money goes without manual entry. Budget nudges warn you before you overspend.\n\nWorks with Indian banks. Not affiliated, just a user.`;
};
