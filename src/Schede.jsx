import { useState, useEffect, useMemo } from "react";

/* Schede Immobili — i dati VERIFICATI di ogni alloggio (piano, letti, accesso, wifi,
   orari, regole). Sono la "verità" che l'agente AI usa per rispondere agli ospiti:
   le mappe fanno le distanze, questa scheda fa tutto il resto. Compila e spunta
   "verificata": più schede verificate = risposte più sicure. */

const SUPABASE_URL = "https://heabtbdmwbjlgujsisor.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhlYWJ0YmRtd2JqbGd1anNpc29yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMjA4NDgsImV4cCI6MjA5NTg5Njg0OH0.FRk1tARhQHylLjfhACorn6O_E7ommm47tBTfJHOVxAU";

function tokenSessione() {
  try { return (JSON.parse(localStorage.getItem("vl_sessione") || "null") || {}).access_token || SUPABASE_KEY; }
  catch { return SUPABASE_KEY; }
}
async function api(method, query, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/schede_immobili${query}`, {
    method,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${tokenSessione()}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => null);
  return { ok: r.ok, data };
}

const CAMPI = [
  ["piano", "Piano", "es. 3° piano (con ascensore)"],
  ["camere_letti", "Camere e letti", "es. 1 camera: 1 matrimoniale + 1 divano letto"],
  ["max_ospiti", "Max ospiti", "es. 4"],
  ["accesso", "Accesso / keybox", "es. keybox accanto al portone, codice fornito al check-in"],
  ["wifi", "Wi-Fi", "es. rete VALENTE_5G, password nella casa"],
  ["checkin", "Check-in", "es. dalle 15:00, in autonomia"],
  ["checkout", "Check-out", "es. entro le 10:00"],
  ["parcheggio", "Parcheggio", "es. strisce blu in zona, garage a pagamento a 200m"],
  ["regole", "Regole della casa", "es. no feste, no fumo, silenzio dopo le 22"],
  ["note", "Altre note", "qualsiasi info utile agli ospiti"],
];

export default function Schede() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [soloDaFare, setSoloDaFare] = useState(false);
  const [openApt, setOpenApt] = useState(null);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => { (async () => {
    setLoading(true);
    const { ok, data } = await api("GET", "?select=*&order=verificata.asc,appartamento.asc");
    if (ok && Array.isArray(data)) setRows(data); else setErr("Impossibile caricare le schede.");
    setLoading(false);
  })(); }, []);

  const filtered = useMemo(() => rows.filter(r =>
    (!soloDaFare || !r.verificata) &&
    (r.appartamento || "").toLowerCase().includes(q.toLowerCase())
  ), [rows, q, soloDaFare]);

  const verificate = rows.filter(r => r.verificata).length;

  const apri = (r) => { setOpenApt(r.appartamento); setDraft({ ...r }); setErr(""); };
  const salva = async () => {
    setSaving(true); setErr("");
    const patch = { verificata: true, aggiornata_il: new Date().toISOString() };
    CAMPI.forEach(([k]) => { patch[k] = draft[k] ?? null; });
    const { ok } = await api("PATCH", `?appartamento=eq.${encodeURIComponent(openApt)}`, patch);
    if (ok) { setRows(rs => rs.map(x => x.appartamento === openApt ? { ...x, ...patch } : x)); setOpenApt(null); }
    else setErr("Salvataggio non riuscito.");
    setSaving(false);
  };

  const card = { background: "var(--card, #fff)", border: "1px solid var(--border, #e5e7eb)", borderRadius: 12, padding: 14, marginBottom: 10 };
  const inp = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border, #d1d5db)", fontSize: 14, boxSizing: "border-box" };

  return (
    <div style={{ maxWidth: 820 }}>
      <div style={{ marginBottom: 4 }}>
        <h2 style={{ margin: "0 0 4px" }}>🏠 Schede Immobili</h2>
        <p style={{ color: "var(--gray, #6b7280)", fontSize: 13, margin: 0 }}>
          I dati verificati di ogni alloggio: sono la fonte di verità che l'agente AI usa per rispondere agli ospiti.
          Le distanze le calcolano le mappe; qui inserisci il resto (piano, letti, accesso, wifi, orari, regole).
        </p>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "14px 0", flexWrap: "wrap" }}>
        <input placeholder="Cerca immobile…" value={q} onChange={e => setQ(e.target.value)} style={{ ...inp, maxWidth: 260 }} />
        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input type="checkbox" checked={soloDaFare} onChange={e => setSoloDaFare(e.target.checked)} /> solo da compilare
        </label>
        <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--gray, #6b7280)" }}>
          <b style={{ color: "var(--accent, #4f46e5)" }}>{verificate}</b> / {rows.length} verificate
        </span>
      </div>

      {loading && <p style={{ color: "var(--gray)" }}>Carico le schede…</p>}
      {err && !openApt && <p style={{ color: "#dc2626", fontSize: 13 }}>{err}</p>}

      {filtered.map(r => (
        <div key={r.appartamento} style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.appartamento}</div>
              {!r.verificata && <div style={{ fontSize: 12, color: "#b45309" }}>⚠️ da compilare</div>}
              {r.verificata && <div style={{ fontSize: 12, color: "#059669" }}>✓ verificata</div>}
            </div>
            <button onClick={() => apri(r)} style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: "var(--accent, #4f46e5)", color: "#fff", fontSize: 13, cursor: "pointer" }}>
              {r.verificata ? "Modifica" : "Compila"}
            </button>
          </div>

          {openApt === r.appartamento && (
            <div style={{ marginTop: 14, borderTop: "1px solid var(--border, #eee)", paddingTop: 14 }}>
              {CAMPI.map(([k, label, ph]) => (
                <div key={k} style={{ marginBottom: 10 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 3, color: "var(--gray, #374151)" }}>{label}</label>
                  {k === "regole" || k === "note" || k === "accesso"
                    ? <textarea value={draft[k] || ""} onChange={e => setDraft(d => ({ ...d, [k]: e.target.value }))} placeholder={ph} rows={2} style={{ ...inp, resize: "vertical" }} />
                    : <input value={draft[k] || ""} onChange={e => setDraft(d => ({ ...d, [k]: e.target.value }))} placeholder={ph} style={inp} />}
                </div>
              ))}
              {err && <p style={{ color: "#dc2626", fontSize: 13 }}>{err}</p>}
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <button onClick={salva} disabled={saving} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "#059669", color: "#fff", fontSize: 14, cursor: "pointer" }}>
                  {saving ? "Salvo…" : "Salva e segna verificata"}
                </button>
                <button onClick={() => setOpenApt(null)} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border, #d1d5db)", background: "transparent", fontSize: 14, cursor: "pointer" }}>Annulla</button>
              </div>
            </div>
          )}
        </div>
      ))}

      {!loading && filtered.length === 0 && <p style={{ color: "var(--gray)" }}>Nessun immobile trovato.</p>}
    </div>
  );
}
