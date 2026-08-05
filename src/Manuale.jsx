import { useEffect, useMemo, useState } from "react";

/* Manuale operativo — quello che una persona nuova deve saper fare, in ordine di ritmo.
   Le procedure NON stanno qui dentro: stanno nella tabella `procedure_operative` su
   Supabase, così Tommaso, Francesco o Claude possono correggerne una senza pubblicare
   il sito. Questa pagina le legge e basta. */

const SUPABASE_URL = "https://heabtbdmwbjlgujsisor.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhlYWJ0YmRtd2JqbGd1anNpc29yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMjA4NDgsImV4cCI6MjA5NTg5Njg0OH0.FRk1tARhQHylLjfhACorn6O_E7ommm47tBTfJHOVxAU";

function tokenSessione() {
  try { return (JSON.parse(localStorage.getItem("vl_sessione") || "null") || {}).access_token || SUPABASE_KEY; }
  catch { return SUPABASE_KEY; }
}

const CADENZE = [
  ["giornaliera", "Ogni giorno", "🌅", "#6366F1", "Il giro che apre e chiude la giornata. Se salta un giorno si recupera; se salta una settimana si vede."],
  ["settimanale", "Ogni settimana", "📅", "#0EA5E9", "Controlli che servono a scoprire i buchi prima che diventino grossi."],
  ["mensile", "Ogni mese", "🗓️", "#8B5CF6", "Chiusure e adempimenti. Hanno scadenze vere e non si recuperano."],
  ["su evento", "Quando succede", "⚡", "#10B981", "Non hanno un orario: partono da un fatto."],
  ["emergenza", "Se qualcosa si rompe", "🚨", "#EF4444", "Cosa fare quando una cosa non funziona, invece di aspettare."],
];

/* Chi si chiede per cosa. È la domanda che una persona nuova si fa venti volte al giorno. */
const CHI = [
  { nome: "Claude", icona: "✳️", col: "#d97757",
    per: "Come si fa una cosa · dove si trova un dato · cosa dice una procedura · perché il sistema si comporta così · preparare numeri e prospetti",
    nota: "Chiedi sempre a lui per primo: risponde subito e non disturba nessuno. Se dice che non lo sa, non insistere: passa a una persona." },
  { nome: "Francesco", icona: "🔧", col: "#0EA5E9",
    per: "Operatività sul campo · pulizie e manutenzioni · fornitori di zona · ospiti in difficoltà dentro l'appartamento",
    nota: "Property manager. È chi conosce gli immobili fisicamente." },
  { nome: "Tommaso", icona: "🧑‍💼", col: "#8B5CF6",
    per: "Prezzi e sconti · rapporti con i proprietari · soldi · qualsiasi eccezione alle regole · tutto ciò che è irreversibile",
    nota: "Titolare. Non chiedergli quello che sanno già gli altri due, ma non decidere mai al posto suo su queste cose." },
  { nome: "Lorenzo Stagno", icona: "📊", col: "#10B981",
    per: "IVA, fatture, autofatture, adempimenti fiscali",
    nota: "Commercialista esterno (BNB Tax Genius). Si passa da Tommaso prima di scrivergli." },
];

