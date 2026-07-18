import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from "react";

/* Adempimenti ricorrenti: archivio organizzato per periodo.
   Ogni adempimento ha una griglia di caselle (trimestri/mesi/anno): casella piena = documento archiviato,
   casella vuota = buco da colmare. Clic sulla casella per caricare o consultare.
   Pensato per contabile / compliance manager: a fine anno il fascicolo è già pronto. */

const MAX_MB = 4;
const MESI = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

// Periodi in base alla cadenza
function periodiPer(cadenza) {
  if (cadenza === "mensile") return MESI.map((m, i) => ({ k: "M" + String(i + 1).padStart(2, "0"), label: m }));
  if (cadenza === "quadrimestrale") return [{ k: "Q1", label: "Q1" }, { k: "Q2", label: "Q2" }, { k: "Q3", label: "Q3" }];
  if (cadenza === "annuale") return [{ k: "ANNO", label: "Anno" }];
  return [{ k: "T1", label: "T1" }, { k: "T2", label: "T2" }, { k: "T3", label: "T3" }, { k: "T4", label: "T4" }];
}

const norm = (s) => String(s || "").toLowerCase().trim();

async function fnAllegati(payload) {
  const r = await fetch("/.netlify/functions/allegati", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) throw new Error(d.error || "Errore.");
  return d;
}

