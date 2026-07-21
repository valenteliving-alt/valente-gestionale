import { useState, useEffect, useCallback, useMemo } from "react";

/* Vista Compliance: fascicolo burocratico per immobile.
   Controlla i CODICI (CIN, CIR, SCIA) e i DOCUMENTI presenti negli allegati
   (mandato, visura, planimetria, documento identità del proprietario, certificato CIN).
   Pensata per essere il punto di lavoro di un'assistente amministrativa. */

const CIN_RE = /^IT[0-9A-Z]{16}$/;

// Riconoscimento documenti dal nome file (coerente con lo Smistamento).
// plus: true = facoltativo, non conta nel completamento (per chi vuole essere pignolo)
const DOC_CHECKS = [
  { id: "mandato", label: "Mandato / Contratto", match: /\b(mandat|incaric|contratt|procura)\w*/i },
  { id: "identita", label: "Doc. identità proprietario", match: /\b(carta\s*identit|ci\b|passaport|patente|codice\s*fiscale|cf\b|tessera|anagraf|identit)\w*/i, owner: true },
  { id: "visura", label: "Visura / Catasto", match: /\b(visur|catast|atto|rogito|ape)\w*/i, plus: true },
  { id: "planimetria", label: "Planimetria", match: /\b(planimetr|piantina|layout)\w*/i, plus: true },
  { id: "cin_doc", label: "Certificato CIN/CIR", match: /\b(cin|cir|codice\s*identificativo|bdsr)\b/i, plus: true },
];

const SCIA_OPZIONI = ["", "da fare", "inviata", "fatta", "non richiesta"];
const sciaOk = (s) => s === "fatta" || s === "non richiesta";

