import { useState, useEffect, useMemo } from "react";

/* Report appartamenti — quanto fa ogni immobile, dai dati API di Kross.
   Legge la funzione Supabase report_kross_appartamenti, che filtra da sola
   per chi è collegato:
   - master/soci: tutti gli appartamenti, con provvigione e margine Valente
   - property manager: i loro immobili
   - agenti: gli immobili dove sono indicati come agente, senza provvigione
     né margine Valente (quei campi arrivano vuoti dal database).
   Il mese è quello di check-out, come nella distinta al proprietario.
   Gli importi sono comprensivi di extra; la tassa di soggiorno è esclusa. */

const EUR = (n) => (n === null || n === undefined ? "—" : "€ " + Math.round(Number(n)).toLocaleString("it-IT"));
const PCT = (n) => (n === null || n === undefined || !isFinite(n) ? "—" : Math.round(n) + "%");
const MESI = ["", "gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const meseBreve = (m) => { const [a, mm] = (m || "").split("-"); return `${MESI[parseInt(mm, 10)] || mm} ${a ? a.slice(2) : ""}`; };
const n = (x) => Number(x) || 0;
const oggiMese = new Date().toISOString().slice(0, 7);

const PERIODI = () => {
  const y = new Date().getFullYear();
  return [
    ["anno:" + y, `${y}`],
    ["anno:" + (y - 1), `${y - 1}`],
    ["12m", "Ultimi 12 mesi"],
    ["futuro", "Prossimi mesi (prenotato)"],
  ];
};

function filtraPeriodo(righe, periodo) {
  if (periodo.startsWith("anno:")) return righe.filter((r) => (r.mese || "").startsWith(periodo.slice(5)));
  if (periodo === "futuro") return righe.filter((r) => r.mese >= oggiMese);
  const d = new Date(); d.setMonth(d.getMonth() - 11);
  const da = d.toISOString().slice(0, 7);
  return righe.filter((r) => r.mese >= da && r.mese <= oggiMese);
}

function totali(righe) {
  const t = { incSub: 0, pren: 0, notti: 0, nottiMese: 0, giorni: 0, lordo: 0, comm: 0, pul: 0, netto: 0, prov: null, pl: null, ced: null, pn: null, tr: null, fut: 0 };
  const add = (k, v) => { if (v !== null && v !== undefined) t[k] = (t[k] || 0) + n(v); };
  righe.forEach((r) => {
    t.pren += n(r.prenotazioni); t.notti += n(r.notti); t.nottiMese += n(r.notti_nel_mese); t.giorni += n(r.giorni_mese);
    t.lordo += n(r.totale_ospite); t.comm += n(r.commissione_ota); t.pul += n(r.pulizie); t.netto += n(r.netto_ota);
    t.fut += n(r.future);
    if (r.tipo_gestione === "sublocazione") t.incSub += n(r.totale_ospite);
    add("prov", r.provvigione_pm); add("pl", r.proprietario_lordo); add("ced", r.cedolare); add("pn", r.proprietario_netto); add("tr", r.trattenuto_gestione);
  });
  t.occ = t.giorni ? (100 * t.nottiMese) / t.giorni : null;
  t.adr = t.notti ? (t.lordo - t.pul) / t.notti : null; // prezzo medio a notte, pulizie escluse
  return t;
}

const Kpi = ({ l, v, sub, forte }) => (
  <div style={{ flex: "1 1 130px", minWidth: 120, padding: "12px 14px", borderRadius: 12, background: forte ? "#EEF2FF" : "var(--white, #fff)", border: forte ? "1px solid var(--gold, #6366F1)" : "1px solid var(--gl, #E2E8F0)", boxShadow: "var(--shadow)" }}>
    <div style={{ fontSize: 10, letterSpacing: 1.1, textTransform: "uppercase", color: "var(--gray, #64748B)" }}>{l}</div>
    <div style={{ fontSize: 20, fontWeight: 700, marginTop: 3 }}>{v}</div>
    {sub && <div style={{ fontSize: 11, color: "var(--gray, #64748B)", marginTop: 2 }}>{sub}</div>}
  </div>
);

const Riga = ({ l, v, forte, meno }) => (
  <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13, borderBottom: "1px solid var(--cd, #ECEEF3)", fontWeight: forte ? 700 : 400 }}>
    <span style={{ color: forte ? "inherit" : "var(--gray, #64748B)" }}>{l}</span>
    <span>{meno && v !== "—" ? "− " : ""}{v}</span>
  </div>
);

/* Controllo fatturazione (solo titolare e soci): fatture emesse su Kross per mese
   e prenotazioni concluse che non hanno ancora fattura o ricevuta. */