export default function Ricorrenti({ proprieta = [], owners = [] }) {
  const [docs, setDocs] = useState([]);
  const [regole, setRegole] = useState([]);
  const [caricando, setCaricando] = useState(true);
  const [anno, setAnno] = useState(new Date().getFullYear());
  const [slot, setSlot] = useState(null); // { tipo, periodo, ambito, ambitoId, label } casella selezionata
  const [uploading, setUploading] = useState(false);
  const [errore, setErrore] = useState("");
  const fileRef = useRef(null);

  const carica = useCallback(async () => {
    setCaricando(true); setErrore("");
    try {
      const [d, g] = await Promise.all([
        fnAllegati({ action: "list_all" }),
        fetch("/.netlify/functions/guida", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "list" }) }).then(r => r.json()).catch(() => ({ righe: [] })),
      ]);
      setDocs(d.files || []);
      setRegole(g.righe || []);
    } catch (e) { setErrore(e.message); }
    setCaricando(false);
  }, []);
  useEffect(() => { carica(); }, [carica]);

  // Comuni con almeno un immobile attivo (match su nome comune o alias della guida)
  const comuniAttivi = useMemo(() => {
    const attive = proprieta.filter(p => norm(p.stato).startsWith("attiv"));
    const trovati = new Map();
    attive.forEach(p => {
      const c = norm(p.citta);
      if (!c) return;
      const reg = regole.find(r => norm(r.comune) === c || String(r.alias || "").split(",").map(norm).includes(c));
      const nome = reg ? reg.comune : (p.citta || "").trim();
      if (!trovati.has(nome)) trovati.set(nome, { comune: nome, regola: reg || null, n: 0 });
      trovati.get(nome).n++;
    });
    return [...trovati.values()].sort((a, b) => a.comune.localeCompare(b.comune));
  }, [proprieta, regole]);

  // Proprietari con almeno un immobile (per le CU)
  const ownersConImmobili = useMemo(() => {
    const conProp = new Set(proprieta.map(p => String(p.proprietario_id)).filter(Boolean));
    return owners.filter(o => conProp.has(String(o.id)))
      .sort((a, b) => (a.cognome || "").localeCompare(b.cognome || ""));
  }, [owners, proprieta]);

  // Documenti indicizzati per tipo|anno|periodo|ambito
  const idx = useMemo(() => {
    const m = {};
    docs.forEach(d => {
      if (!d.ric_tipo || !d.ric_anno) return;
      const k = [d.ric_tipo, d.ric_anno, d.ric_periodo || "", norm(d.ric_ambito)].join("|");
      (m[k] = m[k] || []).push(d);
    });
    return m;
  }, [docs]);

  const docsSlot = (tipo, periodo, ambito) => idx[[tipo, anno, periodo, norm(ambito)].join("|")] || [];

  // Sezioni della griglia
  const sezioni = useMemo(() => ([
    {
      tipo: "imposta_soggiorno", icona: "🏛️", titolo: "Imposta di soggiorno",
      sotto: "Ricevute di dichiarazione/versamento per comune — cadenza dalla Guida",
      righe: comuniAttivi.filter(c => !c.regola || c.regola.imposta_attiva !== false).map(c => ({
        id: c.comune, label: c.comune, extra: `${c.n} immobil${c.n === 1 ? "e" : "i"}`,
        periodi: periodiPer(c.regola ? c.regola.cadenza_tipo : "trimestrale"),
      })),
    },
    {
      tipo: "istat", icona: "📊", titolo: "Comunicazioni ISTAT / flussi",
      sotto: "Ricevute di trasmissione presenze per comune — mensile",
      righe: comuniAttivi.map(c => ({ id: c.comune, label: c.comune, extra: `${c.n} immobil${c.n === 1 ? "e" : "i"}`, periodi: periodiPer("mensile") })),
    },
    {
      tipo: "cu", icona: "📄", titolo: "Certificazioni Uniche",
      sotto: "CU per proprietario — annuale (redditi anno precedente)",
      righe: ownersConImmobili.map(o => ({ id: String(o.id), label: `${o.cognome || ""} ${o.nome || ""}`.trim() || "—", ownerId: o.id, periodi: periodiPer("annuale") })),
    },
    {
      tipo: "altro", icona: "🗂️", titolo: "Altri ricorrenti",
      sotto: "Dichiarazione annuale imposta di soggiorno (30/06), liquidazioni IVA, F24 periodici…",
      righe: [
        { id: "dich_annuale_ids", label: "Dich. annuale imposta soggiorno (AdE)", periodi: periodiPer("annuale") },
        { id: "iva", label: "Liquidazioni IVA", periodi: periodiPer("trimestrale") },
        { id: "f24", label: "F24 periodici", periodi: periodiPer("mensile") },
      ],
    },
  ]), [comuniAttivi, ownersConImmobili]);

  // Avanzamento per sezione (caselle piene / totali) — i mesi/periodi futuri non contano
  const oggi = new Date();
  const periodoPassato = (k) => {
    if (anno < oggi.getFullYear()) return true;
    if (anno > oggi.getFullYear()) return false;
    const m = oggi.getMonth() + 1; // 1-12
    if (k === "ANNO") return true;
    if (k.startsWith("M")) return parseInt(k.slice(1)) < m;
    if (k.startsWith("T")) return parseInt(k.slice(1)) * 3 < m;
    if (k.startsWith("Q")) return parseInt(k.slice(1)) * 4 < m;
    return true;
  };

  const scegliFile = (tipo, periodo, riga) => {
    setSlot({ tipo, periodo, ambito: riga.label, ambitoId: riga.id, ownerId: riga.ownerId || null });
    setTimeout(() => fileRef.current && fileRef.current.click(), 0);
  };

  const caricaFile = async (fileList) => {
    const file = (fileList || [])[0];
    if (!file || !slot) return;
    if (file.size > MAX_MB * 1024 * 1024) { setErrore(`"${file.name}" supera ${MAX_MB} MB.`); return; }
    setUploading(true); setErrore("");
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
        categoria: slot.tipo === "cu" ? "Fisco & Tasse" : "Fisco & Tasse",
        proprietario_id: slot.ownerId || null,
        ric_tipo: slot.tipo,
        ric_anno: anno,
        ric_periodo: slot.periodo,
        ric_ambito: slot.tipo === "cu" ? slot.ambito : slot.ambitoId,
      });
      if (up && up.file) {
        setDocs(ds => [up.file, ...ds]);
        // descrizione AI in sottofondo, non blocca
        fnAllegati({ action: "describe", id: up.file.id, path: up.file.path, tipo: up.file.tipo, nome_file: up.file.nome_file, data }).then(res => {
          if (res && res.file) setDocs(ds => ds.map(x => x.id === res.file.id ? { ...x, ...res.file } : x));
        }).catch(() => {});
      }
    } catch (e) { setErrore(e.message); }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const apri = async (d) => {
    try { const r = await fnAllegati({ action: "sign", path: d.path }); window.open(r.url, "_blank", "noopener"); }
    catch (e) { setErrore(e.message); }
  };
  const elimina = async (d) => {
    if (!window.confirm(`Eliminare "${d.nome_file}"?`)) return;
    try { await fnAllegati({ action: "delete", id: d.id, path: d.path }); setDocs(ds => ds.filter(x => x.id !== d.id)); }
    catch (e) { setErrore(e.message); }
  };

  const slotAperto = slot && !uploading ? slot : slot; // slot corrente (anche durante upload)

  return (
    <div className="fi">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 6 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700 }}>Ricorrenti</h1>
          <p style={{ fontSize: 12, color: "var(--gray)", marginTop: 4 }}>
            Adempimenti periodici archiviati per periodo: casella piena = fatto, vuota = da fare. Clicca una casella per caricare o consultare.
          </p>
        </div>
        <select value={anno} onChange={e => { setAnno(Number(e.target.value)); setSlot(null); }} style={{ width: "auto", minWidth: 100, fontWeight: 700 }}>
          {[oggi.getFullYear() - 2, oggi.getFullYear() - 1, oggi.getFullYear(), oggi.getFullYear() + 1].map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      <div className="gl" style={{ marginBottom: 20 }} />

      {errore && <div style={{ fontSize: 12, color: "var(--red)", marginBottom: 12 }}>{errore}</div>}
      {uploading && <div style={{ fontSize: 12, color: "var(--gold)", fontWeight: 600, marginBottom: 12 }}>Carico il documento…</div>}
      <input ref={fileRef} type="file" style={{ display: "none" }} onChange={e => caricaFile(e.target.files)} />

      {caricando ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--gray)", fontSize: 13 }}>Carico gli adempimenti…</div>
      ) : sezioni.map(sez => {
        // conteggio: solo periodi già passati
        let fatte = 0, dovute = 0;
        sez.righe.forEach(r => r.periodi.forEach(p => {
          if (!periodoPassato(p.k)) return;
          dovute++;
          if (docsSlot(sez.tipo, p.k, sez.tipo === "cu" ? r.label : r.id).length) fatte++;
        }));
        return (
          <div key={sez.tipo} style={{ background: "var(--white)", border: "1px solid var(--gl)", borderRadius: 12, boxShadow: "var(--shadow)", padding: 16, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
              <span style={{ fontSize: 16 }}>{sez.icona}</span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{sez.titolo}</span>
              <span style={{ fontSize: 11, color: dovute && fatte === dovute ? "#2d6a4f" : "var(--gray)", fontWeight: 600, marginLeft: "auto" }}>
                {dovute ? `${fatte}/${dovute} periodi coperti` : ""}
              </span>
            </div>
            <div style={{ fontSize: 11, color: "var(--gray)", marginBottom: 12 }}>{sez.sotto}</div>

            {sez.righe.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--gray)" }}>Niente da mostrare.</div>
            ) : sez.righe.map(riga => {
              const ambitoKey = sez.tipo === "cu" ? riga.label : riga.id;
              return (
                <Fragment key={riga.id}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderTop: "1px solid var(--cd)", flexWrap: "wrap" }}>
                    <div style={{ flex: "1 1 170px", minWidth: 0 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600 }}>{riga.label}</span>
                      {riga.extra && <span style={{ fontSize: 10.5, color: "var(--gray)", marginLeft: 6 }}>{riga.extra}</span>}
                    </div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {riga.periodi.map(p => {
                        const presenti = docsSlot(sez.tipo, p.k, ambitoKey);
                        const pieno = presenti.length > 0;
                        const passato = periodoPassato(p.k);
                        const selez = slotAperto && slotAperto.tipo === sez.tipo && slotAperto.periodo === p.k && slotAperto.ambitoId === riga.id;
                        return (
                          <button
                            key={p.k}
                            onClick={() => pieno
                              ? setSlot(selez ? null : { tipo: sez.tipo, periodo: p.k, ambito: riga.label, ambitoId: riga.id, ownerId: riga.ownerId || null, vista: true })
                              : scegliFile(sez.tipo, p.k, riga)}
                            title={pieno ? `${presenti.length} document${presenti.length === 1 ? "o" : "i"} — clicca per vedere` : passato ? "Mancante — clicca per caricare" : "Periodo futuro — clicca per caricare in anticipo"}
                            style={{
                              minWidth: 34, padding: "4px 7px", fontSize: 10.5, fontWeight: 600,
                              border: selez ? "1.5px solid var(--gold)" : "1px solid " + (pieno ? "rgba(45,106,79,.4)" : passato ? "rgba(225,29,72,.35)" : "var(--gl)"),
                              background: pieno ? "rgba(45,106,79,.1)" : passato ? "rgba(225,29,72,.06)" : "var(--cream)",
                              color: pieno ? "#2d6a4f" : passato ? "var(--red)" : "var(--gray)",
                              borderRadius: 8,
                            }}
                          >{p.label}{pieno ? " ✓" : ""}</button>
                        );
                      })}
                    </div>
                  </div>
                  {/* Dettaglio casella selezionata */}
                  {slotAperto && slotAperto.vista && slotAperto.tipo === sez.tipo && slotAperto.ambitoId === riga.id && (() => {
                    const presenti = docsSlot(sez.tipo, slotAperto.periodo, ambitoKey);
                    return (
                      <div style={{ background: "var(--cream)", border: "1px solid var(--gl)", borderRadius: 10, padding: "10px 12px", margin: "4px 0 8px" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>{riga.label} · {slotAperto.periodo} {anno}</div>
                        {presenti.map(d => (
                          <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "4px 0" }}>
                            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.nome_file}</span>
                            <button className="bg" onClick={() => apri(d)} style={{ fontSize: 10.5, padding: "3px 8px" }}>Apri</button>
                            <button className="bd" onClick={() => elimina(d)} style={{ fontSize: 10.5, padding: "3px 8px" }}>×</button>
                          </div>
                        ))}
                        <button className="bg" onClick={() => scegliFile(sez.tipo, slotAperto.periodo, riga)} style={{ fontSize: 10.5, padding: "4px 10px", marginTop: 6 }}>+ Aggiungi documento</button>
                      </div>
                    );
                  })()}
                </Fragment>
              );
            })}
          </div>
        );
      })}

      <div style={{ marginTop: 4, fontSize: 10.5, color: "var(--gray)", lineHeight: 1.5 }}>
        Le caselle rosse sono periodi già passati senza documento; le grigie sono periodi futuri. I documenti caricati qui finiscono anche nell'Archivio
        (categoria Fisco &amp; Tasse) e le CU anche tra gli allegati del proprietario. Il conteggio "periodi coperti" considera solo i periodi già scaduti.
      </div>
    </div>
  );
}
