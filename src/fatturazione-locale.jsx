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

  if (ok) return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: 20 }}>
      <Fatturazione />
      <div style={{ textAlign: "right", marginTop: 20 }}>
        <button onClick={() => { scrivi(null); setOk(false); }} style={{ fontSize: 12, padding: "6px 12px", borderRadius: 8, border: "1px solid #E2E8F0", background: "#fff", cursor: "pointer" }}>Esci</button>
      </div>
    </div>
  );
  return (
    <form onSubmit={entra} style={{ maxWidth: 340, margin: "14vh auto", display: "grid", gap: 10, fontFamily: "Inter,system-ui,sans-serif" }}>
      <h2 style={{ fontSize: 22 }}>Fatturazione · Valente Living</h2>
      <p style={{ fontSize: 12.5, color: "#64748B" }}>Accedi con le stesse credenziali del CRM.</p>
      <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" style={{ padding: 10, borderRadius: 9, border: "1px solid #E2E8F0" }} />
      <input type="password" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" style={{ padding: 10, borderRadius: 9, border: "1px solid #E2E8F0" }} />
      {err && <div style={{ color: "#B42318", fontSize: 12.5 }}>{err}</div>}
      <button disabled={att} style={{ padding: 10, borderRadius: 9, border: "none", background: "#6366F1", color: "#fff", fontWeight: 600, cursor: "pointer" }}>{att ? "…" : "Entra"}</button>
    </form>
  );
}

createRoot(document.getElementById("root")).render(<App />);
