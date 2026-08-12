// Single source of truth for post timestamps, shared by server.js and the UI.
//
// Rule: the server sends an absolute epoch (createdUtc); the UI renders the
// relative label. A relative string computed on the server gets persisted with
// the lead and then never updates, so an old lead keeps showing the age it had
// on the day it was first scanned.

// Returns epoch SECONDS, or null when the input carries no usable date.
// Never substitutes "now" for a missing date — an unknown age must render as
// unknown, not as brand new.
export function parseUtcSeconds(value) {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return null;
    return value > 1e12 ? Math.floor(value / 1000) : Math.floor(value);
  }
  if (typeof value === "string" && value.trim()) {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber) && asNumber !== 0) return parseUtcSeconds(asNumber);
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parseUtcSeconds(parsed);
  }
  return null;
}

// Relative age of an epoch-seconds timestamp, evaluated against `nowMs` so the
// same stored post renders correctly however long after the scan it is viewed.
export function formatTimeAgo(utcSeconds, nowMs = Date.now()) {
  const utc = parseUtcSeconds(utcSeconds);
  if (utc === null) return "";
  const diff = Math.max(0, nowMs / 1000 - utc);
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
