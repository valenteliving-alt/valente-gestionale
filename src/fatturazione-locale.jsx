import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import Fatturazione from "./Fatturazione";

/* Versione da scaricare sul PC: un unico file HTML che si apre con doppio clic.
   Fa il login con le stesse credenziali del CRM e legge lo stesso database.
   Si ricostruisce con: npx vite build --config vite.locale.config.js */

const SUPABASE_URL = "https://heabtbdmwbjlgujsisor.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhlYWJ0YmRtd2JqbGd1anNpc29yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMjA4NDgsImV4cCI6MjA5NTg5Njg0OH0.FRk1tARhQHylLjfhACorn6O_E7ommm47tBTfJHOVxAU";
const K = "vl_sessione";
const leggi = () => { try { return JSON.parse(localStorage.getItem(K) || "null"); } catch { return null; } };
const scrivi = (s) => { try { s ? localStorage.setItem(K, JSON.stringify(s)) : localStorage.removeItem(K); } catch { /* ignora */ } };

async function token(grant, corpo) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=${grant}`, {
    method: "POST", headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" }, body: JSON.stringify(corpo),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error_description || d.msg || d.message || "Accesso non riuscito.");
  scrivi({ access_token: d.access_token, refresh_token: d.refresh_token, scade: Date.now() + (d.expires_in || 3600) * 1000, user: d.user });
}

function App() {
  const [ok, setOk] = useState(() => { const s = leggi(); return !!(s && s.refresh_token); });
  const [email, setEmail] = useState(""); const [pw, setPw] = useState(""); const [err, setErr] = useState(""); const [att, setAtt] = useState(false);

  /* Il token dura un'ora: si rinnova da solo, così non si resta fuori a metà lavoro. */
  useEffect(() => {
    if (!ok) return;
    const rinnova = async () => {
      const s = leggi();
      if (!s) return;
      if (s.scade - Date.now() < 10 * 60 * 1000) {
        try { await token("refresh_token", { refresh_token: s.refresh_token }); } catch { scrivi(null); setOk(false); }
      }
    };
    rinnova();
    const t = setInterval(rinnova, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [ok]);

  const entra = async (e) => {
    e.preventDefault(); setErr(""); setAtt(true);
    try { await token("password", { email: email.trim(), password: pw }); setOk(true); }
    catch (x) { setErr(x.message); }
    setAtt(false);
  };

  const campo = { padding: "10px 12px", borderRadius: 8, border: "1px solid #E5E7EB", font: "inherit", fontSize: 14, width: "100%", outline: "none" };
  if (ok) return (
    <div style={{ minHeight: "100vh", background: "#F8FAFC" }}>
      <header style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", height: 56, display: "flex", alignItems: "center", padding: "0 28px", gap: 12 }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: "#0F172A", color: "#fff", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 14 }}>V</div>
        <div style={{ fontWeight: 600, fontSize: 14, letterSpacing: "-.01em" }}>Valente Living</div>
        <div style={{ color: "#CBD5E1" }}>/</div>
        <div style={{ color: "#64748B", fontSize: 14 }}>Fatturazione</div>
        <button onClick={() => { scrivi(null); setOk(false); }} style={{ marginLeft: "auto", fontSize: 13, padding: "6px 12px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", cursor: "pointer", color: "#334155" }}>Esci</button>
      </header>
      <main style={{ maxWidth: 1360, margin: "0 auto", padding: "28px 28px 60px" }}><Fatturazione /></main>
    </div>
  );
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#F8FAFC", padding: 20 }}>
      <form onSubmit={entra} style={{ width: "100%", maxWidth: 380, background: "#fff", border: "1px solid #E5E7EB", borderRadius: 14, padding: "32px 30px", boxShadow: "0 10px 30px rgba(15,23,42,.06)", display: "grid", gap: 14 }}>
        <div style={{ width: 36, height: 36, borderRadius: 9, background: "#0F172A", color: "#fff", display: "grid", placeItems: "center", fontWeight: 700 }}>V</div>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 650, letterSpacing: "-.02em", margin: 0 }}>Accedi a Fatturazione</h2>
          <p style={{ fontSize: 13, color: "#64748B", margin: "4px 0 0" }}>Usa le stesse credenziali del CRM Valente Living.</p>
        </div>
        <label style={{ fontSize: 12.5, fontWeight: 500, color: "#334155" }}>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" style={{ ...campo, marginTop: 6 }} /></label>
        <label style={{ fontSize: 12.5, fontWeight: 500, color: "#334155" }}>Password<input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" style={{ ...campo, marginTop: 6 }} /></label>
        {err && <div style={{ color: "#B91C1C", fontSize: 13, background: "#FEF2F2", padding: "8px 10px", borderRadius: 8 }}>{err === "Invalid login credentials" ? "Email o password non corrette." : err}</div>}
        <button disabled={att} style={{ padding: 11, borderRadius: 8, border: "none", background: "#4F46E5", color: "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>{att ? "Accesso…" : "Entra"}</button>
        <a href="https://valentelivingcrm.netlify.app" target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: "#4F46E5", textAlign: "center", textDecoration: "none" }}>Password dimenticata? Recuperala dal CRM</a>
      </form>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
