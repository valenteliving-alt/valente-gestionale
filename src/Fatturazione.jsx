import { useEffect, useMemo, useState, useCallback } from "react";
import Planner from "./Planner";

/* FATTURAZIONE E RENDICONTAZIONE — l'app per le fatture.

   Quattro schermate: Planner · Prenotazioni · Appartamenti (criteri di fatturazione) · Impostazioni.
   L'elenco appartamenti viene da Kross (kross_appartamenti, sincronizzata dalle API):
   ogni appartamento di Kross ha la sua regola in fat_regole, creata al primo salvataggio se manca.
   Nulla viene emesso da qui: le bozze si approvano a mano. */

const SUPABASE_URL = "https://heabtbdmwbjlgujsisor.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhlYWJ0YmRtd2JqbGd1anNpc29yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMjA4NDgsImV4cCI6MjA5NTg5Njg0OH0.FRk1tARhQHylLjfhACorn6O_E7ommm47tBTfJHOVxAU";
const CRM_URL = "https://valentelivingcrm.netlify.app";

const sessione = () => {
  try { return (JSON.parse(localStorage.getItem("vl_sessione") || "null") || {}).access_token || null; }
  catch { return null; }
};
const intest = (extra = {}) => ({ apikey: SUPABASE_KEY, Authorization: `Bearer ${sessione() || SUPABASE_KEY}`, ...extra });

async function leggi(tabella, query = "") {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabella}${query}`, { headers: intest() });
  const d = await r.json().catch(() => null);
  return Array.isArray(d) ? d : [];
}
async function leggiTutto(tabella, query = "") {
  let tutte = [];
  for (let da = 0; da < 20000; da += 1000) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabella}${query}`, { headers: intest({ Range: `${da}-${da + 999}` }) });
    const d = await r.json().catch(() => null);
    if (!Array.isArray(d)) break;
    tutte = tutte.concat(d);
    if (d.length < 1000) break;
  }
  return tutte;
}
async function conta(tabella, filtro = "") {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabella}?select=*${filtro}`, { headers: intest({ Prefer: "count=exact", Range: "0-0" }) });
  const m = (r.headers.get("content-range") || "").split("/")[1];
  return m && m !== "*" ? Number(m) : null;
}
async function aggiorna(tabella, filtro, corpo) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabella}?${filtro}`, {
    method: "PATCH", headers: intest({ "Content-Type": "application/json", Prefer: "return=minimal" }), body: JSON.stringify(corpo),
  });
  return r.ok;
}
async function inserisciOAggiorna(tabella, corpo, chiave) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabella}?on_conflict=${chiave}`, {
    method: "POST", headers: intest({ "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify(corpo),
  });
  return r.ok;
}

/* L'italiano non mette il punto delle migliaia sotto 10.000 ("8265,65"): lo si forza a mano. */
const euro = (n) => {
  if (n == null || n === "") return "—";
  const v = Number(n), [i, d] = Math.abs(v).toFixed(2).split(".");
  return (v < 0 ? "−" : "") + i.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + d + " €";
};
const dataBreve = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "short" }) : "—");
const dataIt = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const oraIt = (t) => (t ? new Date(t).toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const MESI = ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
const meseEsteso = (m) => { if (!m) return "—"; const [a, mm] = m.split("-"); const n = MESI[parseInt(mm, 10) - 1] || mm; return `${n.charAt(0).toUpperCase() + n.slice(1)} ${a}`; };

const CANALI = { AIRBNB: ["#FF5A5F", "Airbnb"], BOOKING: ["#003580", "Booking"], BE: ["#B08D57", "Sito"], DIRECT: ["#4D7C5B", "Diretta"], EXPEDIA: ["#E0A800", "Expedia"], VRBO: ["#1668E3", "Vrbo"] };
const canale = (c) => CANALI[String(c || "").toUpperCase()] || ["#94A3B8", c || "—"];

/* ───────────────────────────── stile ───────────────────────────── */

const CSS = `
.fx{--ink:#0F172A;--ink2:#334155;--mute:#64748B;--faint:#94A3B8;--line:#E5E7EB;--line2:#F1F5F9;--card:#fff;
  --acc:#4F46E5;--acc2:#EEF2FF;--ok:#047857;--okbg:#ECFDF5;--warn:#B45309;--warnbg:#FFFBEB;--err:#B91C1C;--errbg:#FEF2F2;
  font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);font-size:13.5px;line-height:1.45;-webkit-font-smoothing:antialiased}
