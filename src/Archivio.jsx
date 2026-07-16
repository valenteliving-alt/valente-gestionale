import { useState, useEffect, useCallback, useRef, useMemo } from "react";

const CATEGORIE = [
  "Generale",
  "Contratti & Mandati",
  "Fatture & Contabilità",
  "Fisco & Tasse",
  "Compliance / CIN-CIR",
  "Assicurazioni",
  "Utenze",
  "Fornitori",
  "Personale & HR",
  "Legale",
  "Banche",
  "Manuali & Procedure",
  "Marketing",
  "Altro",
];

const MAX_MB = 4;

function fmtData(s) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return "—"; }
}

function icona(nome, tipo) {
  const n = (nome || "").toLowerCase();
  const t = (tipo || "").toLowerCase();
  if (t.includes("pdf") || n.endsWith(".pdf")) return "📕";
  if (t.startsWith("image/") || /\.(jpe?g|png|heic|webp|gif)$/.test(n)) return "🖼️";
  if (/\.(xlsx?|csv|numbers)$/.test(n) || t.includes("sheet")) return "📊";
  if (/\.(docx?|pages)$/.test(n) || t.includes("word")) return "📄";
  if (/\.(zip|rar|7z)$/.test(n)) return "🗜️";
  if (/\.(p7m)$/.test(n)) return "🔏";
  return "📎";
}

async function fnAllegati(payload) {
  const r = await fetch("/.netlify/functions/allegati", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) throw new Error(d.error || "Errore.");
  return d;
}

