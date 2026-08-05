import { useMemo, useState, useRef, useEffect, useCallback } from "react";

/* L'app di valutazione vive in public/valutazione.html ed è servita dallo stesso
   dominio del CRM: stesso login, stessa sessione, nessuna password in più.
   Qui la incorniciamo e le passiamo il nome di chi sta valutando. */

/* Il campo `agente` è testo libero e nel tempo è stato scritto in modi diversi
   ("Desideria" e "Desideria Iovenitti" sono la stessa persona). Finché non lo
   normalizziamo, l'abbinamento si fa per pezzi di nome: basta che una parola del
   nome di chi ha fatto accesso compaia in quello salvato. */
function pulisci(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}
function eMia(agenteSalvato, nomeAgente) {
  const a = pulisci(agenteSalvato), me = pulisci(nomeAgente);
  if (!a || !me) return false;
  if (a === me) return true;
  const parole = me.split(/\s+/).filter((p) => p.length > 2);
  return parole.some((p) => a.includes(p));
}
const euro = (n) => (n == null ? "—" : Number(n).toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }));

const SUPABASE_URL = "https://heabtbdmwbjlgujsisor.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhlYWJ0YmRtd2JqbGd1anNpc29yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMjA4NDgsImV4cCI6MjA5NTg5Njg0OH0.FRk1tARhQHylLjfhACorn6O_E7ommm47tBTfJHOVxAU";

export default function Valutazione({ nomeAgente, vedoTutto = false }) {
  const [pronta, setPronta] = useState(false);
  const [altezza, setAltezza] = useState(700);
  const [storico, setStorico] = useState(null);
  const frame = useRef(null);

  /* Storico: l'agente vede le sue, chi ha visione completa le vede tutte. */
  const caricaStorico = useCallback(async () => {
    try {
      const tok = (JSON.parse(localStorage.getItem("vl_sessione") || "null") || {}).access_token || SUPABASE_KEY;
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/valutazioni?select=id,created_at,agente,indirizzo,comune,modello,punteggio,margine_valente,verdetto&order=created_at.desc&limit=200`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${tok}` } }
      );
      if (!r.ok) { setStorico([]); return; }
      const tutte = await r.json();
      setStorico(vedoTutto ? tutte : tutte.filter((v) => eMia(v.agente, nomeAgente)));
    } catch { setStorico([]); }
  }, [nomeAgente, vedoTutto]);

  useEffect(() => { caricaStorico(); }, [caricaStorico]);

  const src = useMemo(() => {
    const q = nomeAgente ? `?agente=${encodeURIComponent(nomeAgente)}` : "";
    return `/valutazione.html${q}`;
  }, [nomeAgente]);

  /* Il riquadro cresce con il contenuto: così c'è una sola barra di scorrimento,
     quella della pagina, invece di una dentro l'altra. */
  const misura = useCallback(() => {
    const f = frame.current;
    if (!f) return;
    try {
      const doc = f.contentDocument;
      if (!doc || !doc.body) return;
      const h = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight, 520);
      setAltezza(h + 24);
    } catch { /* pagina non accessibile: resta l'altezza di riserva */ }
  }, []);

  useEffect(() => {
    if (!pronta) return;
    misura();
    const t = setInterval(misura, 500);   // il wizard cambia passo e cambia altezza
    window.addEventListener("resize", misura);
    return () => { clearInterval(t); window.removeEventListener("resize", misura); };
  }, [pronta, misura]);

  return (
    <div className="fi">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 6 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700 }}>Valuta immobile</h1>
          <p style={{ fontSize: 12, color: "var(--gray)", marginTop: 4 }}>
            Punteggio, margine e verdetto di acquisizione. Le valutazioni restano salvate nell'archivio.
          </p>
        </div>
      </div>
      <div className="gl" style={{ marginBottom: 14 }} />

      <div style={{ minHeight: 520, position: "relative", background: "var(--white)", border: "1px solid var(--gl)", borderRadius: 12, overflow: "hidden", boxShadow: "var(--shadow)" }}>
        {!pronta && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "var(--gray)" }}>
            Apro il valutatore…
          </div>
        )}
        <iframe
          ref={frame}
          src={src}
          title="Valuta immobile"
          scrolling="no"
          onLoad={() => setPronta(true)}
          style={{ width: "100%", height: altezza, border: 0, display: "block", opacity: pronta ? 1 : 0, transition: "opacity .2s" }}
        />
      </div>

      {/* ── Storico ──────────────────────────────────────────────── */}
      <div style={{ marginTop: 26 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
          <h2 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>
            {vedoTutto ? "Tutte le valutazioni" : "Le mie valutazioni"}
          </h2>
          {storico && <span style={{ fontSize: 12.5, color: "var(--gray)" }}>{storico.length}</span>}
          <button onClick={caricaStorico} style={{ marginLeft: "auto", fontSize: 12.5, padding: "5px 11px", borderRadius: 8, border: "1px solid var(--gl)", background: "var(--white)", cursor: "pointer", font: "inherit", color: "var(--gray)" }}>
            Aggiorna
          </button>
        </div>
        <p style={{ fontSize: 12, color: "var(--gray)", margin: "0 0 12px" }}>
          {vedoTutto
            ? "Tutte le valutazioni salvate, con l'agente che le ha fatte."
            : "Le valutazioni che hai salvato. Se ne manca qualcuna, probabilmente era stata salvata con un nome scritto in modo diverso: segnalalo e la sistemiamo."}
        </p>

        {storico === null && <div style={{ fontSize: 13, color: "var(--gray)" }}>Carico lo storico…</div>}

        {storico && !storico.length && (
          <div style={{ fontSize: 13, color: "var(--gray)", padding: "16px 0" }}>
            Nessuna valutazione ancora. Falla qui sopra: resta salvata e la ritrovi in questo elenco.
          </div>
        )}

        {storico && storico.length > 0 && (
          <div style={{ display: "grid", gap: 8 }}>
            {storico.map((v) => {
              const ok = /acquisi/i.test(v.verdetto || "") && !/non/i.test(v.verdetto || "");
              const col = ok ? "#10B981" : /non acquisi/i.test(v.verdetto || "") ? "#EF4444" : "#F59E0B";
              return (
                <div key={v.id} style={{ padding: "12px 14px", borderRadius: 11, background: "var(--white)", border: "1px solid var(--gl)", display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ minWidth: 200, flex: 1 }}>
                    <div style={{ fontWeight: 650, fontSize: 14.5 }}>
                      {v.indirizzo || v.comune || "Immobile senza indirizzo"}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--gray)", marginTop: 2 }}>
                      {[v.comune, v.modello, new Date(v.created_at).toLocaleDateString("it-IT")].filter(Boolean).join(" · ")}
                      {vedoTutto && v.agente ? ` · ${v.agente}` : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", minWidth: 92 }}>
                    <div style={{ fontSize: 11, color: "var(--gray)" }}>Punteggio</div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{v.punteggio ?? "—"}</div>
                  </div>
                  <div style={{ textAlign: "right", minWidth: 110 }}>
                    <div style={{ fontSize: 11, color: "var(--gray)" }}>Margine Valente</div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{euro(v.margine_valente)}</div>
                  </div>
                  {v.verdetto && (
                    <span style={{ fontSize: 11.5, fontWeight: 700, padding: "4px 10px", borderRadius: 999, background: `${col}18`, color: col, whiteSpace: "nowrap" }}>
                      {v.verdetto}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