.fx *{box-sizing:border-box}
.fx h1{font-size:22px;font-weight:650;letter-spacing:-.02em;margin:0}
.fx h2{font-size:15px;font-weight:600;letter-spacing:-.01em;margin:0}
.fx .sub{color:var(--mute);font-size:13px;margin-top:4px}
.fx input,.fx select,.fx textarea{font:inherit;font-size:13.5px;background:#fff;border:1px solid var(--line);color:var(--ink);padding:8px 11px;width:100%;outline:none;border-radius:8px;transition:border-color .12s,box-shadow .12s}
.fx input:hover,.fx select:hover,.fx textarea:hover{border-color:#CBD5E1}
.fx input:focus,.fx select:focus,.fx textarea:focus{border-color:var(--acc);box-shadow:0 0 0 3px rgba(79,70,229,.12)}
.fx input[type=checkbox]{width:16px;height:16px;padding:0;accent-color:var(--acc)}
.fx button{font:inherit;cursor:pointer;border-radius:8px;transition:background .12s,border-color .12s,color .12s}
.fx .btn{display:inline-flex;align-items:center;gap:7px;background:#fff;color:var(--ink2);border:1px solid var(--line);padding:7px 13px;font-size:13px;font-weight:500}
.fx .btn:hover{border-color:#CBD5E1;background:#FAFAFA}
.fx .btn.pri{background:var(--acc);border-color:var(--acc);color:#fff}
.fx .btn.pri:hover{background:#4338CA}
.fx .btn:disabled{opacity:.5;cursor:default}
.fx .card{background:var(--card);border:1px solid var(--line);border-radius:12px}
.fx .pill{display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border-radius:999px;font-size:11.5px;font-weight:500;background:var(--line2);color:var(--mute);white-space:nowrap}
.fx .pill.ok{background:var(--okbg);color:var(--ok)}.fx .pill.warn{background:var(--warnbg);color:var(--warn)}.fx .pill.err{background:var(--errbg);color:var(--err)}.fx .pill.acc{background:var(--acc2);color:var(--acc)}
.fx .dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex:none}
.fx .lab{display:block;font-size:12px;font-weight:500;color:var(--ink2);margin-bottom:6px}
.fx .hint{font-size:12px;color:var(--mute);margin-top:5px}
.fx .tabs{display:flex;gap:2px;border-bottom:1px solid var(--line);margin:18px 0 20px;overflow-x:auto}
.fx .tab{display:inline-flex;align-items:center;gap:8px;background:none;border:none;border-bottom:2px solid transparent;border-radius:0;padding:10px 14px;margin-bottom:-1px;color:var(--mute);font-size:13.5px;font-weight:500;white-space:nowrap}
.fx .tab:hover{color:var(--ink)}
.fx .tab.on{color:var(--ink);border-bottom-color:var(--acc)}
.fx table{width:100%;border-collapse:separate;border-spacing:0}
.fx th{background:#FAFAFB;text-align:left;font-size:11.5px;font-weight:500;color:var(--mute);padding:10px 14px;border-bottom:1px solid var(--line);white-space:nowrap}
.fx td{padding:12px 14px;border-bottom:1px solid var(--line2);vertical-align:middle}
.fx tbody tr{cursor:pointer}.fx tbody tr:hover td{background:#FAFAFF}
.fx tbody tr.sel td{background:var(--acc2)}
.fx .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.fx .muted{color:var(--mute);font-size:12px}
.fx .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
.fx .kpi{padding:16px 18px}
.fx .kpi .t{font-size:12.5px;color:var(--mute);font-weight:500}
.fx .kpi .v{font-size:24px;font-weight:650;letter-spacing:-.02em;margin-top:6px;font-variant-numeric:tabular-nums}
.fx .kpi .n{font-size:12px;color:var(--faint);margin-top:2px}
.fx .search{position:relative}.fx .search svg{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--faint)}.fx .search input{padding-left:32px}
.fx .drawer-bg{position:fixed;inset:0;background:rgba(15,23,42,.25);z-index:60;animation:fxf .15s}
.fx .drawer{position:fixed;top:0;right:0;bottom:0;width:min(520px,100vw);background:#fff;z-index:61;box-shadow:-12px 0 40px rgba(15,23,42,.12);display:flex;flex-direction:column;animation:fxs .18s ease-out}
@keyframes fxs{from{transform:translateX(30px);opacity:0}to{transform:none;opacity:1}}@keyframes fxf{from{opacity:0}to{opacity:1}}
.fx .row{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--line2);font-size:13px}
.fx .row span:first-child{color:var(--mute)}.fx .row span:last-child{font-variant-numeric:tabular-nums;text-align:right}
.fx .row.tot{border-bottom:none;font-weight:600;padding-top:12px}
.fx .sec{padding:20px 22px;border-bottom:1px solid var(--line2)}
.fx .sec:last-child{border-bottom:none}
.fx .grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}
.fx .split{display:grid;grid-template-columns:minmax(260px,340px) 1fr;gap:16px;align-items:start}
@media (max-width:860px){.fx .split{grid-template-columns:1fr}}
.fx .alist{max-height:calc(100vh - 320px);min-height:420px;overflow:auto}
.fx .aitem{display:flex;align-items:center;gap:10px;padding:11px 14px;border-bottom:1px solid var(--line2);cursor:pointer}
.fx .aitem:hover{background:#FAFAFF}.fx .aitem.on{background:var(--acc2)}
.fx .seg{display:inline-flex;background:var(--line2);border-radius:8px;padding:3px;gap:2px}
.fx .seg button{border:none;background:none;padding:6px 12px;font-size:12.5px;color:var(--mute);border-radius:6px}
.fx .seg button.on{background:#fff;color:var(--ink);box-shadow:0 1px 2px rgba(15,23,42,.08)}
.fx .note{display:flex;gap:10px;padding:12px 14px;border-radius:10px;font-size:13px}
.fx .note.warn{background:var(--warnbg);color:#78350F}.fx .note.info{background:var(--line2);color:var(--ink2)}
/* il planner condiviso col CRM: stessi bottoni e linee */
.fx .bg{background:#fff;color:var(--ink2);border:1px solid var(--line);padding:6px 12px;font-size:12.5px;font-weight:500}
.fx .bg:hover{border-color:#CBD5E1}.fx .bp{background:var(--acc);color:#fff;border:none;padding:7px 13px;font-size:12.5px;font-weight:500}
.fx .gl{height:1px;background:var(--line)}
`;

const ICONE = {
  cal: "M8 2v3M16 2v3M3.5 9h17M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  list: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  gear: "M4 6h16M4 12h16M4 18h16M8 4v4M16 10v4M10 16v4",
  sync: "M21 12a9 9 0 0 1-15.5 6.2M3 12a9 9 0 0 1 15.5-6.2M21 4v5h-5M3 20v-5h5",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
  x: "M18 6 6 18M6 6l12 12",
  warn: "M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  check: "M20 6 9 17l-5-5",
  chart: "M3 3v18h18M7 15l4-4 3 3 5-6",
  euro: "M18 7a7 7 0 1 0 0 10M4 10h9M4 14h9",
};
const Ico = ({ n, s = 16 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none" }}><path d={ICONE[n]} /></svg>
);

const Kpi = ({ t, v, n, tono }) => (
  <div className="card kpi">
    <div className="t">{t}</div>
    <div className="v" style={{ color: tono === "warn" ? "var(--warn)" : tono === "ok" ? "var(--ok)" : undefined }}>{v}</div>
    {n && <div className="n">{n}</div>}
  </div>
);
const Cerca = ({ v, set, ph, w = 320 }) => (
  <div className="search" style={{ flex: `0 1 ${w}px`, minWidth: 200 }}><Ico n="search" s={15} /><input value={v} onChange={(e) => set(e.target.value)} placeholder={ph} /></div>
);
const Vuoto = ({ t }) => <div style={{ padding: "48px 20px", textAlign: "center", color: "var(--mute)" }}>{t}</div>;
const Campo = ({ l, h, children }) => <div><label className="lab">{l}</label>{children}{h && <div className="hint">{h}</div>}</div>;
const SiNo = ({ v, onChange, si = "Sì", no = "No" }) => (
  <select value={String(!!v)} onChange={(e) => onChange(e.target.value === "true")}><option value="true">{si}</option><option value="false">{no}</option></select>
);

/* ───────────────────────────── Prenotazioni ───────────────────────────── */

function Prenotazioni({ modello }) {
  const sub = modello === "sublocazione";
  const [ana, setAna] = useState({});
  useEffect(() => { caricaAnagrafica().then(({ app }) => setAna(Object.fromEntries(app.map((a) => [a.id_room_type, a])))); }, []);
  const [righe, setRighe] = useState(null);
  const [cerca, setCerca] = useState("");
  const [mese, setMese] = useState("");
  const [filtro, setFiltro] = useState("tutte");
  const [aperta, setAperta] = useState(null);
  const [limite, setLimite] = useState(100);

  useEffect(() => { leggiTutto("v_fat_prenotazione", "?select=*&order=arrivo.desc").then(setRighe); }, []);
  const mesi = useMemo(() => [...new Set((righe || []).map((r) => r.mese_rendiconto).filter(Boolean))].sort().reverse(), [righe]);

  const filtrate = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    return (righe || []).filter((r) => {
      if ((r.tipo_gestione || "gestione") !== modello) return false;
      if (mese && r.mese_rendiconto !== mese) return false;
      if (filtro === "avvisi" && !(r.avvisi || []).length) return false;
      if (filtro === "pronte" && (r.avvisi || []).length) return false;
      if (!q) return true;
      const x = ana[r.id_room_type];
      return [r.ospite, r.cod_reservation, r.nome_kross, r.nome_proprieta, r.email, r.canale, String(r.id_reservation), nomeOwn(x?.own), x?.prop?.agente, x?.prop?.gestore_interno]
        .some((x) => String(x || "").toLowerCase().includes(q));
    });
  }, [righe, cerca, mese, filtro, modello, ana]);
  useEffect(() => { setLimite(100); setAperta(null); }, [cerca, mese, filtro, modello]);

  const tot = useMemo(() => filtrate.reduce((a, r) => ({
    ospite: a.ospite + (Number(r.totale_ospite) || 0),
    prov: a.prov + (Number(r.prov_netta) || 0),
    prop: a.prop + (Number(r.quota_proprietario_lorda) || 0),
    ota: a.ota + (Number(r.ota) || 0),
    pul: a.pul + (Number(r.pulizie) || 0),
  }), { ospite: 0, prop: 0, prov: 0, ota: 0, pul: 0 }), [filtrate]);
  const chiudi = useCallback(() => setAperta(null), []);

  if (!righe) return <Vuoto t="Carico le prenotazioni…" />;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="kpis">
        <Kpi t="Prenotazioni" v={filtrate.length.toLocaleString("it-IT")} n={mese ? meseEsteso(mese) : "tutti i mesi"} />
        <Kpi t="Pagato dagli ospiti" v={euro(tot.ospite)} />
        {sub ? <>
          <Kpi t="Commissioni OTA" v={euro(tot.ota)} />
          <Kpi t="Pulizie" v={euro(tot.pul)} />
        </> : <>
          <Kpi t="Provvigioni (netto IVA)" v={euro(tot.prov)} />
          <Kpi t="Quota proprietari" v={euro(tot.prop)} />
        </>}
      </div>
      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", padding: 14, borderBottom: "1px solid var(--line)" }}>
          <Cerca v={cerca} set={setCerca} ph="Cerca ospite, appartamento, codice, email…" w={360} />
          <select value={mese} onChange={(e) => setMese(e.target.value)} style={{ width: 180 }}>
            <option value="">Tutti i mesi</option>
            {mesi.map((m) => <option key={m} value={m}>{meseEsteso(m)}</option>)}
          </select>
          <div className="seg" style={{ marginLeft: "auto" }}>
            {[["tutte", "Tutte"], ["avvisi", "Con avvisi"], ["pronte", "Pronte"]].map(([k, t]) => <button key={k} className={filtro === k ? "on" : ""} onClick={() => setFiltro(k)}>{t}</button>)}
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr>
              <th>Ospite</th><th>Appartamento</th><th>Soggiorno</th><th>Canale</th>
              <th className="num">Totale ospite</th>{sub ? <><th className="num">Pulizie</th><th className="num">Commissione OTA</th></> : <><th className="num">Provvigione</th><th className="num">Al proprietario</th></>}<th>Stato</th>
            </tr></thead>
            <tbody>
              {filtrate.slice(0, limite).map((r) => {
                const [col, can] = canale(r.canale);
                const nav = (r.avvisi || []).length;
                return (
                  <tr key={r.id_reservation} className={aperta?.id_reservation === r.id_reservation ? "sel" : ""} onClick={() => setAperta(r)}>
                    <td><div style={{ fontWeight: 500 }}>{r.ospite || "—"}</div><div className="muted">{r.cod_reservation}</div></td>
                    <td><div>{r.nome_proprieta || r.nome_kross}</div><div className="muted">{[nomeOwn(ana[r.id_room_type]?.own), ana[r.id_room_type]?.prop?.gestore_interno && "PM " + ana[r.id_room_type].prop.gestore_interno].filter(Boolean).join(" · ") || "—"}</div></td>
                    <td style={{ whiteSpace: "nowrap" }}><div>{dataBreve(r.arrivo)} – {dataBreve(r.partenza)}</div><div className="muted">{r.notti} notti</div></td>
                    <td><span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><span className="dot" style={{ background: col }} />{can}</span></td>
                    <td className="num">{euro(r.totale_ospite)}</td>
                    {sub ? <>
                      <td className="num">{euro(r.pulizie)}</td>
                      <td className="num">{euro(r.ota)}</td>
                    </> : <>
                      <td className="num">{euro(r.prov_netta)}</td>
                      <td className="num">{euro(r.quota_proprietario_lorda)}</td>
                    </>}
                    <td>{nav ? <span className="pill warn">{nav} {nav === 1 ? "avviso" : "avvisi"}</span> : <span className="pill ok">Pronta</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtrate.length === 0 && <Vuoto t="Nessuna prenotazione con questi filtri." />}
        </div>
        {filtrate.length > limite && <div style={{ textAlign: "center", padding: 14, borderTop: "1px solid var(--line)" }}><button className="btn" onClick={() => setLimite(limite + 200)}>Mostra altre {Math.min(200, filtrate.length - limite)} (ne restano {filtrate.length - limite})</button></div>}
      </div>
      {aperta && <DettaglioPrenotazione r={aperta} a={ana[aperta.id_room_type]} chiudi={chiudi} />}
    </div>
  );
}

function DettaglioPrenotazione({ r, a, chiudi }) {
  const sub = r.tipo_gestione === "sublocazione";
  const [int, setInt] = useState(undefined);
  const [boz, setBoz] = useState([]);
  useEffect(() => {
    setInt(undefined);
    Promise.all([
      leggi("v_fat_intestatario_calcolato", `?id_reservation=eq.${r.id_reservation}&select=*`),
      leggi("fat_bozze", `?id_reservation=eq.${r.id_reservation}&select=tipo,stato,totale,fic_numero`),
    ]).then(([i, b]) => { setInt(i[0] || null); setBoz(b); });
  }, [r.id_reservation]);
  useEffect(() => { const k = (e) => e.key === "Escape" && chiudi(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [chiudi]);
  const [col, can] = canale(r.canale);

  return (
    <>
      <div className="drawer-bg" onClick={chiudi} />
      <aside className="drawer">
        <div style={{ padding: "20px 22px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div className="muted" style={{ display: "flex", alignItems: "center", gap: 7 }}><span className="dot" style={{ background: col }} />{can} · {r.cod_reservation}</div>
            <h2 style={{ fontSize: 18, marginTop: 4 }}>{r.ospite || "—"}</h2>
            <div className="sub">{r.nome_proprieta || r.nome_kross} · {dataIt(r.arrivo)} – {dataIt(r.partenza)} · {r.notti} notti</div>
          </div>
          <button className="btn" onClick={chiudi} aria-label="Chiudi" style={{ padding: 7, height: 34 }}><Ico n="x" /></button>
        </div>
        <div style={{ overflow: "auto", flex: 1 }}>
          {(r.avvisi || []).length > 0 && (
            <div className="sec"><div className="note warn"><Ico n="warn" /><div>{r.avvisi.map((a, i) => <div key={i}>{a}</div>)}</div></div></div>
          )}
          <div className="sec">
            <h2 style={{ marginBottom: 6 }}>Persone</h2>
            {!a?.prop ? <div className="note warn"><Ico n="warn" />Appartamento non collegato a una proprietà del CRM.</div> : <>
              <div className="row"><span>Proprietario</span><span>{nomeOwn(a.own) || "—"}{a.own?.codice_fiscale ? ` · ${a.own.codice_fiscale}` : ""}</span></div>
              {a.own && <div className="row"><span>Contatti proprietario</span><span>{[a.own.email, a.own.telefono].filter(Boolean).join(" · ") || "—"}</span></div>}
              <div className="row"><span>Property manager</span><span>{a.prop.gestore_interno || "—"}</span></div>
              <div className="row"><span>Agente</span><span>{a.prop.agente || "—"}</span></div>
              {!sub && a.prop.agente && <div className="row"><span>Quota agente {a.regola?.agente_pct != null ? `(${String(a.regola.agente_pct).replace(".", ",")}% della provvigione)` : ""}</span>
                <span>{a.regola?.agente_pct != null ? euro((Number(r.prov_netta) || 0) * a.regola.agente_pct / 100) : <span className="pill warn">% da decidere</span>}</span></div>}
            </>}
          </div>
          <div className="sec">
            <h2 style={{ marginBottom: 8 }}>Intestatario della fattura</h2>
            {int === undefined ? <div className="muted">Carico…</div> : int ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <b>{int.denominazione || "—"}</b>
                  <span className="pill acc">{int.tipo === "pa" ? "Pubblica amministrazione" : int.tipo === "azienda" ? "Azienda" : "Privato"}</span>
                </div>
                <div style={{ marginTop: 10 }}>
                  {[["Partita IVA", int.partita_iva], ["Codice fiscale", int.codice_fiscale], ["Codice SDI", int.codice_sdi], ["PEC", int.pec],
                    ["Indirizzo", [int.indirizzo, int.cap, int.citta, int.nazione].filter(Boolean).join(", ")]].map(([k, v]) => (
                    <div className="row" key={k}><span>{k}</span><span>{v || "—"}</span></div>
                  ))}
                </div>
                <div className="hint">Fonte: {int.fonte === "checkin_kross" ? "dati di fatturazione inseriti in Kross" : int.fonte}</div>
                {(int.avvisi || []).map((a, i) => <div key={i} className="hint" style={{ color: "var(--warn)" }}>⚠ {a}</div>)}
              </>
            ) : <div className="note info">I dati di fatturazione di questa prenotazione non sono ancora stati letti da Kross. Arrivano con la prossima sincronizzazione.</div>}
          </div>
          <div className="sec">
            <h2 style={{ marginBottom: 6 }}>Calcolo</h2>
            {[["Alloggio", r.alloggio], ["Pulizie", r.pulizie], ["Tassa di soggiorno", r.tassa], ["Totale pagato dall'ospite", r.totale_ospite]].map(([k, v]) => <div className="row" key={k}><span>{k}</span><span>{euro(v)}</span></div>)}
            <div className="row"><span>Commissione OTA (+ IVA {euro(r.ota_iva)})</span><span>− {euro(r.ota)}</span></div>
            {!sub && <>
            <div className="row"><span>Base provvigione · {String(r.base_calcolo || "").replace(/_/g, " ")}</span><span>{euro(r.base_importo)}</span></div>
            <div className="row"><span>Provvigione {r.comm_pct_netta != null ? `(${Number(r.comm_pct_netta).toFixed(2).replace(".", ",")}% netto IVA)` : ""}</span><span>{euro(r.prov_netta)}</span></div>
            <div className="row"><span>IVA sulla provvigione</span><span>{euro(r.prov_iva)}</span></div>
            <div className="row"><span>Quota proprietario lorda</span><span>{euro(r.quota_proprietario_lorda)}</span></div>
            <div className="row"><span>Cedolare trattenuta</span><span>{euro(r.cedolare)}</span></div>
            <div className="row tot"><span style={{ color: "var(--ink)" }}>Netto al proprietario</span><span>{euro(r.netto_proprietario)}</span></div>
            </>}
            {sub && <div className="row tot"><span style={{ color: "var(--ink)" }}>Incasso netto OTA</span><span>{euro((Number(r.totale_ospite) || 0) - (Number(r.ota) || 0) - (Number(r.ota_iva) || 0))}</span></div>}
            <div className="hint">Rendiconto di {meseEsteso(r.mese_rendiconto)}.</div>
          </div>
          <div className="sec">
            <h2 style={{ marginBottom: 8 }}>Bozze</h2>
            {boz.length ? boz.map((b, i) => <div className="row" key={i}><span>{b.tipo.replace(/_/g, " ")}</span><span><span className="pill">{b.stato}</span> {euro(b.totale)}</span></div>)
              : <div className="muted">Nessuna bozza ancora.</div>}
          </div>
        </div>
      </aside>
    </>
  );
}

/* ───────────────────────────── Appartamenti (criteri) ───────────────────────────── */

/* Anagrafica: appartamenti Kross + proprietà CRM (agente, property manager) + proprietario + regola. */
async function caricaAnagrafica() {
  const [k, r, pr, ow, co] = await Promise.all([
    leggi("kross_appartamenti", "?select=id_room_type,nome_kross,citta,provincia,indirizzo,cin,tipo_gestione,proprieta_id&order=nome_kross"),
    leggi("fat_regole", "?select=*"),
    leggi("proprieta", "?select=id,nome,agente,gestore_interno,proprietario_id"),
    leggi("proprietari", "?select=id,nome,cognome,codice_fiscale,email,telefono,pec,indirizzo,citta"),
    leggi("collaboratori", "?select=nome,ruolo,attivo&order=nome"),
  ]);
  const reg = Object.fromEntries(r.map((x) => [x.id_room_type, x]));
  const prop = Object.fromEntries(pr.map((x) => [x.id, x]));
  const own = Object.fromEntries(ow.map((x) => [x.id, x]));
  const app = k.map((a) => {
    const p = prop[a.proprieta_id] || null;
    return { ...a, regola: reg[a.id_room_type] || null, prop: p, own: p ? own[p.proprietario_id] || null : null };
  });
  const team = co.filter((c) => c.attivo !== false).map((c) => ({ nome: String(c.nome || "").trim(), ruolo: c.ruolo || "" })).filter((c) => c.nome);
  return { app, team };
}
const nomeOwn = (o) => (o ? [o.nome, o.cognome].filter(Boolean).join(" ") : "");

const DEFAULT_REGOLA = {
  modello: "gestione", commissione: null, commissione_iva_inclusa: true, base_calcolo: "alloggio_meno_ota",
  addebita_ota_al_proprietario: true, addebita_pulizie_al_proprietario: true, sostituto_imposta: null, cedolare_pct: 21,
  chi_fattura_ospite: null, iva_alloggio: null, pulizie_iva_inclusa: true, attiva_fatturazione: false, confermata: false, note: null, agente_pct: null, pm_pct: null,
};
const statoRegola = (r) => (r.attiva_fatturazione ? ["ok", "Attiva"] : r.confermata ? ["acc", "Confermata"] : ["warn", "Da confermare"]);
const triVal = (v) => (v === null || v === undefined ? "" : String(v));
const triOut = (s) => (s === "" ? null : s === "true");

function Appartamenti({ modello }) {
  const [app, setApp] = useState(null);
  const [cerca, setCerca] = useState("");
  const [filtro, setFiltro] = useState("tutti");
  const [sel, setSel] = useState(null);
  const [team, setTeam] = useState([]);

  const carica = useCallback(async () => {
    const { app: lista, team: t } = await caricaAnagrafica();
    setApp(lista); setTeam(t);
    return lista;
  }, []);
  useEffect(() => { carica(); }, [carica]);

  const elenco = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    return (app || []).filter((a) => {
      const r = a.regola || DEFAULT_REGOLA;
      if ((a.regola?.modello || a.tipo_gestione || "gestione") !== modello) return false;
      if (filtro === "attivi" && !r.attiva_fatturazione) return false;
      if (filtro === "daconf" && r.confermata) return false;
      return !q || [a.nome_kross, a.citta, a.indirizzo, nomeOwn(a.own), a.prop?.agente, a.prop?.gestore_interno].some((x) => String(x || "").toLowerCase().includes(q));
    });
  }, [app, cerca, filtro, modello]);

  const conti = useMemo(() => {
    const r = (app || []).filter((a) => (a.regola?.modello || a.tipo_gestione || "gestione") === modello).map((a) => a.regola || DEFAULT_REGOLA);
    return { tot: r.length, conf: r.filter((x) => x.confermata).length, att: r.filter((x) => x.attiva_fatturazione).length,
      aperti: r.filter((x) => x.sostituto_imposta === null || x.chi_fattura_ospite === null).length };
  }, [app, modello]);
  useEffect(() => { if (elenco.length && !elenco.some((a) => a.id_room_type === sel)) setSel(elenco[0].id_room_type); }, [elenco, sel]);

  if (!app) return <Vuoto t="Carico gli appartamenti da Kross…" />;
  const scelto = elenco.find((a) => a.id_room_type === sel);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="kpis">
        <Kpi t={modello === "sublocazione" ? "Sublocazioni su Kross" : "Gestioni su Kross"} v={conti.tot} />
        <Kpi t="Regole confermate" v={`${conti.conf} / ${conti.tot}`} tono={conti.conf < conti.tot ? "warn" : "ok"} />
        <Kpi t="Fatturazione attiva" v={conti.att} />
        <Kpi t="Decisioni fiscali aperte" v={conti.aperti} n="sostituto d'imposta o chi fattura l'ospite" tono={conti.aperti ? "warn" : "ok"} />
      </div>
      <div className="split">
        <div className="card" style={{ overflow: "hidden" }}>
          <div style={{ padding: 12, borderBottom: "1px solid var(--line)", display: "grid", gap: 10 }}>
            <Cerca v={cerca} set={setCerca} ph="Cerca appartamento, città, proprietario…" w={400} />
            <div className="seg">
              {[["tutti", "Tutti"], ["daconf", "Da confermare"], ["attivi", "Attivi"]].map(([k, t]) => <button key={k} className={filtro === k ? "on" : ""} onClick={() => setFiltro(k)}>{t}</button>)}
            </div>
          </div>
          <div className="alist">
            {elenco.map((a) => {
              const [tono, eti] = statoRegola(a.regola || DEFAULT_REGOLA);
              return (
                <div key={a.id_room_type} className={"aitem" + (sel === a.id_room_type ? " on" : "")} onClick={() => setSel(a.id_room_type)}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.nome_kross}</div>
                    <div className="muted" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{[a.citta, nomeOwn(a.own)].filter(Boolean).join(" · ") || "—"}</div>
                  </div>
                  <span className={"pill " + tono}>{eti}</span>
                </div>
              );
            })}
            {elenco.length === 0 && <Vuoto t="Nessun appartamento." />}
          </div>
        </div>
        {scelto ? <SchedaRegola key={scelto.id_room_type} a={scelto} team={team} salvato={carica} /> : <div className="card"><Vuoto t="Scegli un appartamento dall'elenco." /></div>}
      </div>
    </div>
  );
}

const CAMPI_OWN = [["nome", "Nome"], ["cognome", "Cognome"], ["codice_fiscale", "Codice fiscale / P.IVA"], ["email", "Email"], ["telefono", "Telefono"], ["pec", "PEC"], ["indirizzo", "Indirizzo"], ["citta", "Città"]];

function SceltaPersona({ v, onChange, team, ph }) {
  const nomi = team.map((t) => t.nome);
  const fuori = v && !nomi.some((n) => n.toLowerCase() === String(v).trim().toLowerCase());
  return (
    <>
      <select value={v || ""} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">{ph}</option>
        {fuori && <option value={v}>{v} (non è nel team)</option>}
        {team.map((t) => <option key={t.nome} value={t.nome}>{t.nome}{t.ruolo ? ` · ${t.ruolo.trim()}` : ""}</option>)}
      </select>
      {fuori && <div className="hint" style={{ color: "var(--warn)" }}>Il nome non corrisponde a nessun collaboratore: sceglilo dall'elenco, così vede l'appartamento nel CRM.</div>}
    </>
  );
}

function SchedaRegola({ a, team, salvato }) {
  const iniziale = useMemo(() => ({ ...DEFAULT_REGOLA, ...(a.regola || {}), id_room_type: a.id_room_type }), [a]);
  const [b, setB] = useState(iniziale);
  const persIniz = useMemo(() => ({ agente: a.prop?.agente || null, gestore_interno: a.prop?.gestore_interno || null }), [a]);
  const [pers, setPers] = useState(persIniz);
  const ownIniz = useMemo(() => Object.fromEntries(CAMPI_OWN.map(([k]) => [k, a.own?.[k] || ""])), [a]);
  const [own, setOwn] = useState(ownIniz);
  const [msg, setMsg] = useState(null);
  const [lavoro, setLavoro] = useState(false);
  const set = (k, v) => { setB((x) => ({ ...x, [k]: v })); setMsg(null); };
  const modificato = JSON.stringify(b) !== JSON.stringify(iniziale) || JSON.stringify(pers) !== JSON.stringify(persIniz) || JSON.stringify(own) !== JSON.stringify(ownIniz);
  const sub = b.modello === "sublocazione";
  const num = (v) => (v === "" || v == null ? null : Number(v));

  const salva = async () => {
    setLavoro(true);
    const corpo = {
      id_room_type: a.id_room_type, modello: b.modello, commissione: num(b.commissione), commissione_iva_inclusa: !!b.commissione_iva_inclusa,
      base_calcolo: b.base_calcolo, addebita_ota_al_proprietario: !!b.addebita_ota_al_proprietario,
      addebita_pulizie_al_proprietario: !!b.addebita_pulizie_al_proprietario, sostituto_imposta: b.sostituto_imposta,
      cedolare_pct: num(b.cedolare_pct), chi_fattura_ospite: b.chi_fattura_ospite || null, iva_alloggio: num(b.iva_alloggio),
      pulizie_iva_inclusa: !!b.pulizie_iva_inclusa, confermata: !!b.confermata, attiva_fatturazione: !!b.confermata && !!b.attiva_fatturazione,
      note: b.note || null, agente_pct: num(b.agente_pct), pm_pct: num(b.pm_pct), aggiornato_il: new Date().toISOString(),
    };
    let ok = a.regola ? await aggiorna("fat_regole", `id_room_type=eq.${a.id_room_type}`, corpo) : await inserisciOAggiorna("fat_regole", corpo, "id_room_type");
    if (ok && a.prop && JSON.stringify(pers) !== JSON.stringify(persIniz)) ok = await aggiorna("proprieta", `id=eq.${a.prop.id}`, pers);
    if (ok && a.own && JSON.stringify(own) !== JSON.stringify(ownIniz)) ok = await aggiorna("proprietari", `id=eq.${a.own.id}`, Object.fromEntries(Object.entries(own).map(([k, v]) => [k, String(v).trim() || null])));
    setLavoro(false);
    if (ok) { setMsg(["ok", "Modifiche salvate"]); salvato(); }
    else setMsg(["err", "Salvataggio non riuscito. Controlla di aver fatto l'accesso."]);
  };

  const [tono, eti] = statoRegola(a.regola || DEFAULT_REGOLA);

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}><h2 style={{ fontSize: 17 }}>{a.nome_kross}</h2><span className={"pill " + tono}>{eti}</span></div>
          <div className="sub">{[a.indirizzo, a.citta, a.provincia].filter(Boolean).join(", ") || "Indirizzo non presente su Kross"}{a.cin ? ` · CIN ${a.cin}` : ""}</div>
        </div>
        <div className="muted">ID Kross {a.id_room_type}</div>
      </div>

      <div className="sec">
        <h2 style={{ marginBottom: 4 }}>{sub ? "Proprietario (locatore)" : "Proprietario"}</h2>
        <div className="sub" style={{ marginBottom: 14 }}>{sub ? "Chi ci affitta l'immobile." : "Intestatario della fattura delle provvigioni e destinatario del rendiconto."}</div>
        {!a.prop ? (
          <div className="note warn"><Ico n="warn" />Questo appartamento di Kross non è collegato a nessuna proprietà del CRM: niente proprietario, agente né property manager. Va collegato nel CRM, sezione Proprietà.</div>
        ) : !a.own ? (
          <div className="note warn"><Ico n="warn" />La proprietà «{a.prop.nome}» non ha un proprietario collegato nel CRM.</div>
        ) : (
          <>
            <div className="grid2">
              {CAMPI_OWN.map(([k, l]) => <Campo key={k} l={l}><input value={own[k]} onChange={(e) => { const v = e.target.value; setOwn((x) => ({ ...x, [k]: v })); setMsg(null); }} /></Campo>)}
            </div>
            {(() => {
              const manca = [["codice_fiscale", "codice fiscale"], ["indirizzo", "indirizzo"], ["email", "email"]].filter(([k]) => !String(own[k]).trim()).map(([, l]) => l);
              return manca.length > 0 && <div className="hint" style={{ color: "var(--warn)" }}>Per fatturare servono anche: {manca.join(", ")}.</div>;
            })()}
          </>
        )}
      </div>

      <div className="sec">
        <h2 style={{ marginBottom: 14 }}>Chi segue l'appartamento</h2>
        {!a.prop ? <div className="muted">Disponibile dopo il collegamento alla proprietà nel CRM.</div> : (
          <div className="grid2">
            <Campo l="Property manager" h="Segue l'appartamento e lo vede nel CRM.">
              <SceltaPersona v={pers.gestore_interno} onChange={(v) => { setPers((x) => ({ ...x, gestore_interno: v })); setMsg(null); }} team={team} ph="Nessuno" />
            </Campo>
            <Campo l="Agente" h="Chi ha portato il mandato.">
              <SceltaPersona v={pers.agente} onChange={(v) => { setPers((x) => ({ ...x, agente: v })); setMsg(null); }} team={team} ph="Nessun agente" />
            </Campo>
            <Campo l="% property manager solo per questo appartamento" h="Vuoto = vale la % generale della persona (Costi e compensi).">
              <input type="number" step="0.01" value={b.pm_pct ?? ""} onChange={(e) => set("pm_pct", e.target.value)} placeholder="come da compenso" />
            </Campo>
            {!sub && pers.agente && (
              <Campo l="Quota dell'agente (% sulla provvigione netta)" h="Regola in memoria per i mandati attuali: 20% ricorrente. Vuoto = da decidere.">
                <input type="number" step="0.01" value={b.agente_pct ?? ""} onChange={(e) => set("agente_pct", e.target.value)} placeholder="da decidere" />
              </Campo>
            )}
          </div>
        )}
      </div>

      <div className="sec">
        <h2 style={{ marginBottom: 14 }}>{b.modello === "sublocazione" ? "Contratto" : "Contratto e commissione"}</h2>
        <div className="grid2">
          <Campo l="Modello"><select value={b.modello} onChange={(e) => set("modello", e.target.value)}><option value="gestione">Gestione per conto terzi</option><option value="sublocazione">Sublocazione</option></select></Campo>
          {b.modello !== "sublocazione" && <>
          <Campo l="Commissione (%)"><input type="number" step="0.01" value={b.commissione ?? ""} onChange={(e) => set("commissione", e.target.value)} placeholder="es. 20" /></Campo>
          <Campo l="La commissione comprende l'IVA"><SiNo v={b.commissione_iva_inclusa} onChange={(x) => set("commissione_iva_inclusa", x)} si="Sì, IVA inclusa" no="No, IVA in aggiunta" /></Campo>
          <Campo l="Base di calcolo" h="Su cosa si applica la commissione.">
            <select value={b.base_calcolo} onChange={(e) => set("base_calcolo", e.target.value)}>
              <option value="alloggio_meno_ota">Alloggio meno commissione OTA</option><option value="alloggio_lordo">Alloggio lordo</option><option value="lordo_ospite">Totale pagato dall'ospite</option>
            </select>
          </Campo>
          <Campo l="Commissione OTA a carico del proprietario"><SiNo v={b.addebita_ota_al_proprietario} onChange={(x) => set("addebita_ota_al_proprietario", x)} /></Campo>
          <Campo l="Pulizie a carico del proprietario"><SiNo v={b.addebita_pulizie_al_proprietario} onChange={(x) => set("addebita_pulizie_al_proprietario", x)} /></Campo>
          </>}
        </div>
      </div>

      <div className="sec">
        <h2 style={{ marginBottom: 14 }}>Aspetti fiscali</h2>
        <div className="grid2">
          {b.modello !== "sublocazione" && <>
          <Campo l="Facciamo da sostituto d'imposta" h="Da decidere con il commercialista.">
            <select value={triVal(b.sostituto_imposta)} onChange={(e) => set("sostituto_imposta", triOut(e.target.value))}><option value="">Da decidere</option><option value="true">Sì</option><option value="false">No</option></select>
          </Campo>
          <Campo l="Cedolare secca (%)"><input type="number" step="0.01" value={b.cedolare_pct ?? ""} onChange={(e) => set("cedolare_pct", e.target.value)} /></Campo>
          </>}
          <Campo l="IVA sull'alloggio (%)" h="Vuoto = valore generale delle impostazioni."><input type="number" step="0.01" value={b.iva_alloggio ?? ""} onChange={(e) => set("iva_alloggio", e.target.value)} /></Campo>
          <Campo l="Pulizie: importo già con IVA"><SiNo v={b.pulizie_iva_inclusa} onChange={(x) => set("pulizie_iva_inclusa", x)} no="No, IVA da aggiungere" /></Campo>
        </div>
      </div>

      <div className="sec">
        <h2 style={{ marginBottom: 14 }}>Fattura all'ospite</h2>
        <div className="grid2">
          <Campo l="Chi emette la fattura all'ospite" h="Da decidere con il commercialista.">
            <select value={b.chi_fattura_ospite ?? ""} onChange={(e) => set("chi_fattura_ospite", e.target.value || null)}>
              <option value="">Da decidere</option><option value="valente">Valente Living</option><option value="proprietario">Il proprietario</option><option value="non_emessa">Nessuna fattura</option>
            </select>
          </Campo>
          <Campo l="Note"><textarea rows={3} value={b.note || ""} onChange={(e) => set("note", e.target.value)} placeholder="Accordi particolari, eccezioni…" /></Campo>
        </div>
      </div>

      <div style={{ padding: "16px 22px", background: "#FAFAFB", borderTop: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
          <input type="checkbox" checked={!!b.confermata} onChange={(e) => { const c = e.target.checked; setB((x) => ({ ...x, confermata: c, attiva_fatturazione: c ? x.attiva_fatturazione : false })); setMsg(null); }} /> Regola confermata
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: b.confermata ? "pointer" : "default", opacity: b.confermata ? 1 : .45 }}>
          <input type="checkbox" disabled={!b.confermata} checked={!!b.attiva_fatturazione && !!b.confermata} onChange={(e) => set("attiva_fatturazione", e.target.checked)} /> Fatturazione attiva
        </label>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          {msg && <span style={{ fontSize: 12.5, color: msg[0] === "ok" ? "var(--ok)" : "var(--err)", display: "inline-flex", gap: 5, alignItems: "center" }}>{msg[0] === "ok" && <Ico n="check" s={14} />}{msg[1]}</span>}
          <button className="btn" disabled={!modificato || lavoro} onClick={() => { setB(iniziale); setPers(persIniz); setOwn(ownIniz); setMsg(null); }}>Annulla</button>
          <button className="btn pri" disabled={!modificato || lavoro} onClick={salva}>{lavoro ? "Salvo…" : "Salva modifiche"}</button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────── Impostazioni ───────────────────────────── */

const PARAMETRI = {
  modalita: ["Modalità", "«prova»: si preparano solo bozze, nulla parte verso Fatture in Cloud."],
  iva_ordinaria: ["IVA ordinaria (%)", "Aliquota standard su provvigioni e servizi."],
  iva_sublocazione: ["IVA sublocazione (%)", "Da confermare con il commercialista."],
  pulizie_iva_inclusa: ["Pulizie con IVA inclusa", "Le pulizie addebitate all'ospite sono già comprensive di IVA."],
  metodo_competenza: ["Competenza", "Il rendiconto va nel mese del check-in, per l'intera prenotazione."],
  fic_sezionale: ["Sezionale Fatture in Cloud", "Lo stabilisce il commercialista."],
  fic_company_id: ["ID azienda Fatture in Cloud", "Si compila al collegamento."],
};

function Impostazioni({ stato, sincronizza, lavoro, esitoSync }) {
  const [conf, setConf] = useState(null);
  const [num, setNum] = useState(null);
  useEffect(() => {
    leggi("fat_config", "?select=*&order=chiave").then(setConf);
    Promise.all([conta("fat_kross_billing"), conta("fat_bozze", "&stato=eq.bozza"), conta("fat_bozze", "&stato=eq.emessa"), conta("v_fat_prenotazione", "&avvisi=neq.{}")])
      .then(([b, bo, em, av]) => setNum({ billing: b, bozze: bo, emesse: em, avvisi: av }));
  }, []);
  const salvaConf = async (c, v) => {
    const ok = await aggiorna("fat_config", `chiave=eq.${encodeURIComponent(c)}`, { valore: v === "" ? null : v, aggiornato_il: new Date().toISOString() });
    if (ok) setConf((x) => x.map((r) => (r.chiave === c ? { ...r, valore: v === "" ? null : v } : r)));
    return ok;
  };
  const fic = conf?.find((c) => c.chiave === "fic_company_id")?.valore;

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 980 }}>
      <div className="kpis">
        <Kpi t="Dati di fatturazione letti" v={num?.billing ?? "…"} n="prenotazioni con dati da Kross" />
        <Kpi t="Bozze da approvare" v={num?.bozze ?? "…"} />
        <Kpi t="Fatture emesse" v={num?.emesse ?? "…"} />
        <Kpi t="Prenotazioni con avvisi" v={num?.avvisi ?? "…"} tono={num?.avvisi ? "warn" : undefined} />
      </div>

      <div className="card">
        <div className="sec" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h2>Sincronizzazione con Kross</h2>
            <div className="sub">Automatica una volta al giorno alle 6:20. Ultima: <b style={{ color: "var(--ink)" }}>{oraIt(stato?.ultimo_sync)}</b>{stato?.ultimo_esito ? ` · ${stato.ultimo_esito}` : ""}</div>
            {esitoSync && <div className="hint">{esitoSync}</div>}
          </div>
          <button className="btn pri" onClick={sincronizza} disabled={lavoro}><Ico n="sync" s={15} />{lavoro ? "Sincronizzo…" : "Sincronizza adesso"}</button>
        </div>
      </div>

      <div className="card">
        <div className="sec"><h2>Parametri generali</h2><div className="sub">Valgono per tutti gli appartamenti, salvo diversa regola sulla scheda.</div></div>
        {!conf ? <Vuoto t="…" /> : conf.map((c) => <Parametro key={c.chiave} c={c} salva={salvaConf} />)}
      </div>

      <div className="card">
        <div className="sec" style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <h2>Fatture in Cloud</h2>
            <div className="sub">{fic ? `Collegato all'azienda ${fic}. Si inseriscono solo bozze: l'invio allo SdI resta manuale.` : "Non ancora collegato. Servono il token di accesso e il sezionale deciso dal commercialista."}</div>
          </div>
          <span className={"pill " + (fic ? "ok" : "warn")}>{fic ? "Collegato" : "Non collegato"}</span>
        </div>
      </div>
    </div>
  );
}

function Parametro({ c, salva }) {
  const [v, setV] = useState(c.valore ?? "");
  const [ok, setOk] = useState(null);
  const [nome, spiega] = PARAMETRI[c.chiave] || [c.chiave, c.nota || ""];
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center", padding: "14px 22px", borderTop: "1px solid var(--line2)", flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 300px" }}><div style={{ fontWeight: 500 }}>{nome}</div><div className="muted">{spiega}</div></div>
      <input value={v} onChange={(e) => { setV(e.target.value); setOk(null); }} style={{ width: 200 }} placeholder="non impostato" />
      <button className="btn" style={{ minWidth: 86, justifyContent: "center" }} disabled={v === (c.valore ?? "")} onClick={async () => setOk(await salva(c.chiave, v))}>
        {ok === true ? <><Ico n="check" s={14} />Salvato</> : ok === false ? "Errore" : "Salva"}
      </button>
    </div>
  );
}

/* ───────────────────────────── Margini (conto economico per appartamento) ─────────────────────────────

   Per ogni appartamento, nel periodo scelto (prenotazioni per mese di check-in):
     Incasso ospiti − commissioni OTA = netto OTA
     Ricavo Valente: gestione = provvigione netta IVA; sublocazione = incasso al netto IVA alloggio − OTA
     − property manager (fisso ripartito sui suoi appartamenti + % sul ricavo)
     − agente (% sulla provvigione, solo gestione)
     − costi: quelli dell'appartamento (affitto, bollette, …) + quota dei costi generali (gestionale, …)
     = margine Valente  */

const CATEGORIE_COSTO = [["affitto", "Affitto"], ["bollette", "Bollette e utenze"], ["gestionale", "Gestionale e software"], ["pulizie", "Pulizie"], ["manutenzione", "Manutenzione"], ["personale", "Personale"], ["altro", "Altro"]];
const etiCat = (c) => (CATEGORIE_COSTO.find(([k]) => k === c) || [c, c])[1];
const mesiDi = (periodo) => (periodo.length === 4 ? Array.from({ length: 12 }, (_, i) => `${periodo}-${String(i + 1).padStart(2, "0")}`) : [periodo]);
const attivoNelMese = (c, m) => c.attivo !== false && (!c.dal || c.dal.slice(0, 7) <= m) && (!c.al || c.al.slice(0, 7) >= m);
const pct = (v) => (v == null || !isFinite(v) ? "—" : `${v.toFixed(1).replace(".", ",")}%`);

async function caricaEconomia() {
  const [pren, { app, team }, costi, compensi, conf] = await Promise.all([
    leggiTutto("v_fat_prenotazione", "?select=id_room_type,mese_rendiconto,totale_ospite,ota,prov_netta,quota_proprietario_lorda,tipo_gestione"),
    caricaAnagrafica(),
    leggi("fat_costi", "?select=*&order=categoria,voce"),
    leggi("fat_compensi", "?select=*&order=persona"),
    leggi("fat_config", "?select=chiave,valore"),
  ]);
  const cfg = Object.fromEntries(conf.map((c) => [c.chiave, c.valore]));
  return { pren, app, team, costi, compensi, ivaSub: Number(cfg.iva_sublocazione) || 0 };
}

function calcolaMargini(eco, periodo) {
  const mesi = mesiDi(periodo);
  const { pren, app, costi, compensi, ivaSub } = eco;
  const comp = Object.fromEntries(compensi.map((c) => [c.persona.toLowerCase(), c]));
  const pmDi = (a) => String(a.prop?.gestore_interno || "").trim();
  const seguiti = {};
  app.forEach((a) => { const p = pmDi(a).toLowerCase(); if (p) seguiti[p] = (seguiti[p] || 0) + 1; });
  const nApp = app.length || 1;

  const righe = app.map((a) => {
    const sub = (a.regola?.modello || a.tipo_gestione) === "sublocazione";
    const ivaAll = a.regola?.iva_alloggio != null ? Number(a.regola.iva_alloggio) : ivaSub;
    const mie = pren.filter((p) => p.id_room_type === a.id_room_type && mesi.includes(p.mese_rendiconto));
    const incasso = mie.reduce((s, p) => s + (Number(p.totale_ospite) || 0), 0);
    const ota = mie.reduce((s, p) => s + (Number(p.ota) || 0), 0);
    const proprietario = sub ? 0 : mie.reduce((s, p) => s + (Number(p.quota_proprietario_lorda) || 0), 0);
    const ricavo = sub ? incasso / (1 + ivaAll / 100) - ota : mie.reduce((s, p) => s + (Number(p.prov_netta) || 0), 0);

    const pm = pmDi(a), c = comp[pm.toLowerCase()];
    const pmPct = a.regola?.pm_pct != null ? Number(a.regola.pm_pct) : c?.pct_provvigione != null ? Number(c.pct_provvigione) : 0;
    const pmFisso = c?.fisso_mensile ? (Number(c.fisso_mensile) / (seguiti[pm.toLowerCase()] || 1)) * mesi.length : 0;
    const costoPm = pmFisso + Math.max(ricavo, 0) * pmPct / 100;
    const agPct = !sub && a.prop?.agente && a.regola?.agente_pct != null ? Number(a.regola.agente_pct) : 0;
    const costoAg = Math.max(ricavo, 0) * agPct / 100;

    const perCat = {};
    mesi.forEach((m) => costi.forEach((k) => {
      if (!attivoNelMese(k, m)) return;
      let v = 0;
      if (k.id_room_type === a.id_room_type) v = Number(k.importo_mensile) || 0;
      else if (k.id_room_type == null) v = (Number(k.importo_mensile) || 0) / nApp;
      if (v) perCat[k.categoria] = (perCat[k.categoria] || 0) + v;
    }));
    const costiTot = Object.values(perCat).reduce((s, v) => s + v, 0);
    const margine = ricavo - costoPm - costoAg - costiTot;
    return {
      a, sub, n: mie.length, incasso, ota, netto: incasso - ota, proprietario, ricavo, pm, pmPct, pmFisso, costoPm,
      agente: a.prop?.agente || null, agPct, agPctMancante: !sub && !!a.prop?.agente && a.regola?.agente_pct == null, costoAg,
      perCat, costiTot, margine, margPct: ricavo > 0 ? (margine / ricavo) * 100 : null, ivaAll,
    };
  });
  return righe;
}

function Margini({ modello }) {
  const [eco, setEco] = useState(null);
  const anno = String(new Date().getFullYear());
  const [periodo, setPeriodo] = useState(anno);
  const [aperta, setAperta] = useState(null);
  const [ordine, setOrdine] = useState("margine");
  useEffect(() => { caricaEconomia().then(setEco); }, []);

  const periodi = useMemo(() => {
    const ms = [...new Set((eco?.pren || []).map((p) => p.mese_rendiconto).filter(Boolean))].sort().reverse();
    const anni = [...new Set([anno, ...ms.map((m) => m.slice(0, 4))])].sort().reverse();
    return { anni, ms };
  }, [eco, anno]);

  const righe = useMemo(() => {
    if (!eco) return [];
    return calcolaMargini(eco, periodo).filter((r) => (r.sub ? "sublocazione" : "gestione") === modello)
      .sort((x, y) => (ordine === "nome" ? x.a.nome_kross.localeCompare(y.a.nome_kross, "it") : y[ordine] - x[ordine]));
  }, [eco, periodo, modello, ordine]);

  const tot = useMemo(() => righe.reduce((t, r) => {
    ["incasso", "ota", "netto", "proprietario", "ricavo", "costoPm", "costoAg", "costiTot", "margine"].forEach((k) => { t[k] = (t[k] || 0) + r[k]; });
    return t;
  }, {}), [righe]);
  const chiudi = useCallback(() => setAperta(null), []);

  if (!eco) return <Vuoto t="Calcolo i margini…" />;
  const sub = modello === "sublocazione";
  const mancaAg = righe.filter((r) => r.agPctMancante).length;
  const senzaCosti = righe.filter((r) => sub && !r.perCat.affitto).length;
  const Th = ({ k, children }) => <th className="num" style={{ cursor: "pointer", color: ordine === k ? "var(--ink)" : undefined }} onClick={() => setOrdine(k)}>{children}{ordine === k ? " ↓" : ""}</th>;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} style={{ width: 200 }}>
          {periodi.anni.map((y) => <option key={y} value={y}>Anno {y}</option>)}
          <option disabled>──────────</option>
          {periodi.ms.map((m) => <option key={m} value={m}>{meseEsteso(m)}</option>)}
        </select>
        <span className="muted">Prenotazioni per mese di check-in. Costi fissi e compensi contati per {mesiDi(periodo).length === 1 ? "1 mese" : "12 mesi"}.</span>
      </div>

      <div className="kpis">
        <Kpi t="Incasso ospiti" v={euro(tot.incasso)} />
        <Kpi t="Netto OTA" v={euro(tot.netto)} n={`commissioni OTA ${euro(tot.ota)}`} />
        <Kpi t={sub ? "Ricavo (IVA esclusa)" : "Provvigioni Valente"} v={euro(tot.ricavo)} n={sub ? null : `al proprietario ${euro(tot.proprietario)}`} />
        <Kpi t="Property manager + agenti" v={euro((tot.costoPm || 0) + (tot.costoAg || 0))} n={`PM ${euro(tot.costoPm)} · agenti ${euro(tot.costoAg)}`} />
        <Kpi t="Costi fissi" v={euro(tot.costiTot)} n={sub ? "affitti, bollette, quota gestionale…" : "bollette, quota gestionale…"} />
        <Kpi t="Resta a Valente Living" v={euro(tot.margine)} tono={tot.margine < 0 ? "warn" : "ok"} n={tot.ricavo > 0 ? `${pct((tot.margine / tot.ricavo) * 100)} del ricavo` : null} />
      </div>

      {(mancaAg > 0 || senzaCosti > 0) && (
        <div className="note warn"><Ico n="warn" /><div>
          {mancaAg > 0 && <div>{mancaAg} appartamenti hanno un agente ma la sua quota è «da decidere»: il costo agente qui vale zero.</div>}
          {senzaCosti > 0 && <div>{senzaCosti} sublocazioni non hanno l'affitto inserito: il margine è sovrastimato. Inseriscilo in «Costi e compensi».</div>}
        </div></div>
      )}

      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr>
              <th style={{ cursor: "pointer" }} onClick={() => setOrdine("nome")}>Appartamento{ordine === "nome" ? " ↓" : ""}</th>
              <Th k="incasso">Incasso</Th><Th k="netto">Netto OTA</Th>
              {!sub && <Th k="proprietario">Al proprietario</Th>}
              <Th k="ricavo">{sub ? "Ricavo" : "Provvigione"}</Th>
              <Th k="costoPm">PM</Th><Th k="costoAg">Agente</Th><Th k="costiTot">Costi fissi</Th><Th k="margine">Margine</Th>
              <th className="num">%</th>
            </tr></thead>
            <tbody>
              {righe.map((r) => (
                <tr key={r.a.id_room_type} onClick={() => setAperta(r)} className={aperta?.a.id_room_type === r.a.id_room_type ? "sel" : ""}>
                  <td><div style={{ fontWeight: 500 }}>{r.a.nome_kross}</div><div className="muted">{[r.n ? `${r.n} prenotazioni` : "nessuna prenotazione", r.pm && `PM ${r.pm}`].filter(Boolean).join(" · ")}</div></td>
                  <td className="num">{euro(r.incasso)}</td>
                  <td className="num">{euro(r.netto)}</td>
                  {!sub && <td className="num muted">{euro(r.proprietario)}</td>}
                  <td className="num">{euro(r.ricavo)}</td>
                  <td className="num">{r.costoPm ? "− " + euro(r.costoPm) : "—"}</td>
                  <td className="num">{r.agPctMancante ? <span className="pill warn">da decidere</span> : r.costoAg ? "− " + euro(r.costoAg) : "—"}</td>
                  <td className="num">{r.costiTot ? "− " + euro(r.costiTot) : "—"}</td>
                  <td className="num" style={{ fontWeight: 600, color: r.margine < 0 ? "var(--err)" : "var(--ink)" }}>{euro(r.margine)}</td>
                  <td className="num muted">{pct(r.margPct)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr>
              <td style={{ fontWeight: 600, padding: "12px 14px", borderTop: "1px solid var(--line)" }}>Totale</td>
              {["incasso", "netto", ...(sub ? [] : ["proprietario"]), "ricavo", "costoPm", "costoAg", "costiTot", "margine"].map((k) => (
                <td key={k} className="num" style={{ fontWeight: 600, padding: "12px 14px", borderTop: "1px solid var(--line)", color: k === "margine" && tot.margine < 0 ? "var(--err)" : undefined }}>
                  {["costoPm", "costoAg", "costiTot"].includes(k) && tot[k] ? "− " : ""}{euro(tot[k])}</td>
              ))}
              <td className="num muted" style={{ padding: "12px 14px", borderTop: "1px solid var(--line)" }}>{tot.ricavo > 0 ? pct((tot.margine / tot.ricavo) * 100) : "—"}</td>
            </tr></tfoot>
          </table>
        </div>
      </div>
      <div className="hint">{sub
        ? `Ricavo sublocazioni = incasso ospiti senza IVA (${eco.ivaSub}% salvo diversa regola sulla scheda, da confermare col commercialista) meno commissioni OTA. Pulizie pagate all'impresa: inseriscile come costo dell'appartamento.`
        : "Provvigione = quanto resta a Valente dopo la quota del proprietario, IVA esclusa. Le commissioni OTA sono a carico del proprietario."}</div>
      {aperta && <DettaglioMargine r={aperta} periodo={periodo} chiudi={chiudi} />}
    </div>
  );
}

function DettaglioMargine({ r, periodo, chiudi }) {
  useEffect(() => { const k = (e) => e.key === "Escape" && chiudi(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [chiudi]);
  const Riga = ({ l, v, meno, tot }) => <div className={"row" + (tot ? " tot" : "")}><span style={tot ? { color: "var(--ink)" } : undefined}>{l}</span><span>{meno && v ? "− " : ""}{euro(v)}</span></div>;
  return (
    <>
      <div className="drawer-bg" onClick={chiudi} />
      <aside className="drawer">
        <div style={{ padding: "20px 22px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div className="muted">{r.sub ? "Sublocazione" : "Gestione"} · {periodo.length === 4 ? `Anno ${periodo}` : meseEsteso(periodo)}</div>
            <h2 style={{ fontSize: 18, marginTop: 4 }}>{r.a.nome_kross}</h2>
            <div className="sub">{r.n} prenotazioni · {nomeOwn(r.a.own) || "proprietario non collegato"}</div>
          </div>
          <button className="btn" onClick={chiudi} aria-label="Chiudi" style={{ padding: 7, height: 34 }}><Ico n="x" /></button>
        </div>
        <div style={{ overflow: "auto", flex: 1 }}>
          <div className="sec">
            <h2 style={{ marginBottom: 6 }}>Incassi</h2>
            <Riga l="Pagato dagli ospiti" v={r.incasso} />
            <Riga l="Commissioni OTA" v={r.ota} meno />
            <Riga l="Netto OTA" v={r.netto} tot />
          </div>
          <div className="sec">
            <h2 style={{ marginBottom: 6 }}>Ricavo di Valente Living</h2>
            {r.sub ? <>
              <Riga l={`Incasso senza IVA (${r.ivaAll}%)`} v={r.incasso / (1 + r.ivaAll / 100)} />
              <Riga l="Commissioni OTA" v={r.ota} meno />
            </> : <>
              <Riga l="Netto OTA" v={r.netto} />
              <Riga l="Quota al proprietario" v={r.proprietario} meno />
              <div className="hint" style={{ marginBottom: 4 }}>Dalla differenza si toglie anche l'IVA sulla provvigione.</div>
            </>}
            <Riga l={r.sub ? "Ricavo" : "Provvigione netta"} v={r.ricavo} tot />
          </div>
          <div className="sec">
            <h2 style={{ marginBottom: 6 }}>Compensi</h2>
            <Riga l={`Property manager${r.pm ? ` · ${r.pm}` : ""}${r.pmFisso ? " · quota del fisso" : ""}`} v={r.pmFisso} meno />
            {r.pmPct > 0 && <Riga l={`Property manager · ${String(r.pmPct).replace(".", ",")}% del ricavo`} v={r.costoPm - r.pmFisso} meno />}
            {!r.pm && <div className="muted">Nessun property manager assegnato.</div>}
            {r.agente && <Riga l={`Agente · ${r.agente}${r.agPctMancante ? " · % da decidere" : ` · ${String(r.agPct).replace(".", ",")}%`}`} v={r.costoAg} meno />}
          </div>
          <div className="sec">
            <h2 style={{ marginBottom: 6 }}>Costi fissi</h2>
            {Object.keys(r.perCat).length ? Object.entries(r.perCat).map(([k, v]) => <Riga key={k} l={etiCat(k)} v={v} meno />) : <div className="muted">Nessun costo inserito per questo appartamento.</div>}
            <div className="hint">I costi generali (es. il gestionale) sono divisi in parti uguali su tutti gli appartamenti di Kross.</div>
          </div>
          <div className="sec">
            <Riga l="Resta a Valente Living" v={r.margine} tot />
            {r.margPct != null && <div className="hint">{pct(r.margPct)} del ricavo.</div>}
          </div>
        </div>
      </aside>
    </>
  );
}

/* ───────────────────────────── Costi e compensi ───────────────────────────── */

function Costi({ modello }) {
  const [dati, setDati] = useState(null);
  const [nuovo, setNuovo] = useState(null);
  const [msg, setMsg] = useState("");
  const carica = useCallback(async () => {
    const [costi, compensi, { app, team }] = await Promise.all([
      leggi("fat_costi", "?select=*&order=categoria,voce"), leggi("fat_compensi", "?select=*&order=persona"), caricaAnagrafica(),
    ]);
    setDati({ costi, compensi, app, team });
  }, []);
  useEffect(() => { carica(); }, [carica]);
  if (!dati) return <Vuoto t="Carico i costi…" />;

  const nomeApp = Object.fromEntries(dati.app.map((a) => [a.id_room_type, a.nome_kross]));
  const appModello = dati.app.filter((a) => (a.regola?.modello || a.tipo_gestione || "gestione") === modello);
  const idsModello = new Set(appModello.map((a) => a.id_room_type));
  const generali = dati.costi.filter((c) => c.id_room_type == null);
  const perApp = dati.costi.filter((c) => c.id_room_type != null && idsModello.has(c.id_room_type));
  const totGen = generali.filter((c) => attivoNelMese(c, new Date().toISOString().slice(0, 7))).reduce((s, c) => s + Number(c.importo_mensile || 0), 0);
  const pms = [...new Set(dati.app.map((a) => String(a.prop?.gestore_interno || "").trim()).filter(Boolean))].sort();

  const salvaCosto = async (c) => {
    const corpo = { id_room_type: c.id_room_type === "" || c.id_room_type == null ? null : Number(c.id_room_type), voce: c.voce.trim(), categoria: c.categoria,
      importo_mensile: Number(c.importo_mensile) || 0, dal: c.dal || null, al: c.al || null, note: c.note || null, aggiornato_il: new Date().toISOString() };
    if (!corpo.voce) { setMsg("Scrivi il nome della voce."); return false; }
    const r = await fetch(`${SUPABASE_URL}/rest/v1/fat_costi${c.id ? `?id=eq.${c.id}` : ""}`, {
      method: c.id ? "PATCH" : "POST", headers: intest({ "Content-Type": "application/json", Prefer: "return=minimal" }), body: JSON.stringify(corpo),
    });
    setMsg(r.ok ? "" : "Salvataggio non riuscito."); if (r.ok) { setNuovo(null); carica(); }
    return r.ok;
  };
  const eliminaCosto = async (c) => {
    if (!window.confirm(`Eliminare «${c.voce}»?`)) return;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/fat_costi?id=eq.${c.id}`, { method: "DELETE", headers: intest() });
    if (r.ok) carica(); else setMsg("Eliminazione non riuscita.");
  };
  const salvaCompenso = async (persona, campi) => inserisciOAggiorna("fat_compensi", { persona, ...campi, aggiornato_il: new Date().toISOString() }, "persona");

  const Tabella = ({ righe, conApp }) => (
    <table>
      <thead><tr>{conApp && <th>Appartamento</th>}<th>Voce</th><th>Categoria</th><th className="num">Al mese</th><th>Periodo</th><th></th></tr></thead>
      <tbody>{righe.map((c) => <RigaCosto key={c.id} c={c} conApp={conApp} nomeApp={nomeApp} salva={salvaCosto} elimina={eliminaCosto} />)}</tbody>
    </table>
  );

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 1180 }}>
      {msg && <div className="note warn"><Ico n="warn" />{msg}</div>}

      <div className="card" style={{ overflow: "hidden" }}>
        <div className="sec" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div><h2>Costi dei singoli appartamenti</h2><div className="sub">{modello === "sublocazione" ? "Affitto al proprietario, bollette, pulizie, manutenzione…" : "Bollette o altri costi che restano a carico di Valente."}</div></div>
          <button className="btn pri" onClick={() => setNuovo({ id_room_type: appModello[0]?.id_room_type ?? "", voce: "", categoria: modello === "sublocazione" ? "affitto" : "bollette", importo_mensile: "", dal: "", al: "", note: "" })}>+ Aggiungi costo</button>
        </div>
        {nuovo && nuovo.id_room_type !== null && (
          <div className="sec" style={{ background: "#FAFAFB" }}>
            <FormCosto c={nuovo} set={setNuovo} app={appModello} salva={() => salvaCosto(nuovo)} annulla={() => setNuovo(null)} />
          </div>
        )}
        {perApp.length ? <div style={{ overflowX: "auto" }}><Tabella righe={perApp} conApp /></div> : <Vuoto t="Nessun costo inserito per questi appartamenti." />}
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div className="sec" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div><h2>Costi generali</h2><div className="sub">Gestionale, software, abbonamenti: divisi in parti uguali sui {dati.app.length} appartamenti di Kross. Oggi {euro(totGen)} al mese, {euro(totGen / (dati.app.length || 1))} ad appartamento.</div></div>
          <button className="btn" onClick={() => setNuovo({ id_room_type: null, voce: "", categoria: "gestionale", importo_mensile: "", dal: "", al: "", note: "" })}>+ Aggiungi costo generale</button>
        </div>
        {nuovo && nuovo.id_room_type === null && (
          <div className="sec" style={{ background: "#FAFAFB" }}>
            <FormCosto c={nuovo} set={setNuovo} generale salva={() => salvaCosto(nuovo)} annulla={() => setNuovo(null)} />
          </div>
        )}
        {generali.length ? <div style={{ overflowX: "auto" }}><Tabella righe={generali} /></div> : <Vuoto t="Nessun costo generale." />}
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div className="sec"><h2>Compensi dei property manager</h2><div className="sub">Il fisso mensile si divide sugli appartamenti che la persona segue; la % si applica al ricavo di Valente di quegli appartamenti. Una % diversa per un singolo appartamento si imposta sulla sua scheda.</div></div>
        {pms.map((p) => <RigaCompenso key={p} persona={p} c={dati.compensi.find((x) => x.persona.toLowerCase() === p.toLowerCase())} n={dati.app.filter((a) => String(a.prop?.gestore_interno || "").trim() === p).length} salva={salvaCompenso} />)}
      </div>
    </div>
  );
}

function FormCosto({ c, set, app, generale, salva, annulla }) {
  const s = (k, v) => set((x) => ({ ...x, [k]: v }));
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="grid2">
        {!generale && <Campo l="Appartamento"><select value={c.id_room_type ?? ""} onChange={(e) => s("id_room_type", e.target.value)}>{app.map((a) => <option key={a.id_room_type} value={a.id_room_type}>{a.nome_kross}</option>)}</select></Campo>}
        <Campo l="Voce"><input value={c.voce} onChange={(e) => s("voce", e.target.value)} placeholder={generale ? "es. Kross Booking" : "es. Luce Enel"} /></Campo>
        <Campo l="Categoria"><select value={c.categoria} onChange={(e) => s("categoria", e.target.value)}>{CATEGORIE_COSTO.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Campo>
        <Campo l="Importo al mese (€)" h="Per costi annuali o bimestrali, dividi per mese."><input type="number" step="0.01" value={c.importo_mensile} onChange={(e) => s("importo_mensile", e.target.value)} /></Campo>
        <Campo l="Dal (facoltativo)"><input type="date" value={c.dal || ""} onChange={(e) => s("dal", e.target.value)} /></Campo>
        <Campo l="Al (facoltativo)"><input type="date" value={c.al || ""} onChange={(e) => s("al", e.target.value)} /></Campo>
        <Campo l="Note"><input value={c.note || ""} onChange={(e) => s("note", e.target.value)} /></Campo>
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button className="btn" onClick={annulla}>Annulla</button>
        <button className="btn pri" onClick={salva}>Salva</button>
      </div>
    </div>
  );
}

function RigaCosto({ c, conApp, nomeApp, salva, elimina }) {
  const [mod, setMod] = useState(null);
  if (mod) return (
    <tr style={{ cursor: "default" }}><td colSpan={conApp ? 6 : 5} style={{ background: "#FAFAFB" }}>
      <FormCosto c={mod} set={setMod} generale={!conApp} app={Object.entries(nomeApp).map(([id, n]) => ({ id_room_type: Number(id), nome_kross: n }))} salva={async () => { if (await salva(mod)) setMod(null); }} annulla={() => setMod(null)} />
    </td></tr>
  );
  const periodo = c.dal || c.al ? `${c.dal ? dataIt(c.dal) : "…"} → ${c.al ? dataIt(c.al) : "…"}` : "sempre";
  return (
    <tr style={{ cursor: "default" }}>
      {conApp && <td style={{ fontWeight: 500 }}>{nomeApp[c.id_room_type] || `#${c.id_room_type}`}</td>}
      <td>{c.voce}{c.note && <div className="muted">{c.note}</div>}</td>
      <td><span className="pill">{etiCat(c.categoria)}</span></td>
      <td className="num">{euro(c.importo_mensile)}</td>
      <td className="muted">{periodo}</td>
      <td className="num" style={{ whiteSpace: "nowrap" }}>
        <button className="btn" style={{ padding: "4px 10px" }} onClick={() => setMod({ ...c, dal: c.dal || "", al: c.al || "", note: c.note || "" })}>Modifica</button>{" "}
        <button className="btn" style={{ padding: "4px 10px", color: "var(--err)" }} onClick={() => elimina(c)}>Elimina</button>
      </td>
    </tr>
  );
}

function RigaCompenso({ persona, c, n, salva }) {
  const [f, setF] = useState(c?.fisso_mensile ?? "");
  const [p, setP] = useState(c?.pct_provvigione ?? "");
  const [nota, setNota] = useState(c?.note ?? "");
  const [ok, setOk] = useState(null);
  const cambiato = String(f) !== String(c?.fisso_mensile ?? "") || String(p) !== String(c?.pct_provvigione ?? "") || nota !== (c?.note ?? "");
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(180px,1.2fr) 150px 150px minmax(180px,2fr) auto", gap: 12, alignItems: "end", padding: "14px 22px", borderTop: "1px solid var(--line2)" }}>
      <div><div style={{ fontWeight: 500 }}>{persona}</div><div className="muted">{n} appartamenti</div></div>
      <Campo l="Fisso al mese (€)"><input type="number" step="0.01" value={f} onChange={(e) => { setF(e.target.value); setOk(null); }} placeholder="nessuno" /></Campo>
      <Campo l="% sul ricavo"><input type="number" step="0.01" value={p} onChange={(e) => { setP(e.target.value); setOk(null); }} placeholder="nessuna" /></Campo>
      <Campo l="Note"><input value={nota} onChange={(e) => { setNota(e.target.value); setOk(null); }} /></Campo>
      <button className="btn" disabled={!cambiato} style={{ minWidth: 90, justifyContent: "center" }}
        onClick={async () => setOk(await salva(persona, { fisso_mensile: f === "" ? null : Number(f), pct_provvigione: p === "" ? null : Number(p), note: nota || null }))}>
        {ok === true ? <><Ico n="check" s={14} />Salvato</> : ok === false ? "Errore" : "Salva"}
      </button>
    </div>
  );
}

/* ───────────────────────────── Pagina ───────────────────────────── */

const TABS = [["prenotazioni", "Prenotazioni", "list"], ["margini", "Margini", "chart"], ["planner", "Planner", "cal"], ["appartamenti", "Appartamenti e criteri", "home"], ["costi", "Costi e compensi", "euro"], ["impostazioni", "Impostazioni", "gear"]];

export default function Fatturazione() {
  const [tab, setTab] = useState("prenotazioni");
  const [modello, setModello] = useState("gestione");
  const [perModello, setPerModello] = useState(null);
  useEffect(() => { leggi("kross_appartamenti", "?select=id_room_type,tipo_gestione").then((k) => setPerModello(k)); }, []);
  const idsModello = useMemo(() => (perModello ? new Set(perModello.filter((a) => (a.tipo_gestione || "gestione") === modello).map((a) => a.id_room_type)) : null), [perModello, modello]);
  const [stato, setStato] = useState(null);
  const [lavoro, setLavoro] = useState(false);
  const [esitoSync, setEsitoSync] = useState("");
  const loggato = !!sessione();

  const caricaStato = useCallback(async () => {
    const s = (await leggi("kross_stato", "?select=ultimo_sync,ultimo_esito&limit=1"))[0] || null;
    setStato(s); return s;
  }, []);
  useEffect(() => { caricaStato(); }, [caricaStato]);

  const sincronizza = async () => {
    setLavoro(true); setEsitoSync("Avviata, di solito servono un paio di minuti…");
    const prima = stato?.ultimo_sync;
    /* Dal file sul PC l'indirizzo relativo non esiste: si chiama il CRM online. */
    const base = location.protocol === "file:" ? CRM_URL : "";
    try { await fetch(`${base}/.netlify/functions/kross-sync-background`, { method: "POST", mode: "no-cors" }); } catch { /* parte comunque */ }
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 6000));
      const s = await caricaStato();
      if (s && s.ultimo_sync !== prima) { setEsitoSync("Sincronizzazione completata."); setLavoro(false); return; }
    }
    setEsitoSync("Non vedo ancora la fine: può essere solo lenta, ricarica fra un minuto.");
    setLavoro(false);
  };

  return (
    <div className="fx">
      <style>{CSS}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1>Fatturazione</h1>
          <div className="sub">Prenotazioni da Kross, criteri per appartamento e bozze per Fatture in Cloud.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span className="pill warn">Modalità prova</span>
          <span className="muted">Kross aggiornato {oraIt(stato?.ultimo_sync)}</span>
          <button className="btn" onClick={sincronizza} disabled={lavoro}><Ico n="sync" s={15} />{lavoro ? "Sincronizzo…" : "Sincronizza"}</button>
        </div>
      </div>
      {!loggato && <div className="note warn" style={{ marginTop: 16 }}><Ico n="warn" />Non risulti collegato: accedi per vedere i dati.</div>}
      <div className="seg" style={{ marginTop: 18, padding: 4 }}>
        {[["gestione", "Gestioni", "per conto dei proprietari · fattura delle provvigioni"], ["sublocazione", "Sublocazioni", "affitti diretti · fattura all'ospite"]].map(([k, t, d]) => (
          <button key={k} className={modello === k ? "on" : ""} onClick={() => setModello(k)} style={{ padding: "8px 18px", textAlign: "left" }}>
            <div style={{ fontWeight: 600, fontSize: 13.5, color: modello === k ? "var(--ink)" : undefined }}>{t}</div>
            <div style={{ fontSize: 11.5 }}>{d}</div>
          </button>
        ))}
      </div>
      <nav className="tabs">
        {TABS.map(([k, t, i]) => <button key={k} className={"tab" + (tab === k ? " on" : "")} onClick={() => setTab(k)}><Ico n={i} s={15} />{t}</button>)}
      </nav>
      {tab === "planner" && <div className="card" style={{ padding: 18 }}><Planner compatto soloAppartamenti={idsModello} /></div>}
      {tab === "prenotazioni" && <Prenotazioni modello={modello} />}
      {tab === "appartamenti" && <Appartamenti modello={modello} />}
      {tab === "margini" && <Margini modello={modello} />}
      {tab === "costi" && <Costi modello={modello} />}
      {tab === "impostazioni" && <Impostazioni stato={stato} sincronizza={sincronizza} lavoro={lavoro} esitoSync={esitoSync} />}
    </div>
  );
}
