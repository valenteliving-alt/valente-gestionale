import { useState, useEffect, useMemo, useRef } from "react";

/* Autofatture — archivio delle fatture di fornitori esteri da integrare
   (TD17/TD18/TD19) e girare allo studio Pachino.
   Legge la tabella `autofatture`; i PDF stanno nel bucket privato `autofatture`.
   La riempiono l'agente contabile (giro del lunedì e del 3 del mese) e Tommaso.
   Qui NON si emette niente e non si trasmette niente allo SdI: è l'archivio
   e lo stato di avanzamento. Visibile solo a master/soci (RLS vede_tutto). */

const STATI = {
  manca_pdf: { l: "Manca il PDF", bg: "#FEF3C7", c: "#92400E" },
  da_girare: { l: "Da girare a Pachino", bg: "#FFE4E6", c: "#BE123C" },
  girata: { l: "Girata a Pachino", bg: "#E0E7FF", c: "#3730A3" },
  autofatturata: { l: "Autofattura emessa", bg: "#DCFCE7", c: "#166534" },
  da_riemettere: { l: "Da far riemettere", bg: "#FFEDD5", c: "#9A3412" },
  nessuna_autofattura: { l: "Non serve autofattura", bg: "#F1F5F9", c: "#475569" },
};
const REGIMI = {
  reverse_charge: "Reverse charge 22%",
  esente: "Esente (da confermare)",
  iva_it_addebitata: "IVA italiana già addebitata",
  iva_estera: "IVA estera addebitata",
  da_verificare: "Da verificare",
};
const APERTI = ["manca_pdf", "da_girare", "girata", "da_riemettere"];
// OTA = i portali che ci fatturano le commissioni: Airbnb (IE) e Booking (NL).
const RE_OTA = /airbnb|booking\.com/i;
const isOta = (r) => RE_OTA.test(r.fornitore || "");

const oggi = new Date().toISOString().slice(0, 10);
const dataIt = (d) => (d ? d.split("-").reverse().join("/") : "—");
const soldi = (n, v = "EUR") =>
  n === null || n === undefined ? "—" : (v === "EUR" ? "€ " : v + " ") + Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const slug = (s) => (s || "x").toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function Kpi({ l, v, sub, rosso, onClick, attivo }) {
  return (
    <button onClick={onClick} style={{ textAlign: "left", flex: "1 1 150px", padding: "12px 14px", borderRadius: 12, background: "var(--white)", border: "1px solid " + (attivo ? "var(--gold)" : "var(--gl)"), boxShadow: "var(--shadow)", cursor: onClick ? "pointer" : "default" }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--gray)" }}>{l}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: rosso ? "var(--red)" : "var(--black)" }}>{v}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--gray)", marginTop: 2 }}>{sub}</div>}
    </button>
  );
}

function Nuova({ onSalva, onChiudi }) {
  const [f, setF] = useState({ fornitore: "", paese: "", numero: "", data_fattura: "", importo: "", valuta: "EUR", regime: "reverse_charge", stato: "da_girare", note: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const ok = f.fornitore.trim() && f.numero.trim();
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }} onClick={onChiudi}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--white)", borderRadius: 14, padding: 20, width: "100%", maxWidth: 460, display: "grid", gap: 10 }}>
        <h3 style={{ fontSize: 16 }}>Nuova fattura estera</h3>
        <input placeholder="Fornitore (es. PriceLabs Inc.)" value={f.fornitore} onChange={set("fornitore")} />
        <div style={{ display: "flex", gap: 8 }}>
          <input placeholder="Paese (US, IE…)" value={f.paese} onChange={set("paese")} style={{ width: 110 }} />
          <input placeholder="Numero fattura" value={f.numero} onChange={set("numero")} style={{ flex: 1 }} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input type="date" value={f.data_fattura} onChange={set("data_fattura")} style={{ flex: 1 }} />
          <input placeholder="Importo" inputMode="decimal" value={f.importo} onChange={set("importo")} style={{ width: 110 }} />
          <select value={f.valuta} onChange={set("valuta")}><option>EUR</option><option>USD</option><option>GBP</option></select>
        </div>
        <select value={f.regime} onChange={set("regime")}>{Object.entries(REGIMI).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <textarea placeholder="Note" rows={2} value={f.note} onChange={set("note")} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="bg" onClick={onChiudi}>Annulla</button>
          <button className="bp" disabled={!ok} onClick={() => onSalva({ ...f, importo: f.importo ? Number(String(f.importo).replace(",", ".")) : null, data_fattura: f.data_fattura || null, fonte: "Inserita a mano" })}>Salva</button>
        </div>
      </div>
    </div>
  );
}