export default function Archivio({ proprieta = [], owners = [] }) {
  const [docs, setDocs] = useState([]);
  const [caricando, setCaricando] = useState(true);
  const [errore, setErrore] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [inCorso, setInCorso] = useState([]);
  const [search, setSearch] = useState("");
  const [fCat, setFCat] = useState("");
  const [fAmbito, setFAmbito] = useState("archivio"); // archivio | tutti
  const [catNuova, setCatNuova] = useState("Generale");
  const [tagsNuovi, setTagsNuovi] = useState("");
  const [noteNuove, setNoteNuove] = useState("");
  const [editId, setEditId] = useState(null);
  const [editVal, setEditVal] = useState({ categoria: "", tags: "", note: "" });
  const [descrivendo, setDescrivendo] = useState(null); // { fatti, totale } durante la descrizione automatica
  const fileRef = useRef(null);
  const backfillFatto = useRef(false);

  const mappaProp = useMemo(() => Object.fromEntries(proprieta.map(p => [String(p.id), p.nome])), [proprieta]);
  const mappaOwn = useMemo(() => Object.fromEntries(owners.map(o => [String(o.id), `${o.nome || ""} ${o.cognome || ""}`.trim()])), [owners]);

  const carica = useCallback(async () => {
    setCaricando(true); setErrore("");
    try {
      const d = await fnAllegati({ action: "list_all" });
      setDocs(d.files || []);
    } catch (e) { setErrore(e.message); }
    setCaricando(false);
  }, []);

  useEffect(() => { carica(); }, [carica]);

  // Un documento è descrivibile dall'AI solo se è PDF o immagine
  const descrivibile = (d) => {
    const n = (d.nome_file || "").toLowerCase(); const t = (d.tipo || "").toLowerCase();
    return t.includes("pdf") || n.endsWith(".pdf") || t.startsWith("image/") || /\.(jpe?g|png|webp|gif|heic)$/.test(n);
  };

  // Genera la descrizione AI di un singolo documento e aggiorna la lista
  const descrivi = useCallback(async (d, data) => {
    try {
      const res = await fnAllegati({ action: "describe", id: d.id, path: d.path, tipo: d.tipo, nome_file: d.nome_file, data });
      if (res && res.file) setDocs(ds => ds.map(x => x.id === d.id ? { ...x, ...res.file } : x));
    } catch { /* silenzioso: non blocca l'uso dell'archivio */ }
  }, []);

  // Elabora in sequenza i documenti ancora senza descrizione
  const descriviMancanti = useCallback(async (lista, includiErrori = false) => {
    const daFare = lista.filter(d => includiErrori ? (d.ai_stato !== "ok" && d.ai_stato !== "skip") : !d.ai_stato);
    if (!daFare.length) return;
    setDescrivendo({ fatti: 0, totale: daFare.length });
    for (let i = 0; i < daFare.length; i++) {
      await descrivi(daFare[i]);
      setDescrivendo({ fatti: i + 1, totale: daFare.length });
    }
    setDescrivendo(null);
  }, [descrivi]);

  // Backfill automatico una volta per sessione: descrive i documenti già presenti
  useEffect(() => {
    if (caricando || backfillFatto.current || descrivendo) return;
    if (docs.some(d => !d.ai_stato)) {
      backfillFatto.current = true;
      descriviMancanti(docs, false);
    }
  }, [docs, caricando, descrivendo, descriviMancanti]);

  const aggiungiFiles = async (fileList) => {
    const tutti = Array.from(fileList || []);
    if (!tutti.length) return;
    setErrore("");
    const grandi = tutti.filter(f => f.size > MAX_MB * 1024 * 1024).map(f => f.name);
    if (grandi.length) setErrore(`Saltati perché oltre ${MAX_MB} MB: ` + grandi.join(", "));
    const validi = tutti.filter(f => f.size <= MAX_MB * 1024 * 1024);
    setInCorso(validi.map(f => f.name));

    for (const file of validi) {
      try {
        const data = await new Promise((res, rej) => {
          const rd = new FileReader();
          rd.onload = () => res(String(rd.result).split(",")[1]);
          rd.onerror = () => rej(new Error("Lettura file non riuscita"));
          rd.readAsDataURL(file);
        });
        const up = await fnAllegati({
          action: "upload",
          nome_file: file.name,
          tipo: file.type || "application/octet-stream",
          data,
          categoria: catNuova,
          tags: tagsNuovi,
          note: noteNuove,
        });
        // Descrizione automatica subito dopo il caricamento (riusa i dati già in memoria)
        if (up && up.file) { await descrivi(up.file, data); }
      } catch (e) {
        setErrore(prev => (prev ? prev + " · " : "") + `${file.name}: ${e.message}`);
      }
      setInCorso(c => c.filter(n => n !== file.name));
    }
    setTagsNuovi(""); setNoteNuove("");
    if (fileRef.current) fileRef.current.value = "";
    carica();
  };

  const apri = async (d) => {
    try {
      const r = await fnAllegati({ action: "sign", path: d.path });
      window.open(r.url, "_blank", "noopener");
    } catch (e) { setErrore(e.message); }
  };

  const elimina = async (d) => {
    if (!window.confirm(`Eliminare definitivamente "${d.nome_file}"?`)) return;
    try {
      await fnAllegati({ action: "delete", id: d.id, path: d.path });
      setDocs(ds => ds.filter(x => x.id !== d.id));
    } catch (e) { setErrore(e.message); }
  };

  const salvaEdit = async (d) => {
    try {
      await fnAllegati({ action: "update", id: d.id, categoria: editVal.categoria, tags: editVal.tags, note: editVal.note });
      setDocs(ds => ds.map(x => x.id === d.id ? { ...x, ...editVal } : x));
      setEditId(null);
    } catch (e) { setErrore(e.message); }
  };

  const collegamento = (d) => {
    if (d.proprieta_id) return { label: mappaProp[String(d.proprieta_id)] || "Proprietà", tipo: "prop" };
    if (d.proprietario_id) return { label: mappaOwn[String(d.proprietario_id)] || "Proprietario", tipo: "own" };
    return null;
  };

  const visibili = useMemo(() => {
    const q = search.trim().toLowerCase();
    return docs.filter(d => {
      if (fAmbito === "archivio" && (d.proprieta_id || d.proprietario_id)) return false;
      if (fCat && (d.categoria || "Generale") !== fCat) return false;
      if (!q) return true;
      const c = collegamento(d);
      const blob = [d.nome_file, d.categoria, d.tags, d.note, d.ai_descrizione, c && c.label].filter(Boolean).join(" ").toLowerCase();
      return blob.includes(q);
    });
  }, [docs, search, fCat, fAmbito, mappaProp, mappaOwn]);

  const conteggi = useMemo(() => {
    const base = docs.filter(d => fAmbito === "tutti" || (!d.proprieta_id && !d.proprietario_id));
    const m = {};
    base.forEach(d => { const c = d.categoria || "Generale"; m[c] = (m[c] || 0) + 1; });
    return m;
  }, [docs, fAmbito]);

  return (
    <div className="fi">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 6 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700 }}>Archivio</h1>
          <p style={{ fontSize: 12, color: "var(--gray)", marginTop: 4 }}>
            Tutto quello che non sta sotto una singola proprietà: contratti quadro, fatture fornitori, F24, procedure, polizze.
          </p>
        </div>
        <div style={{ fontSize: 11, color: "var(--gray)", letterSpacing: ".05em", textTransform: "uppercase" }}>
          {visibili.length} document{visibili.length === 1 ? "o" : "i"}
        </div>
      </div>
      <div className="gl" style={{ marginBottom: 20 }} />

      {/* Zona di caricamento */}
      <div style={{ background: "var(--white)", border: "1px solid var(--gl)", padding: 18, marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--gray)" }}>Categoria</label>
            <select value={catNuova} onChange={e => setCatNuova(e.target.value)} style={{ marginTop: 4 }}>
              {CATEGORIE.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--gray)" }}>Tag (separati da virgola)</label>
            <input value={tagsNuovi} onChange={e => setTagsNuovi(e.target.value)} placeholder="es. 2026, Pistoia, Enel" style={{ marginTop: 4 }} />
          </div>
        </div>
        <input value={noteNuove} onChange={e => setNoteNuove(e.target.value)} placeholder="Nota facoltativa (a cosa serve questo documento)" style={{ marginBottom: 12 }} />

        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); aggiungiFiles(e.dataTransfer.files); }}
          onClick={() => fileRef.current && fileRef.current.click()}
          style={{
            border: `2px dashed ${dragOver ? "var(--gold)" : "var(--gl)"}`,
            background: dragOver ? "rgba(214,156,49,.06)" : "var(--cream)",
            padding: "34px 20px", textAlign: "center", cursor: "pointer", transition: "all .2s",
          }}
        >
          <div style={{ fontSize: 30, marginBottom: 8 }}>📥</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Trascina qui i file, o clicca per sceglierli</div>
          <div style={{ fontSize: 11, color: "var(--gray)", marginTop: 6 }}>
            PDF, immagini, Excel, Word, .p7m — massimo {MAX_MB} MB per file. Vengono salvati con categoria e tag qui sopra.
          </div>
        </div>
        <input ref={fileRef} type="file" multiple onChange={e => aggiungiFiles(e.target.files)} style={{ display: "none" }} />

        {inCorso.length > 0 && (
          <div style={{ marginTop: 12, fontSize: 12, color: "var(--gold)", fontWeight: 500 }}>
            Caricamento in corso: {inCorso.join(", ")}…
          </div>
        )}
        {errore && (
          <div style={{ marginTop: 12, fontSize: 12, color: "var(--red)" }}>{errore}</div>
        )}
      </div>

      {/* Filtri */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Cerca per nome, tag, nota, proprietà…"
          style={{ flex: "1 1 240px", maxWidth: 380 }}
        />
        <select value={fCat} onChange={e => setFCat(e.target.value)} style={{ width: "auto", minWidth: 180 }}>
          <option value="">Tutte le categorie</option>
          {CATEGORIE.map(c => <option key={c} value={c}>{c}{conteggi[c] ? ` (${conteggi[c]})` : ""}</option>)}
        </select>
        <div style={{ display: "flex", border: "1px solid var(--gl)" }}>
          {[["archivio", "Solo archivio generale"], ["tutti", "Tutti i documenti del CRM"]].map(([v, l]) => (
            <button key={v} onClick={() => setFAmbito(v)} style={{
              background: fAmbito === v ? "var(--black)" : "transparent",
              color: fAmbito === v ? "var(--white)" : "var(--gray)",
              border: "none", padding: "8px 14px", fontSize: 11, fontWeight: 500,
            }}>{l}</button>
          ))}
        </div>
        <button className="bg" onClick={carica}>↻ Aggiorna</button>
        {descrivendo ? (
          <span style={{ fontSize: 11, color: "var(--gold)", fontWeight: 600 }}>
            ✨ Descrivo i documenti… {descrivendo.fatti}/{descrivendo.totale}
          </span>
        ) : (() => {
          const mancanti = docs.filter(d => descrivibile(d) && d.ai_stato !== "ok" && d.ai_stato !== "skip").length;
          if (!mancanti) return null;
          return <button className="bg" onClick={() => descriviMancanti(docs, true)} title="Genera la descrizione AI per i documenti che ancora non ce l'hanno">✨ Descrivi i mancanti ({mancanti})</button>;
        })()}
      </div>

      {/* Lista */}
      {caricando ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--gray)", fontSize: 13 }}>Carico l'archivio…</div>
      ) : visibili.length === 0 ? (
        <div style={{ padding: 50, textAlign: "center", background: "var(--white)", border: "1px solid var(--gl)" }}>
          <div style={{ fontSize: 26, marginBottom: 8 }}>🗂️</div>
          <div style={{ fontSize: 13, color: "var(--gray)" }}>
            {search || fCat ? "Nessun documento corrisponde ai filtri." : "L'archivio è vuoto. Trascina il primo file qui sopra."}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {visibili.map(d => {
            const c = collegamento(d);
            const inEdit = editId === d.id;
            return (
              <div key={d.id} style={{ background: "var(--white)", border: "1px solid var(--gl)", padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 20 }}>{icona(d.nome_file, d.tipo)}</div>
                  <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.nome_file}</div>
                    <div style={{ fontSize: 11, color: "var(--gray)", marginTop: 3, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <span>{fmtData(d.created_at)}</span>
                      <span className="tag">{d.categoria || "Generale"}</span>
                      {c && <span className="tag" style={{ background: "rgba(214,156,49,.15)", color: "var(--gold)", borderColor: "rgba(214,156,49,.3)" }}>{c.tipo === "prop" ? "🏠" : "👤"} {c.label}</span>}
                      {(d.tags || "").split(",").map(t => t.trim()).filter(Boolean).map(t => <span key={t} className="tag">#{t}</span>)}
                    </div>
                    {d.ai_descrizione && <div style={{ fontSize: 11, color: "var(--black)", marginTop: 4 }}><span title="Descrizione generata dall'AI" style={{ color: "var(--gold)" }}>✨</span> {d.ai_descrizione}</div>}
                    {d.ai_stato === "errore" && !d.ai_descrizione && <div style={{ fontSize: 10, color: "var(--gray)", marginTop: 4 }}>Descrizione automatica non riuscita — riprova con "Descrivi i mancanti".</div>}
                    {d.note && <div style={{ fontSize: 11, color: "var(--gray)", marginTop: 4, fontStyle: "italic" }}>{d.note}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="bg" onClick={() => apri(d)}>Apri</button>
                    <button className="bg" onClick={() => { setEditId(inEdit ? null : d.id); setEditVal({ categoria: d.categoria || "Generale", tags: d.tags || "", note: d.note || "" }); }}>✎</button>
                    <button className="bd" onClick={() => elimina(d)}>×</button>
                  </div>
                </div>

                {inEdit && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--cd)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <select value={editVal.categoria} onChange={e => setEditVal(v => ({ ...v, categoria: e.target.value }))}>
                      {CATEGORIE.map(x => <option key={x} value={x}>{x}</option>)}
                    </select>
                    <input value={editVal.tags} onChange={e => setEditVal(v => ({ ...v, tags: e.target.value }))} placeholder="Tag separati da virgola" />
                    <input value={editVal.note} onChange={e => setEditVal(v => ({ ...v, note: e.target.value }))} placeholder="Nota" style={{ gridColumn: "1 / -1" }} />
                    <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8 }}>
                      <button className="bp" onClick={() => salvaEdit(d)}>Salva</button>
                      <button className="bg" onClick={() => setEditId(null)}>Annulla</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
