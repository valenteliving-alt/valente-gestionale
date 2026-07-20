import { useState, useEffect, useCallback, useMemo, useRef } from "react";

/* Portale agenti: per ogni immobile che gli compete, l'agente vede
   la checklist dei documenti da consegnare e li carica direttamente.
   È la vista che trasforma "mandato firmato" in "pratica completa". */

const MAX_MB = 4;

// Cosa serve dopo la firma del mandato, in ordine di importanza
const RICHIESTI = [
  { id: "mandato", label: "Mandato firmato", match: /\b(mandat|incaric|contratt|procura)\w*/i, nota: "Il contratto di gestione firmato dal proprietario" },
  { id: "identita", label: "Documento d'identità proprietario", match: /\b(carta\s*identit|ci[-_ ]|passaport|patente|identit)\w*/i, nota: "Carta d'identità o passaporto, fronte e retro" },
  { id: "cf", label: "Codice fiscale proprietario", match: /\b(codice\s*fiscale|cod[-_ ]?fisc|cf[-_ ]|tessera\s*sanitaria)\w*/i, nota: "Tessera sanitaria o certificato di attribuzione" },
  { id: "iban", label: "IBAN proprietario", match: /\b(iban|coordinate\s*bancarie|conto\s*corrente)\w*/i, nota: "Dove accreditare i compensi: IBAN intestato al proprietario" },
  { id: "planimetria", label: "Planimetria", match: /\b(planimetr|piantina|layout|disegno)\w*/i, nota: "Piantina dell'immobile, anche catastale" },
  { id: "visura", label: "Visura catastale", match: /\b(visur|catast|rogito|atto)\w*/i, nota: "Visura o atto con i dati catastali" },
  { id: "ape", label: "APE", match: /\b(ape|attestato\s*prestazione|certificazione\s*energetica)\b/i, nota: "Attestato di prestazione energetica", facoltativo: true },
  { id: "foto", label: "Foto dell'immobile", match: /\b(foto|img|image|photo|_dsc|jpg|jpeg|png)\w*/i, nota: "Foto degli ambienti, utili per gli annunci", facoltativo: true },
];

async function fnAllegati(payload) {
  const r = await fetch("/.netlify/functions/allegati", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) throw new Error(d.error || "Errore.");
  return d;
}

