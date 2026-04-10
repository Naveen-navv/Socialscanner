import { useState, useEffect, useMemo, useRef } from "react";
import { C, SUBS_DB, DEF_FA, DEF_THREADS, DEF_TOOL_TERMS, DEF_METRICS, DEF_INTEL, TONES } from "./constants";
import { filterByIntent, genReplyAI, genReplyFallback } from "./ai";

const Badge = ({ children, color = C.accent, onRemove }: { children: React.ReactNode; color?: string; onRemove?: () => void }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, padding: "4px 10px", borderRadius: 6, background: `${color}18`, color, border: `1px solid ${color}35`, fontWeight: 500 }}>
    {children}{onRemove && <span onClick={e => { e.stopPropagation(); onRemove(); }} style={{ cursor: "pointer", opacity: 0.7, fontWeight: 700, marginLeft: 2 }}>x</span>}
  </span>
);

const Spark = ({ data, color = C.accent, w = 80, h = 24 }: { data: number[]; color?: string; w?: number; h?: number }) => {
  if (!data?.length) return null;
  const mx = Math.max(...data), mn = Math.min(...data);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - mn) / (mx - mn || 1)) * h}`).join(" ");
  return <svg width={w} height={h} style={{ display: "block" }}><polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" /></svg>;
};

function TagInput({ tags, setTags, placeholder, color = C.accent }: { tags: string[]; setTags: (t: string[]) => void; placeholder: string; color?: string }) {
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

function SubAdd({ onAdd }: { onAdd: (name: string, members: string) => void }) {
  const [v, setV] = useState("");
  const f = v.trim() ? SUBS_DB.filter(s => s.name.toLowerCase().includes(v.toLowerCase())) : [];
  return (<div style={{ position: "relative" }}>
    <input value={v} onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && v.trim()) { onAdd(v.trim().startsWith("r/") ? v.trim() : `r/${v.trim()}`, "?"); setV(""); } }} placeholder="Add subreddit..." style={{ width: "100%", padding: "8px 12px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 13, boxSizing: "border-box" }} />
    {f.length > 0 && <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, marginTop: 4, zIndex: 10, maxHeight: 140, overflowY: "auto" }}>{f.map(p => <div key={p.name} onClick={() => { onAdd(p.name, p.m); setV(""); }} style={{ padding: "8px 12px", cursor: "pointer", display: "flex", justifyContent: "space-between", fontSize: 13, color: C.text }} onMouseEnter={e => (e.currentTarget.style.background = C.accentBg)} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}><span>{p.name}</span><span style={{ color: C.muted, fontSize: 12 }}>{p.m}</span></div>)}</div>}
  </div>);
}

export function Dashboard({ user, onLogout }: { user: any; onLogout: () => void }) {
  const [page, setPage] = useState("leads");
  const [dataLoaded, setDataLoaded] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveInFlight = useRef(false);
  const pendingSave = useRef(false);
  const snapshotRef = useRef<any>(null);
  const hasHydratedRef = useRef(false);

  const [fa, setFa] = useState<any[]>([]); const [threads, setThreads] = useState<any[]>([]); const [ec, setEc] = useState({ tone: "helpful", length: "medium", bv: "" }); const [metrics, setMetrics] = useState<any[]>([]); const [bm, setBm] = useState<any[]>([]); const [intel, setIntel] = useState<any[]>([]);

  const [selFA, setSelFA] = useState<string | null>(null); const [showNewFA, setShowNewFA] = useState(false); const [newFAName, setNewFAName] = useState("");
  const [activeThread, setActiveThread] = useState<any | null>(null); const [draftText, setDraftText] = useState(""); const [threadFilter, setThreadFilter] = useState("all");
  const [newMetric, setNewMetric] = useState(""); const [measurePeriod, setMeasurePeriod] = useState("30d");
  const [copied, setCopied] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [replyTarget, setReplyTarget] = useState<"comment" | "post">("comment");
  const [settingsTab, setSettingsTab] = useState("intelligence"); const [selIntel, setSelIntel] = useState<string | null>(null); const [newIntelSub, setNewIntelSub] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [toolTerms, setToolTerms] = useState<string[]>(DEF_TOOL_TERMS);
  const [searchAll, setSearchAll] = useState(false);
  const [testPostText, setTestPostText] = useState("");
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<any | null>(null);
  const normalizedEmail = (user?.email || "").toLowerCase().trim();
  const localBackupKey = `ss_data_backup:${normalizedEmail}`;
  const getSnapshotSavedAt = (data: any) => Number(data?._meta?.savedAt || 0);
  const withSnapshotMeta = (snapshot: any) => ({
    ...snapshot,
    _meta: { ...(snapshot?._meta || {}), savedAt: Date.now() },
  });
  const saveLocalSnapshot = (snapshot: any) => {
    const stamped = withSnapshotMeta(snapshot);
    snapshotRef.current = stamped;
    try {
      localStorage.setItem(localBackupKey, JSON.stringify(stamped));
    } catch {}
    return stamped;
  };

  const normalizeIntelEntry = (si: any) => {
    const scanningLike = [si?.lastScanned, ...(si?.rules || []), ...(si?.whatWorks || []).map((w: any) => w?.insight || ""), ...(si?.whatFails || []).map((w: any) => w?.insight || "")]
      .some((x: string) => typeof x === "string" && /(Scanning|Analyzing|Learning)\.\.\./i.test(x));
    return {
      ...si,
      scanStatus: si?.scanStatus || (scanningLike ? "scanning" : "analyzed"),
      scanMessage: si?.scanMessage || null,
    };
  };

  const normalizeFocusArea = (focus: any) => ({
    ...focus,
    brandKeywords: focus?.brandKeywords || [],
    competitors: focus?.competitors || [],
    subreddits: focus?.subreddits || [],
    intentPatterns: focus?.intentPatterns || [],
    intentDescription: focus?.intentDescription || "",
  });

  const normalizeSubredditName = (rawSub: string) => {
    const trimmed = String(rawSub || "").trim();
    if (!trimmed) return "";
    return trimmed.startsWith("r/") ? trimmed : `r/${trimmed}`;
  };

  const isLiveIntelEntry = (entry: any) => (
    String(entry?.source || "").toLowerCase() === "live" ||
    /^Analyzed at /i.test(String(entry?.lastScanned || ""))
  );

  const quickScanIntel = async (id: string, sub: string) => {
    setIntel((prev) => prev.map((x) => x.id === id ? { ...x, scanStatus: "scanning", scanMessage: "Analyzing subreddit patterns..." } : x));
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch("/api/intel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sub }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      const profile = data?.profile;
      if (!profile) throw new Error("Analysis service returned no profile");
      setIntel((prev) => prev.map((x) => x.id === id ? { ...x, ...profile, source: "live" } : x));
    } catch (err: any) {
      setIntel((prev) => prev.map((x) => x.id === id ? {
        ...x,
        scanStatus: "failed",
        scanMessage: err?.message || "Scan failed.",
        lastScanned: "Scan failed",
        confidence: 0,
        rules: ["Analysis failed - click retry."],
      } : x));
    }
  };

  const addIntelSubreddit = (rawSub: string, members = "?") => {
    const sub = normalizeSubredditName(rawSub);
    if (!sub) return;
    if (intel.find((s) => s.sub.toLowerCase() === sub.toLowerCase())) return;
    const id = `si_${Date.now()}`;
    setIntel((prev) => [...prev, {
      id,
      sub,
      members,
      lastScanned: "Queued",
      confidence: 0,
      rules: ["Preparing scan..."],
      bestTimes: { peak: "Analyzing...", avoid: "Analyzing..." },
      toneProfile: { preferred: "Analyzing...", avoid: "Analyzing..." },
      topFormats: [],
      whatWorks: [{ insight: "Analyzing...", score: 0 }],
      whatFails: [{ insight: "Analyzing...", score: 0 }],
      keywords: { positive: [], negative: [] },
      modStrictness: 0,
      sentimentBreakdown: { positive: 33, neutral: 34, negative: 33 },
      learningLog: [{ date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }), entry: "Quick scan started" }],
      scanStatus: "scanning",
      scanMessage: "Starting analysis...",
      source: "pending",
    }]);
    setNewIntelSub("");
    void quickScanIntel(id, sub);
  };

  const applyLoadedState = (data: any) => {
    const loadedFa = (data?.fa || DEF_FA).map(normalizeFocusArea);
    const loadedThreads = data?.threads || DEF_THREADS;
    const loadedEc = data?.ec || { tone: "helpful", length: "medium", bv: "" };
    const loadedMetrics = data?.metrics || DEF_METRICS;
    const loadedBm = data?.bm || [];
    const loadedToolTerms = data?.toolTerms || DEF_TOOL_TERMS;
    const loadedSearchAll = data?.searchAll || false;
    const loadedIntel = (data?.intel || DEF_INTEL).map(normalizeIntelEntry);

    setFa(loadedFa);
    setThreads(loadedThreads);
    setEc(loadedEc);
    setMetrics(loadedMetrics);
    setBm(loadedBm);
    setIntel(loadedIntel);
    setToolTerms(loadedToolTerms);
    setSearchAll(loadedSearchAll);

    return { loadedFa, loadedThreads, loadedToolTerms, loadedSearchAll, loadedIntel };
  };

  const normalizeStatusText = (value: string | null | undefined) => {
    if (!value) return value || "";
    return value;
  };

  const getThreadStatsText = (thread: any, scoreLabel = "pts") => {
    const parts = [];
    if (typeof thread?.score === "number") parts.push(`${thread.score} ${scoreLabel}`);
    if (typeof thread?.comments === "number") parts.push(`${thread.comments} comments`);
    return parts.join(" | ");
  };

  const normalizedToolTerms = useMemo(
    () => toolTerms.map((term) => term.toLowerCase().trim()).filter(Boolean),
    [toolTerms]
  );

  const threadMatchesActiveConfig = (thread: any) => {
    if (normalizedToolTerms.length > 0) {
      const text = `${thread?.title || ""} ${thread?.body || ""} ${thread?.replyTo?.text || ""}`.toLowerCase();
      if (!normalizedToolTerms.some((term) => text.includes(term))) return false;
    }

    const matchingFocusAreas = fa.filter((focus) => focusAreaMatchesThread(focus, thread, searchAll));
    if (!matchingFocusAreas.length) return false;

    const storedFocusAreaId = String(thread?.focusAreaId || "");
    if (storedFocusAreaId) {
      return matchingFocusAreas.some((focus) => String(focus.id || "") === storedFocusAreaId);
    }

    const storedIntentDescription = String(thread?.intentFilterDescription || "");
    if (!storedIntentDescription) return true;

    return matchingFocusAreas.some((focus) => String(focus.intentDescription || "") === storedIntentDescription);
  };

  const visibleThreads = useMemo(
    () => threads.filter(threadMatchesActiveConfig),
    [threads, fa, searchAll, normalizedToolTerms]
  );

  useEffect(() => {
    if (activeThread && !visibleThreads.some((thread) => thread.id === activeThread.id)) {
      setActiveThread(null);
    }
  }, [activeThread, visibleThreads]);

  useEffect(() => {
    setTestPostText("");
    setTestResult(null);
    setTestLoading(false);
  }, [selFA]);

  function focusAreaMatchesThread(focus: any, thread: any, useSearchAll = false) {
    const subName = String(thread?.sub || "").toLowerCase().trim();
    const text = `${thread?.title || ""} ${thread?.body || ""}`.toLowerCase();
    const matchedPattern = String(thread?.matchedPattern || "").toLowerCase().trim();
    const subredditMatch = useSearchAll || (focus.subreddits || []).some((sub: any) => String(sub?.name || sub || "").toLowerCase().trim() === subName);
    const patternMatch = (focus.intentPatterns || []).some((pattern: string) => {
      const normalizedPattern = pattern.toLowerCase().trim();
      return normalizedPattern && (matchedPattern === normalizedPattern || text.includes(normalizedPattern));
    });
    return subredditMatch && patternMatch;
  }

  const applyIntentFilters = async (incomingThreads: any[], currentFa: any[], useSearchAll = false) => {
    const filteredThreads = [];
    for (const thread of incomingThreads) {
      const matchingFocusAreas = currentFa.filter((focus) => focusAreaMatchesThread(focus, thread, useSearchAll));
      if (!matchingFocusAreas.length) continue;

      let passingIntentResult: { reason: string; intentDescription: string; focusAreaId: string; focusAreaName: string } | null = null;
      for (const focus of matchingFocusAreas) {
        const result = await filterByIntent(thread, focus.intentDescription || "");
        if (result.pass) {
          passingIntentResult = {
            reason: result.reason,
            intentDescription: focus.intentDescription || "",
            focusAreaId: String(focus.id || ""),
            focusAreaName: String(focus.name || ""),
          };
          break;
        }
      }

      if (!passingIntentResult) continue;
      filteredThreads.push({
        ...thread,
        intentFilterReason: passingIntentResult.reason,
        intentFilterDescription: passingIntentResult.intentDescription,
        focusAreaId: passingIntentResult.focusAreaId,
        focusAreaName: passingIntentResult.focusAreaName,
      });
    }
    return filteredThreads;
  };

  const fetchFromReddit = async (currentFa: any[], currentToolTerms: string[], useSearchAll = false) => {
    if (!useSearchAll && !currentFa.length) return;
    setRefreshing(true);
    setScanError(null);
    try {
      const allSubs = currentFa.flatMap(f => f.subreddits);
      const allKeywords = [...new Set(currentFa.flatMap(f => [...f.brandKeywords, ...f.competitors]))];
      const allPatterns = [...new Set(currentFa.flatMap(f => f.intentPatterns))];
      const res = await fetch("/api/reddit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subreddits: allSubs, keywords: allKeywords, intentPatterns: allPatterns, toolTerms: currentToolTerms, searchAll: useSearchAll }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
      const filteredIncomingThreads = await applyIntentFilters(data.threads || [], currentFa, useSearchAll);
      const DUMMY_IDS = new Set(["t1","t2","t3","t4","t5","t6"]);
      setThreads(prev => {
        const preserved = prev.filter((t: any) => !DUMMY_IDS.has(t.id));
        const mergedById = new Map<string, any>(preserved.map((t: any) => [t.id, t]));

        for (const incoming of filteredIncomingThreads) {
          const existing = mergedById.get(incoming.id);
          mergedById.set(
            incoming.id,
            existing
              ? {
                  ...incoming,
                  ...existing,
                  title: incoming.title,
                  sub: incoming.sub,
                  subMembers: incoming.subMembers,
                  score: incoming.score,
                  comments: incoming.comments,
                  time: incoming.time,
                  intent: incoming.intent,
                  matchedPattern: incoming.matchedPattern,
                  author: incoming.author,
                  authorKarma: incoming.authorKarma,
                  body: incoming.body,
                  replyTo: incoming.replyTo,
                  url: incoming.url,
                  intentFilterReason: incoming.intentFilterReason,
                  intentFilterDescription: incoming.intentFilterDescription,
                  focusAreaId: incoming.focusAreaId,
                  focusAreaName: incoming.focusAreaName,
                }
              : incoming
          );
        }

        return [...mergedById.values()];
      });
      if (filteredIncomingThreads.length) {
        setScanError(null);
      } else {
        setScanError(normalizeStatusText(data.debug) || "Reddit returned 0 matching threads - try broadening your intent patterns or subreddits in Monitor.");
      }
    } catch (err: any) {
      setScanError(normalizeStatusText(`Fetch failed: ${err.message} - check Railway logs & /api/test`));
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let localData: any = null;
    try {
      const raw = localStorage.getItem(localBackupKey);
      if (raw) localData = JSON.parse(raw);
    } catch {}

    const initialData = localData || {
      fa: DEF_FA,
      threads: DEF_THREADS,
      ec: { tone: "helpful", length: "medium", bv: "" },
      metrics: DEF_METRICS,
      bm: [],
      intel: DEF_INTEL,
      toolTerms: DEF_TOOL_TERMS,
      searchAll: false,
    };

    const initial = applyLoadedState(initialData);
    snapshotRef.current = initialData;
    setDataLoaded(true);
    setSaveState("idle");
    setSaveError(null);

    for (const item of initial.loadedIntel) {
      if (item.scanStatus === "scanning") {
        void quickScanIntel(item.id, item.sub);
      }
    }

    // Defer network refresh so first paint isn't blocked by Reddit calls.
    setTimeout(() => { void fetchFromReddit(initial.loadedFa, initial.loadedToolTerms, initial.loadedSearchAll); }, 50);

    (async () => {
      const CLOUD_SYNC_TIMEOUT_MS = 8000;
      const CLOUD_SYNC_ATTEMPTS = 2;
      let remoteError: string | null = null;

      for (let attempt = 1; attempt <= CLOUD_SYNC_ATTEMPTS; attempt++) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), CLOUD_SYNC_TIMEOUT_MS);
          const res = await fetch(`/api/data?email=${encodeURIComponent(normalizedEmail)}`, { signal: controller.signal });
          clearTimeout(timeout);

          if (!res.ok) {
            let msg = `HTTP ${res.status}`;
            try {
              const body = await res.json();
              if (body?.error) msg = body.error;
            } catch {}
            remoteError = `Cloud sync unavailable (${msg})`;
            break;
          }

          const remoteData = await res.json();
          if (remoteData) {
            const currentSavedAt = getSnapshotSavedAt(snapshotRef.current);
            const remoteSavedAt = getSnapshotSavedAt(remoteData);
            if (!localData || remoteSavedAt > currentSavedAt) {
              const remote = applyLoadedState(remoteData);
              snapshotRef.current = remoteData;
              for (const item of remote.loadedIntel) {
              if (item.scanStatus === "scanning") {
                void quickScanIntel(item.id, item.sub);
              }
            }
            }
          }
          setSaveState("idle");
          setSaveError(null);
          remoteError = null;
          break;
        } catch (err: any) {
          remoteError = `Cloud sync unavailable (${err?.name === "AbortError" ? "timeout" : err?.message || "network error"})`;
          if (attempt < CLOUD_SYNC_ATTEMPTS) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }
      }

      if (remoteError) {
        if (localData) {
          // Local snapshot is available, so avoid noisy error state on startup.
          setSaveState("idle");
          setSaveError(null);
        } else {
          setSaveState("error");
          setSaveError(`${remoteError}. Running in local-only mode until DB is reachable.`);
        }
      }
    })();
  }, []);

  const persistSnapshot = async (snapshot: any) => {
    const stampedSnapshot = snapshot?._meta?.savedAt ? snapshot : withSnapshotMeta(snapshot);
    snapshotRef.current = stampedSnapshot;
    if (saveInFlight.current) {
      pendingSave.current = true;
      return;
    }

    saveInFlight.current = true;
    setSaveState("saving");
    setSaveError(null);

    if (!normalizedEmail) {
      setLastSaved(new Date().toLocaleTimeString());
      setSaveState("saved");
      saveInFlight.current = false;
      if (pendingSave.current) {
        pendingSave.current = false;
        const nextSnapshot = snapshotRef.current;
        if (nextSnapshot) void persistSnapshot(nextSnapshot);
      }
      return;
    }

    try {
      const res = await fetch("/api/data", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, data: stampedSnapshot }),
      });

      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const body = await res.json();
          if (body?.error) msg = body.error;
        } catch {}
        throw new Error(msg);
      }

      setLastSaved(new Date().toLocaleTimeString());
      setSaveState("saved");
    } catch (err: any) {
      setSaveState("error");
      setSaveError(`Cloud save failed: ${err?.message || "unknown error"}. Changes are still saved locally.`);
    } finally {
      saveInFlight.current = false;
      if (pendingSave.current) {
        pendingSave.current = false;
        const nextSnapshot = snapshotRef.current;
        if (nextSnapshot) void persistSnapshot(nextSnapshot);
      }
    }
  };

  useEffect(() => {
    if (!dataLoaded) return;
    if (!hasHydratedRef.current) {
      hasHydratedRef.current = true;
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    const snapshot = { fa, threads, ec, metrics, bm, intel, toolTerms, searchAll };
    const localSnapshot = saveLocalSnapshot(snapshot);
    timer.current = setTimeout(() => { void persistSnapshot(localSnapshot); }, 800);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [fa, threads, ec, metrics, bm, intel, toolTerms, searchAll, dataLoaded]);

  useEffect(() => {
    if (!dataLoaded) return;

    const monitorSubs = new Map<string, string>();
    for (const focus of fa) {
      for (const sub of focus?.subreddits || []) {
        const name = normalizeSubredditName(sub?.name || sub);
        if (!name) continue;
        const members = String(sub?.members || "?");
        if (!monitorSubs.has(name)) monitorSubs.set(name, members);
      }
    }

    if (!monitorSubs.size) return;

    const existingBySub = new Map(
      intel.map((entry) => [normalizeSubredditName(entry?.sub || ""), entry] as const).filter(([name]) => !!name)
    );

    setIntel((prev) => {
      let changed = false;
      const next = prev.map((entry) => {
        const subName = normalizeSubredditName(entry?.sub || "");
        const monitorMembers = monitorSubs.get(subName);
        if (!monitorMembers || monitorMembers === "?" || entry?.members === monitorMembers) return entry;
        if (entry?.members && entry.members !== "?") return entry;
        changed = true;
        return { ...entry, members: monitorMembers };
      });
      return changed ? next : prev;
    });

    for (const [subName, members] of monitorSubs.entries()) {
      const existing = existingBySub.get(subName);
      if (!existing) {
        addIntelSubreddit(subName, members);
        continue;
      }
      if (existing.scanStatus === "scanning" || existing.scanStatus === "failed") continue;
      if (!isLiveIntelEntry(existing)) {
        void quickScanIntel(existing.id, subName);
      }
    }
  }, [fa, intel, dataLoaded]);

  const updateFA = (id: string, u: any) => setFa(p => p.map(f => f.id === id ? { ...f, ...u } : f));

  const validate = (text: string, subName: string) => {
    const si = intel.find(s => s.sub === subName);
    if (!si || !text.trim()) return null;
    const lw = text.toLowerCase(); const checks: any[] = [];
    const ruleIssues: string[] = []; si.rules.forEach((r: string) => { if (r.toLowerCase().includes("self-promotion") && (lw.includes("check out my") || lw.includes("visit my"))) ruleIssues.push(r); if (r.toLowerCase().includes("referral") && lw.includes("referral")) ruleIssues.push(r); });
    checks.push({ label: "Rule Compliance", pass: ruleIssues.length === 0, score: ruleIssues.length === 0 ? 100 : 30, detail: ruleIssues.length === 0 ? "No violations detected" : `Issue: ${ruleIssues[0]}` });
    const ts = (si.toneProfile.preferred.toLowerCase().includes("expert") && (lw.includes("data") || lw.includes("months") || lw.includes("experience"))) ? 90 : (si.toneProfile.preferred.toLowerCase().includes("supportive") && (lw.includes("i've been") || lw.includes("same boat"))) ? 95 : (si.toneProfile.preferred.toLowerCase().includes("knowledgeable") && (lw.includes("upi") || lw.includes("indian"))) ? 92 : 65;
    checks.push({ label: "Tone Match", pass: ts >= 70, score: ts, detail: ts >= 70 ? `Aligns with "${si.toneProfile.preferred}"` : `Consider "${si.toneProfile.preferred}" tone` });
    const ph = si.keywords.positive.filter((k: string) => lw.includes(k.toLowerCase()));
    checks.push({ label: "Signal Keywords", pass: ph.length > 0, score: Math.min(100, 40 + ph.length * 20), detail: ph.length > 0 ? `Contains: ${ph.join(", ")}` : "Add high-signal phrases" });
    const nh = si.keywords.negative.filter((k: string) => lw.includes(k.toLowerCase()));
    checks.push({ label: "Trigger Words", pass: nh.length === 0, score: nh.length === 0 ? 100 : 20, detail: nh.length === 0 ? "No trigger words" : `Warning: "${nh.join(", ")}"` });
    const wc = text.split(/\s+/).filter(Boolean).length; const lok = wc > 30 && wc < 300;
    checks.push({ label: "Length", pass: lok, score: lok ? 85 : 50, detail: lok ? `${wc} words - good` : wc <= 30 ? "Too short" : "Consider shortening" });
    const hd = lw.includes("not affiliated") || lw.includes("disclaimer") || lw.includes("just a user");
    if (si.whatWorks.some((w: any) => w.insight.toLowerCase().includes("disclaimer"))) checks.push({ label: "Disclaimer", pass: hd, score: hd ? 100 : 40, detail: hd ? "Trust disclaimer present" : "This sub rewards disclaimers" });
    const overall = Math.round(checks.reduce((s, c) => s + c.score, 0) / checks.length);
    return { checks, overall, subName: si.sub, confidence: si.confidence };
  };

  const renderMonitor = () => {
    if (selFA) {
      const f = fa.find(x => x.id === selFA); if (!f) { setSelFA(null); return null; }
      return (<div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <button onClick={() => setSelFA(null)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 14 }}>{"<- Back"}</button>
          <span style={{ fontSize: 24 }}>{f.icon}</span>
          <div><h2 style={{ margin: 0, fontSize: 20, color: C.text, fontWeight: 700 }}>{f.name}</h2><span style={{ fontSize: 12, color: C.muted }}>Monitoring Setup</span></div>
        </div>
        <div style={{ marginBottom: 28 }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}><span style={{ fontSize: 13, fontWeight: 700, color: C.text, textTransform: "uppercase", letterSpacing: 1 }}>Problem Search Terms</span><span style={{ fontSize: 12, color: C.muted }}>{f.brandKeywords.length} terms</span></div><TagInput tags={f.brandKeywords} setTags={t => updateFA(f.id, { brandKeywords: t })} placeholder="Problem search term..." color={C.accent} /></div>
        <div style={{ marginBottom: 28 }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}><span style={{ fontSize: 13, fontWeight: 700, color: C.text, textTransform: "uppercase", letterSpacing: 1 }}>Competitors</span><span style={{ fontSize: 12, color: C.muted }}>{f.competitors.length} tracked</span></div><TagInput tags={f.competitors} setTags={t => updateFA(f.id, { competitors: t })} placeholder="Competitor..." color={C.orange} /></div>
        <div style={{ marginBottom: 28 }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}><span style={{ fontSize: 13, fontWeight: 700, color: C.text, textTransform: "uppercase", letterSpacing: 1 }}>Subreddits</span><span style={{ fontSize: 12, color: C.muted }}>{f.subreddits.length} active</span></div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            {f.subreddits.map((s: any) => (
              <Badge key={s.name} color={C.blue} onRemove={() => updateFA(f.id, { subreddits: f.subreddits.filter((x: any) => x.name !== s.name) })}>
                {s.name} <span style={{ fontSize: 11, color: C.muted }}>{s.members}</span>
              </Badge>
            ))}
          </div>
          <SubAdd onAdd={(n, m) => { if (!f.subreddits.find((s: any) => s.name.toLowerCase() === n.toLowerCase())) updateFA(f.id, { subreddits: [...f.subreddits, { name: n, members: m }] }); }} />
        </div>
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text, textTransform: "uppercase", letterSpacing: 1 }}>Intent Filter</span>
            <span style={{ fontSize: 12, color: C.muted }}>AI-powered</span>
          </div>
          <textarea
            value={f.intentDescription || ""}
            onChange={e => updateFA(f.id, { intentDescription: e.target.value })}
            placeholder="Describe who you want to capture. e.g. Someone struggling to track salary, EMIs, or household expenses and looking for a simpler budgeting method"
            rows={3}
            style={{ width: "100%", padding: "10px 14px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 13, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit", lineHeight: 1.5 }}
          />
        </div>
        <div style={{ marginBottom: 28 }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}><span style={{ fontSize: 13, fontWeight: 700, color: C.text, textTransform: "uppercase", letterSpacing: 1 }}>Intent Patterns</span><span style={{ fontSize: 12, color: C.muted }}>{f.intentPatterns.length} patterns</span></div><TagInput tags={f.intentPatterns} setTags={t => updateFA(f.id, { intentPatterns: t })} placeholder='Pattern e.g. "best"...' color={C.purple} /></div>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Test a Post</div>
          <textarea
            value={testPostText}
            onChange={e => setTestPostText(e.target.value)}
            placeholder="Paste Reddit post title and body here to test against your intent filter..."
            rows={4}
            style={{ width: "100%", padding: "10px 14px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 13, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit", lineHeight: 1.5, marginBottom: 10 }}
          />
          <button
            onClick={async () => {
              if (!testPostText.trim() || !f.intentDescription?.trim()) return;
              setTestLoading(true);
              setTestResult(null);
              const result = await filterByIntent(
                { title: testPostText, body: "", sub: "test" },
                f.intentDescription,
                { allowPassThroughOnError: false },
              );
              setTestResult(result);
              setTestLoading(false);
            }}
            disabled={!testPostText.trim() || !f.intentDescription?.trim() || testLoading}
            style={{ background: testLoading || !testPostText.trim() || !f.intentDescription?.trim() ? C.border : C.accent, color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", cursor: testLoading || !testPostText.trim() || !f.intentDescription?.trim() ? "not-allowed" : "pointer", fontWeight: 600, fontSize: 13, marginBottom: 12 }}
          >
            {testLoading ? "Checking..." : "Test Intent Filter"}
          </button>
          {testResult && (
            <div style={{ padding: "12px 16px", borderRadius: 8, background: testResult.status === "error" ? `${C.orange}15` : testResult.pass ? `${C.green}15` : `${C.danger}15`, border: `1px solid ${testResult.status === "error" ? C.orange : testResult.pass ? C.green : C.danger}` }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: testResult.status === "error" ? C.orange : testResult.pass ? C.green : C.danger, marginBottom: 4 }}>
                {testResult.status === "error" ? "Couldn't test filter" : testResult.pass ? "Match - goes to Leads" : "No match - filtered out"}
              </div>
              <div style={{ fontSize: 13, color: C.muted }}>{testResult.reason}</div>
              {!!testResult.matchedIntent && (
                <div style={{ marginTop: 10, fontSize: 12, color: C.text }}>
                  <span style={{ fontWeight: 700 }}>Matched intent:</span> {testResult.matchedIntent}
                </div>
              )}
              {!!testResult.matchedKeywords?.length && (
                <div style={{ marginTop: 8, fontSize: 12, color: C.text }}>
                  <span style={{ fontWeight: 700 }}>Matched keywords:</span> {testResult.matchedKeywords.join(", ")}
                </div>
              )}
            </div>
          )}
        </div>
      </div>);
    }
    return (<div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}><div><h2 style={{ margin: 0, fontSize: 22, color: C.text, fontWeight: 700 }}>Monitor</h2><p style={{ margin: "4px 0 0", fontSize: 13, color: C.muted }}>Setup focus areas with keywords, competitors & subreddits</p></div><button onClick={() => setShowNewFA(true)} style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", cursor: "pointer", fontWeight: 600, fontSize: 14 }}>+ New</button></div>
      {showNewFA && <div style={{ background: C.card, borderRadius: 12, padding: 20, marginBottom: 20, border: `1px solid ${C.border}` }}><input value={newFAName} onChange={e => setNewFAName(e.target.value)} placeholder="Focus area name..." onKeyDown={e => { if (e.key === "Enter" && newFAName.trim()) { setFa(p => [...p, { id: `fa_${Date.now()}`, name: newFAName.trim(), icon: "*", brandKeywords: [], competitors: [], subreddits: [], intentDescription: "", intentPatterns: ["best", "vs", "alternative", "review"] }]); setNewFAName(""); setShowNewFA(false); } }} style={{ width: "100%", padding: "10px 14px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 14, marginBottom: 12, boxSizing: "border-box" }} /><div style={{ display: "flex", gap: 8 }}><button onClick={() => { if (newFAName.trim()) { setFa(p => [...p, { id: `fa_${Date.now()}`, name: newFAName.trim(), icon: "*", brandKeywords: [], competitors: [], subreddits: [], intentDescription: "", intentPatterns: ["best", "vs", "alternative", "review"] }]); setNewFAName(""); setShowNewFA(false); } }} style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", cursor: "pointer", fontWeight: 600 }}>Create</button><button onClick={() => { setShowNewFA(false); setNewFAName(""); }} style={{ background: "transparent", color: C.muted, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 20px", cursor: "pointer" }}>Cancel</button></div></div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>{fa.map(f => <div key={f.id} onClick={() => setSelFA(f.id)} style={{ background: C.card, borderRadius: 12, padding: 20, cursor: "pointer", border: `1px solid ${C.border}`, borderLeft: `4px solid ${C.accent}`, transition: "transform 0.15s", position: "relative" }} onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-2px)")} onMouseLeave={e => (e.currentTarget.style.transform = "none")}><button onClick={e => { e.stopPropagation(); setFa(p => p.filter(x => x.id !== f.id)); }} style={{ position: "absolute", top: 10, right: 12, background: "none", border: "none", color: C.muted, cursor: "pointer", opacity: 0.3 }} onMouseEnter={e => (e.currentTarget.style.opacity = "1")} onMouseLeave={e => (e.currentTarget.style.opacity = "0.3")}>x</button><div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}><span style={{ fontSize: 24 }}>{f.icon}</span><h3 style={{ margin: 0, fontSize: 18, color: C.text, fontWeight: 700 }}>{f.name}</h3></div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}><div style={{ color: C.muted }}><span style={{ color: C.accent, fontWeight: 700 }}>{f.brandKeywords.length}</span> problem terms</div><div style={{ color: C.muted }}><span style={{ color: C.orange, fontWeight: 700 }}>{f.competitors.length}</span> competitors</div><div style={{ color: C.muted }}><span style={{ color: C.blue, fontWeight: 700 }}>{f.subreddits.length}</span> subreddits</div><div style={{ color: C.muted }}><span style={{ color: C.purple, fontWeight: 700 }}>{f.intentPatterns.length}</span> patterns</div></div></div>)}</div>
      {fa.length === 0 && !showNewFA && <div style={{ textAlign: "center", padding: 60, color: C.muted }}>No focus areas</div>}
    </div>);
  };

  const renderLeads = () => {
    if (activeThread) return renderWorkspace();
    const fl = threadFilter === "all" ? visibleThreads : visibleThreads.filter(t => t.status === threadFilter);
    return (<div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div><h2 style={{ margin: 0, fontSize: 22, color: C.text, fontWeight: 700 }}>Leads</h2><p style={{ margin: "4px 0 0", fontSize: 13, color: C.muted }}>High-intent threads from Monitor</p></div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, color: searchAll ? C.accent : C.muted, background: searchAll ? C.accentBg : "transparent", border: `1px solid ${searchAll ? C.accent : C.border}`, borderRadius: 8, padding: "7px 12px", userSelect: "none" }}>
            <input type="checkbox" checked={searchAll} onChange={e => setSearchAll(e.target.checked)} style={{ accentColor: C.accent }} />
            All Reddit
          </label>
          <button onClick={() => { setThreads([]); setScanError(null); }} style={{ background: "transparent", color: C.muted, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 14px", cursor: "pointer", fontSize: 12 }}> Clear</button>
          <button onClick={() => fetchFromReddit(fa, toolTerms, searchAll)} disabled={refreshing} style={{ background: refreshing ? C.border : C.accentBg, color: C.accent, border: `1px solid ${C.accent}40`, borderRadius: 8, padding: "9px 18px", cursor: refreshing ? "not-allowed" : "pointer", fontWeight: 600, fontSize: 13, opacity: refreshing ? 0.7 : 1 }}>{refreshing ? "Fetching..." : "Refresh"}</button>
        </div>
      </div>
      {scanError && <div style={{ marginBottom: 16, padding: "12px 16px", background: `${C.danger}15`, border: `1px solid ${C.danger}40`, borderRadius: 10, fontSize: 13, color: C.danger }}>{scanError}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: 6 }}>{["all", "new", "posted"].map(f => <button key={f} onClick={() => setThreadFilter(f)} style={{ background: threadFilter === f ? C.accentBg : "transparent", color: threadFilter === f ? C.accent : C.muted, border: `1px solid ${threadFilter === f ? C.accent : C.border}`, borderRadius: 8, padding: "7px 16px", cursor: "pointer", fontSize: 13, fontWeight: 500, textTransform: "capitalize" }}>{f} ({visibleThreads.filter(t => f === "all" || t.status === f).length})</button>)}</div>
      </div>
      {fl.length === 0 && !refreshing && <div style={{ textAlign: "center", padding: 60, color: C.muted }}>No leads yet - click Refresh to scan Reddit</div>}
      {fl.map(t => <div key={t.id} onClick={() => { const defaultTarget: "comment" | "post" = t.replyTo ? "comment" : "post"; setReplyTarget(defaultTarget); setActiveThread(t); setDraftText(t.reply || genReplyFallback(t, ec.tone, ec.length, defaultTarget)); }} style={{ background: C.card, borderRadius: 10, padding: "16px 18px", marginBottom: 8, border: `1px solid ${C.border}`, cursor: "pointer", transition: "border-color 0.15s" }} onMouseEnter={e => (e.currentTarget.style.borderColor = C.accent)} onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}><Badge color={C.blue}>{t.sub}</Badge><Badge color={t.intent === "High" ? C.green : C.warn}>{t.intent}</Badge><Badge color={C.purple}>{t.matchedPattern}</Badge>{t.status === "posted" && <Badge color={C.green}> Posted</Badge>}<span style={{ fontSize: 11, color: C.muted }}>{t.time}</span></div>
            {!!t.focusAreaName && <div style={{ fontSize: 12, color: C.accent, marginBottom: 6 }}>From Monitor setup: {t.focusAreaName}</div>}
            <div style={{ fontSize: 14, color: C.text, fontWeight: 600, lineHeight: 1.4, marginBottom: 4 }}>{t.title}</div>
            <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{t.body}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
            {getThreadStatsText(t) && <div style={{ fontSize: 12, color: C.muted }}>{getThreadStatsText(t)}</div>}
            <span style={{ fontSize: 11, color: C.muted }}>{t.author}</span>
            {t.performance && <div style={{ fontSize: 11, color: C.green }}>{t.performance.upvotes} upvotes | {t.performance.views.toLocaleString()} views</div>}
          </div>
        </div>
      </div>)}
    </div>);
  };

  const renderWorkspace = () => {
    const t = activeThread; const isP = t.status === "posted";
    const copyR = () => { navigator.clipboard.writeText(draftText).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {}); };
    const markP = () => { const perf = { upvotes: 0, replies: 0, views: 0 }; setThreads(p => p.map(x => x.id === t.id ? { ...x, reply: draftText, status: "posted", performance: perf } : x)); setActiveThread({ ...t, reply: draftText, status: "posted", performance: perf }); };
    const openReddit = () => { if (t.url) window.open(t.url, "_blank", "noopener,noreferrer"); };
    const threadStatsText = getThreadStatsText(t);
    const replyToStatsText = getThreadStatsText(t, "upvotes");
    const regen = async (tone?: string, len?: string) => {
      const useTone = tone || ec.tone; const useLen = len || ec.length;
      setAiLoading(true);
      const si = intel.find(s => s.sub === t.sub);
      const aiResult = await genReplyAI({ ...t, _replyTarget: replyTarget }, useTone, useLen, ec.bv, si);
      setDraftText(aiResult || genReplyFallback(t, useTone, useLen, replyTarget));
      setAiLoading(false);
    };
    const switchReplyTarget = (nextTarget: "comment" | "post") => {
      setReplyTarget(nextTarget);
      if (!isP) {
        setDraftText(t.reply || genReplyFallback(t, ec.tone, ec.length, nextTarget));
      }
    };
    const vld = validate(draftText, t.sub);
    return (<div>
      <div style={{ background: C.card, borderRadius: 12, padding: "14px 20px", marginBottom: 16, border: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
          <button onClick={() => setActiveThread(null)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 14, flexShrink: 0 }}>{"<-"}</button>
          <div style={{ minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.title}</div><div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}><Badge color={C.blue}>{t.sub}</Badge>{t.focusAreaName && <Badge color={C.accent}>Monitor: {t.focusAreaName}</Badge>}<span style={{ fontSize: 11, color: C.muted }}>{[t.author, threadStatsText, t.time].filter(Boolean).join(" | ")}</span></div></div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>{isP ? <Badge color={C.green}> Posted</Badge> : <Badge color={C.warn}>Draft</Badge>}<button onClick={openReddit} disabled={!t.url} style={{ background: "transparent", color: t.url ? C.accent : C.muted, border: `1px solid ${t.url ? C.accent : C.border}`, borderRadius: 8, padding: "6px 14px", cursor: t.url ? "pointer" : "not-allowed", fontSize: 12, opacity: t.url ? 1 : 0.6 }}> View on Reddit</button></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "5fr 7fr", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div><div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Replying To</div>
            {t.replyTo && <div style={{ display: "flex", gap: 4, marginBottom: 10, background: C.bg, borderRadius: 8, padding: 3 }}>
              <button onClick={() => switchReplyTarget("post")} style={{ flex: 1, padding: "7px 0", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: replyTarget === "post" ? C.accent : "transparent", color: replyTarget === "post" ? "#fff" : C.muted }}>Original Post</button>
              <button onClick={() => switchReplyTarget("comment")} style={{ flex: 1, padding: "7px 0", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: replyTarget === "comment" ? C.accent : "transparent", color: replyTarget === "comment" ? "#fff" : C.muted }}>Comment</button>
            </div>}
            <div style={{ background: C.card, borderRadius: 10, padding: 16, border: `1px solid ${replyTarget === "comment" && t.replyTo ? C.accent : C.border}`, borderLeft: `3px solid ${C.accent}` }}>
              {replyTarget === "comment" && t.replyTo ? (<><p style={{ margin: "0 0 8px", fontSize: 14, color: C.text, lineHeight: 1.6, fontStyle: "italic" }}>"{t.replyTo.text}"</p><div style={{ fontSize: 12, color: C.muted }}> {t.replyTo.upvotes} upvotes | {t.replyTo.author}</div></>) : (<><p style={{ margin: "0 0 8px", fontSize: 14, color: C.text, lineHeight: 1.6 }}>Replying directly to original post by {t.author}</p><div style={{ fontSize: 12, color: C.muted }}>{replyToStatsText || "Live Reddit stats unavailable"}</div></>)}
            </div>
          </div>
          <div><div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Original Thread</div>
            <div style={{ background: C.card, borderRadius: 10, padding: 16, border: `1px solid ${C.border}` }}><h3 style={{ margin: "0 0 10px", fontSize: 15, color: C.text, fontWeight: 700, lineHeight: 1.4 }}>{t.title}</h3><p style={{ margin: 0, fontSize: 13, color: C.muted, lineHeight: 1.7 }}>{t.body}</p></div>
          </div>
          {isP && t.performance && <div><div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Performance (48h)</div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>{[{ icon: "UP", l: "upvotes", v: t.performance.upvotes }, { icon: "RP", l: "replies", v: t.performance.replies }, { icon: "VW", l: "views", v: t.performance.views.toLocaleString() }].map(m => <div key={m.l} style={{ background: C.card, borderRadius: 10, padding: "12px 8px", border: `1px solid ${C.border}`, textAlign: "center" }}><div style={{ fontSize: 16 }}>{m.icon}</div><div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>{m.v}</div><div style={{ fontSize: 10, color: C.muted }}>{m.l}</div></div>)}</div></div>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Our Reply</div>
            <div style={{ background: C.card, borderRadius: 10, padding: 16, border: `1px solid ${isP ? C.green + "50" : C.border}`, flex: 1, display: "flex", flexDirection: "column" }}>
              {isP ? <div style={{ fontSize: 14, color: C.text, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{t.reply}</div> : <>
                {aiLoading ? (<div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 180, gap: 12 }}><div style={{ width: 32, height: 32, border: `3px solid ${C.border}`, borderTopColor: C.purple, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /><style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style><div style={{ fontSize: 13, color: C.purple, fontWeight: 600 }}> AI generating reply...</div><div style={{ fontSize: 11, color: C.muted }}>Reading thread + subreddit intelligence + brand voice</div></div>
                ) : (<textarea value={draftText} onChange={e => setDraftText(e.target.value)} style={{ width: "100%", padding: 0, background: "transparent", border: "none", color: C.text, fontSize: 14, lineHeight: 1.7, minHeight: 180, flex: 1, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit", outline: "none" }} />)}
                <div style={{ display: "flex", gap: 8, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}`, flexWrap: "wrap", alignItems: "center" }}>
                  <button onClick={copyR} disabled={aiLoading} style={{ background: copied ? C.green : C.accent, color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", cursor: "pointer", fontWeight: 600, fontSize: 13, opacity: aiLoading ? 0.5 : 1 }}>{copied ? " Copied!" : " Copy Reply"}</button>
                  <button onClick={() => regen()} disabled={aiLoading} style={{ background: "transparent", color: C.purple, border: `1px solid ${C.purple}`, borderRadius: 8, padding: "9px 16px", cursor: "pointer", fontWeight: 600, fontSize: 12, opacity: aiLoading ? 0.5 : 1 }}>{aiLoading ? "Generating..." : " AI Generate"}</button>
                  <button onClick={markP} disabled={aiLoading} style={{ background: "transparent", color: C.green, border: `1px solid ${C.green}50`, borderRadius: 8, padding: "9px 16px", cursor: "pointer", fontSize: 12, opacity: aiLoading ? 0.5 : 1 }}> Mark Posted</button>
                  <span style={{ marginLeft: "auto", fontSize: 11, color: C.muted }}>{draftText.split(/\s+/).filter(Boolean).length} words</span>
                </div>
              </>}
            </div>
          </div>
          {!isP && <div style={{ background: C.card, borderRadius: 10, padding: 16, border: `1px solid ${C.purple}20` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}><span style={{ fontSize: 10, fontWeight: 700, color: C.purple, textTransform: "uppercase", letterSpacing: 1 }}>Response Config</span><span style={{ fontSize: 11, color: C.muted }}>{ec.tone}  {ec.length}</span></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div><label style={{ fontSize: 11, color: C.muted, fontWeight: 600, display: "block", marginBottom: 6 }}>Tone</label><div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{TONES.map(tn => <button key={tn.id} onClick={() => setEc(p => ({ ...p, tone: tn.id }))} style={{ background: ec.tone === tn.id ? `${C.purple}20` : "transparent", color: ec.tone === tn.id ? C.purple : C.muted, border: `1px solid ${ec.tone === tn.id ? C.purple : C.border}`, borderRadius: 6, padding: "4px 9px", cursor: "pointer", fontSize: 11 }}>{tn.label}</button>)}</div></div>
              <div><label style={{ fontSize: 11, color: C.muted, fontWeight: 600, display: "block", marginBottom: 6 }}>Length</label><div style={{ display: "flex", gap: 4 }}>{["short", "medium", "long"].map(l => <button key={l} onClick={() => setEc(p => ({ ...p, length: l }))} style={{ background: ec.length === l ? `${C.purple}20` : "transparent", color: ec.length === l ? C.purple : C.muted, border: `1px solid ${ec.length === l ? C.purple : C.border}`, borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontSize: 11, textTransform: "capitalize" }}>{l}</button>)}</div></div>
            </div>
            <div style={{ marginTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <label style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>Brand Voice & Context</label>
                <span style={{ fontSize: 10, color: C.purple, cursor: "pointer" }} onClick={() => { if (!ec.bv) setEc(p => ({ ...p, bv: "I am responding from my company account (Kedil). Do NOT write as if I switched from another product  that looks fake from a brand account. Instead, acknowledge the user's problem and explain how Kedil solves it from the builder's perspective. Be genuine, helpful, and transparent about being the maker." })); }}> Load default</span>
              </div>
              <textarea value={ec.bv} onChange={e => setEc(p => ({ ...p, bv: e.target.value }))} placeholder={"Add context that shapes every AI reply.\n I'm responding from my company account\n Always mention UPI & Indian bank support\n Never be pushy or salesy"} style={{ width: "100%", padding: "8px 12px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 12, minHeight: 64, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }} />
            </div>
          </div>}
          {vld && <div style={{ background: C.card, borderRadius: 10, padding: 16, border: `1px solid ${vld.overall >= 75 ? C.green : vld.overall >= 50 ? C.warn : C.danger}30` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 16 }}></span><span style={{ fontSize: 10, fontWeight: 700, color: C.purple, textTransform: "uppercase", letterSpacing: 1 }}>Intelligence Check</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 11, color: C.muted }}>{vld.subName}</span><div style={{ background: `${vld.overall >= 75 ? C.green : vld.overall >= 50 ? C.warn : C.danger}20`, borderRadius: 8, padding: "4px 10px" }}><span style={{ fontSize: 16, fontWeight: 800, color: vld.overall >= 75 ? C.green : vld.overall >= 50 ? C.warn : C.danger }}>{vld.overall}</span><span style={{ fontSize: 10, color: C.muted }}>/100</span></div></div>
            </div>
            {vld.checks.map((ck: any, i: number) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, padding: "6px 0", borderBottom: i < vld.checks.length - 1 ? `1px solid ${C.border}50` : "none" }}><span style={{ fontSize: 14, flexShrink: 0 }}>{ck.pass ? "" : ""}</span><div style={{ flex: 1 }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}><span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{ck.label}</span><span style={{ fontSize: 11, fontWeight: 700, color: ck.score >= 70 ? C.green : ck.score >= 40 ? C.warn : C.danger }}>{ck.score}%</span></div><div style={{ fontSize: 11, color: ck.pass ? C.muted : C.warn }}>{ck.detail}</div></div></div>)}
            <div style={{ marginTop: 8, padding: "8px 10px", background: `${vld.overall >= 75 ? C.green : C.warn}10`, borderRadius: 6, fontSize: 11, color: vld.overall >= 75 ? C.green : C.warn }}>{vld.overall >= 75 ? ` Approved by Intelligence  matches ${vld.subName} patterns` : " Adjust reply to improve score"}</div>
          </div>}
          {!vld && !isP && <div style={{ background: C.card, borderRadius: 10, padding: 14, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}><span style={{ fontSize: 16 }}></span><div><div style={{ fontSize: 12, color: C.muted }}>Intelligence unavailable for {t.sub}</div><div style={{ fontSize: 11, color: C.muted }}>Add it in <span style={{ color: C.accent, cursor: "pointer" }} onClick={() => { setActiveThread(null); setPage("settings"); }}>{"Settings -> Intelligence"}</span></div></div></div>}
        </div>
      </div>
    </div>);
  };

  const renderMeasure = () => {
    const addM = () => { if (newMetric.trim()) { setMetrics(p => [...p, { id: `m_${Date.now()}`, name: newMetric.trim(), value: "0", change: "New", trend: "up", icon: "*", data: [0,0,0,0,0,0,0,0,0,0,0,0] }]); setNewMetric(""); } };
    return (<div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}><span style={{ fontSize: 28 }}></span><div><h2 style={{ margin: 0, fontSize: 22, color: C.text, fontWeight: 700 }}>Measure</h2><p style={{ margin: 0, fontSize: 13, color: C.muted }}>Track business impact</p></div></div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "16px 0", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 6 }}>{["7d", "30d", "90d"].map(p => <button key={p} onClick={() => setMeasurePeriod(p)} style={{ background: measurePeriod === p ? C.accentBg : "transparent", color: measurePeriod === p ? C.accent : C.muted, border: `1px solid ${measurePeriod === p ? C.accent : C.border}`, borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 13 }}>{p}</button>)}</div>
        <div style={{ display: "flex", gap: 8 }}><input value={newMetric} onChange={e => setNewMetric(e.target.value)} onKeyDown={e => e.key === "Enter" && addM()} placeholder="New metric..." style={{ padding: "8px 14px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 13, width: 160 }} /><button onClick={addM} style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>+ Add</button></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12, marginBottom: 24 }}>{metrics.map(m => <div key={m.id} style={{ background: C.card, borderRadius: 12, padding: 18, border: `1px solid ${C.border}`, position: "relative" }}><button onClick={() => setMetrics(p => p.filter(x => x.id !== m.id))} style={{ position: "absolute", top: 8, right: 10, background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 12, opacity: 0.3 }} onMouseEnter={e => (e.currentTarget.style.opacity = "1")} onMouseLeave={e => (e.currentTarget.style.opacity = "0.3")}>x</button><div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}><span style={{ fontSize: 18 }}>{m.icon}</span><span style={{ fontSize: 13, color: C.muted, fontWeight: 600 }}>{m.name}</span></div><div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}><div><div style={{ fontSize: 26, fontWeight: 800, color: C.text, lineHeight: 1 }}>{m.value}</div><span style={{ fontSize: 13, fontWeight: 600, color: m.trend === "up" ? C.green : C.danger }}>{m.change}</span></div><Spark data={m.data} color={m.trend === "up" ? C.green : C.danger} w={80} h={28} /></div></div>)}</div>
      <div style={{ background: C.card, borderRadius: 12, padding: 20, border: `1px solid ${C.border}` }}><h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: C.text }}>Pipeline</h3><div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>{[{ l: "Monitored", v: visibleThreads.length, c: C.accent, i: "M" }, { l: "Drafted", v: visibleThreads.filter(t => t.reply).length, c: C.purple, i: "D" }, { l: "Published", v: visibleThreads.filter(t => t.status === "posted").length, c: C.green, i: "P" }].map((s, i) => <div key={s.l} style={{ display: "flex", alignItems: "center" }}><div style={{ textAlign: "center", padding: "12px 28px" }}><div style={{ fontSize: 22, marginBottom: 4 }}>{s.i}</div><div style={{ fontSize: 28, fontWeight: 800, color: s.c }}>{s.v}</div><div style={{ fontSize: 12, color: C.muted }}>{s.l}</div></div>{i < 2 && <div style={{ fontSize: 20, color: C.border }}></div>}</div>)}</div></div>
    </div>);
  };

  const renderSaved = () => (<div><h2 style={{ margin: "0 0 20px", fontSize: 22, color: C.text, fontWeight: 700 }}>Saved ({bm.length})</h2>{bm.length === 0 ? <div style={{ textAlign: "center", padding: 60, color: C.muted }}>No saved items</div> : bm.map(b => <div key={b.id || b.title} style={{ background: C.card, borderRadius: 10, padding: "14px 18px", marginBottom: 8, border: `1px solid ${C.border}` }}><div style={{ fontSize: 14, color: C.text, fontWeight: 600, marginBottom: 4 }}>{b.title}</div><div style={{ fontSize: 12, color: C.muted }}>{b.sub} | {b.time}</div></div>)}</div>);

  const renderSettings = () => {
    if (selIntel) {
      const si = intel.find(s => s.id === selIntel);
      if (!si) { setSelIntel(null); return null; }
      const ScoreBar = ({ score, color = C.accent }: { score: number; color?: string }) => (<div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}><div style={{ flex: 1, height: 5, borderRadius: 3, background: C.border }}><div style={{ width: `${score}%`, height: "100%", borderRadius: 3, background: color }} /></div><span style={{ fontSize: 11, fontWeight: 700, color, minWidth: 28, textAlign: "right" }}>{score}%</span></div>);
      return (<div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}><button onClick={() => setSelIntel(null)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 14 }}>{"<- Settings"}</button><span style={{ fontSize: 20 }}></span><div><h2 style={{ margin: 0, fontSize: 20, color: C.text, fontWeight: 700 }}>{si.sub}</h2><span style={{ fontSize: 12, color: C.muted }}>{si.members} | Scanned {si.lastScanned} | Confidence: <span style={{ color: si.confidence >= 80 ? C.green : C.warn, fontWeight: 700 }}>{si.confidence}%</span></span></div></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div style={{ background: C.card, borderRadius: 10, padding: 16, border: `1px solid ${C.border}` }}><div style={{ fontSize: 11, fontWeight: 700, color: C.danger, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}> Rules</div>{si.rules.map((r: string, i: number) => <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}><span style={{ fontSize: 11, color: C.danger }}></span><span style={{ fontSize: 13, color: C.text, lineHeight: 1.4 }}>{r}</span></div>)}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: C.card, borderRadius: 10, padding: 16, border: `1px solid ${C.border}` }}><div style={{ fontSize: 11, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Tone</div><div style={{ marginBottom: 6 }}><span style={{ fontSize: 11, color: C.muted }}>Preferred: </span><span style={{ fontSize: 13, color: C.green, fontWeight: 600 }}>{si.toneProfile.preferred}</span></div><div><span style={{ fontSize: 11, color: C.muted }}>Avoid: </span><span style={{ fontSize: 13, color: C.danger, fontWeight: 600 }}>{si.toneProfile.avoid}</span></div></div>
            <div style={{ background: C.card, borderRadius: 10, padding: 16, border: `1px solid ${C.border}` }}><div style={{ fontSize: 11, fontWeight: 700, color: C.blue, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Timing</div><div style={{ marginBottom: 6 }}><span style={{ fontSize: 11, color: C.muted }}>Peak: </span><span style={{ fontSize: 13, color: C.green }}>{si.bestTimes.peak}</span></div><div><span style={{ fontSize: 11, color: C.muted }}>Avoid: </span><span style={{ fontSize: 13, color: C.danger }}>{si.bestTimes.avoid}</span></div></div>
          </div>
          <div style={{ background: C.card, borderRadius: 10, padding: 16, border: `1px solid ${C.border}` }}><div style={{ fontSize: 11, fontWeight: 700, color: C.green, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}> What Works</div>{si.whatWorks.map((w: any, i: number) => <div key={i} style={{ marginBottom: 10 }}><div style={{ fontSize: 13, color: C.text, lineHeight: 1.4, marginBottom: 4 }}>{w.insight}</div><ScoreBar score={w.score} color={C.green} /></div>)}</div>
          <div style={{ background: C.card, borderRadius: 10, padding: 16, border: `1px solid ${C.border}` }}><div style={{ fontSize: 11, fontWeight: 700, color: C.danger, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}> What Fails</div>{si.whatFails.map((w: any, i: number) => <div key={i} style={{ marginBottom: 10 }}><div style={{ fontSize: 13, color: C.text, lineHeight: 1.4, marginBottom: 4 }}>{w.insight}</div><ScoreBar score={w.score} color={C.danger} /></div>)}</div>
          <div style={{ background: C.card, borderRadius: 10, padding: 16, border: `1px solid ${C.border}` }}><div style={{ fontSize: 11, fontWeight: 700, color: C.purple, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}> Top Formats</div>{si.topFormats.map((f: any, i: number) => <div key={i} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: i < si.topFormats.length - 1 ? `1px solid ${C.border}` : "none" }}><div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{f.format}</span><span style={{ fontSize: 12, color: C.accent, fontWeight: 700 }}>avg {f.avgScore}</span></div></div>)}</div>
          <div style={{ background: C.card, borderRadius: 10, padding: 16, border: `1px solid ${C.border}` }}><div style={{ fontSize: 11, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Keywords</div><div style={{ marginBottom: 10 }}><div style={{ fontSize: 11, color: C.muted, marginBottom: 6, fontWeight: 600 }}>Use these</div><div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>{si.keywords.positive.map((k: string) => <Badge key={k} color={C.green}>{k}</Badge>)}</div></div><div><div style={{ fontSize: 11, color: C.muted, marginBottom: 6, fontWeight: 600 }}>Avoid these</div><div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>{si.keywords.negative.map((k: string) => <Badge key={k} color={C.danger}>{k}</Badge>)}</div></div></div>
        </div>
        <div style={{ background: C.card, borderRadius: 10, padding: 16, border: `1px solid ${C.border}`, marginTop: 14 }}><div style={{ fontSize: 11, fontWeight: 700, color: C.purple, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}> Learning Log</div>{si.learningLog.map((l: any, i: number) => <div key={i} style={{ display: "flex", gap: 12, marginBottom: 8 }}><span style={{ fontSize: 11, color: C.accent, fontWeight: 700, minWidth: 50 }}>{l.date}</span><span style={{ fontSize: 13, color: C.text, lineHeight: 1.4 }}>{l.entry}</span></div>)}</div>
      </div>);
    }
    return (<div>
      <h2 style={{ margin: "0 0 16px", fontSize: 22, color: C.text, fontWeight: 700 }}>Settings</h2>
      <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>{[{ id: "intelligence", label: "Intelligence Agent" }, { id: "filters", label: "Lead Filters" }, { id: "account", label: "Account" }].map(t => <button key={t.id} onClick={() => setSettingsTab(t.id)} style={{ background: settingsTab === t.id ? C.accentBg : "transparent", color: settingsTab === t.id ? C.accent : C.muted, border: `1px solid ${settingsTab === t.id ? C.accent : C.border}`, borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13, fontWeight: 500 }}>{t.label}</button>)}</div>
      {settingsTab === "account" && <div style={{ background: C.card, borderRadius: 12, padding: 20, border: `1px solid ${C.border}` }}><div style={{ marginBottom: 16 }}><div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>Name</div><div style={{ fontSize: 15, color: C.text, fontWeight: 600 }}>{user.name}</div></div><div style={{ marginBottom: 16 }}><div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>Email</div><div style={{ fontSize: 15, color: C.text }}>{user.email}</div></div><div><div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>Plan</div><Badge color={C.accent}>{user.plan || "Pro"}</Badge></div></div>}

      {settingsTab === "filters" && <div>
        <div style={{ background: `${C.orange}10`, borderRadius: 10, padding: 16, marginBottom: 20, border: `1px solid ${C.orange}25` }}>
          <div style={{ fontSize: 12, color: C.orange, fontWeight: 700, marginBottom: 4 }}> How Lead Filters work</div>
          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>Posts must match an intent pattern <strong style={{ color: C.text }}>and</strong> contain at least one term below to appear as a lead. This filters out general finance posts (savings accounts, investing tips) and keeps only posts about finance tools & apps.</div>
        </div>
        <div style={{ background: C.card, borderRadius: 12, padding: 20, border: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Tool Context Terms</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{toolTerms.length} terms active</div>
            </div>
            <button onClick={() => setToolTerms(DEF_TOOL_TERMS)} style={{ background: "transparent", color: C.muted, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 12 }}> Reset to defaults</button>
          </div>
          <TagInput tags={toolTerms} setTags={setToolTerms} placeholder='Add term e.g. "budget app"...' color={C.orange} />
        </div>
      </div>}

      {settingsTab === "intelligence" && <>
        <div style={{ background: `${C.purple}10`, borderRadius: 10, padding: 16, marginBottom: 16, border: `1px solid ${C.purple}25` }}>
          <div style={{ fontSize: 12, color: C.purple, fontWeight: 700, marginBottom: 8 }}>How Intelligence Agent works</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>{[{ i: "1", l: "Reads rules", d: "Scrapes sidebar" }, { i: "2", l: "Analyzes patterns", d: "What gets upvoted" }, { i: "3", l: "Tracks timing", d: "Best hours" }, { i: "4", l: "Learns daily", d: "Updates on shifts" }].map(s => <div key={s.l} style={{ textAlign: "center" }}><div style={{ fontSize: 20, marginBottom: 4 }}>{s.i}</div><div style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>{s.l}</div><div style={{ fontSize: 11, color: C.muted }}>{s.d}</div></div>)}</div>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input value={newIntelSub} onChange={e => setNewIntelSub(e.target.value)} onKeyDown={e => { if (e.key === "Enter") addIntelSubreddit(newIntelSub); }} placeholder="Add subreddit to learn..." style={{ flex: 1, padding: "10px 14px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 14 }} />
          <button onClick={() => addIntelSubreddit(newIntelSub)} style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", cursor: "pointer", fontWeight: 600 }}>+ Learn</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>{intel.map(si => <div key={si.id} onClick={() => setSelIntel(si.id)} style={{ background: C.card, borderRadius: 12, padding: 18, cursor: "pointer", border: `1px solid ${C.border}`, borderLeft: `4px solid ${si.scanStatus === "failed" ? C.danger : si.scanStatus === "scanning" ? C.accent : si.confidence >= 80 ? C.green : si.confidence >= 50 ? C.warn : C.muted}`, transition: "transform 0.15s", position: "relative" }} onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-2px)")} onMouseLeave={e => (e.currentTarget.style.transform = "none")}>
          <button onClick={e => { e.stopPropagation(); setIntel(p => p.filter(x => x.id !== si.id)); }} style={{ position: "absolute", top: 10, right: 12, background: "none", border: "none", color: C.muted, cursor: "pointer", opacity: 0.3 }} onMouseEnter={e => (e.currentTarget.style.opacity = "1")} onMouseLeave={e => (e.currentTarget.style.opacity = "0.3")}>x</button>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}><div><div style={{ fontSize: 17, fontWeight: 700, color: C.text }}>{si.sub}</div><div style={{ fontSize: 12, color: C.muted }}>{si.members}  {si.lastScanned}</div></div><div style={{ textAlign: "right" }}><div style={{ fontSize: 20, fontWeight: 800, color: si.confidence >= 80 ? C.green : si.confidence >= 50 ? C.warn : C.muted }}>{si.confidence}%</div><div style={{ fontSize: 10, color: C.muted }}>confidence</div></div></div>
          <div style={{ fontSize: 11, marginBottom: 10, color: si.scanStatus === "failed" ? C.danger : si.scanStatus === "scanning" ? C.accent : C.green }}>
            {si.scanStatus === "scanning" ? (si.scanMessage || "Analyzing...") : si.scanStatus === "failed" ? (si.scanMessage || "Analysis failed.") : "Analysis complete"}
            {si.scanStatus === "failed" && <button onClick={e => { e.stopPropagation(); void quickScanIntel(si.id, si.sub); }} style={{ marginLeft: 8, background: "transparent", color: C.danger, border: `1px solid ${C.danger}55`, borderRadius: 6, padding: "2px 8px", cursor: "pointer", fontSize: 10 }}>Retry</button>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}><div style={{ background: C.bg, borderRadius: 6, padding: "6px 8px", textAlign: "center" }}><div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{si.rules.length}</div><div style={{ fontSize: 10, color: C.muted }}>rules</div></div><div style={{ background: C.bg, borderRadius: 6, padding: "6px 8px", textAlign: "center" }}><div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{si.whatWorks.length}</div><div style={{ fontSize: 10, color: C.muted }}>insights</div></div><div style={{ background: C.bg, borderRadius: 6, padding: "6px 8px", textAlign: "center" }}><div style={{ fontSize: 14, fontWeight: 700, color: si.modStrictness >= 75 ? C.danger : C.warn }}>{si.modStrictness}%</div><div style={{ fontSize: 10, color: C.muted }}>strict</div></div></div>
          <div style={{ fontSize: 12, color: C.muted }}>Tone: <span style={{ color: C.green }}>{si.toneProfile.preferred}</span></div>
        </div>)}</div>
      </>}
    </div>);
  };

  if (!dataLoaded) return <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontFamily: "sans-serif" }}>Loading...</div>;

  const navItems = [
    { label: "ENGINES", items: [{ id: "monitor", label: "Monitor", icon: "M" }, { id: "leads", label: "Leads", icon: "L" }, { id: "measure", label: "Measure", icon: "R" }] },
    { label: "OTHER", items: [{ id: "saved", label: "Saved", icon: "S" }, { id: "settings", label: "Settings", icon: "T" }] },
  ];

  const curPage = (() => { switch (page) { case "monitor": return renderMonitor(); case "leads": return renderLeads(); case "measure": return renderMeasure(); case "saved": return renderSaved(); case "settings": return renderSettings(); default: return renderLeads(); } })();

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: C.bg, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", color: C.text }}>
      <div style={{ width: 220, background: C.sb, borderRight: `1px solid ${C.border}`, padding: "20px 0", flexShrink: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "0 20px", marginBottom: 28 }}><div style={{ display: "flex", alignItems: "center", gap: 10 }}><div style={{ width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg, ${C.accent}, #0d9488)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, color: "#fff" }}>S</div><div><div style={{ fontSize: 16, fontWeight: 800, color: C.text, letterSpacing: -0.5 }}>SocialScanner</div><div style={{ fontSize: 9, color: C.muted, letterSpacing: 1.5, textTransform: "uppercase" }}>Monitor | Execute | Measure</div></div></div></div>
        <nav style={{ flex: 1 }}>{navItems.map(sec => <div key={sec.label}><div style={{ padding: "10px 20px 4px", fontSize: 10, color: C.muted, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" }}>{sec.label}</div>{sec.items.map(item => { const active = page === item.id; return <button key={item.id} onClick={() => { setPage(item.id); setActiveThread(null); setSelFA(null); setSelIntel(null); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 20px", background: active ? C.accentBg : "transparent", border: "none", borderLeft: active ? `3px solid ${C.accent}` : "3px solid transparent", color: active ? C.accent : C.muted, cursor: "pointer", fontSize: 14, fontWeight: 500, textAlign: "left" }}><span style={{ fontSize: 15 }}>{item.icon}</span>{item.label}{item.id === "leads" && <span style={{ marginLeft: "auto", fontSize: 10, background: `${C.green}25`, color: C.green, borderRadius: 10, padding: "1px 7px", fontWeight: 700 }}>{threads.filter(t => t.status === "new").length}</span>}{item.id === "monitor" && <span style={{ marginLeft: "auto", fontSize: 10, background: `${C.accent}25`, color: C.accent, borderRadius: 10, padding: "1px 7px", fontWeight: 700 }}>{fa.length}</span>}</button>; })}</div>)}</nav>
        <div style={{ padding: "6px 20px", fontSize: 11, color: saveState === "error" ? C.danger : C.muted }}>{saveState === "saving" ? "Saving..." : saveState === "saved" && lastSaved ? `Saved ${lastSaved}` : saveState === "error" ? "Save issue (local backup active)" : ""}</div>
        {saveError && <div style={{ padding: "0 20px 8px", fontSize: 10, color: C.danger, lineHeight: 1.4 }}>{saveError}</div>}
        <div style={{ padding: "10px 20px", borderTop: `1px solid ${C.border}`, position: "relative" }}>
          <div onClick={() => setShowMenu(!showMenu)} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}><div style={{ width: 28, height: 28, borderRadius: "50%", background: C.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff" }}>{user.name?.[0]?.toUpperCase() || "U"}</div><div><div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{user.name}</div><div style={{ fontSize: 11, color: C.muted }}>Pro</div></div></div>
          {showMenu && <div style={{ position: "absolute", bottom: "100%", left: 12, right: 12, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 8, marginBottom: 4, zIndex: 10 }}><div style={{ padding: "6px 12px", fontSize: 12, color: C.muted, borderBottom: `1px solid ${C.border}`, marginBottom: 4 }}>{user.email}</div><button onClick={onLogout} style={{ display: "block", width: "100%", padding: "8px 12px", background: "none", border: "none", color: C.danger, cursor: "pointer", fontSize: 13, textAlign: "left", borderRadius: 6 }}>Log Out</button></div>}
        </div>
      </div>
      <div style={{ flex: 1, padding: "24px 32px", overflowY: "auto", maxHeight: "100vh" }}>{curPage}</div>
    </div>
  );
}