export default function Manuale() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [aperta, setAperta] = useState(null);
  const [caricando, setCaricando] = useState(true);
  const [errore, setErrore] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(
          `${SUPABASE_URL}/rest/v1/procedure_operative?select=*&attivo=is.true&order=ordine.asc`,
          { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${tokenSessione()}` } }
        );
        if (!r.ok) throw new Error("lettura non riuscita");
        setRows(await r.json());
      } catch (e) { setErrore(String(e.message || e)); }
      finally { setCaricando(false); }
    })();
  }, []);

  const filtrate = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) =>
      [r.titolo, r.area, r.passi, r.perche, r.attenzione, r.chi_chiedere, r.dove]
        .filter(Boolean).join(" ").toLowerCase().includes(t)
    );
  }, [rows, q]);

  return (
    <div style={{ padding: "4px 0 44px" }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 6px", fontSize: 26, fontWeight: 700, color: "#1e293b" }}>Manuale operativo</h2>
        <p style={{ margin: 0, color: "#64748b", fontSize: 15, lineHeight: 1.55, maxWidth: 780 }}>
          Tutto quello che c'è da fare, in ordine di ritmo. Se una procedura non è chiara o manca,
          non arrangiarti: chiedi, e poi facciamola aggiungere qui dentro.
        </p>
      </div>

      {/* A chi si chiede */}
      <div style={{ marginBottom: 26 }}>
        <div style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#475569", marginBottom: 10 }}>
          Quando non sai una cosa
        </div>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          {CHI.map((c) => (
            <div key={c.nome} style={{ padding: "14px 16px", borderRadius: 13, background: "#fff", border: `1.5px solid ${c.col}33` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 7 }}>
                <span style={{ width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", background: `${c.col}1a`, fontSize: 16 }}>{c.icona}</span>
                <span style={{ fontWeight: 700, color: "#1e293b", fontSize: 15 }}>{c.nome}</span>
              </div>
              <div style={{ fontSize: 13.2, color: "#334155", lineHeight: 1.5 }}>{c.per}</div>
              <div style={{ fontSize: 12.2, color: "#94a3b8", lineHeight: 1.45, marginTop: 7, fontStyle: "italic" }}>{c.nota}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Le due regole */}
      <div style={{ marginBottom: 26, padding: "16px 18px", borderRadius: 13, background: "#fffbeb", border: "1px solid #fde68a" }}>
        <div style={{ fontWeight: 700, color: "#92400e", fontSize: 14.5, marginBottom: 8 }}>Le due regole che valgono sempre</div>
        <div style={{ fontSize: 14, color: "#78350f", lineHeight: 1.6 }}>
          <div style={{ marginBottom: 6 }}>
            <b>Se è irreversibile, chiedi prima.</b> Invii alla Questura, trasmissioni all'Agenzia delle Entrate,
            messaggi delicati a un ospite, cancellazioni: si prepara tutto e si chiede. Nessuno si arrabbia per una domanda in più.
          </div>
          <div>
            <b>Se hai sbagliato, dillo subito.</b> Un errore detto in giornata è un problema piccolo.
            Lo stesso errore scoperto dopo un mese è un problema grosso, e nel frattempo è cresciuto.
          </div>
        </div>
      </div>

      {/* Ricerca */}
      <input
        value={q} onChange={(e) => setQ(e.target.value)}
        placeholder="Cerca una procedura — es. schedine, rendiconto, codici, fattura…"
        style={{
          width: "100%", padding: "11px 14px", borderRadius: 11, border: "1px solid #e2e8f0",
          fontSize: 14.5, marginBottom: 22, font: "inherit", boxSizing: "border-box",
        }}
      />

      {caricando && <div style={{ color: "#94a3b8", fontSize: 14 }}>Carico le procedure…</div>}
      {errore && (
        <div style={{ padding: "12px 14px", borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", fontSize: 13.5 }}>
          Non riesco a leggere le procedure: {errore}
        </div>
      )}

      {CADENZE.map(([chiave, etichetta, icona, col, spiega]) => {
        const gruppo = filtrate.filter((r) => r.cadenza === chiave);
        if (!gruppo.length) return null;
        return (
          <div key={chiave} style={{ marginBottom: 30 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 9, marginBottom: 4 }}>
              <span style={{ fontSize: 17 }}>{icona}</span>
              <span style={{ fontSize: 17, fontWeight: 700, color: "#1e293b" }}>{etichetta}</span>
              <span style={{ fontSize: 12.5, color: "#94a3b8" }}>{gruppo.length}</span>
            </div>
            <div style={{ fontSize: 13.5, color: "#94a3b8", marginBottom: 12 }}>{spiega}</div>

            <div style={{ display: "grid", gap: 10 }}>
              {gruppo.map((p) => {
                const open = aperta === p.id;
                return (
                  <div key={p.id} style={{ borderRadius: 13, background: "#fff", border: `1.5px solid ${open ? col : "#e2e8f0"}`, overflow: "hidden" }}>
                    <button
                      onClick={() => setAperta(open ? null : p.id)}
                      style={{ width: "100%", textAlign: "left", padding: "14px 16px", background: "none", border: "none", cursor: "pointer", font: "inherit" }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 700, color: "#1e293b", fontSize: 15.5 }}>{p.titolo}</span>
                        {p.irreversibile && (
                          <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca" }}>
                            irreversibile
                          </span>
                        )}
                        <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                          {p.tempo && <span style={{ fontSize: 12, color: "#94a3b8" }}>{p.tempo}</span>}
                          <span style={{ color: "#cbd5e1", fontSize: 13 }}>{open ? "▲" : "▼"}</span>
                        </span>
                      </div>
                      {p.quando && <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>{p.quando}</div>}
                    </button>

                    {open && (
                      <div style={{ padding: "0 16px 16px", borderTop: "1px solid #f1f5f9" }}>
                        {p.perche && (
                          <div style={{ marginTop: 13, fontSize: 13.8, color: "#475569", lineHeight: 1.6, fontStyle: "italic" }}>
                            {p.perche}
                          </div>
                        )}

                        <div style={{ marginTop: 14, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#94a3b8", marginBottom: 6 }}>
                          Come si fa
                        </div>
                        <div style={{ fontSize: 14.3, color: "#1e293b", lineHeight: 1.75, whiteSpace: "pre-wrap" }}>{p.passi}</div>

                        {p.attenzione && (
                          <div style={{ marginTop: 14, padding: "11px 13px", borderRadius: 10, background: p.irreversibile ? "#fef2f2" : "#fffbeb", border: `1px solid ${p.irreversibile ? "#fecaca" : "#fde68a"}`, fontSize: 13.5, lineHeight: 1.55, color: p.irreversibile ? "#991b1b" : "#78350f" }}>
                            <b>Attenzione.</b> {p.attenzione}
                          </div>
                        )}

                        <div style={{ marginTop: 14, display: "grid", gap: 7 }}>
                          {p.chi_chiedere && <Riga k="Chi si chiede" v={p.chi_chiedere} />}
                          {p.dove && <Riga k="Dove si fa" v={p.dove} />}
                          {p.area && <Riga k="Area" v={p.area} />}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {!caricando && !filtrate.length && !errore && (
        <div style={{ color: "#94a3b8", fontSize: 14 }}>Nessuna procedura trovata per «{q}».</div>
      )}

      <div style={{ marginTop: 28, fontSize: 12.5, color: "#94a3b8", lineHeight: 1.6, maxWidth: 760 }}>
        Le procedure vivono nel database, non in questa pagina: si aggiungono e si correggono senza pubblicare
        niente. Se durante il lavoro trovi un passaggio sbagliato o che manca, segnalalo — un manuale che non
        si aggiorna smette di essere letto nel giro di un mese.
      </div>
    </div>
  );
}

function Riga({ k, v }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "baseline", fontSize: 13.5 }}>
      <span style={{ minWidth: 108, color: "#94a3b8", fontWeight: 600, flexShrink: 0 }}>{k}</span>
      <span style={{ color: "#334155" }}>{v}</span>
    </div>
  );
}
