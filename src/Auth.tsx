import { useState } from "react";
import { C } from "./constants";

export function Auth({ onLogin }: { onLogin: (u: any) => void }) {
  const [mode, setMode] = useState("login"); const [email, setEmail] = useState(""); const [pw, setPw] = useState(""); const [name, setName] = useState(""); const [err, setErr] = useState(""); const [ld, setLd] = useState(false);
  const inp: React.CSSProperties = { width: "100%", padding: "12px 14px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, fontSize: 14, boxSizing: "border-box", outline: "none" };
  const submit = async () => {
    setErr("");
    if (!email.trim() || !pw.trim()) return setErr("Fill all fields");
    if (mode === "signup" && !name.trim()) return setErr("Enter name");
    setLd(true);
    try {
      const endpoint = mode === "signup" ? "/api/auth/signup" : "/api/auth/login";
      const body: any = { email: email.toLowerCase().trim(), password: pw };
      if (mode === "signup") body.name = name.trim();
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || "Failed"); setLd(false); return; }
      onLogin(data);
    } catch (e: any) { setErr(e.message || "Network error"); }
    setLd(false);
  };
  return (<div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}><div style={{ width: "100%", maxWidth: 420, padding: 20 }}>
    <div style={{ textAlign: "center", marginBottom: 36 }}><div style={{ display: "inline-flex", alignItems: "center", gap: 12, marginBottom: 8 }}><div style={{ width: 44, height: 44, borderRadius: 12, background: `linear-gradient(135deg, ${C.accent}, #0d9488)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800, color: "#fff" }}>S</div><span style={{ fontSize: 28, fontWeight: 800, color: C.text, letterSpacing: -1 }}>SocialScanner</span></div><div style={{ fontSize: 14, color: C.muted }}>Monitor · Execute · Measure</div></div>
    <div style={{ background: C.card, borderRadius: 16, padding: 32, border: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", marginBottom: 24, background: C.bg, borderRadius: 10, padding: 4 }}>{["login", "signup"].map(m => <button key={m} onClick={() => { setMode(m); setErr(""); }} style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600, background: mode === m ? C.accent : "transparent", color: mode === m ? "#fff" : C.muted }}>{m === "login" ? "Log In" : "Sign Up"}</button>)}</div>
      {mode === "signup" && <div style={{ marginBottom: 16 }}><label style={{ display: "block", fontSize: 11, color: C.muted, marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>Name</label><input value={name} onChange={e => setName(e.target.value)} placeholder="Name" style={inp} /></div>}
      <div style={{ marginBottom: 16 }}><label style={{ display: "block", fontSize: 11, color: C.muted, marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>Email</label><input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="you@example.com" style={inp} /></div>
      <div style={{ marginBottom: 20 }}><label style={{ display: "block", fontSize: 11, color: C.muted, marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>Password</label><input value={pw} onChange={e => setPw(e.target.value)} type="password" placeholder="••••••" onKeyDown={e => e.key === "Enter" && submit()} style={inp} /></div>
      {err && <div style={{ fontSize: 13, color: C.danger, marginBottom: 14, padding: "8px 12px", background: `${C.danger}15`, borderRadius: 8 }}>{err}</div>}
      <button onClick={submit} disabled={ld} style={{ width: "100%", padding: "13px", background: C.accent, color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 15 }}>{ld ? "..." : mode === "login" ? "Log In" : "Create Account"}</button>
      <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border}`, textAlign: "center" }}><button onClick={() => onLogin({ email: "demo@google.com", name: "Mani", plan: "Pro" })} style={{ padding: "10px 24px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, cursor: "pointer", fontSize: 14 }}>Google Sign In</button></div>
    </div>
  </div></div>);
}