function Fatturazione({ sb }) {
  const [mesi, setMesi] = useState(null);
  const [lista, setLista] = useState(null);
  const [aperta, setAperta] = useState(false);

  useEffect(() => {
    sb.post("rpc/report_fatturazione", {}).then(({ data }) => setMesi(Array.isArray(data) ? data : []));
  }, [sb]);

  const apri = async () => {
    setAperta(!aperta);
    if (!lista) {
      const { data } = await sb.post("rpc/lista_da_fatturare", {});
      setLista(Array.isArray(data) ? data : []);
    }
  };

  if (!mesi || mesi.length === 0) return null;
  const totDa = mesi.reduce((a, m) => a + n(m.da_fatturare_n), 0);
  const impDa = mesi.reduce((a, m) => a + n(m.da_fatturare_importo), 0);
  const emesso = mesi.reduce((a, m) => a + n(m.emesso_totale), 0);
  const cella = { padding: "6px 8px", textAlign: "right", whiteSpace: "nowrap" };
  const th = { padding: "6px 8px", borderBottom: "1px solid var(--gl, #E2E8F0)" };

  return (
    <div style={{ borderRadius: 12, background: "var(--white, #fff)", border: "1px solid var(--gl, #E2E8F0)", boxShadow: "var(--shadow)", padding: 16, marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, alignItems: "baseline" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Controllo fatturazione</div>
          <div style={{ fontSize: 11, color: "var(--gray, #64748B)", marginTop: 2 }}>Fatture emesse su Kross dal 23/02/2026 (IVA inclusa, note di credito sottratte) · prenotazioni concluse ancora senza fattura</div>
        </div>
        <div style={{ display: "flex", gap: 18, fontSize: 13, flexWrap: "wrap" }}>
          <span>Emesso <b>{EUR(emesso)}</b></span>
          <span style={{ color: totDa ? "var(--red, #E11D48)" : "inherit" }}>Senza fattura <b>{totDa}</b> pren. · <b>{EUR(impDa)}</b></span>
        </div>
      </div>
      <div style={{ overflowX: "auto", marginTop: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ color: "var(--gray, #64748B)", fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>
              {["Mese", "Fatture emesse", "Importo emesso", "Pren. concluse", "Senza fattura", "Importo senza fattura"].map((h, i) => (
                <th key={h} style={{ ...th, textAlign: i ? "right" : "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {mesi.map((m) => (
              <tr key={m.mese} style={{ borderBottom: "1px solid var(--cd, #ECEEF3)" }}>
                <td style={{ ...cella, textAlign: "left" }}>{meseBreve(m.mese)}</td>
                <td style={cella}>{m.fatture_n}</td>
                <td style={cella}>{EUR(m.emesso_totale)}</td>
                <td style={cella}>{m.concluse_n}</td>
                <td style={{ ...cella, fontWeight: 600, color: n(m.da_fatturare_n) > 10 ? "var(--red, #E11D48)" : "inherit" }}>{m.da_fatturare_n}</td>
                <td style={cella}>{EUR(m.da_fatturare_importo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totDa > 0 && (
        <button className="bg" style={{ fontSize: 12, marginTop: 10 }} onClick={apri}>{aperta ? "Nascondi" : "Vedi"} le prenotazioni senza fattura</button>
      )}
      {aperta && (
        <div style={{ overflowX: "auto", marginTop: 10, maxHeight: 420, overflowY: "auto" }}>
          {!lista ? <div style={{ fontSize: 12, color: "var(--gray, #64748B)" }}>Caricamento…</div> : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ color: "var(--gray, #64748B)", fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>
                  {["Check-out", "Appartamento", "Ospite", "Canale", "Tipo", "Importo ospite"].map((h, i) => (
                    <th key={h} style={{ ...th, textAlign: i === 5 ? "right" : "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lista.map((r) => (
                  <tr key={r.cod_reservation} style={{ borderBottom: "1px solid var(--cd, #ECEEF3)" }}>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{(r.partenza || "").split("-").reverse().join("/")}</td>
                    <td style={{ padding: "6px 8px" }}>{r.appartamento || "—"}</td>
                    <td style={{ padding: "6px 8px" }}>{r.ospite || "—"}</td>
                    <td style={{ padding: "6px 8px" }}>{r.canale || "—"}</td>
                    <td style={{ padding: "6px 8px" }}>{r.tipo_gestione || "—"}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right" }}>{EUR(r.totale_ospite)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export default function ReportAppartamenti({ sb, vedoTutto, sonoAgente }) {
  const [righe, setRighe] = useState(null);
  const [errore, setErrore] = useState("");
  const [periodo, setPeriodo] = useState("anno:" + new Date().getFullYear());
  const [citta, setCitta] = useState("");
  const [cerca, setCerca] = useState("");
  const [aperto, setAperto] = useState(null);

  useEffect(() => {
    (async () => {
      const y = new Date().getFullYear();
      const { data, ok } = await sb.post("rpc/report_kross_appartamenti", { p_da: `${y - 1}-01-01`, p_a: `${y + 1}-12-31` });
      if (!ok || !Array.isArray(data)) { setErrore("Non riesco a leggere i report. Se il problema resta, avvisa Tommaso."); setRighe([]); return; }
      setRighe(data);
    })();
  }, [sb]);

  const nelPeriodo = useMemo(() => filtraPeriodo(righe || [], periodo), [righe, periodo]);

  const appartamenti = useMemo(() => {
    const per = {};
    nelPeriodo.forEach((r) => {
      const k = r.id_room_type;
      if (!per[k]) per[k] = { id: k, nome: r.appartamento, citta: r.citta, tipo: r.tipo_gestione, agente: r.agente, gestore: r.gestore, mesi: [] };
      per[k].mesi.push(r);
    });
    return Object.values(per)
      .map((a) => ({ ...a, t: totali(a.mesi), mesi: a.mesi.sort((x, y) => (x.mese < y.mese ? 1 : -1)) }))
      .filter((a) => !citta || a.citta === citta)
      .filter((a) => !cerca || (a.nome || "").toLowerCase().includes(cerca.toLowerCase()))
      .sort((a, b) => b.t.lordo - a.t.lordo);
  }, [nelPeriodo, citta, cerca]);

  const elencoCitta = useMemo(() => [...new Set((righe || []).map((r) => r.citta).filter(Boolean))].sort(), [righe]);
  const tot = useMemo(() => totali(appartamenti.flatMap((a) => a.mesi)), [appartamenti]);

  if (righe === null) return <div style={{ textAlign: "center", padding: 60, color: "var(--gray, #64748B)" }}>Caricamento report…</div>;

  const vediMargine = !sonoAgente; // gli agenti non vedono provvigione e margine Valente

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 22 }}>Report appartamenti</h2>
        <div style={{ fontSize: 12, color: "var(--gray, #64748B)", marginTop: 3 }}>
          {sonoAgente ? "Quanto fanno gli immobili che hai portato. " : ""}Dati Kross aggiornati ogni 4 ore · mese di check-out · tassa di soggiorno esclusa
        </div>
      </div>

      {errore && <div style={{ padding: 12, borderRadius: 10, background: "#FFE4E6", color: "var(--red, #E11D48)", fontSize: 13, marginBottom: 12 }}>{errore}</div>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {PERIODI().map(([id, l]) => (
          <button key={id} className={periodo === id ? "bp" : "bg"} style={{ fontSize: 12 }} onClick={() => setPeriodo(id)}>{l}</button>
        ))}
        {elencoCitta.length > 1 && (
          <select value={citta} onChange={(e) => setCitta(e.target.value)} style={{ fontSize: 12 }}>
            <option value="">Tutte le città</option>
            {elencoCitta.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {(righe.length > 0 && new Set(righe.map((r) => r.id_room_type)).size > 6) && (
          <input placeholder="Cerca appartamento" value={cerca} onChange={(e) => setCerca(e.target.value)} style={{ fontSize: 12, minWidth: 160 }} />
        )}
      </div>

      {appartamenti.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--gray, #64748B)", fontSize: 13 }}>
          {righe.length === 0
            ? (sonoAgente ? "Non ci sono ancora immobili collegati a te su Kross. Se ne hai portati, chiedi in ufficio di indicarti come agente nella scheda dell'immobile." : "Nessun dato Kross disponibile.")
            : "Nessun dato nel periodo scelto."}
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
            <Kpi l="Incasso lordo" v={EUR(tot.lordo)} sub={`${appartamenti.length} appartament${appartamenti.length === 1 ? "o" : "i"}`} />
            <Kpi l="Notti vendute" v={tot.notti.toLocaleString("it-IT")} sub={`${tot.pren} prenotazioni`} />
            <Kpi l="Occupazione" v={PCT(tot.occ)} />
            <Kpi l="Prezzo medio notte" v={EUR(tot.adr)} sub="pulizie escluse" />
            {tot.pn !== null && <Kpi l="Netto proprietari" v={EUR(tot.pn)} sub="dopo cedolare 21%" />}
            {vedoTutto ? (
              <>
                <Kpi l="Provvigioni gestioni" v={EUR(tot.prov || 0)} sub="quota Valente sulle gestioni" />
                <Kpi l="Incasso sublocazioni" v={EUR(tot.incSub)} sub="tutto fatturato Valente" />
                <Kpi l="Fatturato Valente" v={EUR(n(tot.prov) + tot.incSub)} sub="provvigioni + sublocazioni" forte />
              </>
            ) : vediMargine && tot.prov !== null && <Kpi l="Provvigioni Valente" v={EUR(tot.prov)} sub="solo gestioni" />}
          </div>

          {vedoTutto && <Fatturazione sb={sb} />}

          <div style={{ display: "grid", gap: 10 }}>
            {appartamenti.map((a) => {
              const t = a.t; const sub = a.tipo === "sublocazione"; const open = aperto === a.id;
              return (
                <div key={a.id} style={{ borderRadius: 12, background: "var(--white, #fff)", border: "1px solid var(--gl, #E2E8F0)", boxShadow: "var(--shadow)" }}>
                  <button onClick={() => setAperto(open ? null : a.id)} style={{ width: "100%", textAlign: "left", background: "none", border: "none", color: "inherit", padding: "14px 16px", cursor: "pointer" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>{a.nome}</div>
                        <div style={{ fontSize: 11, color: "var(--gray, #64748B)", marginTop: 2 }}>
                          {a.citta || "—"} · {sub ? "sublocazione" : "gestione"}{vedoTutto && a.agente ? ` · agente ${a.agente}` : ""}
                        </div>
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 700 }}>{EUR(t.lordo)}</div>
                    </div>
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: "var(--gray, #64748B)", marginTop: 8 }}>
                      <span>{t.notti} notti</span>
                      <span>occupazione {PCT(t.occ)}</span>
                      <span>{EUR(t.adr)}/notte</span>
                      {!sub && t.pn !== null && <span>netto proprietario <b style={{ color: "var(--black, #0F172A)" }}>{EUR(t.pn)}</b></span>}
                      {t.fut > 0 && <span>{t.fut} prenotazioni future</span>}
                      <span style={{ marginLeft: "auto" }}>{open ? "▲" : "▼ dettaglio"}</span>
                    </div>
                  </button>

                  {open && (
                    <div style={{ padding: "0 16px 16px" }}>
                      <div style={{ maxWidth: 420, marginBottom: 14 }}>
                        <Riga l="Incasso lordo (alloggio + extra + pulizie)" v={EUR(t.lordo)} forte />
                        <Riga l="Commissioni portali" v={EUR(t.comm)} meno />
                        <Riga l="Pulizie" v={EUR(t.pul)} meno />
                        {!sub && vediMargine && <Riga l="Provvigione Valente" v={EUR(t.prov)} meno />}
                        {!sub && <Riga l="Netto proprietario prima delle tasse" v={EUR(t.pl)} forte={!vediMargine} />}
                        {!sub && <Riga l="Cedolare secca" v={EUR(t.ced)} meno />}
                        {!sub && <Riga l="Netto proprietario" v={EUR(t.pn)} forte />}
                        {sub && vediMargine && <Riga l="Netto Valente (prima di canone e costi)" v={EUR(t.netto - t.pul)} forte />}
                      </div>

                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                          <thead>
                            <tr style={{ color: "var(--gray, #64748B)", fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>
                              {["Mese", "Notti", "Occ.", "Lordo", "Portali", "Pulizie", ...(sub ? [] : ["Netto propr."]), ...(vediMargine ? [sub ? "Netto Valente" : "Provv. Valente"] : [])].map((h, i) => (
                                <th key={h} style={{ textAlign: i ? "right" : "left", padding: "6px 8px", borderBottom: "1px solid var(--gl, #E2E8F0)" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {a.mesi.map((m) => (
                              <tr key={m.mese} style={{ borderBottom: "1px solid var(--cd, #ECEEF3)", opacity: m.mese > oggiMese ? 0.7 : 1 }}>
                                <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{meseBreve(m.mese)}{m.mese > oggiMese ? " ·prenotato" : ""}</td>
                                <td style={{ padding: "6px 8px", textAlign: "right" }}>{m.notti}</td>
                                <td style={{ padding: "6px 8px", textAlign: "right" }}>{PCT(m.giorni_mese ? (100 * m.notti_nel_mese) / m.giorni_mese : null)}</td>
                                <td style={{ padding: "6px 8px", textAlign: "right" }}>{EUR(m.totale_ospite)}</td>
                                <td style={{ padding: "6px 8px", textAlign: "right" }}>{EUR(m.commissione_ota)}</td>
                                <td style={{ padding: "6px 8px", textAlign: "right" }}>{EUR(m.pulizie)}</td>
                                {!sub && <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 600 }}>{EUR(m.proprietario_netto)}</td>}
                                {vediMargine && <td style={{ padding: "6px 8px", textAlign: "right" }}>{EUR(sub ? n(m.netto_ota) - n(m.pulizie) : m.provvigione_pm)}</td>}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
