import { useEffect, useMemo, useState, useCallback } from "react";

/* PLANNER — il calendario di Kross, ma dentro casa nostra.

   Perché esiste, al di là della comodità: l'anno prossimo il gestionale e il
   sistema di fatturazione potrebbero cambiare. Quando succede, la storia delle
   prenotazioni non deve restare ostaggio di Kross. Qui i dati arrivano dalla
   sincronizzazione API e vivono su Supabase: il giorno in cui si stacca Kross,
   questa pagina continua a funzionare.

   La differenza con il planner di Kross è una sola, ed è il motivo per cui vale
   la pena averlo: ogni barra dice anche SE È STATA FATTURATA. Su Kross quella
   informazione sta in un'altra schermata, e infatti a settembre 2026 sono
   rimaste scoperte 38 prenotazioni per 12.329 euro senza che nessuno se ne
   accorgesse.

   Fonte: vista `v_planner` (prenotazioni + appartamenti + documento fiscale).
   La vista è security_invoker: la legge solo chi ha fatto accesso al CRM. */

const SUPABASE_URL = "https://heabtbdmwbjlgujsisor.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhlYWJ0YmRtd2JqbGd1anNpc29yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMjA4NDgsImV4cCI6MjA5NTg5Njg0OH0.FRk1tARhQHylLjfhACorn6O_E7ommm47tBTfJHOVxAU";

