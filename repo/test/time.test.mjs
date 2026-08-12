import test from "node:test";
import assert from "node:assert/strict";

import { parseUtcSeconds, formatTimeAgo } from "../src/time.js";

const JUN_06_2026 = Math.floor(Date.parse("2026-06-06T10:00:00Z") / 1000);
const JUN_11_2026 = Date.parse("2026-06-11T10:00:00Z"); // scan time, 5 days later
const AUG_05_2026 = Date.parse("2026-08-05T10:00:00Z"); // 60 days after the post

test("parseUtcSeconds keeps epoch seconds as-is", () => {
  assert.equal(parseUtcSeconds(JUN_06_2026), JUN_06_2026);
});

test("parseUtcSeconds converts epoch milliseconds to seconds", () => {
  assert.equal(parseUtcSeconds(JUN_06_2026 * 1000), JUN_06_2026);
});

test("parseUtcSeconds parses ISO date strings", () => {
  assert.equal(parseUtcSeconds("2026-06-06T10:00:00Z"), JUN_06_2026);
});

test("parseUtcSeconds parses numeric strings", () => {
  assert.equal(parseUtcSeconds(String(JUN_06_2026)), JUN_06_2026);
});

// The old parseUtc silently substituted Date.now() here, which made an undated
// post render as brand new — a fabricated timestamp presented as fact.
test("parseUtcSeconds returns null when there is no usable date", () => {
  assert.equal(parseUtcSeconds(undefined), null);
  assert.equal(parseUtcSeconds(null), null);
  assert.equal(parseUtcSeconds(""), null);
  assert.equal(parseUtcSeconds("not a date"), null);
  assert.equal(parseUtcSeconds(0), null);
});

test("formatTimeAgo renders minutes, hours and days", () => {
  const now = Date.parse("2026-08-05T10:00:00Z");
  assert.equal(formatTimeAgo(now / 1000 - 120, now), "2m ago");
  assert.equal(formatTimeAgo(now / 1000 - 3 * 3600, now), "3h ago");
  assert.equal(formatTimeAgo(now / 1000 - 4 * 86400, now), "4d ago");
});

test("formatTimeAgo returns an empty label when the timestamp is unknown", () => {
  assert.equal(formatTimeAgo(null, Date.now()), "");
  assert.equal(formatTimeAgo(undefined, Date.now()), "");
  assert.equal(formatTimeAgo(0, Date.now()), "");
});

test("formatTimeAgo never reports a future post as aged", () => {
  const now = Date.parse("2026-08-05T10:00:00Z");
  assert.equal(formatTimeAgo(now / 1000 + 600, now), "0m ago");
});

// This is the reported bug. A lead scanned on Jun 11 stored the string "5d ago"
// and kept showing it on Aug 5, by which point the post was two months old.
// The age must be a function of (createdUtc, now) so it re-renders correctly at
// any later moment, never a value frozen at scan time.
test("age is recomputed from the absolute timestamp, not frozen at scan time", () => {
  assert.equal(formatTimeAgo(JUN_06_2026, JUN_11_2026), "5d ago");
  assert.equal(formatTimeAgo(JUN_06_2026, AUG_05_2026), "60d ago");
});
