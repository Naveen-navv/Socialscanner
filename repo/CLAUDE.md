# SocialScanner — Project Context

## Hard Rules — Answers
- **Short and precise, always. Labelled bullets, never prose paragraphs.** This applies to every answer — explanations, findings, status — not just decisions.
  - One bold label per part of the question, then one-line bullets under it.
  - **Labels are written fresh for the situation.** There is no fixed heading set. Reusing a header because it appeared in an example is wrong.
  - **Max one idea per bullet, ~1 line.** Longer → bold claim line + indented sub-bullets. Paragraph-length bullets are forbidden — split, don't cram.
  - No trailing caveat paragraph. A caveat either changes what Mani would do (one line, inline) or gets cut.

## What This App Does
Reddit lead-gen tool for Kedil (kedil.money). Finds high-intent Reddit conversations:
1. **Buying intent** — people actively looking for a budgeting/expense app
2. **Competitor frustration** — people complaining about YNAB, Mint, Walnut, Fi Money, Jupiter
3. **Problem-aware** — people discussing UPI tracking issues, overspending, salary management

**Target users:** Indian UPI users, young professionals, general personal finance audience

---

## Key URLs
- **Live app:** https://thedal.up.railway.app
- **GitHub:** https://github.com/Naveen-navv/Socialscanner.git
- **Railway project:** 04613691-18df-49b9-9554-ce1e6fcce264 (service `Thedal`)

---

## Repo Layout
All app code lives under `repo/`; the git root holds only `.gitignore`.

```
/Users/mani/Claude/Thedal/     ← git root
└── repo/                      ← Railway builds from here (service Root Directory = repo)
    ├── server.js  src/  test/  package.json  railway.json  CLAUDE.md
```

**If you move files again, change the Railway service Root Directory to match** — Nixpacks looks for `package.json` at the root of the build context, so a mismatch fails every deploy.

---

## Architecture
```
React UI → PostgreSQL (user config) → POST /api/reddit → Apify (automation-lab/reddit-scraper) → filtered threads
                                    → POST /api/anthropic → Claude AI (intent filter + reply gen)
```

## Key Files
| File | What it does |
|------|-------------|
| `repo/server.js` | All backend logic — Reddit fetching, Apify, filtering, AI proxy |
| `repo/src/constants.ts` | Default config for NEW users only (DEF_FA, DEF_TOOL_TERMS) |
| `repo/src/ai.ts` | AI reply generation + intent filtering — proxied via /api/anthropic |
| `repo/src/Dashboard.tsx` | Main UI — scan, threads, focus area config |
| `repo/src/time.js` | Timestamp parsing + age formatting, shared by server and UI |
| `repo/src/reddit-info.js` | Pure helpers for the post-time lookup (Reddit + Apify inputs) |
| `repo/test/` | `npm test` — node's built-in runner, no framework |

---

## Critical Rules
- **UI config is source of truth** — intent patterns/subreddits typed in the UI are saved to DB and sent to backend on every scan. `constants.ts` only affects brand new users.
- **Deploy process:** edit code → `git add -A && git commit -m "msg" && git push origin main` → Railway auto-deploys in 2-3 min
- **Default Apify actor:** `automation-lab/reddit-scraper` (set in Railway env vars as `APIFY_REDDIT_ACTOR_ID`)
- **Never store a rendered timestamp.** The server sends `createdUtc` (absolute epoch); the UI formats the age at render. Threads are persisted to the DB, so any relative string saved with them freezes at scan time and is wrong forever after.
- **Reddit's public API 403s from Railway.** Anything needing reddit.com from the server must go through Apify. This is why `/api/subreddit-about` reports `members: "?"` and why `/api/post-times` falls back to an Apify run.

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