function tok() {
  try { return (JSON.parse(localStorage.getItem("vl_sessione") || "null") || {}).access_token || SUPABASE_KEY; }
  catch { return SUPABASE_KEY; }
}
async function api(tabella, query = "") {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabella}${query}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${tok()}` },
  });
  return { ok: r.ok, data: await r.json().catch(() => null) };
}

/* I colori dei canali. Gli stessi di Kross, così l'occhio non deve reimparare. */
const CANALI = {
  AIRBNB:  { col: "#FF5A5F", eti: "Airbnb" },
  BOOKING: { col: "#003580", eti: "Booking" },
  BE:      { col: "#C09456", eti: "Sito" },
  DIRECT:  { col: "#5B8C5A", eti: "Diretta" },
  EXPEDIA: { col: "#FFC72C", eti: "Expedia" },
  VRBO:    { col: "#1668E3", eti: "Vrbo" },
};
const canale = (c) => CANALI[String(c || "").toUpperCase()] || { col: "#8A8A8A", eti: c || "—" };

const GIORNO = 86400000;
const MESI = ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
const euro = (n) => (n == null || n === "" ? "—" : "€" + Math.round(Number(n)).toLocaleString("it-IT"));
const giorno = (d) => (d ? new Date(d + "T00:00:00") : null);
const iso = (d) => d.toISOString().slice(0, 10);
const dataIt = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" }) : "—");

export default function Planner() {
  const oggi = new Date();
  const [anno, setAnno] = useState(oggi.getFullYear());
  const [mese, setMese] = useState(oggi.getMonth());
  const [righe, setRighe] = useState([]);
  const [caricando, setCaricando] = useState(true);
  const [errore, setErrore] = useState("");
  const [scelta, setScelta] = useState(null);      // la prenotazione aperta
  const [soloScoperte, setSoloScoperte] = useState(false);
  const [cerca, setCerca] = useState("");

  const inizio = useMemo(() => new Date(anno, mese, 1), [anno, mese]);
  const fine = useMemo(() => new Date(anno, mese + 1, 0), [anno, mese]);
  const nGiorni = fine.getDate();
  const giorni = useMemo(() => Array.from({ length: nGiorni }, (_, i) => new Date(anno, mese, i + 1)), [anno, mese, nGiorni]);

  const carica = useCallback(async () => {
    setCaricando(true); setErrore("");
    /* Si prende tutto ciò che TOCCA il mese: chi arriva prima e parte dopo
       deve comparire lo stesso, altrimenti i soggiorni lunghi spariscono. */
    const da = iso(inizio), a = iso(new Date(fine.getTime() + GIORNO));
    const { ok, data } = await api("v_planner",
      `?select=*&annullata=eq.false&arrivo=lt.${a}&partenza=gte.${da}&order=appartamento.asc,arrivo.asc&limit=2000`);
    if (!ok || !Array.isArray(data)) { setErrore("Non riesco a leggere le prenotazioni. Se è la prima volta, controlla di aver fatto l'accesso al CRM."); setRighe([]); }
    else setRighe(data);
    setCaricando(false);
  }, [inizio, fine]);

  useEffect(() => { carica(); }, [carica]);

  /* Una riga per appartamento, in ordine alfabetico. Gli appartamenti senza
     prenotazioni questo mese non si mostrano: righe vuote non dicono niente. */
  const perAppartamento = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    const filtrate = righe.filter((r) => {
      if (soloScoperte && r.fatturata) return false;
      if (!q) return true;
      return [r.ospite, r.appartamento, r.cod_reservation, r.email, r.citta]
        .some((x) => String(x || "").toLowerCase().includes(q));
    });
    const m = new Map();
    filtrate.forEach((r) => {
      const k = r.appartamento || "(senza nome)";
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "it"));
  }, [righe, soloScoperte, cerca]);

  /* Il riepilogo del mese: serve a vedere il buco senza doverlo cercare. */
  const conti = useMemo(() => {
    const partite = righe.filter((r) => giorno(r.partenza) <= oggi);
    const scoperte = partite.filter((r) => !r.fatturata);
    return {
      totali: righe.length,
      partite: partite.length,
      scoperte: scoperte.length,
      euroScoperti: scoperte.reduce((s, r) => s + (Number(r.totale_addebiti) || 0), 0),
      incasso: righe.reduce((s, r) => s + (Number(r.totale_addebiti) || 0), 0),
      pulizie: righe.reduce((s, r) => s + (Number(r.pulizie) || 0), 0),
    };
  }, [righe]);

  const spostaMese = (d) => {
    const n = new Date(anno, mese + d, 1);
    setAnno(n.getFullYear()); setMese(n.getMonth()); setScelta(null);
  };

  const LARG = 34;   // larghezza di un giorno, in pixel
  const NOME = 190;  // larghezza della colonna con il nome dell'appartamento

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700 }}>Planner</h1>
          <p style={{ fontSize: 12, color: "var(--gray)", marginTop: 4 }}>
            Le prenotazioni di Kross con i dati ospite e lo stato della fattura
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button className="bg" onClick={() => spostaMese(-1)}>‹</button>
          <strong style={{ fontSize: 15, minWidth: 150, textAlign: "center" }}>{MESI[mese]} {anno}</strong>
          <button className="bg" onClick={() => spostaMese(1)}>›</button>
          <button className="bg" onClick={() => { setAnno(oggi.getFullYear()); setMese(oggi.getMonth()); }}>Oggi</button>
          <button className="bg" onClick={carica} disabled={caricando}>{caricando ? "…" : "↻"}</button>
        </div>
      </div>

      <div className="gl" style={{ marginBottom: 14 }} />

      {/* Il riepilogo. La riga rossa è il motivo per cui questo planner esiste. */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <Riquadro titolo="Prenotazioni" valore={conti.totali} nota="che toccano il mese" />
        <Riquadro titolo="Valore" valore={euro(conti.incasso)} nota="totale addebiti" />
        <Riquadro titolo="Pulizie" valore={euro(conti.pulizie)} nota="addebitate agli ospiti" />
        <Riquadro titolo="Da fatturare" valore={conti.scoperte}
          nota={conti.scoperte ? euro(conti.euroScoperti) + " già partite" : "tutto in regola"}
          allarme={conti.scoperte > 0} />
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <input value={cerca} onChange={(e) => setCerca(e.target.value)}
          placeholder="Cerca ospite, appartamento, numero…"
          style={{ flex: "1 1 240px", maxWidth: 340, padding: "8px 11px", border: "1px solid var(--cd)", borderRadius: 8, fontSize: 13 }} />
        <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, cursor: "pointer" }}>
          <input type="checkbox" checked={soloScoperte} onChange={(e) => setSoloScoperte(e.target.checked)} style={{ width: "auto" }} />
          Solo quelle senza fattura
        </label>
        <div style={{ display: "flex", gap: 10, marginLeft: "auto", fontSize: 11, color: "var(--gray)", alignItems: "center", flexWrap: "wrap" }}>
          {Object.values(CANALI).map((c) => (
            <span key={c.eti} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <i style={{ width: 10, height: 10, borderRadius: 3, background: c.col, display: "inline-block" }} />{c.eti}
            </span>
          ))}
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>€ = fatturata</span>
        </div>
      </div>

      {errore ? (
        <div style={{ padding: 20, background: "var(--white)", border: "1px solid var(--gl)", borderRadius: 12, fontSize: 13, color: "var(--red)" }}>{errore}</div>
      ) : caricando ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--gray)" }}>Carico il mese…</div>
      ) : !perAppartamento.length ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--gray)" }}>
          Nessuna prenotazione {soloScoperte ? "senza fattura " : ""}in {MESI[mese]}.
        </div>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid var(--cd)", borderRadius: 10, background: "var(--white)", WebkitOverflowScrolling: "touch" }}>
          <div style={{ minWidth: NOME + nGiorni * LARG }}>

            {/* I giorni */}
            <div style={{ display: "flex", position: "sticky", top: 0, zIndex: 3, background: "var(--white)", borderBottom: "1px solid var(--cd)" }}>
              <div style={{ width: NOME, flexShrink: 0, position: "sticky", left: 0, zIndex: 4, background: "var(--white)", borderRight: "1px solid var(--cd)" }} />
              {giorni.map((d) => {
                const weekend = d.getDay() === 0 || d.getDay() === 6;
                const eOggi = iso(d) === iso(oggi);
                return (
                  <div key={+d} style={{
                    width: LARG, flexShrink: 0, textAlign: "center", padding: "5px 0",
                    background: eOggi ? "rgba(192,148,86,.18)" : weekend ? "rgba(0,0,0,.035)" : "transparent",
                    fontWeight: eOggi ? 700 : 400,
                  }}>
                    <div style={{ fontSize: 9, color: "var(--gray)", textTransform: "uppercase" }}>
                      {d.toLocaleDateString("it-IT", { weekday: "narrow" })}
                    </div>
                    <div style={{ fontSize: 12 }}>{d.getDate()}</div>
                  </div>
                );
              })}
            </div>

            {/* Una riga per appartamento */}
            {perAppartamento.map(([nome, pren]) => (
              <div key={nome} style={{ display: "flex", borderBottom: "1px solid rgba(0,0,0,.05)", minHeight: 42 }}>
                <div style={{
                  width: NOME, flexShrink: 0, position: "sticky", left: 0, zIndex: 2,
                  background: "var(--white)", borderRight: "1px solid var(--cd)",
                  padding: "8px 10px", fontSize: 12, lineHeight: 1.3,
                }}>
                  <div style={{ fontWeight: 600 }}>{nome}</div>
                  {pren[0].citta && <div style={{ fontSize: 10.5, color: "var(--gray)" }}>{pren[0].citta}</div>}
                </div>

                <div style={{ position: "relative", flex: 1, minHeight: 42 }}>
                  {/* le colonne di sfondo */}
                  <div style={{ display: "flex", position: "absolute", inset: 0 }}>
                    {giorni.map((d) => {
                      const weekend = d.getDay() === 0 || d.getDay() === 6;
                      const eOggi = iso(d) === iso(oggi);
                      return <div key={+d} style={{
                        width: LARG, flexShrink: 0,
                        background: eOggi ? "rgba(192,148,86,.14)" : weekend ? "rgba(0,0,0,.025)" : "transparent",
                        borderRight: "1px solid rgba(0,0,0,.04)",
                      }} />;
                    })}
                  </div>

                  {/* le barre */}
                  {pren.map((r) => {
                    const arr = giorno(r.arrivo), par = giorno(r.partenza);
                    if (!arr || !par) return null;
                    const da = Math.max(0, Math.round((arr - inizio) / GIORNO));
                    const al = Math.min(nGiorni, Math.round((par - inizio) / GIORNO));
                    const larg = Math.max(1, al - da);
                    const c = canale(r.canale);
                    const partita = par <= oggi;
                    const scoperta = partita && !r.fatturata;
                    return (
                      <div key={r.id_reservation}
                        onClick={() => setScelta(r)}
                        title={`${r.ospite} · ${dataIt(r.arrivo)} → ${dataIt(r.partenza)} · ${euro(r.totale_addebiti)}`}
                        style={{
                          position: "absolute", left: da * LARG + 2, width: larg * LARG - 4,
                          top: 6, height: 30, borderRadius: 6, cursor: "pointer",
                          background: c.col, color: "#fff",
                          display: "flex", alignItems: "center", gap: 4, padding: "0 7px",
                          fontSize: 11, overflow: "hidden", whiteSpace: "nowrap",
                          border: scoperta ? "2px solid #D93025" : "2px solid transparent",
                          boxShadow: scelta && scelta.id_reservation === r.id_reservation ? "0 0 0 2px var(--gold)" : "none",
                        }}>
                        <span style={{
                          flexShrink: 0, fontSize: 10, fontWeight: 700,
                          opacity: r.fatturata ? 1 : .45,
                          textDecoration: r.fatturata ? "none" : "line-through",
                        }}>€</span>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{r.ospite}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {scelta && <Dettaglio r={scelta} onChiudi={() => setScelta(null)} />}
    </div>
  );
}

function Riquadro({ titolo, valore, nota, allarme }) {
  return (
    <div style={{
      flex: "1 1 150px", padding: "11px 14px", borderRadius: 10,
      background: allarme ? "rgba(217,48,37,.07)" : "var(--white)",
      border: "1px solid " + (allarme ? "rgba(217,48,37,.3)" : "var(--cd)"),
    }}>
      <div style={{ fontSize: 10.5, color: "var(--gray)", textTransform: "uppercase", letterSpacing: ".04em" }}>{titolo}</div>
      <div style={{ fontSize: 21, fontWeight: 700, color: allarme ? "#C5221F" : "inherit", lineHeight: 1.25 }}>{valore}</div>
      <div style={{ fontSize: 11, color: "var(--gray)" }}>{nota}</div>
    </div>
  );
}

/* La scheda della prenotazione. Tutto quello per cui oggi devi aprire Kross. */
function Dettaglio({ r, onChiudi }) {
  const c = canale(r.canale);
  const partita = giorno(r.partenza) <= new Date();
  const voci = [
    ["Alloggio", euro(r.alloggio)],
    ["Pulizie", euro(r.pulizie)],
    ["Tassa di soggiorno", euro(r.tassa_soggiorno)],
    ["Extra", euro(r.extra)],
    ["Commissione OTA", euro(r.commissione_ota)],
  ];
  return (
    <>
      <div onClick={onChiudi} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 500 }} />
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: "min(440px, 100%)", zIndex: 501,
        background: "var(--white)", boxShadow: "-8px 0 30px rgba(0,0,0,.18)", overflowY: "auto", padding: 22,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div>
            <h2 style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.25 }}>{r.ospite || "(senza nome)"}</h2>
            <div style={{ fontSize: 12, color: "var(--gray)", marginTop: 3 }}>
              {r.cod_reservation} · <span style={{ color: c.col, fontWeight: 600 }}>{c.eti}</span>
            </div>
          </div>
          <button onClick={onChiudi} style={{ background: "none", border: 0, fontSize: 22, cursor: "pointer", color: "var(--gray)", lineHeight: 1 }}>×</button>
        </div>

        {/* Lo stato della fattura, in cima: è la domanda per cui sei qui. */}
        <div style={{
          margin: "14px 0", padding: "11px 13px", borderRadius: 9,
          background: r.fatturata ? "rgba(91,140,90,.1)" : partita ? "rgba(217,48,37,.08)" : "rgba(0,0,0,.04)",
          border: "1px solid " + (r.fatturata ? "rgba(91,140,90,.35)" : partita ? "rgba(217,48,37,.3)" : "var(--cd)"),
        }}>
          {r.fatturata ? (
            <>
              <strong style={{ fontSize: 13, color: "#3D6B3C" }}>Fatturata</strong>
              <div style={{ fontSize: 12, color: "var(--gray)", marginTop: 3 }}>
                {r.doc_tipo} n. {r.doc_numero} del {dataIt(r.doc_data)} · {euro(r.doc_totale)}
              </div>
            </>
          ) : partita ? (
            <>
              <strong style={{ fontSize: 13, color: "#C5221F" }}>Nessun documento emesso</strong>
              <div style={{ fontSize: 12, color: "var(--gray)", marginTop: 3 }}>Il soggiorno è finito il {dataIt(r.partenza)}.</div>
            </>
          ) : (
            <>
              <strong style={{ fontSize: 13 }}>Non ancora fatturata</strong>
              <div style={{ fontSize: 12, color: "var(--gray)", marginTop: 3 }}>Il soggiorno non è ancora finito: è normale.</div>
            </>
          )}
        </div>

        <Blocco titolo="Soggiorno" voci={[
          ["Appartamento", r.appartamento],
          ["Città", r.citta],
          ["CIN", r.cin],
          ["Arrivo", dataIt(r.arrivo)],
          ["Partenza", dataIt(r.partenza)],
          ["Notti", r.notti],
          ["Ospiti", r.ospiti],
          ["Stato", r.stato],
        ]} />

        <Blocco titolo="Ospite" voci={[
          ["Email", r.email],
          ["Telefono", r.telefono],
          ["Paese", r.paese],
          ["Lingua", r.lingua],
        ]} />

        <Blocco titolo="Importi" voci={voci} />

        <div style={{ marginTop: 6, padding: "11px 13px", background: "rgba(192,148,86,.08)", borderLeft: "3px solid var(--gold)", borderRadius: 7 }}>
          <Riga eti="Totale addebiti" val={euro(r.totale_addebiti)} grosso />
          <Riga eti="Incassato" val={euro(r.incassato)} />
          {r.quota_proprietario != null && <Riga eti="Quota proprietario" val={euro(r.quota_proprietario)} />}
          {r.quota_pm != null && <Riga eti="Quota PM" val={euro(r.quota_pm)} grosso />}
          {r.quota_pm == null && (
            <div style={{ fontSize: 10.5, color: "var(--gray)", marginTop: 7, lineHeight: 1.4 }}>
              La ripartizione fra proprietario e Valente Living non arriva da Kross:
              quei campi sono vuoti su tutte le prenotazioni. Finché non si decide come
              calcolarla, preferisco non mostrarti un numero inventato.
            </div>
          )}
        </div>

        {r.proprietario && (
          <div style={{ marginTop: 12, fontSize: 12, color: "var(--gray)" }}>Proprietario: <strong style={{ color: "inherit" }}>{r.proprietario}</strong></div>
        )}
      </div>
    </>
  );
}

function Blocco({ titolo, voci }) {
  const piene = voci.filter(([, v]) => v !== null && v !== undefined && v !== "" && v !== "—");
  if (!piene.length) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--gold)", marginBottom: 5 }}>{titolo}</div>
      {piene.map(([k, v]) => <Riga key={k} eti={k} val={v} />)}
    </div>
  );
}

function Riga({ eti, val, grosso }) {
  return (
    <div style={{ display: "flex", gap: 10, padding: "3px 0", fontSize: 12.5, borderBottom: "1px solid rgba(0,0,0,.04)" }}>
      <span style={{ color: "var(--gray)", minWidth: 128, flexShrink: 0 }}>{eti}</span>
      <span style={{ wordBreak: "break-word", fontWeight: grosso ? 700 : 400 }}>{val}</span>
    </div>
  );
}