export default function Compliance({ proprieta = [], owners = [], onPatch, onDataChanged }) {
  const [docs, setDocs] = useState([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [filtro, setFiltro] = useState("attivi"); // attivi | tutti
  const [search, setSearch] = useState("");
  const [editId, setEditId] = useState(null);
  const [editVal, setEditVal] = useState({ cin: "", cir: "", scia_stato: "", scia_note: "" });
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");

  const caricaDocs = useCallback(async () => {
    setDocsLoading(true);
    try {
      // Il token dice alla funzione chi sta chiedendo: l'elenco arriva già filtrato per ruolo
      let token = null;
      try { token = (JSON.parse(localStorage.getItem("vl_sessione") || "null") || {}).access_token || null; } catch { /* sessione assente */ }
      const r = await fetch("/.netlify/functions/allegati", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list_all", token }),
      });
      const d = await r.json();
      setDocs(d.files || []);
    } catch { setDocs([]); }
    setDocsLoading(false);
  }, []);
  useEffect(() => { caricaDocs(); }, [caricaDocs]);

  // Documenti per proprietà e per proprietario
  const docsByProp = useMemo(() => {
    const m = {};
    docs.forEach(d => { if (d.proprieta_id) (m[String(d.proprieta_id)] = m[String(d.proprieta_id)] || []).push(d); });
    return m;
  }, [docs]);
  const docsByOwner = useMemo(() => {
    const m = {};
    docs.forEach(d => { if (d.proprietario_id) (m[String(d.proprietario_id)] = m[String(d.proprietario_id)] || []).push(d); });
    return m;
  }, [docs]);

  // Stato compliance di una proprietà: codici + documenti
  const analizza = useCallback((p) => {
    const cin = String(p.cin || "").trim();
    const cir = String(p.cir || "").trim();
    const checks = [];
    checks.push({ id: "cin", label: "CIN", ok: !!cin && CIN_RE.test(cin.toUpperCase()), warn: !!cin && !CIN_RE.test(cin.toUpperCase()), detail: cin ? (CIN_RE.test(cin.toUpperCase()) ? cin : `"${cin}" non è un CIN (formato IT + 16 caratteri) — forse è il CIR?`) : "mancante" });
    checks.push({ id: "cir", label: "CIR", ok: !!cir, detail: cir || "mancante" });
    checks.push({ id: "scia", label: "SCIA / Comunicazione", ok: sciaOk(p.scia_stato), warn: p.scia_stato === "inviata", detail: p.scia_stato ? p.scia_stato + (p.scia_note ? ` — ${p.scia_note}` : "") : "non tracciata" });

    const propDocs = docsByProp[String(p.id)] || [];
    const ownerDocs = docsByOwner[String(p.proprietario_id)] || [];
    const plus = [];
    DOC_CHECKS.forEach(c => {
      const pool = c.owner ? [...propDocs, ...ownerDocs] : propDocs;
      const trovato = pool.find(d => c.match.test(d.nome_file || ""));
      const check = { id: c.id, label: c.label, ok: !!trovato, doc: trovato, detail: trovato ? trovato.nome_file : "non trovato negli allegati" };
      if (c.plus) plus.push(check); else checks.push(check);
    });

    // Il completamento conta SOLO gli obbligatori; i "plus" sono facoltativi
    const fatti = checks.filter(c => c.ok).length;
    return { checks, plus, fatti, totale: checks.length, pct: Math.round((fatti / checks.length) * 100) };
  }, [docsByProp, docsByOwner]);

  const attivo = (p) => String(p.stato || "").toLowerCase().startsWith("attiv");

  const lista = useMemo(() => {
    const q = search.trim().toLowerCase();
    return proprieta
      .filter(p => filtro === "tutti" || attivo(p))
      .filter(p => !q || [p.nome, p.citta, p.cin, p.cir].filter(Boolean).join(" ").toLowerCase().includes(q))
      .map(p => ({ p, a: analizza(p) }))
      .sort((x, y) => x.a.pct - y.a.pct || String(x.p.nome).localeCompare(String(y.p.nome)));
  }, [proprieta, filtro, search, analizza]);

  const totali = useMemo(() => {
    const base = proprieta.filter(p => filtro === "tutti" || attivo(p)).map(analizza);
    return { completi: base.filter(a => a.pct === 100).length, totale: base.length };
  }, [proprieta, filtro, analizza]);

  const apriEdit = (p) => {
    setEditId(p.id);
    setEditVal({ cin: p.cin || "", cir: p.cir || "", scia_stato: p.scia_stato || "", scia_note: p.scia_note || "" });
    setMsg("");
  };

  const salva = async () => {
    setSalvando(true); setMsg("");
    try {
      const { ok } = await onPatch(editId, {
        cin: editVal.cin.trim() || null,
        cir: editVal.cir.trim() || null,
        scia_stato: editVal.scia_stato || null,
        scia_note: editVal.scia_note.trim() || null,
      });
      if (!ok) throw new Error("Salvataggio fallito.");
      setEditId(null);
      onDataChanged && onDataChanged();
    } catch (e) { setMsg(e.message); }
    setSalvando(false);
  };

  const Icona = ({ c }) => (
    <span title={c.detail} style={{ fontSize: 13, cursor: "help" }}>{c.ok ? "✅" : c.warn ? "⚠️" : "❌"}</span>
  );

  return (
    <div className="fi">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 6 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700 }}>Compliance</h1>
          <p style={{ fontSize: 12, color: "var(--gray)", marginTop: 4 }}>
            Fascicolo burocratico per immobile: codici (CIN, CIR, SCIA) e documenti chiave negli allegati.
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 26, fontFamily: "Inter", fontWeight: 700, color: totali.completi === totali.totale ? "#2d6a4f" : "var(--gold)" }}>
            {totali.completi}/{totali.totale}
          </div>
          <div style={{ fontSize: 10, color: "var(--gray)", textTransform: "uppercase", letterSpacing: ".05em" }}>fascicoli completi</div>
        </div>
      </div>
      <div className="gl" style={{ marginBottom: 20 }} />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca immobile, città, codice…" style={{ flex: "1 1 220px", maxWidth: 340 }} />
        <div style={{ display: "flex", border: "1px solid var(--gl)", borderRadius: 10, overflow: "hidden" }}>
          {[["attivi", "Solo attivi"], ["tutti", "Tutti"]].map(([v, l]) => (
            <button key={v} onClick={() => setFiltro(v)} style={{ background: filtro === v ? "var(--black)" : "transparent", color: filtro === v ? "var(--white)" : "var(--gray)", border: "none", padding: "8px 14px", fontSize: 11, fontWeight: 500, borderRadius: 0 }}>{l}</button>
          ))}
        </div>
        <button className="bg" onClick={caricaDocs}>↻ Aggiorna documenti</button>
        {docsLoading && <span style={{ fontSize: 11, color: "var(--gray)" }}>Leggo gli allegati…</span>}
      </div>

      {msg && <div style={{ fontSize: 12, color: "var(--red)", marginBottom: 10 }}>{msg}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {lista.map(({ p, a }) => {
          const inEdit = editId === p.id;
          const owner = owners.find(o => o.id === p.proprietario_id);
          return (
            <div key={p.id} style={{ background: "var(--white)", border: `1px solid ${a.pct === 100 ? "rgba(45,106,79,.35)" : "var(--gl)"}`, borderRadius: 12, boxShadow: "var(--shadow)", padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{p.nome}</div>
                  <div style={{ fontSize: 11, color: "var(--gray)", marginTop: 2 }}>
                    {p.citta}{p.provincia ? ` (${p.provincia})` : ""} · {p.stato || "—"}{owner ? ` · ${owner.cognome || ""} ${owner.nome || ""}` : ""}
                  </div>
                </div>
                {/* Barra completamento */}
                <div style={{ flex: "0 0 150px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--gray)", marginBottom: 3 }}>
                    <span>{a.fatti}/{a.totale}</span><span style={{ fontWeight: 700, color: a.pct === 100 ? "#2d6a4f" : a.pct >= 50 ? "var(--gold)" : "var(--red)" }}>{a.pct}%</span>
                  </div>
                  <div style={{ height: 6, background: "var(--cd)", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ width: `${a.pct}%`, height: "100%", borderRadius: 99, background: a.pct === 100 ? "#2d6a4f" : a.pct >= 50 ? "var(--gold)" : "var(--red)", transition: "width .3s" }} />
                  </div>
                </div>
                <button className="bg" onClick={() => inEdit ? setEditId(null) : apriEdit(p)} style={{ fontSize: 11, padding: "6px 10px" }}>{inEdit ? "Chiudi" : "✎ Codici"}</button>
              </div>

              {/* Checklist obbligatori */}
              <div style={{ display: "flex", gap: "6px 16px", flexWrap: "wrap", marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--cd)" }}>
                {a.checks.map(c => (
                  <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: c.ok ? "var(--black)" : "var(--gray)" }} title={c.detail}>
                    <Icona c={c} /> {c.label}
                  </div>
                ))}
              </div>
              {/* Plus facoltativi: non contano nel completamento */}
              <div style={{ display: "flex", gap: "4px 14px", flexWrap: "wrap", marginTop: 6, alignItems: "center" }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "#A2ACBD" }}>Plus</span>
                {a.plus.map(c => (
                  <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: c.ok ? "#475569" : "#A2ACBD" }} title={c.detail + " (facoltativo, non conta nel completamento)"}>
                    <span style={{ fontSize: 11 }}>{c.ok ? "✓" : "·"}</span> {c.label}
                  </div>
                ))}
              </div>

              {inEdit && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--cd)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--gray)" }}>CIN (IT + 16 caratteri)</label>
                    <input value={editVal.cin} onChange={e => setEditVal(v => ({ ...v, cin: e.target.value.toUpperCase() }))} placeholder="IT…" style={{ marginTop: 4 }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--gray)" }}>CIR (codice regionale)</label>
                    <input value={editVal.cir} onChange={e => setEditVal(v => ({ ...v, cir: e.target.value }))} style={{ marginTop: 4 }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--gray)" }}>SCIA / Comunicazione</label>
                    <select value={editVal.scia_stato} onChange={e => setEditVal(v => ({ ...v, scia_stato: e.target.value }))} style={{ marginTop: 4 }}>
                      {SCIA_OPZIONI.map(o => <option key={o} value={o}>{o || "— non tracciata —"}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--gray)" }}>Nota SCIA (protocollo, data…)</label>
                    <input value={editVal.scia_note} onChange={e => setEditVal(v => ({ ...v, scia_note: e.target.value }))} style={{ marginTop: 4 }} />
                  </div>
                  <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8 }}>
                    <button className="bp" onClick={salva} disabled={salvando}>{salvando ? "Salvo…" : "Salva"}</button>
                    <button className="bg" onClick={() => setEditId(null)}>Annulla</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 16, fontSize: 10.5, color: "var(--gray)", lineHeight: 1.5 }}>
        I documenti vengono riconosciuti dal nome del file negli allegati dell'immobile (il documento d'identità anche tra gli allegati del proprietario).
        Se un documento c'è ma non viene riconosciuto, rinomina il file in modo chiaro (es. "Mandato Rossi 2026.pdf") oppure passa il mouse sull'icona per i dettagli.
      </div>
    </div>
  );
}