export default function PortaleAgente({ proprieta = [], nomeAgente }) {
  const [docs, setDocs] = useState([]);
  const [caricando, setCaricando] = useState(true);
  const [errore, setErrore] = useState("");
  const [aperto, setAperto] = useState(null);      // immobile espanso
  const [inCorso, setInCorso] = useState("");      // etichetta del documento in caricamento
  const fileRef = useRef(null);
  const bersaglio = useRef(null);                  // { propId, tipo }

  const carica = useCallback(async () => {
    setCaricando(true); setErrore("");
    try { const d = await fnAllegati({ action: "list_all" }); setDocs(d.files || []); }
    catch (e) { setErrore(e.message); }
    setCaricando(false);
  }, []);
  useEffect(() => { carica(); }, [carica]);

  const docsDi = useCallback((propId) => docs.filter(d => String(d.proprieta_id) === String(propId)), [docs]);

  // Stato della pratica per un immobile
  const stato = useCallback((p) => {
    const suoi = docsDi(p.id);
    const voci = RICHIESTI.map(r => {
      const trovato = suoi.find(d => r.match.test(d.nome_file || ""));
      return { ...r, ok: !!trovato, file: trovato };
    });
    const obbligatorie = voci.filter(v => !v.facoltativo);
    const fatte = obbligatorie.filter(v => v.ok).length;
    return { voci, fatte, totale: obbligatorie.length, pct: Math.round((fatte / obbligatorie.length) * 100) };
  }, [docsDi]);

  const scegli = (p, tipo) => {
    bersaglio.current = { prop: p, tipo };
    setErrore("");
    setTimeout(() => fileRef.current && fileRef.current.click(), 0);
  };

  const caricaFile = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length || !bersaglio.current) return;
    const { prop, tipo } = bersaglio.current;
    setInCorso(tipo.label);
    for (const file of files) {
      if (file.size > MAX_MB * 1024 * 1024) { setErrore(`"${file.name}" supera ${MAX_MB} MB.`); continue; }
      try {
        const data = await new Promise((res, rej) => {
          const rd = new FileReader();
          rd.onload = () => res(String(rd.result).split(",")[1]);
          rd.onerror = () => rej(new Error("Lettura non riuscita"));
          rd.readAsDataURL(file);
        });
        // Il nome viene prefissato col tipo, così il documento è riconoscibile da tutti
        const nome = `${tipo.id}-${file.name}`;
        const up = await fnAllegati({
          action: "upload", nome_file: nome, tipo: file.type || "application/octet-stream",
          data, proprieta_id: prop.id, caricato_da: nomeAgente,
        });
        if (up && up.file) setDocs(ds => [up.file, ...ds]);
      } catch (e) { setErrore(`${file.name}: ${e.message}`); }
    }
    setInCorso("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const apri = async (d) => {
    try { const r = await fnAllegati({ action: "sign", path: d.path }); window.open(r.url, "_blank", "noopener"); }
    catch (e) { setErrore(e.message); }
  };

  const complessivo = useMemo(() => {
    if (!proprieta.length) return { completi: 0, totale: 0 };
    const s = proprieta.map(stato);
    return { completi: s.filter(x => x.pct === 100).length, totale: proprieta.length };
  }, [proprieta, stato]);

  return (
    <div className="fi">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 6 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700 }}>I miei immobili</h1>
          <p style={{ fontSize: 12, color: "var(--gray)", marginTop: 4 }}>
            Per ogni immobile carica i documenti richiesti: servono a noi per attivare la gestione.
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: complessivo.completi === complessivo.totale && complessivo.totale ? "#2d6a4f" : "var(--gold)" }}>
            {complessivo.completi}/{complessivo.totale}
          </div>
          <div style={{ fontSize: 10, color: "var(--gray)", textTransform: "uppercase", letterSpacing: ".05em" }}>pratiche complete</div>
        </div>
      </div>
      <div className="gl" style={{ marginBottom: 20 }} />

      {errore && <div style={{ fontSize: 12, color: "var(--red)", marginBottom: 12 }}>{errore}</div>}
      {inCorso && <div style={{ fontSize: 12, color: "var(--gold)", fontWeight: 600, marginBottom: 12 }}>Carico “{inCorso}”…</div>}
      <input ref={fileRef} type="file" multiple style={{ display: "none" }} onChange={e => caricaFile(e.target.files)} />

      {caricando ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--gray)", fontSize: 13 }}>Carico i tuoi immobili…</div>
      ) : proprieta.length === 0 ? (
        <div style={{ padding: 50, textAlign: "center", background: "var(--white)", border: "1px solid var(--gl)", borderRadius: 12 }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>🏠</div>
          <div style={{ fontSize: 13, color: "var(--gray)", lineHeight: 1.6 }}>
            Non hai ancora immobili collegati.<br />Appena Valente Living te ne assegna uno, comparirà qui.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {proprieta.map(p => {
            const s = stato(p);
            const espanso = aperto === p.id;
            return (
              <div key={p.id} style={{ background: "var(--white)", border: `1px solid ${s.pct === 100 ? "rgba(45,106,79,.35)" : "var(--gl)"}`, borderRadius: 12, boxShadow: "var(--shadow)", padding: 16 }}>
                <div onClick={() => setAperto(espanso ? null : p.id)} style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{p.nome}</div>
                    <div style={{ fontSize: 11, color: "var(--gray)", marginTop: 2 }}>
                      {[p.indirizzo, p.citta, p.provincia && `(${p.provincia})`].filter(Boolean).join(", ")}
                    </div>
                  </div>
                  <div style={{ flex: "0 0 160px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--gray)", marginBottom: 3 }}>
                      <span>{s.fatte}/{s.totale} documenti</span>
                      <span style={{ fontWeight: 700, color: s.pct === 100 ? "#2d6a4f" : s.pct >= 50 ? "var(--gold)" : "var(--red)" }}>{s.pct}%</span>
                    </div>
                    <div style={{ height: 6, background: "var(--cd)", borderRadius: 99, overflow: "hidden" }}>
                      <div style={{ width: `${s.pct}%`, height: "100%", borderRadius: 99, background: s.pct === 100 ? "#2d6a4f" : s.pct >= 50 ? "var(--gold)" : "var(--red)", transition: "width .3s" }} />
                    </div>
                  </div>
                  <span style={{ fontSize: 13, color: "var(--gray)" }}>{espanso ? "−" : "+"}</span>
                </div>

                {espanso && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--cd)" }}>
                    {s.voci.map(v => (
                      <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--cd)", flexWrap: "wrap" }}>
                        <span style={{ fontSize: 15, width: 20, flexShrink: 0 }}>{v.ok ? "✅" : v.facoltativo ? "○" : "⬜️"}</span>
                        <div style={{ flex: "1 1 180px", minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: v.ok ? 400 : 600, color: v.ok ? "var(--gray)" : "var(--black)" }}>
                            {v.label} {v.facoltativo && <span style={{ fontSize: 10, color: "var(--gray)", fontWeight: 400 }}>· facoltativo</span>}
                          </div>
                          <div style={{ fontSize: 10.5, color: "var(--gray)" }}>{v.ok ? v.file.nome_file : v.nota}</div>
                        </div>
                        {v.ok
                          ? <button className="bg" onClick={() => apri(v.file)} style={{ fontSize: 10.5, padding: "4px 9px" }}>Apri</button>
                          : null}
                        <button className={v.ok ? "bg" : "bp"} onClick={() => scegli(p, v)} style={{ fontSize: 10.5, padding: "4px 10px" }}>
                          {v.ok ? "Sostituisci" : "Carica"}
                        </button>
                      </div>
                    ))}
                    <p style={{ fontSize: 10.5, color: "var(--gray)", marginTop: 10, lineHeight: 1.6 }}>
                      Formati accettati: PDF, immagini, Word, Excel — massimo {MAX_MB} MB per file. Puoi caricarne più d'uno alla volta.
                      I documenti arrivano direttamente al property manager che segue l'immobile.
                    </p>
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
