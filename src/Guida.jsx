import { useState, useEffect, useCallback, useMemo } from "react";

// Guide procedurali (contenuto stabile: cambia di rado)
const GUIDE = [
  {
    id: "ids",
    icona: "🏛️",
    titolo: "Imposta di soggiorno — come funziona",
    testo: [
      "È un tributo comunale che l'ospite paga per ogni notte, e che il gestore RISCUOTE e RIVERSA al Comune. La applica solo una parte dei comuni, e ognuno ha il suo regolamento: tariffa a persona/notte, tetto di notti oltre il quale non si paga, esenzioni (di solito i minori sotto una certa età), e cadenza di versamento.",
      "Passi tipici: 1) accreditarsi sul portale del Comune; 2) comunicare le presenze del periodo; 3) versare l'imposta incassata (di solito via PagoPA o F24) entro la scadenza; 4) presentare la dichiarazione annuale nazionale all'Agenzia delle Entrate entro il 30 giugno dell'anno successivo.",
      "Attenzione: se le prenotazioni passano da un portale (es. Airbnb) in alcuni comuni è l'intermediario a riscuotere e versare. Verifica sempre caso per caso.",
    ],
  },
  {
    id: "istat",
    icona: "📊",
    titolo: "ISTAT / Rilevazione flussi turistici",
    testo: [
      "Ogni Regione raccoglie i dati statistici su arrivi e presenze tramite un portale dedicato. In Toscana è Ross1000 / Turismo5 (spesso raggiungibile via toscana.motouristoffice.it); in Lombardia Ross1000/Turismo5; in Lazio RadarWeb; in Campania Sinfonia Turismo SMART; in Emilia-Romagna e Liguria i rispettivi Ross1000 regionali.",
      "È un obbligo SEPARATO dall'imposta di soggiorno e da Alloggiati Web: va comunicato anche quando l'imposta non è dovuta (es. isole minori). Di norma le presenze si trasmettono con cadenza mensile.",
    ],
  },
  {
    id: "alloggiati",
    icona: "🛂",
    titolo: "Alloggiati Web (Questura)",
    testo: [
      "Entro 24 ore dal check-in (entro poche ore se il soggiorno è di una sola notte) vanno comunicati alla Questura i dati di tutti gli ospiti tramite il portale Alloggiati Web della Polizia di Stato.",
      "È un obbligo di pubblica sicurezza, valido ovunque e indipendente da imposta di soggiorno e ISTAT. Molti channel manager / PMS lo automatizzano: conviene delegarlo al gestionale delle prenotazioni.",
    ],
  },
  {
    id: "cin",
    icona: "🔢",
    titolo: "CIN / CIR — codici identificativi",
    testo: [
      "Il CIN (Codice Identificativo Nazionale) è il codice unico nazionale delle strutture ricettive e delle locazioni per finalità turistiche, da esporre negli annunci. Si ottiene dalla Banca Dati Strutture Ricettive del Ministero del Turismo.",
      "Il CIR è l'eventuale codice regionale, dove previsto (in Toscana il prefisso di Livorno è 049). Vanno tenuti aggiornati e riportati sugli annunci online.",
    ],
  },
];

async function fnGuida(payload) {
  const r = await fetch("/.netlify/functions/guida", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) throw new Error(d.error || "Errore.");
  return d;
}

function badgeConfidenza(c) {
  const v = (c || "").toLowerCase();
  const map = {
    alta: { bg: "rgba(45,106,79,.15)", col: "#2d6a4f", txt: "dato affidabile" },
    media: { bg: "rgba(214,156,49,.15)", col: "var(--gold)", txt: "da confermare" },
    bassa: { bg: "rgba(224,123,57,.15)", col: "#e07b39", txt: "da verificare" },
  };
  const s = map[v] || map.media;
  return <span className="tag" style={{ background: s.bg, color: s.col, borderColor: "transparent" }}>{s.txt}</span>;
}

const VUOTO = { comune: "", provincia: "", regione: "", imposta_attiva: true, tariffa: "", tetto_notti: "", esenzioni: "", frequenza: "", portale_tassa: "", portale_istat: "", regolamento_url: "", note: "", confidenza: "media", fonte_url: "", aggiornato_il: "" };

