import { useState, useEffect, useMemo, useCallback } from "react";

/* Messaggi AI Ospiti — pannello di controllo dell'agente AI che risponde agli ospiti su Krossbooking.
   • Interruttore GENERALE: spegni tutto, oppure modalità "solo bozze" (l'AI propone ma non invia mai da sola).
   • Interruttore per SINGOLO appartamento.
   • CODA: le risposte proposte dall'AI, da approvare / modificare / rifiutare.
   • Monitoraggio delle conversazioni.
   Nota: il robot gira su un server separato e legge questi interruttori/coda dal database. */

const SUPABASE_URL = "https://heabtbdmwbjlgujsisor.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhlYWJ0YmRtd2JqbGd1anNpc29yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMjA4NDgsImV4cCI6MjA5NTg5Njg0OH0.FRk1tARhQHylLjfhACorn6O_E7ommm47tBTfJHOVxAU";

function tokenSessione() {
  try { return (JSON.parse(localStorage.getItem("vl_sessione") || "null") || {}).access_token || SUPABASE_KEY; }
  catch { return SUPABASE_KEY; }
}
async function api(method, table, query, body, prefer) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query || ""}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${tokenSessione()}`,
      "Content-Type": "application/json",
      Prefer: prefer || "return=representation",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => null);
  return { ok: r.ok, data };
}

const box = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, marginBottom: 16, boxShadow: "0 1px 2px rgba(0,0,0,.04)" };
const btn = (bg, fg = "#fff") => ({ background: bg, color: fg, border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 600, cursor: "pointer", fontSize: 13 });
const chip = (bg, fg) => ({ background: bg, color: fg, borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 600, display: "inline-block" });

function Switch({ on, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} title={on ? "Attiva" : "Spenta"}
      style={{ width: 46, height: 26, borderRadius: 999, border: "none", cursor: disabled ? "default" : "pointer",
        background: on ? "#16a34a" : "#cbd5e1", position: "relative", transition: "background .15s", opacity: disabled ? .5 : 1 }}>
      <span style={{ position: "absolute", top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .15s", boxShadow: "0 1px 2px rgba(0,0,0,.3)" }} />
    </button>
  );
}

export default function MessaggiAI() {
  const [config, setConfig] = useState({ ai_globale_attiva: false, modalita: "sola_bozza" });
  const [apts, setApts] = useState([]);          // [{appartamento, attiva}]
  const [queue, setQueue] = useState([]);        // bozze_approvazioni in attesa
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("coda");        // coda | appartamenti
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [edit, setEdit] = useState({});          // { id_thread: testo modificato }

  const carica = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const [cfg, toggles, coda] = await Promise.all([
        api("GET", "ai_config", "?id=eq.1&select=*"),
        api("GET", "ai_appartamenti", "?select=*&order=appartamento.asc"),
        api("GET", "bozze_approvazioni", "?stato=eq.in_attesa&order=creata_il.desc"),
      ]);
      if (cfg.ok && cfg.data && cfg.data[0]) setConfig(cfg.data[0]);
      // La lista appartamenti sono i nomi VERI di Krossbooking (già puliti dai doppioni)
      setApts((toggles.data || []).map(t => ({ appartamento: t.appartamento, attiva: !!t.attiva })));
      if (coda.ok && Array.isArray(coda.data)) setQueue(coda.data);
    } catch (e) { setErr("Impossibile caricare i dati."); }
    setLoading(false);
  }, []);

  useEffect(() => { carica(); }, [carica]);
  useEffect(() => { const t = setInterval(carica, 30000); return () => clearInterval(t); }, [carica]); // aggiorna ogni 30s

  async function salvaConfig(patch) {
    const nuovo = { ...config, ...patch, aggiornata_il: new Date().toISOString() };
    setConfig(nuovo);
    await api("PATCH", "ai_config", "?id=eq.1", patch);
  }
  async function toggleApt(nome, attiva) {
    setApts(a => a.map(x => x.appartamento === nome ? { ...x, attiva } : x));
    await api("POST", "ai_appartamenti", "?on_conflict=appartamento",
      [{ appartamento: nome, attiva, aggiornata_il: new Date().toISOString() }],
      "resolution=merge-duplicates,return=minimal");
  }
  async function aggiornaBozza(row, stato, bozza) {
    const patch = { stato, aggiornata_il: new Date().toISOString() };
    if (typeof bozza === "string") patch.bozza = bozza;
    await api("PATCH", "bozze_approvazioni", `?id_thread=eq.${encodeURIComponent(row.id_thread)}`, patch, "return=minimal");
    setQueue(qq => qq.filter(x => x.id_thread !== row.id_thread));
  }

  const aptsFiltrati = useMemo(() =>
    apts.filter(a => (a.appartamento || "").toLowerCase().includes(q.toLowerCase())),
  [apts, q]);
  const attiviCount = apts.filter(a => a.attiva).length;

  const spentoTutto = !config.ai_globale_attiva;

  return (
    <div style={{ maxWidth: 900 }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 22 }}>🤖 Messaggi AI Ospiti</h2>
      <p style={{ margin: "0 0 16px", color: "#6b7280", fontSize: 14 }}>
        Il tuo pannello di controllo sull'agente che risponde agli ospiti. Qui comandi tu: cosa risponde, dove è attivo, e blocchi tutto quando vuoi.
      </p>

      {err && <div style={{ ...box, background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca" }}>{err}</div>}

      {/* INTERRUTTORE GENERALE */}
      <div style={{ ...box, borderColor: spentoTutto ? "#fca5a5" : "#86efac", background: spentoTutto ? "#fef2f2" : "#f0fdf4" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Interruttore generale</div>
            <div style={{ color: "#6b7280", fontSize: 13, marginTop: 2 }}>
              {spentoTutto ? "🔴 AI SPENTA — non legge e non risponde a nessuno." : "🟢 AI accesa."}
            </div>
          </div>
          <Switch on={config.ai_globale_attiva} onClick={() => salvaConfig({ ai_globale_attiva: !config.ai_globale_attiva })} />
        </div>

        {!spentoTutto && (
          <div style={{ marginTop: 14, borderTop: "1px dashed #d1d5db", paddingTop: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Come si comporta?</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button onClick={() => salvaConfig({ modalita: "sola_bozza" })}
                style={{ ...btn(config.modalita === "sola_bozza" ? "#2563eb" : "#e5e7eb", config.modalita === "sola_bozza" ? "#fff" : "#374151"), textAlign: "left", flex: "1 1 220px" }}>
                ✍️ Solo bozze (consigliato)<br /><span style={{ fontWeight: 400, fontSize: 12 }}>Prepara le risposte ma NON invia. Approvi tu.</span>
              </button>
              <button onClick={() => salvaConfig({ modalita: "auto" })}
                style={{ ...btn(config.modalita === "auto" ? "#16a34a" : "#e5e7eb", config.modalita === "auto" ? "#fff" : "#374151"), textAlign: "left", flex: "1 1 220px" }}>
                ⚡ Automatico<br /><span style={{ fontWeight: 400, fontSize: 12 }}>Invia da solo le risposte di routine; il resto lo mette in coda.</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* TABS */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={() => setTab("coda")} style={btn(tab === "coda" ? "#111827" : "#e5e7eb", tab === "coda" ? "#fff" : "#374151")}>
          📥 Da approvare {queue.length > 0 && <span style={{ ...chip("#ef4444", "#fff"), marginLeft: 6 }}>{queue.length}</span>}
        </button>
        <button onClick={() => setTab("appartamenti")} style={btn(tab === "appartamenti" ? "#111827" : "#e5e7eb", tab === "appartamenti" ? "#fff" : "#374151")}>
          🏠 AI per appartamento <span style={{ ...chip("#3b82f6", "#fff"), marginLeft: 6 }}>{attiviCount} attivi</span>
        </button>
        <button onClick={carica} style={{ ...btn("#e5e7eb", "#374151"), marginLeft: "auto" }}>↻ Aggiorna</button>
      </div>

      {loading && <div style={{ color: "#6b7280", padding: 20 }}>Caricamento…</div>}

      {/* CODA APPROVAZIONI */}
      {!loading && tab === "coda" && (
        queue.length === 0 ? (
          <div style={{ ...box, color: "#6b7280", textAlign: "center" }}>
            Nessuna conversazione in attesa. 🎉<br />
            <span style={{ fontSize: 13 }}>Quando l'AI prepara una risposta da approvare, compare qui.</span>
          </div>
        ) : queue.map(row => {
          const testo = edit[row.id_thread] !== undefined ? edit[row.id_thread] : (row.bozza || "");
          return (
            <div key={row.id_thread} style={box}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
                <div style={{ fontWeight: 700 }}>🏠 {row.appartamento || "n/d"}</div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {row.canale && <span style={chip("#eef2ff", "#4338ca")}>{row.canale}</span>}
                  {row.motivo && <span style={chip("#fef9c3", "#854d0e")}>{row.motivo}</span>}
                </div>
              </div>
              {row.conversazione && (
                <div style={{ background: "#f9fafb", border: "1px solid #eee", borderRadius: 8, padding: 10, fontSize: 13, color: "#374151", whiteSpace: "pre-wrap", maxHeight: 160, overflow: "auto", marginBottom: 10 }}>
                  {row.conversazione}
                </div>
              )}
              <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>Risposta proposta dall'AI (modificabile):</div>
              <textarea value={testo} onChange={e => setEdit(s => ({ ...s, [row.id_thread]: e.target.value }))}
                placeholder="(l'AI non ha ancora scritto una bozza per questa conversazione)"
                style={{ width: "100%", minHeight: 80, borderRadius: 8, border: "1px solid #d1d5db", padding: 10, fontSize: 14, fontFamily: "inherit", resize: "vertical" }} />
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button style={btn("#16a34a")} onClick={() => aggiornaBozza(row, "approvata", testo)}>✓ Approva e invia</button>
                <button style={btn("#e5e7eb", "#374151")} onClick={() => aggiornaBozza(row, "in_attesa", testo)}>💾 Salva bozza</button>
                <button style={btn("#fee2e2", "#b91c1c")} onClick={() => aggiornaBozza(row, "rifiutata")}>✕ Rifiuta</button>
              </div>
            </div>
          );
        })
      )}

      {/* AI PER APPARTAMENTO */}
      {!loading && tab === "appartamenti" && (
        <div style={box}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cerca appartamento…"
            style={{ width: "100%", borderRadius: 8, border: "1px solid #d1d5db", padding: "10px 12px", fontSize: 14, marginBottom: 12, boxSizing: "border-box" }} />
          {spentoTutto && <div style={{ ...chip("#fef2f2", "#b91c1c"), display: "block", padding: 10, marginBottom: 10 }}>⚠️ L'interruttore generale è spento: nessun appartamento risponde, anche se acceso qui sotto.</div>}
          {aptsFiltrati.length === 0 && <div style={{ color: "#6b7280" }}>Nessun appartamento.</div>}
          {aptsFiltrati.map(a => (
            <div key={a.appartamento} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #f3f4f6" }}>
              <div style={{ fontSize: 14 }}>{a.appartamento}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12, color: a.attiva ? "#16a34a" : "#9ca3af", fontWeight: 600 }}>{a.attiva ? "AI attiva" : "spenta"}</span>
                <Switch on={a.attiva} onClick={() => toggleApt(a.appartamento, !a.attiva)} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
