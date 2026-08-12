import { useState, useEffect } from "react";
import { Auth } from "./Auth";
import { Dashboard } from "./Dashboard";

export default function App() {
  const [user, setUser] = useState<any>(null); const [chk, setChk] = useState(true);
  useEffect(() => { try { const s = localStorage.getItem("ss_session"); if (s) { const u = JSON.parse(s); if (u?.email) setUser(u); } } catch {} setChk(false); }, []);
  const login = (u: any) => { setUser(u); localStorage.setItem("ss_session", JSON.stringify(u)); };
  const logout = () => { setUser(null); localStorage.removeItem("ss_session"); };
  if (chk) return <div style={{ minHeight: "100vh", background: "#0f1117", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontFamily: "sans-serif" }}>Loading...</div>;
  return user ? <Dashboard user={user} onLogout={logout} /> : <Auth onLogin={login} />;
}