function Link({ url, label }) {
  if (!url) return null;
  const href = url.startsWith("http") ? url : "https://" + url;
  return <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "var(--gold)", fontSize: 11, textDecoration: "none", wordBreak: "break-all" }}>↗ {label}</a>;
}

export default function Guida() {
  const [righe, setRighe] = useState([]);
  const [caricando, setCaricando] = useState(true);
  const [errore, setErrore] = useState("");
  const [search, setSearch] = useState("");
  const [editId, setEditId] = useState(null); // id esistente oppure "nuovo"
  const [form, setForm] = useState(VUOTO);
  const [salvando, setSalvando] = useState(false);
  const [guidaAperta, setGuidaAperta] = useState(null);
  const [domanda, setDomanda] = useState("");
  const [risposta, setRisposta] = useState("");
  const [chiedendo, setChiedendo] = useState(false);
  const [briefTesto, setBriefTesto] = useState("");
  const [briefLoading, setBriefLoading] = useState(false);

  const carica = useCallback(async () => {
    setCaricando(true); setErrore("");
    try { const d = await fnGuida({ action: "list" }); setRighe(d.righe || []); }
    catch (e) { setErrore(e.message); }
    setCaricando(false);
  }, []);
  useEffect(() => { carica(); }, [carica]);

  const apriNuovo = () => { setForm({ ...VUOTO, aggiornato_il: new Date().toISOString().slice(0, 10) }); setEditId("nuovo"); };
  const apriEdit = (r) => { setForm({ ...VUOTO, ...r, aggiornato_il: r.aggiornato_il || new Date().toISOString().slice(0, 10) }); setEditId(r.id); };

  const salva = async () => {
    if (!form.comune.trim()) { setErrore("Il comune è obbligatorio."); return; }
    setSalvando(true); setErrore("");
    try {
      const payload = { action: "save", ...form };
      if (editId !== "nuovo") payload.id = editId;
      const d = await fnGuida(payload);
      setRighe(rs => {
        const altri = rs.filter(x => x.id !== d.riga.id);
        return [...altri, d.riga].sort((a, b) => (a.comune || "").localeCompare(b.comune || ""));
      });
      setEditId(null);
    } catch (e) { setErrore(e.message); }
    setSalvando(false);
  };

  const elimina = async (r) => {
    if (!window.confirm(`Eliminare la scheda di "${r.comune}"?`)) return;
    try { await fnGuida({ action: "delete", id: r.id }); setRighe(rs => rs.filter(x => x.id !== r.id)); }
    catch (e) { setErrore(e.message); }
  };

  const chiedi = async () => {
    if (!domanda.trim()) return;
    setChiedendo(true); setRisposta("");
    try { const d = await fnGuida({ action: "ask", domanda }); setRisposta(d.risposta || ""); }
    catch (e) { setRisposta("Errore: " + e.message); }
    setChiedendo(false);
  };

  const provaBriefing = async () => {
    setBriefLoading(true); setBriefTesto("");
    try {
      const r = await fetch("/.netlify/functions/briefing", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ push: false }),
      });
      const d = await r.json();
      setBriefTesto(d.testo || d.error || "Nessuna risposta.");
    } catch (e) { setBriefTesto("Errore: " + e.message); }
    setBriefLoading(false);
  };

  const visibili = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return righe;
    return righe.filter(r => [r.comune, r.provincia, r.regione, r.tariffa, r.note, r.frequenza].filter(Boolean).join(" ").toLowerCase().includes(q));
  }, [righe, search]);

  const F = (campo, label, opts = {}) => (
    <div style={{ gridColumn: opts.full ? "1 / -1" : undefined }}>
      <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--gray)" }}>{label}</label>
      {opts.area
        ? <textarea value={form[campo] || ""} onChange={e => setForm(f => ({ ...f, [campo]: e.target.value }))} rows={2} style={{ marginTop: 4, width: "100%" }} />
        : <input value={form[campo] || ""} onChange={e => setForm(f => ({ ...f, [campo]: e.target.value }))} style={{ marginTop: 4, width: "100%" }} />}
    </div>
  );

  return (
    <div className="fi">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 6 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700 }}>Guida</h1>
          <p style={{ fontSize: 12, color: "var(--gray)", marginTop: 4 }}>
            Imposta di soggiorno per comune, ISTAT, Alloggiati Web e CIN — le procedure e le regole dei comuni del portfolio.
          </p>
        </div>
        <div style={{ fontSize: 11, color: "var(--gray)", letterSpacing: ".05em", textTransform: "uppercase" }}>
          {righe.length} comun{righe.length === 1 ? "e" : "i"}
        </div>
      </div>
      <div className="gl" style={{ marginBottom: 20 }} />

      {/* Avviso */}
      <div style={{ background: "rgba(214,156,49,.08)", border: "1px solid rgba(214,156,49,.3)", padding: "10px 14px", marginBottom: 20, fontSize: 12, color: "var(--black)", borderRadius: 12 }}>
        ⚠️ I dati sono <strong>indicativi</strong> e possono cambiare: prima di ogni adempimento fiscale <strong>verifica sempre sul portale ufficiale del comune</strong> (link in ogni scheda). Le tariffe segnate "da confermare/verificare" vanno controllate all'ufficio Tributi.
      </div>

      {/* Assistente AI */}
      <div style={{ background: "var(--white)", border: "1px solid var(--gl)", borderRadius: 12, boxShadow: "var(--shadow)", padding: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--gold)", marginBottom: 8 }}>✦ Chiedi alla guida</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={domanda} onChange={e => setDomanda(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") chiedi(); }}
            placeholder="Es. Quanto è l'imposta a Lucca e quando si versa?"
            style={{ flex: "1 1 260px" }}
          />
          <button className="bp" onClick={chiedi} disabled={chiedendo}>{chiedendo ? "Penso…" : "Chiedi"}</button>
        </div>
        {risposta && <div style={{ marginTop: 12, fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap", background: "var(--cream)", padding: 12, border: "1px solid var(--gl)", borderRadius: 10 }}>{risposta}</div>}
      </div>

      {/* Briefing mattutino */}
      <div style={{ background: "var(--white)", border: "1px solid var(--gl)", borderRadius: 12, boxShadow: "var(--shadow)", padding: 16, marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--gold)" }}>🌅 Briefing mattutino</div>
            <div style={{ fontSize: 11, color: "var(--gray)", marginTop: 3 }}>Ogni mattina alle 7 l'agente controlla scadenze imposta, CIN mancanti e fatture da registrare, e ti manda una notifica se c'è qualcosa da fare.</div>
          </div>
          <button className="bg" onClick={provaBriefing} disabled={briefLoading}>{briefLoading ? "Controllo…" : "▶ Prova adesso"}</button>
        </div>
        {briefTesto && <div style={{ marginTop: 12, fontSize: 12.5, lineHeight: 1.6, whiteSpace: "pre-wrap", background: "var(--cream)", padding: 12, border: "1px solid var(--gl)", borderRadius: 10 }}>{briefTesto}</div>}
      </div>

      {/* Guide procedurali */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--gray)", marginBottom: 10 }}>Procedure</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {GUIDE.map(g => {
            const aperta = guidaAperta === g.id;
            return (
              <div key={g.id} style={{ background: "var(--white)", border: "1px solid var(--gl)", borderRadius: 12, boxShadow: "var(--shadow)" }}>
                <button onClick={() => setGuidaAperta(aperta ? null : g.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
                  <span style={{ fontSize: 18 }}>{g.icona}</span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{g.titolo}</span>
                  <span style={{ fontSize: 12, color: "var(--gray)" }}>{aperta ? "−" : "+"}</span>
                </button>
                {aperta && (
                  <div style={{ padding: "0 14px 14px 44px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {g.testo.map((p, i) => <p key={i} style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--black)" }}>{p}</p>)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabella comuni */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--gray)", marginRight: "auto" }}>Imposta di soggiorno per comune</div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca comune…" style={{ flex: "0 1 240px" }} />
        <button className="bp" onClick={apriNuovo}>+ Aggiungi comune</button>
      </div>

      {errore && <div style={{ fontSize: 12, color: "var(--red)", marginBottom: 12 }}>{errore}</div>}

      {/* Form nuovo/modifica */}
      {editId && (
        <div style={{ background: "var(--white)", border: "1px solid var(--gold)", padding: 16, marginBottom: 16, borderRadius: 12, boxShadow: "var(--shadow)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>{editId === "nuovo" ? "Nuovo comune" : "Modifica " + (form.comune || "")}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {F("comune", "Comune")}
            {F("provincia", "Provincia")}
            {F("regione", "Regione")}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 18 }}>
              <input type="checkbox" checked={!!form.imposta_attiva} onChange={e => setForm(f => ({ ...f, imposta_attiva: e.target.checked }))} id="imp_att" />
              <label htmlFor="imp_att" style={{ fontSize: 12 }}>Imposta di soggiorno attiva</label>
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--gray)" }}>Affidabilità</label>
              <select value={form.confidenza || "media"} onChange={e => setForm(f => ({ ...f, confidenza: e.target.value }))} style={{ marginTop: 4, width: "100%" }}>
                <option value="alta">alta (fonte ufficiale)</option>
                <option value="media">media (da confermare)</option>
                <option value="bassa">bassa (da verificare)</option>
              </select>
            </div>
            {F("aggiornato_il", "Aggiornato il")}
            {F("tariffa", "Tariffa", { full: true, area: true })}
            {F("tetto_notti", "Tetto notti")}
            {F("frequenza", "Frequenza / scadenze", { full: false })}
            {F("esenzioni", "Esenzioni", { full: true, area: true })}
            {F("portale_tassa", "Portale versamento (URL)", { full: true })}
            {F("portale_istat", "Portale ISTAT/flussi", { full: true })}
            {F("regolamento_url", "Regolamento (URL)", { full: true })}
            {F("fonte_url", "Fonte", { full: true })}
            {F("note", "Note", { full: true, area: true })}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button className="bp" onClick={salva} disabled={salvando}>{salvando ? "Salvo…" : "Salva"}</button>
            <button className="bg" onClick={() => setEditId(null)}>Annulla</button>
          </div>
        </div>
      )}

      {/* Elenco schede */}
      {caricando ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--gray)", fontSize: 13 }}>Carico la guida…</div>
      ) : visibili.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", background: "var(--white)", border: "1px solid var(--gl)", borderRadius: 12, boxShadow: "var(--shadow)", fontSize: 13, color: "var(--gray)" }}>
          Nessun comune corrisponde alla ricerca.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
          {visibili.map(r => (
            <div key={r.id} style={{ background: "var(--white)", border: "1px solid var(--gl)", borderRadius: 12, boxShadow: "var(--shadow)", padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{r.comune} <span style={{ fontSize: 11, color: "var(--gray)", fontWeight: 400 }}>{r.provincia}{r.regione ? " · " + r.regione : ""}</span></div>
                </div>
                {r.imposta_attiva
                  ? <span className="tag" style={{ background: "rgba(45,106,79,.12)", color: "#2d6a4f", borderColor: "transparent" }}>imposta attiva</span>
                  : <span className="tag" style={{ background: "rgba(136,136,136,.12)", color: "var(--gray)", borderColor: "transparent" }}>no imposta</span>}
              </div>

              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--black)" }}>{r.tariffa || "—"}</div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 11, color: "var(--gray)" }}>
                <div><span style={{ textTransform: "uppercase", letterSpacing: ".04em", fontSize: 9 }}>Tetto notti</span><br />{r.tetto_notti || "—"}</div>
                <div><span style={{ textTransform: "uppercase", letterSpacing: ".04em", fontSize: 9 }}>Frequenza</span><br />{r.frequenza || "—"}</div>
              </div>

              {r.esenzioni && <div style={{ fontSize: 11, color: "var(--gray)" }}><span style={{ textTransform: "uppercase", letterSpacing: ".04em", fontSize: 9 }}>Esenzioni</span><br />{r.esenzioni}</div>}
              {r.note && <div style={{ fontSize: 11, color: "var(--black)", fontStyle: "italic" }}>{r.note}</div>}

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 2 }}>
                <Link url={r.portale_tassa} label="Portale imposta" />
                <Link url={r.portale_istat} label="ISTAT" />
                <Link url={r.regolamento_url} label="Regolamento" />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, paddingTop: 8, borderTop: "1px solid var(--cd)" }}>
                {badgeConfidenza(r.confidenza)}
                {r.aggiornato_il && <span style={{ fontSize: 10, color: "var(--gray)" }}>agg. {r.aggiornato_il}</span>}
                <div style={{ flex: 1 }} />
                <button className="bg" onClick={() => apriEdit(r)} style={{ fontSize: 11, padding: "4px 8px" }}>✎</button>
                <button className="bd" onClick={() => elimina(r)} style={{ fontSize: 11, padding: "4px 8px" }}>×</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