export default function Autofatture({ sb }) {
  const [righe, setRighe] = useState(null);
  const [errore, setErrore] = useState("");
  const [filtro, setFiltro] = useState("aperte");
  const [fornitore, setFornitore] = useState("");
  const [canale, setCanale] = useState("");
  const [cerca, setCerca] = useState("");
  const [nuova, setNuova] = useState(false);
  const [lavoro, setLavoro] = useState(null);
  const fileRef = useRef(null);
  const [perChi, setPerChi] = useState(null);

  const carica = async () => {
    const { data, ok } = await sb.get("autofatture", "?select=*&order=data_fattura.desc.nullslast,fornitore");
    if (!ok || !Array.isArray(data)) { setErrore("Non riesco a leggere l'archivio autofatture."); setRighe([]); return; }
    setErrore(""); setRighe(data);
  };
  useEffect(() => { carica(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const scaduta = (r) => r.scadenza_td17 && r.scadenza_td17 < oggi && ["manca_pdf", "da_girare", "girata"].includes(r.stato) && ["reverse_charge", "esente"].includes(r.regime);

  const conteggi = useMemo(() => {
    const t = { aperte: 0, manca_pdf: 0, da_girare: 0, da_riemettere: 0, scadute: 0, tutte: 0, ota: 0, ota_aperte: 0 };
    (righe || []).forEach((r) => {
      t.tutte++;
      if (APERTI.includes(r.stato)) t.aperte++;
      if (r.stato === "manca_pdf") t.manca_pdf++;
      if (r.stato === "da_girare") t.da_girare++;
      if (r.stato === "da_riemettere") t.da_riemettere++;
      if (scaduta(r)) t.scadute++;
      if (isOta(r)) { t.ota++; if (APERTI.includes(r.stato)) t.ota_aperte++; }
    });
    return t;
  }, [righe]); // eslint-disable-line react-hooks/exhaustive-deps

  const fornitori = useMemo(() => [...new Set((righe || [])
    .filter((r) => !canale || (canale === "ota" ? isOta(r) : !isOta(r)))
    .map((r) => r.fornitore))].sort(), [righe, canale]);

  const vista = useMemo(() => (righe || [])
    .filter((r) => filtro === "tutte" ? true : filtro === "aperte" ? APERTI.includes(r.stato) : filtro === "scadute" ? scaduta(r) : r.stato === filtro)
    .filter((r) => !canale || (canale === "ota" ? isOta(r) : !isOta(r)))
    .filter((r) => !fornitore || r.fornitore === fornitore)
    .filter((r) => { const q = cerca.trim().toLowerCase(); return !q || [r.fornitore, r.numero, r.descrizione, r.note].some((x) => (x || "").toLowerCase().includes(q)); }),
  [righe, filtro, canale, fornitore, cerca]); // eslint-disable-line react-hooks/exhaustive-deps

  const totEur = vista.reduce((s, r) => s + (r.valuta === "EUR" ? Number(r.importo) || 0 : Number(r.importo_eur) || 0), 0);
  const senzaEur = vista.filter((r) => r.valuta !== "EUR" && r.importo_eur == null).length;

  const aggiorna = async (r, patch) => {
    setLavoro(r.id);
    const { ok } = await sb.patch("autofatture", r.id, patch);
    if (!ok) setErrore("Modifica non salvata. Riprova.");
    await carica(); setLavoro(null);
  };

  const apriPdf = async (r) => {
    setLavoro(r.id);
    const url = await sb.firmaFile("autofatture", r.pdf_path);
    setLavoro(null);
    if (url) window.open(url, "_blank", "noopener"); else setErrore("Non riesco ad aprire il PDF.");
  };

  const scegliPdf = (r) => { setPerChi(r); fileRef.current && (fileRef.current.value = "", fileRef.current.click()); };
  const caricaPdf = async (e) => {
    const file = e.target.files && e.target.files[0]; const r = perChi;
    if (!file || !r) return;
    setLavoro(r.id);
    const anno = (r.data_fattura || oggi).slice(0, 4);
    const path = `${anno}/${slug(r.fornitore)}/${slug(r.numero)}.pdf`;
    const ok = await sb.caricaFile("autofatture", path, file);
    if (!ok) { setErrore("Caricamento del PDF non riuscito."); setLavoro(null); return; }
    await aggiorna(r, { pdf_path: path, ...(r.stato === "manca_pdf" ? { stato: "da_girare" } : {}) });
  };

  // Più PDF insieme: ogni file si aggancia alla fattura il cui numero compare nel nome del file
  const caricaMolti = async (e) => {
    const files = [...(e.target.files || [])]; e.target.value = "";
    if (!files.length) return;
    const elenco = (righe || []).filter((r) => r.numero && slug(r.numero).length >= 4);
    let fatti = 0; const scartati = [];
    for (const file of files) {
      const nome = slug(file.name.replace(/\.pdf$/i, ""));
      const r = elenco.filter((x) => nome.includes(slug(x.numero))).sort((a, b) => slug(b.numero).length - slug(a.numero).length)[0];
      if (!r) { scartati.push(file.name); continue; }
      const path = `${(r.data_fattura || oggi).slice(0, 4)}/${slug(r.fornitore)}/${slug(r.numero)}.pdf`;
      const ok = await sb.caricaFile("autofatture", path, file);
      if (!ok) { scartati.push(file.name); continue; }
      await sb.patch("autofatture", r.id, { pdf_path: path, ...(r.stato === "manca_pdf" ? { stato: "da_girare" } : {}) });
      fatti++;
    }
    setErrore(scartati.length ? `Caricati ${fatti} PDF. Non abbinati (nessun numero fattura nel nome): ${scartati.join(", ")}` : "");
    carica();
  };

  const salvaNuova = async (rec) => {
    const { ok } = await sb.post("autofatture", rec);
    if (!ok) { setErrore("Non salvata: forse esiste già una fattura con lo stesso fornitore e numero."); return; }
    setNuova(false); carica();
  };

  if (righe === null) return <div style={{ textAlign: "center", padding: 60, color: "var(--gray)" }}>Caricamento autofatture…</div>;

  return (
    <div style={{ maxWidth: 1200 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <h2 style={{ fontSize: 22 }}>Autofatture</h2>
          <div style={{ fontSize: 12, color: "var(--gray)", marginTop: 3, maxWidth: 640 }}>
            Fatture di fornitori esteri da integrare (TD17) e girare allo studio Pachino. Le aggiorna l'agente contabile ogni lunedì e il 3 del mese; qui si consultano i PDF e lo stato. Niente parte allo SdI da qui.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <label className="bg" style={{ cursor: "pointer", borderRadius: 8 }} title="Il numero della fattura deve comparire nel nome del file">
            ⬆ Carica PDF (anche più file)
            <input type="file" accept="application/pdf" multiple onChange={caricaMolti} style={{ display: "none" }} aria-label="Carica PDF autofatture" />
          </label>
          <button className="bp" onClick={() => setNuova(true)}>+ Aggiungi fattura</button>
        </div>
      </div>

      {errore && <div style={{ padding: 12, borderRadius: 10, background: "#FFE4E6", color: "var(--red)", fontSize: 13, marginBottom: 12 }}>{errore}</div>}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <Kpi l="Aperte" v={conteggi.aperte} sub="non ancora chiuse" onClick={() => setFiltro("aperte")} attivo={filtro === "aperte"} />
        <Kpi l="Da girare" v={conteggi.da_girare} sub="PDF pronto, manca l'invio" onClick={() => setFiltro("da_girare")} attivo={filtro === "da_girare"} />
        <Kpi l="Manca il PDF" v={conteggi.manca_pdf} sub="da scaricare dal portale" onClick={() => setFiltro("manca_pdf")} attivo={filtro === "manca_pdf"} />
        <Kpi l="Da far riemettere" v={conteggi.da_riemettere} sub="intestate al soggetto sbagliato" onClick={() => setFiltro("da_riemettere")} attivo={filtro === "da_riemettere"} />
        <Kpi l="Fuori termine" v={conteggi.scadute} rosso={conteggi.scadute > 0} sub="TD17 oltre la scadenza" onClick={() => setFiltro("scadute")} attivo={filtro === "scadute"} />
        <Kpi l="OTA · Airbnb e Booking" v={conteggi.ota} sub={conteggi.ota_aperte + " ancora aperte"} onClick={() => { setCanale("ota"); setFiltro("tutte"); }} attivo={canale === "ota"} />
        <Kpi l="Tutte" v={conteggi.tutte} onClick={() => { setFiltro("tutte"); setCanale(""); }} attivo={filtro === "tutte" && !canale} />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
        <select value={canale} onChange={(e) => { setCanale(e.target.value); setFornitore(""); }} style={{ fontSize: 12, fontWeight: canale ? 600 : 400 }}>
          <option value="">Tutti i canali</option>
          <option value="ota">Solo OTA (Airbnb + Booking)</option>
          <option value="altri">Solo altri fornitori</option>
        </select>
        <select value={fornitore} onChange={(e) => setFornitore(e.target.value)} style={{ fontSize: 12 }}>
          <option value="">Tutti i fornitori</option>
          {fornitori.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <input placeholder="Cerca numero, nota…" value={cerca} onChange={(e) => setCerca(e.target.value)} style={{ fontSize: 12, minWidth: 180 }} />
        <span style={{ fontSize: 12, color: "var(--gray)" }}>
          {vista.length} fatture · {soldi(totEur)}{senzaEur ? ` (+${senzaEur} in valuta senza controvalore)` : ""}
        </span>
      </div>

      <input ref={fileRef} type="file" accept="application/pdf" style={{ display: "none" }} onChange={caricaPdf} />

      {vista.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--gray)", fontSize: 13 }}>Nessuna fattura in questo filtro.</div>
      ) : (
        <div style={{ overflowX: "auto", background: "var(--white)", border: "1px solid var(--gl)", borderRadius: 12, boxShadow: "var(--shadow)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--gray)", fontSize: 10, letterSpacing: ".06em", textTransform: "uppercase" }}>
                {["Fornitore", "Fattura", "Importo", "IVA", "Stato", "Scadenza TD17", "PDF", "Note"].map((h) => <th key={h} style={{ padding: "10px 10px", borderBottom: "1px solid var(--gl)", whiteSpace: "nowrap" }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {vista.map((r) => {
                const s = STATI[r.stato] || STATI.da_girare; const tardi = scaduta(r);
                return (
                  <tr key={r.id} style={{ borderBottom: "1px solid var(--gl)", opacity: lavoro === r.id ? 0.5 : 1, verticalAlign: "top" }}>
                    <td style={{ padding: "9px 10px", minWidth: 140 }}>
                      <div style={{ fontWeight: 600 }}>{r.fornitore}</div>
                      <div style={{ color: "var(--gray)", fontSize: 11 }}>{[r.paese, r.periodo].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td style={{ padding: "9px 10px", whiteSpace: "nowrap" }}>
                      <div>{r.numero || "—"}</div>
                      <div style={{ color: "var(--gray)", fontSize: 11 }}>{dataIt(r.data_fattura)}</div>
                    </td>
                    <td style={{ padding: "9px 10px", whiteSpace: "nowrap" }}>
                      <div>{soldi(r.importo, r.valuta)}</div>
                      {r.valuta !== "EUR" && <div style={{ color: "var(--gray)", fontSize: 11 }}>{r.importo_eur != null ? soldi(r.importo_eur) + " addebitati" : "€ da Finom"}</div>}
                    </td>
                    <td style={{ padding: "9px 10px", fontSize: 11, color: r.regime === "da_verificare" ? "#92400E" : "inherit", minWidth: 110 }}>{REGIMI[r.regime] || r.regime}</td>
                    <td style={{ padding: "9px 10px" }}>
                      <select value={r.stato} disabled={lavoro === r.id} onChange={(e) => aggiorna(r, { stato: e.target.value, ...(e.target.value === "girata" && !r.data_girata ? { data_girata: oggi } : {}) })}
                        style={{ fontSize: 11, fontWeight: 600, background: s.bg, color: s.c, border: "none", borderRadius: 6, padding: "4px 6px" }}>
                        {Object.entries(STATI).map(([k, v]) => <option key={k} value={k}>{v.l}</option>)}
                      </select>
                      {r.data_girata && <div style={{ color: "var(--gray)", fontSize: 10, marginTop: 3 }}>girata il {dataIt(r.data_girata)}</div>}
                    </td>
                    <td style={{ padding: "9px 10px", whiteSpace: "nowrap", color: tardi ? "var(--red)" : "inherit", fontWeight: tardi ? 600 : 400 }}>
                      {r.scadenza_td17 ? dataIt(r.scadenza_td17) : "—"}{tardi && <div style={{ fontSize: 10 }}>fuori termine</div>}
                    </td>
                    <td style={{ padding: "9px 10px", whiteSpace: "nowrap" }}>
                      {r.pdf_path
                        ? <button className="bg" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => apriPdf(r)}>📄 Apri</button>
                        : <button className="bg" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => scegliPdf(r)}>⬆ Carica</button>}
                      {r.rif_gmail && /^https:\/\/mail\.google\.com\//.test(r.rif_gmail) && (
                        <a href={r.rif_gmail} target="_blank" rel="noopener noreferrer" style={{ display: "block", fontSize: 11, marginTop: 4 }}>✉ Mail originale</a>
                      )}
                    </td>
                    <td style={{ padding: "9px 10px", fontSize: 11, color: "var(--gray)", maxWidth: 320 }}>{[r.descrizione, r.note].filter(Boolean).join(" — ")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {nuova && <Nuova onSalva={salvaNuova} onChiudi={() => setNuova(false)} />}
    </div>
  );
}
