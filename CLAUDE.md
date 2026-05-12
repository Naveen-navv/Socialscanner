# SocialScanner — Project Context

## What This App Does
Reddit lead-gen tool for Kedil (kedil.money). Finds high-intent Reddit conversations:
1. **Buying intent** — people actively looking for a budgeting/expense app
2. **Competitor frustration** — people complaining about YNAB, Mint, Walnut, Fi Money, Jupiter
3. **Problem-aware** — people discussing UPI tracking issues, overspending, salary management

**Target users:** Indian UPI users, young professionals, general personal finance audience

---

## Key URLs
- **Live app:** https://socialscanner-production.up.railway.app
- **GitHub:** https://github.com/Naveen-navv/Socialscanner.git
- **Railway project:** 04613691-18df-49b9-9554-ce1e6fcce264

---

## Architecture
```
React UI → PostgreSQL (user config) → POST /api/reddit → Apify (automation-lab/reddit-scraper) → filtered threads
                                    → POST /api/anthropic → Claude AI (intent filter + reply gen)
```

## Key Files
| File | What it does |
|------|-------------|
| `server.js` | All backend logic — Reddit fetching, Apify, filtering, AI proxy |
| `src/constants.ts` | Default config for NEW users only (DEF_FA, DEF_TOOL_TERMS) |
| `src/ai.ts` | AI reply generation + intent filtering — proxied via /api/anthropic |
| `src/Dashboard.tsx` | Main UI — scan, threads, focus area config |

---

## Critical Rules
- **UI config is source of truth** — intent patterns/subreddits typed in the UI are saved to DB and sent to backend on every scan. `constants.ts` only affects brand new users.
- **Deploy process:** edit code → `git add -A && git commit -m "msg" && git push origin main` → Railway auto-deploys in 2-3 min
- **Default Apify actor:** `automation-lab/reddit-scraper` (set in Railway env vars as `APIFY_REDDIT_ACTOR_ID`)

---

## Intent Pattern Rules
✅ Good — specific, 3+ words: `"looking for an app"`, `"UPI transactions"`, `"track my expenses"`
❌ Bad — generic, 1 word: `"best"`, `"vs"`, `"review"` — match almost every Reddit post

## Debug Guide
After each scan the app shows:
`Fetched X posts → Y matched intent → Z matched tool terms → N threads`
- Y = 0 → intent patterns too tight, broaden them
- N = Y → tool terms too broad, tighten them
- N is high but results are junk → intent patterns still too generic

---

## Full Fine-Tuning Guide
See `/Users/mani/Claude/Workspace/SocialScanner/skills/socialscanner/SKILL.md`
