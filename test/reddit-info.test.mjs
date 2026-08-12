import test from "node:test";
import assert from "node:assert/strict";

import { normalizePostIds, buildInfoUrl, extractCreatedTimes } from "../src/reddit-info.js";
import { formatTimeAgo } from "../src/time.js";

// Shape of a real https://www.reddit.com/api/info.json?id=t3_... response,
// trimmed to the fields the backfill reads.
const infoPayload = {
  kind: "Listing",
  data: {
    children: [
      {
        kind: "t3",
        data: {
          id: "1l7abcd",
          subreddit: "IndiaFinance",
          title: "Need Advice / Possible Private Loan for Debt Consolidation (India)",
          created_utc: Math.floor(Date.parse("2026-06-06T10:00:00Z") / 1000),
        },
      },
      { kind: "t3", data: { id: "1l7efgh", created_utc: null } },
      { kind: "t3", data: { title: "no id", created_utc: 1780000000 } },
    ],
  },
};

test("normalizePostIds dedupes, trims and strips the t3_ prefix", () => {
  assert.deepEqual(normalizePostIds([" abc ", "t3_abc", "def", "", null]), ["abc", "def"]);
});

test("normalizePostIds caps the batch at Reddit's 100-fullname limit", () => {
  const ids = Array.from({ length: 150 }, (_, i) => `id${i}`);
  assert.equal(normalizePostIds(ids).length, 100);
});

test("buildInfoUrl builds a comma-joined fullname query", () => {
  assert.equal(buildInfoUrl(["abc", "def"]), "https://www.reddit.com/api/info.json?id=t3_abc,t3_def");
});

test("buildInfoUrl returns empty string when there is nothing to look up", () => {
  assert.equal(buildInfoUrl([]), "");
  assert.equal(buildInfoUrl(["", "  "]), "");
});

test("extractCreatedTimes maps post id to creation time", () => {
  const times = extractCreatedTimes(infoPayload);
  assert.equal(times["1l7abcd"], Math.floor(Date.parse("2026-06-06T10:00:00Z") / 1000));
});

test("extractCreatedTimes skips children without a usable id or date", () => {
  const times = extractCreatedTimes(infoPayload);
  assert.equal(Object.keys(times).length, 1);
  assert.equal("1l7efgh" in times, false);
});

test("extractCreatedTimes tolerates an empty or malformed payload", () => {
  assert.deepEqual(extractCreatedTimes(null), {});
  assert.deepEqual(extractCreatedTimes({}), {});
  assert.deepEqual(extractCreatedTimes({ data: { children: null } }), {});
});

// End-to-end shape of the repair: a lead stuck on "5d ago" gets its absolute
// timestamp back from Reddit and renders its true age.
test("backfilled timestamp corrects a lead frozen at scan-day age", () => {
  const staleLead = { id: "1l7abcd", time: "5d ago", createdUtc: undefined };
  const times = extractCreatedTimes(infoPayload);
  const repaired = { ...staleLead, createdUtc: times[staleLead.id] };
  assert.equal(formatTimeAgo(repaired.createdUtc, Date.parse("2026-08-05T10:00:00Z")), "60d ago");
});
