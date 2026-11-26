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
  doc: "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h6",
  user: "M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10z",
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
/* Spiegazioni brevi accanto ai campi: icona «i», si leggono passandoci sopra o toccandola. */
const INFO = {
  "Modello": "Gestione: l'appartamento è del proprietario, noi prendiamo una commissione. Sublocazione: lo affittiamo noi, paghiamo un canone e teniamo l'incasso.",
  "Commissione (%)": "La percentuale che prende Valente, calcolata sulla base di calcolo. Es. 20 = 20%.",
  "La commissione comprende l'IVA": "«IVA inclusa»: il 20% è già comprensivo di IVA (a noi resta circa 16,4% + IVA). «IVA in aggiunta»: il 20% è netto e al proprietario si addebita 20% + IVA.",
  "Base di calcolo": "Su quale cifra si applica la commissione. La regola standard è: pernottamenti meno commissioni OTA comprese di IVA.",
  "Commissione OTA a carico del proprietario": "Sì: la commissione di Airbnb/Booking (con IVA) si toglie dalla quota del proprietario. No: la paga Valente.",
  "Costo dell'impresa per ogni pulizia (€ + IVA)": "Quanto paghiamo l'impresa di pulizie a ogni check-out, scritto senza IVA. Vale per tutte le prenotazioni dell'appartamento; sulla singola prenotazione si può cambiare.",
  "Chi paga l'impresa": "Il proprietario: il costo della pulizia con IVA si toglie dalla base di calcolo e dalla sua quota. Valente: il costo resta a noi e pesa sul nostro margine.",
  "Pulizie pagate dall'ospite": "È l'importo «pulizie» che l'ospite paga sulla prenotazione (arriva da Kross). Può restare a Valente o andare al proprietario.",
  "Le pulizie pagate dall'ospite comprendono l'IVA?": "Serve solo per calcolare quanto resta a Valente al netto dell'IVA sulle pulizie pagate dall'ospite.",
  "Facciamo da sostituto d'imposta": "Sì: tratteniamo la cedolare secca dalla quota del proprietario e la versiamo noi. Va deciso con il commercialista.",
  "Cedolare secca (%)": "Aliquota trattenuta al proprietario quando facciamo da sostituto d'imposta. Di solito 21%.",
  "IVA sull'alloggio (%)": "Aliquota IVA sull'affitto all'ospite, usata per calcolare il ricavo delle sublocazioni senza IVA. Vuoto = il valore generale delle Impostazioni.",
  "Affitto mensile al proprietario (€)": "Il canone che paghiamo al proprietario ogni mese. Se cambia, scegli da quando: il vecchio importo resta per i mesi precedenti.",
  "Il nuovo affitto vale dal": "Primo giorno in cui vale il nuovo canone. I mesi prima restano con il vecchio importo.",
  "Chi emette la fattura all'ospite": "Chi intesta la fattura all'ospite: Valente o il proprietario. Va deciso con il commercialista.",
  "Note": "Accordi particolari o eccezioni da ricordare su questo appartamento.",
  "Property manager": "Chi segue l'appartamento ogni giorno. Lo vede nel CRM e, se ha un compenso a percentuale, pesa sul margine.",
  "Agente": "Chi ha portato l'appartamento. Prende una quota sulla nostra provvigione senza IVA.",
  "Quota dell'agente (% sulla provvigione netta)": "Percentuale della nostra provvigione senza IVA che va all'agente. Mandati attuali: 20%.",
  "% property manager solo per questo appartamento": "Se il property manager ha una percentuale diversa solo qui. Vuoto = vale quella generale in «Costi e compensi».",
  "Codice fiscale / P.IVA": "Serve per intestare la fattura delle provvigioni e per il rendiconto.",
  "Fisso al mese (€)": "Compenso fisso mensile del property manager. Si divide in parti uguali sugli appartamenti che segue.",
  "% sul ricavo": "Parte variabile del property manager, in percentuale su quanto resta a Valente degli appartamenti che segue.",
  "Importo al mese (€)": "Costo mensile. Per una spesa annuale o bimestrale dividi l'importo per i mesi.",
  "Categoria": "Serve a raggruppare i costi nei Margini (affitto, bollette, gestionale…).",
  "Dal (facoltativo)": "Da quando vale il costo. Vuoto = da sempre.",
  "Al (facoltativo)": "Fino a quando vale il costo. Vuoto = senza scadenza.",
  "Importo totale (€)": "Totale della bolletta. Si divide sugli appartamenti scelti e sui mesi del periodo.",
  "Periodo dal": "Inizio del periodo fatturato nella bolletta.",
  "Periodo al": "Fine del periodo fatturato nella bolletta.",
  "POD / PDR / codice cliente": "Il codice dell'utenza scritto in bolletta: POD per la luce, PDR per il gas.",
  "È già su Kross?": "Se l'appartamento esiste già su Kross, sceglilo: arrivano le prenotazioni e si impostano i criteri di fatturazione.",
  "Stato": "A che punto è l'appartamento: da avviare, mandato firmato, in lancio, attivo.",
  "Soggiorno": "Concluse: ospite già partito. In corso: ospite in casa oggi. Future: arrivo dopo oggi.",
  "Totale ospite almeno (€)": "Mostra solo le prenotazioni con un totale pagato dall'ospite pari o superiore a questa cifra.",
};
function Info({ t }) {
  const [aperta, setAperta] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex", marginLeft: 5, verticalAlign: "middle" }}
      onMouseEnter={() => setAperta(true)} onMouseLeave={() => setAperta(false)} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAperta((x) => !x); }}>
      <span aria-label="Informazioni" style={{ width: 15, height: 15, borderRadius: "50%", border: "1px solid #CBD5E1", color: "var(--mute)", fontSize: 10, fontWeight: 700, fontStyle: "italic", fontFamily: "Georgia,serif", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "help", background: "#fff" }}>i</span>
      {aperta && <span role="tooltip" style={{ position: "absolute", left: -12, bottom: "calc(100% + 8px)", width: 260, background: "#0F172A", color: "#fff", fontSize: 12, fontWeight: 400, lineHeight: 1.45, padding: "9px 11px", borderRadius: 8, boxShadow: "0 8px 24px rgba(15,23,42,.25)", zIndex: 80, whiteSpace: "normal", textTransform: "none", letterSpacing: 0 }}>{t}</span>}
    </span>
  );
}
const Campo = ({ l, h, i, children }) => {
  const testo = i || INFO[l];
  return <div><label className="lab">{l}{testo && <Info t={testo} />}</label>{children}{h && <div className="hint">{h}</div>}</div>;
};
const SiNo = ({ v, onChange, si = "Sì", no = "No" }) => (
  <select value={String(!!v)} onChange={(e) => onChange(e.target.value === "true")}><option value="true">{si}</option><option value="false">{no}</option></select>
);

/* Quanto resta a Valente su UNA prenotazione (IVA esclusa), prima dei costi fissi del mese.
   Gestione: provvigione + pulizie pagate dall'ospite (se restano a noi) − costo pulizia − agente − % PM.
   Sublocazione: incasso senza IVA − commissione OTA − costo pulizia − % PM. */
function contoPrenotazione(r, a, costoPulizia, ivaSub = 10, pctPmGenerale = 0) {
  const sub = r.tipo_gestione === "sublocazione";
  const reg = a?.regola || {};
  const ivaAll = reg.iva_alloggio != null ? Number(reg.iva_alloggio) : ivaSub;
  const pulOspite = Number(r.pulizie) || 0;
  const pulizieNoi = !sub && reg.addebita_pulizie_al_proprietario !== false ? pulOspite / (reg.pulizie_iva_inclusa === false ? 1 : 1.22) : 0;
  const ricavo = sub
    ? (Number(r.totale_ospite) || 0) / (1 + ivaAll / 100) - (Number(r.ota) || 0)
    : (Number(r.prov_netta) || 0) + pulizieNoi;
  const agPct = !sub && a?.prop?.agente && reg.agente_pct != null ? Number(reg.agente_pct) : 0;
  const agente = (Number(r.prov_netta) || 0) * agPct / 100;
  const pmPct = reg.pm_pct != null ? Number(reg.pm_pct) : pctPmGenerale;
  const pm = Math.max(ricavo, 0) * pmPct / 100;
  const pul = costoPulizia ?? (r.costo_pulizia != null ? Number(r.costo_pulizia) : reg.costo_pulizia != null ? Number(reg.costo_pulizia) : null);
  const aCaricoProprietario = !sub && !!r.base_meno_pulizie;   // tolta dalla base: la paga il proprietario
  const pulNoi = aCaricoProprietario ? 0 : (pul || 0);
  return { sub, ricavo, pulizieNoi, agente, agPct, pm, pmPct, pulizia: pul, aCaricoProprietario, resta: ricavo - agente - pm - pulNoi };
}

/* ───────────────────────────── Prenotazioni ───────────────────────────── */

function Prenotazioni({ modello }) {
  const sub = modello === "sublocazione";
  const [ana, setAna] = useState({});
  const [pul, setPul] = useState({});
  const [cfg, setCfg] = useState({ ivaSub: 10, comp: {} });
  const caricaPulizie = useCallback(() => leggiTutto("fat_pulizie", "?select=id_reservation,costo").then((x) => setPul(Object.fromEntries(x.map((p) => [p.id_reservation, Number(p.costo)])))), []);
  useEffect(() => {
    caricaAnagrafica().then(({ app }) => setAna(Object.fromEntries(app.map((a) => [a.id_room_type, a]))));
    caricaPulizie();
    Promise.all([leggi("fat_config", "?select=chiave,valore"), leggi("fat_compensi", "?select=*")]).then(([c, k]) => setCfg({
      ivaSub: Number((c.find((x) => x.chiave === "iva_sublocazione") || {}).valore) || 0,
      comp: Object.fromEntries(k.map((x) => [x.persona.toLowerCase(), x])),
    }));
  }, [caricaPulizie]);
  const conto = useCallback((r) => {
    const a = ana[r.id_room_type];
    const pmGen = Number(cfg.comp[String(a?.prop?.gestore_interno || "").trim().toLowerCase()]?.pct_provvigione) || 0;
    return contoPrenotazione(r, a, pul[r.id_reservation], cfg.ivaSub, pmGen);
  }, [ana, pul, cfg]);
  const [righe, setRighe] = useState(null);
  const [cerca, setCerca] = useState("");
  const [mese, setMese] = useState("");
  const [filtro, setFiltro] = useState("tutte");
  const [aperta, setAperta] = useState(null);
  const [limite, setLimite] = useState(100);
  const VUOTI = { app: "", canale: "", pm: "", agente: "", own: "", dal: "", al: "", quando: "", fatt: "", minimo: "", ordine: "arrivo_desc" };
  const [f, setF] = useState(VUOTI);
  const sf = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const nFiltri = Object.entries(f).filter(([k, v]) => k !== "ordine" && v).length + (mese ? 1 : 0) + (filtro !== "tutte" ? 1 : 0) + (cerca ? 1 : 0);

  const caricaRighe = useCallback(() => leggiTutto("v_fat_prenotazione", "?select=*&order=arrivo.desc").then((x) => { setRighe(x); return x; }), []);
  useEffect(() => { caricaRighe(); }, [caricaRighe]);
  const dopoPulizia = useCallback(async (id) => {
    await caricaPulizie();
    const x = await caricaRighe();
    const nuova = x.find((r) => r.id_reservation === id);
    if (nuova) setAperta(nuova);
  }, [caricaPulizie, caricaRighe]);
  const mesi = useMemo(() => [...new Set((righe || []).map((r) => r.mese_rendiconto).filter(Boolean))].sort().reverse(), [righe]);

  /* Le scelte dei menu a tendina, prese solo dalle prenotazioni di questo modello. */
  const scelte = useMemo(() => {
    const mie = (righe || []).filter((r) => (r.tipo_gestione || "gestione") === modello);
    const uniq = (fn) => [...new Set(mie.map(fn).map((v) => String(v || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "it"));
    return {
      app: uniq((r) => r.nome_proprieta || r.nome_kross), canale: uniq((r) => r.canale),
      pm: uniq((r) => ana[r.id_room_type]?.prop?.gestore_interno), agente: uniq((r) => ana[r.id_room_type]?.prop?.agente),
      own: uniq((r) => nomeOwn(ana[r.id_room_type]?.own)),
    };
  }, [righe, modello, ana]);

  const filtrate = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    const oggi = new Date().toISOString().slice(0, 10);
    const out = (righe || []).filter((r) => {
      if ((r.tipo_gestione || "gestione") !== modello) return false;
      if (mese && r.mese_rendiconto !== mese) return false;
      const x = ana[r.id_room_type];
      if (f.app && (r.nome_proprieta || r.nome_kross) !== f.app) return false;
      if (f.canale && String(r.canale || "") !== f.canale) return false;
      if (f.pm && String(x?.prop?.gestore_interno || "").trim() !== f.pm) return false;
      if (f.agente && String(x?.prop?.agente || "").trim() !== f.agente) return false;
      if (f.own && nomeOwn(x?.own) !== f.own) return false;
      if (f.dal && r.arrivo < f.dal) return false;
      if (f.al && r.arrivo > f.al) return false;
      if (f.quando === "passate" && !(r.partenza <= oggi)) return false;
      if (f.quando === "incorso" && !(r.arrivo <= oggi && r.partenza > oggi)) return false;
      if (f.quando === "future" && !(r.arrivo > oggi)) return false;
      if (f.minimo && (Number(r.totale_ospite) || 0) < Number(f.minimo)) return false;
      if (filtro === "avvisi" && !(r.avvisi || []).length) return false;
      if (filtro === "pronte" && (r.avvisi || []).length) return false;
      if (!q) return true;
      return [r.ospite, r.cod_reservation, r.nome_kross, r.nome_proprieta, r.email, r.canale, String(r.id_reservation), nomeOwn(x?.own), x?.prop?.agente, x?.prop?.gestore_interno]
        .some((v) => String(v || "").toLowerCase().includes(q));
    });
    const [campo, verso] = f.ordine.split("_");
    const val = (r) => (campo === "arrivo" ? r.arrivo : campo === "importo" ? Number(r.totale_ospite) || 0 : campo === "notti" ? Number(r.notti) || 0 : String(r.ospite || "").toLowerCase());
    out.sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * (verso === "desc" ? -1 : 1); });
    return out;
  }, [righe, cerca, mese, filtro, modello, ana, f]);
  useEffect(() => { setLimite(100); setAperta(null); }, [cerca, mese, filtro, modello, f]);
  useEffect(() => { setF(VUOTI); setMese(""); setFiltro("tutte"); setCerca(""); }, [modello]); // eslint-disable-line

  const tot = useMemo(() => filtrate.reduce((a, r) => ({
    ospite: a.ospite + (Number(r.totale_ospite) || 0),
    prov: a.prov + (Number(r.prov_netta) || 0),
    prop: a.prop + (Number(r.quota_proprietario_lorda) || 0),
    ota: a.ota + (Number(r.ota) || 0),
    pul: a.pul + (Number(r.pulizie) || 0),
    resta: a.resta + conto(r).resta,
  }), { ospite: 0, prop: 0, prov: 0, ota: 0, pul: 0, resta: 0 }), [filtrate, conto]);
  const chiudi = useCallback(() => setAperta(null), []);

  if (!righe) return <Vuoto t="Carico le prenotazioni…" />;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="kpis">
        <Kpi t="Prenotazioni" v={filtrate.length.toLocaleString("it-IT")} n={nFiltri ? `${nFiltri} filtri attivi` : "nessun filtro"} />
        <Kpi t="Pagato dagli ospiti" v={euro(tot.ospite)} />
        {sub ? <>
          <Kpi t="Commissioni OTA" v={euro(tot.ota)} />
        </> : <>
          <Kpi t="Provvigioni (netto IVA)" v={euro(tot.prov)} />
          <Kpi t="Quota proprietari" v={euro(tot.prop)} />
        </>}
        <Kpi t="Resta a Valente" v={euro(tot.resta)} n="dopo pulizie, agente e PM; prima dei costi fissi" tono={tot.resta < 0 ? "warn" : "ok"} />
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 10, padding: "12px 14px", borderBottom: "1px solid var(--line)", background: "#FAFAFB" }}>
          {[["app", "Appartamento", "Tutti"], ["own", "Proprietario", "Tutti"], ["pm", "Property manager", "Tutti"], ["agente", "Agente", "Tutti"], ["canale", "Canale", "Tutti"]].map(([k, l, t]) => (
            <Campo key={k} l={l}><select value={f[k]} onChange={(e) => sf(k, e.target.value)}><option value="">{t}</option>{scelte[k].map((v) => <option key={v} value={v}>{k === "canale" ? canale(v)[1] : v}</option>)}</select></Campo>
          ))}
          <Campo l="Soggiorno"><select value={f.quando} onChange={(e) => sf("quando", e.target.value)}><option value="">Tutti</option><option value="passate">Concluse</option><option value="incorso">In corso</option><option value="future">Future</option></select></Campo>
          <Campo l="Arrivo dal"><input type="date" value={f.dal} onChange={(e) => sf("dal", e.target.value)} /></Campo>
          <Campo l="Arrivo al"><input type="date" value={f.al} onChange={(e) => sf("al", e.target.value)} /></Campo>
          <Campo l="Totale ospite almeno (€)"><input type="number" value={f.minimo} onChange={(e) => sf("minimo", e.target.value)} placeholder="qualsiasi" /></Campo>
          <Campo l="Ordina per"><select value={f.ordine} onChange={(e) => sf("ordine", e.target.value)}>
            <option value="arrivo_desc">Arrivo, più recenti</option><option value="arrivo_asc">Arrivo, meno recenti</option>
            <option value="importo_desc">Importo, più alto</option><option value="importo_asc">Importo, più basso</option>
            <option value="notti_desc">Notti, più lunghe</option><option value="ospite_asc">Ospite, A–Z</option></select></Campo>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button className="btn" disabled={!nFiltri} onClick={() => { setF(VUOTI); setMese(""); setFiltro("tutte"); setCerca(""); }} style={{ width: "100%", justifyContent: "center", height: 37 }}>
              Azzera filtri{nFiltri ? ` (${nFiltri})` : ""}</button>
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr>
              <th>Ospite</th><th>Appartamento</th><th>Soggiorno</th><th>Canale</th>
              <th className="num">Totale ospite</th>{sub ? <><th className="num">Commissione OTA</th></> : <><th className="num">Provvigione</th><th className="num">Al proprietario</th></>}<th className="num">Costo pulizia</th><th className="num">Resta a Valente</th><th>Stato</th>
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
                      <td className="num">{euro(r.ota)}</td>
                    </> : <>
                      <td className="num">{euro(r.prov_netta)}</td>
                      <td className="num">{euro(r.quota_proprietario_lorda)}</td>
                    </>}
                    {(() => { const c = conto(r); return <>
                      <td className="num">{c.pulizia == null ? <span className="pill warn">manca</span> : euro(c.pulizia)}</td>
                      <td className="num" style={{ fontWeight: 600, color: c.resta < 0 ? "var(--err)" : undefined }}>{euro(c.resta)}</td>
                    </>; })()}
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
      {aperta && <DettaglioPrenotazione r={aperta} a={ana[aperta.id_room_type]} chiudi={chiudi} conto={conto(aperta)} costoSalvato={pul[aperta.id_reservation]} salvato={() => dopoPulizia(aperta.id_reservation)} />}
    </div>
  );
}

function DettaglioPrenotazione({ r, a, chiudi, conto, costoSalvato, salvato }) {
  const sub = r.tipo_gestione === "sublocazione";
  const [costo, setCosto] = useState(conto?.pulizia ?? "");
  const [statoPul, setStatoPul] = useState(null);
  useEffect(() => { setCosto(conto?.pulizia ?? ""); setStatoPul(null); }, [r.id_reservation]); // eslint-disable-line
  const salvaPulizia = async () => {
    const ok = costo === ""
      ? (await fetch(`${SUPABASE_URL}/rest/v1/fat_pulizie?id_reservation=eq.${r.id_reservation}`, { method: "DELETE", headers: intest() })).ok
      : await inserisciOAggiorna("fat_pulizie", { id_reservation: r.id_reservation, costo: Number(costo), aggiornato_il: new Date().toISOString() }, "id_reservation");
    setStatoPul(ok ? "ok" : "err"); if (ok) salvato();
  };
  const otaTot = (Number(r.ota) || 0) + (Number(r.ota_iva) || 0);
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
            <h2 style={{ marginBottom: 6 }}>Rendicontazione</h2>
            <div className="row"><span>Totale pernottamenti</span><span>{euro(r.alloggio)}</span></div>
            <div className="row"><span>Pulizie pagate dall'ospite</span><span>{euro(r.pulizie)}</span></div>
            <div className="row"><span>Commissioni OTA con IVA <span className="muted">(di cui IVA {euro(r.ota_iva)})</span></span><span>− {euro(otaTot)}</span></div>
            <div className="row" style={{ alignItems: "center" }}>
              <span>Costo pulizia, IVA esclusa{costo !== "" && Number(costo) ? <span className="muted"> · con IVA {euro(Number(costo) * 1.22)}</span> : ""}{costoSalvato == null && conto?.pulizia != null ? <span className="muted"> · standard dell'appartamento</span> : ""}</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <input type="number" step="0.01" value={costo} onChange={(e) => { setCosto(e.target.value); setStatoPul(null); }} placeholder="es. 85" style={{ width: 100, padding: "5px 8px", textAlign: "right" }} />
                <button className="btn" style={{ padding: "5px 10px" }} disabled={String(costo) === String(conto?.pulizia ?? "")} onClick={salvaPulizia}>{statoPul === "ok" ? "✓" : "Salva"}</button>
              </span>
            </div>
            {statoPul === "err" && <div className="hint" style={{ color: "var(--err)" }}>Salvataggio non riuscito.</div>}
            {!sub && r.base_meno_pulizie && <div className="row"><span>Pulizia tolta dalla base, con IVA <span className="muted">(a carico del proprietario)</span></span><span>{r.costo_pulizia_lordo != null ? `− ${euro(r.costo_pulizia_lordo)}` : <span className="pill warn">manca il costo</span>}</span></div>}
            {!sub && <div className="row"><span style={{ color: "var(--ink)" }}>Base di calcolo</span><span>{euro(r.base_importo)}</span></div>}
            {!sub && <>
              <div className="row"><span>Percentuale Valente ({r.commissione != null ? `${String(r.commissione).replace(".", ",")}%` : "—"}{r.commissione_iva_inclusa ? " IVA incl." : ""} su {euro(r.base_importo)})</span><span>{euro((Number(r.prov_netta) || 0) + (Number(r.prov_iva) || 0))}</span></div>
              <div className="row tot"><span style={{ color: "var(--ink)" }}>Totale proprietario</span><span>{euro(r.quota_proprietario_lorda)}</span></div>
              <div className="row"><span>Imposta trattenuta {r.sostituto_imposta ? `(${r.cedolare_pct}%)` : r.sostituto_imposta === false ? "(non applicata)" : "(sostituto da decidere)"}</span><span>{euro(r.cedolare)}</span></div>
              <div className="row tot"><span style={{ color: "var(--ink)" }}>Netto proprietario</span><span>{euro(r.netto_proprietario)}</span></div>
            </>}
            <div className="hint">Rendiconto di {meseEsteso(r.mese_rendiconto)}.</div>
          </div>
          <div className="sec">
            <h2 style={{ marginBottom: 6 }}>Quanto resta a Valente</h2>
            {sub ? <>
              <div className="row"><span>Incasso senza IVA meno commissioni OTA</span><span>{euro(conto?.ricavo)}</span></div>
            </> : <>
              <div className="row"><span>Provvigione netta (senza IVA)</span><span>{euro(r.prov_netta)}</span></div>
              {conto?.pulizieNoi > 0 && <div className="row"><span>Pulizie pagate dall'ospite (senza IVA)</span><span>{euro(conto.pulizieNoi)}</span></div>}
            </>}
            <div className="row"><span>Costo pulizia (IVA esclusa){conto?.aCaricoProprietario ? " · la paga il proprietario" : ""}</span><span>{conto?.aCaricoProprietario ? "—" : conto?.pulizia == null ? <span className="pill warn">da inserire</span> : `− ${euro(conto.pulizia)}`}</span></div>
            {conto?.agente > 0 && <div className="row"><span>Agente · {a?.prop?.agente} ({String(conto.agPct).replace(".", ",")}%)</span><span>− {euro(conto.agente)}</span></div>}
            {conto?.pm > 0 && <div className="row"><span>Property manager · {a?.prop?.gestore_interno} ({String(conto.pmPct).replace(".", ",")}%)</span><span>− {euro(conto.pm)}</span></div>}
            <div className="row tot"><span style={{ color: "var(--ink)" }}>Resta a Valente</span><span style={{ color: (conto?.resta || 0) < 0 ? "var(--err)" : undefined }}>{euro(conto?.resta)}</span></div>
            <div className="hint">Prima dei costi fissi del mese (affitto, bollette, gestionale, fisso dei PM): quelli sono nei Margini.</div>
          </div>
          <div className="sec" style={{ display: "none" }}>
            <h2 style={{ marginBottom: 6 }}>Calcolo</h2>
            {[["Alloggio", r.alloggio], ["Pulizie", r.pulizie], ["Tassa di soggiorno", r.tassa], ["Totale pagato dall'ospite", r.totale_ospite]].map(([k, v]) => <div className="row" key={k}><span>{k}</span><span>{euro(v)}</span></div>)}
            <div className="row"><span>Commissione OTA (+ IVA {euro(r.ota_iva)})</span><span>− {euro(r.ota)}</span></div>
            {!sub && <>
            <div className="row"><span>Base provvigione · {String(r.base_calcolo || "").replace(/_/g, " ")}{r.base_meno_pulizie ? " meno pulizie" : ""}</span><span>{euro(r.base_importo)}</span></div>
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

/* ───────────────────────────── Aggiungi / collega appartamenti ─────────────────────────────
   Un appartamento nasce nel CRM come "proprietà" (con proprietario, PM, agente). Quando esiste anche
   su Kross si collega: da lì arrivano le prenotazioni e si impostano i criteri di fatturazione. */

async function inserisci(tabella, corpo) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabella}`, {
    method: "POST", headers: intest({ "Content-Type": "application/json", Prefer: "return=representation" }), body: JSON.stringify(corpo),
  });
  const d = await r.json().catch(() => null);
  return r.ok && Array.isArray(d) ? d[0] : null;
}
async function collegaKross(idRoom, proprietaId, modello, commissione) {
  const ok = await aggiorna("kross_appartamenti", `id_room_type=eq.${idRoom}`, { proprieta_id: proprietaId });
  if (!ok) return false;
  const corpo = { id_room_type: Number(idRoom), modello, aggiornato_il: new Date().toISOString() };
  if (commissione !== "" && commissione != null) corpo.commissione = Number(commissione);
  return inserisciOAggiorna("fat_regole", corpo, "id_room_type");
}

function NuovoAppartamento({ modello, team, owners, krossLiberi, chiudi, creato }) {
  const [d, setD] = useState({ nome: "", indirizzo: "", citta: "", provincia: "", modello, stato: "da avviare", commissione: modello === "sublocazione" ? "0" : "",
    ownSel: "", ownNome: "", ownCognome: "", ownCf: "", ownEmail: "", ownTel: "", gestore: "", agente: "", kross: "" });
  const [err, setErr] = useState(""); const [lav, setLav] = useState(false);
  const s = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const nuovoOwn = d.ownSel === "__nuovo";

  const scegliKross = (id) => {
    s("kross", id);
    const k = krossLiberi.find((x) => String(x.id_room_type) === String(id));
    if (k) setD((x) => ({ ...x, kross: id, nome: x.nome || k.nome_kross.trim(), indirizzo: x.indirizzo || k.indirizzo || "", citta: x.citta || k.citta || "", provincia: x.provincia || k.provincia || "" }));
  };

  const salva = async () => {
    if (!d.nome.trim()) { setErr("Scrivi il nome dell'appartamento."); return; }
    if (nuovoOwn && !d.ownNome.trim() && !d.ownCognome.trim()) { setErr("Scrivi almeno nome o cognome del proprietario."); return; }
    setLav(true); setErr("");
    let proprietarioId = d.ownSel && !nuovoOwn ? d.ownSel : null;
    if (nuovoOwn) {
      const o = await inserisci("proprietari", { nome: d.ownNome.trim() || null, cognome: d.ownCognome.trim() || null, codice_fiscale: d.ownCf.trim() || null,
        email: d.ownEmail.trim() || null, telefono: d.ownTel.trim() || null });
      if (!o) { setErr("Non sono riuscito a creare il proprietario."); setLav(false); return; }
      proprietarioId = o.id;
    }
    const p = await inserisci("proprieta", { nome: d.nome.trim(), indirizzo: d.indirizzo.trim() || null, citta: d.citta.trim() || null, provincia: d.provincia.trim() || null,
      tipo_contratto: d.modello, stato: d.stato, commissione: d.commissione === "" ? null : Number(d.commissione), proprietario_id: proprietarioId,
      gestore_interno: d.gestore || null, agente: d.agente || null, nome_kross: d.kross ? (krossLiberi.find((k) => String(k.id_room_type) === String(d.kross))?.nome_kross || null) : null });
    if (!p) { setErr("Non sono riuscito a creare l'appartamento."); setLav(false); return; }
    if (d.kross && !(await collegaKross(d.kross, p.id, d.modello, d.commissione))) { setErr("Appartamento creato, ma il collegamento a Kross non è riuscito: riprova dalla sua scheda."); setLav(false); creato(); return; }
    setLav(false); creato(d.kross ? `k${d.kross}` : `p${p.id}`);
  };

  return (
    <>
      <div className="drawer-bg" onClick={chiudi} />
      <aside className="drawer" style={{ width: "min(640px,100vw)" }}>
        <div style={{ padding: "20px 22px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div><h2 style={{ fontSize: 18 }}>Nuovo appartamento</h2><div className="sub">Si crea anche nel CRM, tra le Proprietà.</div></div>
          <button className="btn" onClick={chiudi} aria-label="Chiudi" style={{ padding: 7, height: 34 }}><Ico n="x" /></button>
        </div>
        <div style={{ overflow: "auto", flex: 1 }}>
          <div className="sec">
            <h2 style={{ marginBottom: 12 }}>Kross</h2>
            <Campo l="È già su Kross?" h={krossLiberi.length ? "Qui compaiono solo gli appartamenti di Kross non ancora collegati." : "Tutti gli appartamenti di Kross sono già collegati."}>
              <select value={d.kross} onChange={(e) => scegliKross(e.target.value)}>
                <option value="">No, non ancora</option>
                {krossLiberi.map((k) => <option key={k.id_room_type} value={k.id_room_type}>Sì: {k.nome_kross.trim()}{k.citta ? ` · ${k.citta}` : ""}</option>)}
              </select>
            </Campo>
          </div>
          <div className="sec">
            <h2 style={{ marginBottom: 12 }}>Appartamento</h2>
            <div className="grid2">
              <Campo l="Nome"><input value={d.nome} onChange={(e) => s("nome", e.target.value)} placeholder="es. Lucca Via Fillungo" /></Campo>
              <Campo l="Modello"><select value={d.modello} onChange={(e) => s("modello", e.target.value)}><option value="gestione">Gestione per conto terzi</option><option value="sublocazione">Sublocazione</option></select></Campo>
              <Campo l="Indirizzo"><input value={d.indirizzo} onChange={(e) => s("indirizzo", e.target.value)} /></Campo>
              <Campo l="Città"><input value={d.citta} onChange={(e) => s("citta", e.target.value)} /></Campo>
              <Campo l="Provincia"><input value={d.provincia} onChange={(e) => s("provincia", e.target.value)} placeholder="es. LU" /></Campo>
              <Campo l="Stato"><select value={d.stato} onChange={(e) => s("stato", e.target.value)}>{["da avviare", "mandato firmato", "in lancio", "attivo"].map((x) => <option key={x} value={x}>{x}</option>)}</select></Campo>
              {d.modello !== "sublocazione" && <Campo l="Commissione (%)"><input type="number" step="0.01" value={d.commissione} onChange={(e) => s("commissione", e.target.value)} placeholder="es. 20" /></Campo>}
            </div>
          </div>
          <div className="sec">
            <h2 style={{ marginBottom: 12 }}>{d.modello === "sublocazione" ? "Proprietario (locatore)" : "Proprietario"}</h2>
            <Campo l="Proprietario">
              <select value={d.ownSel} onChange={(e) => s("ownSel", e.target.value)}>
                <option value="">Da indicare dopo</option>
                <option value="__nuovo">+ Nuovo proprietario</option>
                {owners.map((o) => <option key={o.id} value={o.id}>{nomeOwn(o) || "(senza nome)"}{o.citta ? ` · ${o.citta}` : ""}</option>)}
              </select>
            </Campo>
            {nuovoOwn && (
              <div className="grid2" style={{ marginTop: 12 }}>
                <Campo l="Nome"><input value={d.ownNome} onChange={(e) => s("ownNome", e.target.value)} /></Campo>
                <Campo l="Cognome"><input value={d.ownCognome} onChange={(e) => s("ownCognome", e.target.value)} /></Campo>
                <Campo l="Codice fiscale / P.IVA"><input value={d.ownCf} onChange={(e) => s("ownCf", e.target.value)} /></Campo>
                <Campo l="Email"><input value={d.ownEmail} onChange={(e) => s("ownEmail", e.target.value)} /></Campo>
                <Campo l="Telefono"><input value={d.ownTel} onChange={(e) => s("ownTel", e.target.value)} /></Campo>
              </div>
            )}
          </div>
          <div className="sec">
            <h2 style={{ marginBottom: 12 }}>Chi lo segue</h2>
            <div className="grid2">
              <Campo l="Property manager"><SceltaPersona v={d.gestore} onChange={(v) => s("gestore", v || "")} team={team} ph="Nessuno" /></Campo>
              <Campo l="Agente"><SceltaPersona v={d.agente} onChange={(v) => s("agente", v || "")} team={team} ph="Nessun agente" /></Campo>
            </div>
          </div>
        </div>
        <div style={{ padding: "14px 22px", borderTop: "1px solid var(--line)", display: "flex", gap: 10, alignItems: "center", justifyContent: "flex-end" }}>
          {err && <span style={{ color: "var(--err)", fontSize: 12.5, marginRight: "auto" }}>{err}</span>}
          <button className="btn" onClick={chiudi}>Annulla</button>
          <button className="btn pri" onClick={salva} disabled={lav}>{lav ? "Creo…" : "Crea appartamento"}</button>
        </div>
      </aside>
    </>
  );
}

/* Scheda di un appartamento che esiste nel CRM ma non ancora su Kross. */
function SchedaSoloCrm({ a, krossLiberi, salvato }) {
  const [k, setK] = useState(""); const [msg, setMsg] = useState(null);
  const collega = async () => {
    const ok = await collegaKross(k, a.prop.id, a.prop.tipo_contratto || "gestione", a.prop.commissione);
    setMsg(ok ? ["ok", "Collegato a Kross."] : ["err", "Collegamento non riuscito."]);
    if (ok) salvato(`k${k}`);
  };
  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--line)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}><h2 style={{ fontSize: 17 }}>{a.prop.nome}</h2><span className="pill">Non ancora su Kross</span></div>
        <div className="sub">{[a.prop.indirizzo, a.prop.citta].filter(Boolean).join(", ") || "Indirizzo non inserito"} · {a.prop.stato || "—"}</div>
      </div>
      <div className="sec">
        <h2 style={{ marginBottom: 6 }}>Persone</h2>
        <div className="row"><span>Proprietario</span><span>{nomeOwn(a.own) || "—"}</span></div>
        <div className="row"><span>Property manager</span><span>{a.prop.gestore_interno || "—"}</span></div>
        <div className="row"><span>Agente</span><span>{a.prop.agente || "—"}</span></div>
        <div className="row"><span>Commissione</span><span>{a.prop.commissione != null ? `${a.prop.commissione}%` : "—"}</span></div>
      </div>
      <div className="sec">
        <h2 style={{ marginBottom: 4 }}>Collega a Kross</h2>
        <div className="sub" style={{ marginBottom: 12 }}>Quando l'appartamento è stato creato su Kross, collegalo qui: arrivano le prenotazioni e si impostano i criteri di fatturazione.</div>
        {krossLiberi.length ? (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <select value={k} onChange={(e) => setK(e.target.value)} style={{ flex: "1 1 260px" }}>
              <option value="">Scegli l'appartamento di Kross…</option>
              {krossLiberi.map((x) => <option key={x.id_room_type} value={x.id_room_type}>{x.nome_kross.trim()}{x.citta ? ` · ${x.citta}` : ""}</option>)}
            </select>
            <button className="btn pri" disabled={!k} onClick={collega}>Collega</button>
          </div>
        ) : <div className="muted">Su Kross non ci sono appartamenti liberi da collegare: prima va creato lì.</div>}
        {msg && <div className="hint" style={{ color: msg[0] === "ok" ? "var(--ok)" : "var(--err)" }}>{msg[1]}</div>}
      </div>
    </div>
  );
}

/* ───────────────────────────── Appartamenti (criteri) ───────────────────────────── */

/* Anagrafica: appartamenti Kross + proprietà CRM (agente, property manager) + proprietario + regola. */
async function caricaAnagrafica() {
  const [k, r, pr, ow, co] = await Promise.all([
    leggi("kross_appartamenti", "?select=id_room_type,nome_kross,citta,provincia,indirizzo,cin,tipo_gestione,proprieta_id&order=nome_kross"),
    leggi("fat_regole", "?select=*"),
    leggi("proprieta", "?select=id,nome,agente,gestore_interno,proprietario_id,indirizzo,citta,stato,tipo_contratto,commissione&order=nome"),
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
  const collegate = new Set(k.map((a) => a.proprieta_id).filter(Boolean));
  /* Appartamenti del CRM non ancora su Kross (esclusi quelli chiusi o solo in trattativa). */
  const soloCrm = pr.filter((p) => !collegate.has(p.id) && !["inattivo", "in trattativa"].includes(String(p.stato || "").toLowerCase()))
    .map((p) => ({ soloCrm: true, id_room_type: null, nome_kross: p.nome, citta: p.citta, indirizzo: p.indirizzo, tipo_gestione: p.tipo_contratto || "gestione", prop: p, own: own[p.proprietario_id] || null, regola: null }));
  const krossLiberi = k.filter((a) => !a.proprieta_id || !prop[a.proprieta_id]);
  return { app, team, soloCrm, krossLiberi, owners: ow };
}
const nomeOwn = (o) => (o ? [o.nome, o.cognome].filter(Boolean).join(" ") : "");

const DEFAULT_REGOLA = {
  modello: "gestione", commissione: null, commissione_iva_inclusa: true, base_calcolo: "alloggio_meno_ota",
  addebita_ota_al_proprietario: true, addebita_pulizie_al_proprietario: true, sostituto_imposta: null, cedolare_pct: 21,
  chi_fattura_ospite: null, iva_alloggio: null, pulizie_iva_inclusa: true, attiva_fatturazione: false, confermata: false, note: null, agente_pct: null, pm_pct: null, base_meno_pulizie: false, costo_pulizia: null,
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
  const [extra, setExtra] = useState({ soloCrm: [], krossLiberi: [], owners: [] });
  const [nuovo, setNuovo] = useState(false);

  const carica = useCallback(async (selezione) => {
    const { app: lista, team: t, soloCrm, krossLiberi, owners } = await caricaAnagrafica();
    setApp(lista); setTeam(t); setExtra({ soloCrm, krossLiberi, owners });
    if (typeof selezione === "string") setSel(selezione);
    return lista;
  }, []);
  const chiave = (a) => (a.soloCrm ? `p${a.prop.id}` : `k${a.id_room_type}`);
  useEffect(() => { carica(); }, [carica]);

  const elenco = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    return [...(app || []), ...extra.soloCrm].filter((a) => {
      const r = a.regola || DEFAULT_REGOLA;
      if (a.soloCrm && filtro !== "tutti") return false;
      if ((a.regola?.modello || a.tipo_gestione || "gestione") !== modello) return false;
      if (filtro === "attivi" && !r.attiva_fatturazione) return false;
      if (filtro === "daconf" && r.confermata) return false;
      return !q || [a.nome_kross, a.citta, a.indirizzo, nomeOwn(a.own), a.prop?.agente, a.prop?.gestore_interno].some((x) => String(x || "").toLowerCase().includes(q));
    });
  }, [app, extra, cerca, filtro, modello]);

  const conti = useMemo(() => {
    const r = (app || []).filter((a) => (a.regola?.modello || a.tipo_gestione || "gestione") === modello).map((a) => a.regola || DEFAULT_REGOLA);
    return { tot: r.length, conf: r.filter((x) => x.confermata).length, att: r.filter((x) => x.attiva_fatturazione).length,
      aperti: r.filter((x) => x.sostituto_imposta === null || x.chi_fattura_ospite === null).length };
  }, [app, modello]);
  useEffect(() => { if (elenco.length && !elenco.some((a) => chiave(a) === sel)) setSel(chiave(elenco[0])); }, [elenco, sel]);

  if (!app) return <Vuoto t="Carico gli appartamenti da Kross…" />;
  const scelto = elenco.find((a) => chiave(a) === sel);

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
            <div style={{ display: "flex", gap: 8 }}>
              <Cerca v={cerca} set={setCerca} ph="Cerca appartamento, città, proprietario…" w={400} />
              <button className="btn pri" onClick={() => setNuovo(true)} title="Aggiungi appartamento" style={{ whiteSpace: "nowrap" }}>+ Aggiungi</button>
            </div>
            <div className="seg">
              {[["tutti", "Tutti"], ["daconf", "Da confermare"], ["attivi", "Attivi"]].map(([k, t]) => <button key={k} className={filtro === k ? "on" : ""} onClick={() => setFiltro(k)}>{t}</button>)}
            </div>
          </div>
          <div className="alist">
            {elenco.map((a) => {
              const [tono, eti] = a.soloCrm ? ["", "Non su Kross"] : !a.prop ? ["err", "Da collegare"] : statoRegola(a.regola || DEFAULT_REGOLA);
              return (
                <div key={chiave(a)} className={"aitem" + (sel === chiave(a) ? " on" : "")} onClick={() => setSel(chiave(a))}>
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
        {!scelto ? <div className="card"><Vuoto t="Scegli un appartamento dall'elenco." /></div>
          : scelto.soloCrm ? <SchedaSoloCrm key={chiave(scelto)} a={scelto} krossLiberi={extra.krossLiberi} salvato={carica} />
          : <SchedaRegola key={chiave(scelto)} a={scelto} team={team} salvato={carica} proprietaLibere={extra.soloCrm} />}
      {nuovo && <NuovoAppartamento modello={modello} team={team} owners={extra.owners} krossLiberi={extra.krossLiberi} chiudi={() => setNuovo(false)} creato={(k) => { setNuovo(false); carica(k); }} />}
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

function SchedaRegola({ a, team, salvato, proprietaLibere = [] }) {
  const [propSel, setPropSel] = useState("");
  const iniziale = useMemo(() => ({ ...DEFAULT_REGOLA, ...(a.regola || {}), id_room_type: a.id_room_type }), [a]);
  const [b, setB] = useState(iniziale);
  const persIniz = useMemo(() => ({ agente: a.prop?.agente || null, gestore_interno: a.prop?.gestore_interno || null }), [a]);
  const [pers, setPers] = useState(persIniz);
  const ownIniz = useMemo(() => Object.fromEntries(CAMPI_OWN.map(([k]) => [k, a.own?.[k] || ""])), [a]);
  const [own, setOwn] = useState(ownIniz);
  const [msg, setMsg] = useState(null);
  const [lavoro, setLavoro] = useState(false);
  const set = (k, v) => { setB((x) => ({ ...x, [k]: v })); setMsg(null); };
  const sub = b.modello === "sublocazione";
  const num = (v) => (v === "" || v == null ? null : Number(v));

  /* Affitto al proprietario (sublocazioni): sta in fat_costi, categoria «affitto», con lo storico per date. */
  const oggiMese = new Date().toISOString().slice(0, 7);
  const primoDelMese = `${oggiMese}-01`;
  const [affitti, setAffitti] = useState(null);
  const [aff, setAff] = useState({ importo: "", dal: primoDelMese, iniz: "" });
  const caricaAffitti = useCallback(async () => {
    const r = await leggi("fat_costi", `?id_room_type=eq.${a.id_room_type}&categoria=eq.affitto&select=*&order=dal.asc.nullsfirst`);
    setAffitti(r);
    const attivi = r.filter((c) => Number(c.importo_mensile) > 0 && attivoNelMese(c, oggiMese));
    const v = attivi.length ? String(attivi.reduce((x, c) => x + Number(c.importo_mensile), 0)) : "";
    setAff({ importo: v, dal: primoDelMese, iniz: v });
  }, [a.id_room_type, oggiMese, primoDelMese]);
  useEffect(() => { caricaAffitti(); }, [caricaAffitti]);
  const affModificato = sub && aff.importo !== aff.iniz;
  const modificato = JSON.stringify(b) !== JSON.stringify(iniziale) || JSON.stringify(pers) !== JSON.stringify(persIniz) || JSON.stringify(own) !== JSON.stringify(ownIniz) || affModificato;
  const salvaAffitto = async () => {
    const attivi = (affitti || []).filter((c) => Number(c.importo_mensile) > 0 && attivoNelMese(c, oggiMese));
    const dal = aff.dal || primoDelMese;
    const giornoPrima = new Date(new Date(dal + "T00:00:00").getTime() - 86400000).toISOString().slice(0, 10);
    for (const c of attivi) {
      const ok = c.dal && c.dal >= dal
        ? (await fetch(`${SUPABASE_URL}/rest/v1/fat_costi?id=eq.${c.id}`, { method: "DELETE", headers: intest() })).ok
        : await aggiorna("fat_costi", `id=eq.${c.id}`, { al: giornoPrima, aggiornato_il: new Date().toISOString() });
      if (!ok) return false;
    }
    if (aff.importo === "" || Number(aff.importo) <= 0) return true;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/fat_costi`, {
      method: "POST", headers: intest({ "Content-Type": "application/json", Prefer: "return=minimal" }),
      body: JSON.stringify({ id_room_type: a.id_room_type, voce: `Affitto ${a.nome_kross.trim()}`, categoria: "affitto", importo_mensile: Number(aff.importo), dal: attivi.length || (affitti || []).length ? dal : null }),
    });
    return r.ok;
  };

  const salva = async () => {
    setLavoro(true);
    const corpo = {
      id_room_type: a.id_room_type, modello: b.modello, commissione: num(b.commissione), commissione_iva_inclusa: !!b.commissione_iva_inclusa,
      base_calcolo: b.base_calcolo, addebita_ota_al_proprietario: !!b.addebita_ota_al_proprietario,
      addebita_pulizie_al_proprietario: !!b.addebita_pulizie_al_proprietario, sostituto_imposta: b.sostituto_imposta,
      cedolare_pct: num(b.cedolare_pct), chi_fattura_ospite: b.chi_fattura_ospite || null, iva_alloggio: num(b.iva_alloggio),
      pulizie_iva_inclusa: !!b.pulizie_iva_inclusa, confermata: !!b.confermata, attiva_fatturazione: !!b.confermata && !!b.attiva_fatturazione,
      note: b.note || null, agente_pct: num(b.agente_pct), pm_pct: num(b.pm_pct), base_meno_pulizie: !!b.base_meno_pulizie, costo_pulizia: num(b.costo_pulizia), aggiornato_il: new Date().toISOString(),
    };
    let ok = a.regola ? await aggiorna("fat_regole", `id_room_type=eq.${a.id_room_type}`, corpo) : await inserisciOAggiorna("fat_regole", corpo, "id_room_type");
    if (ok && a.prop && JSON.stringify(pers) !== JSON.stringify(persIniz)) ok = await aggiorna("proprieta", `id=eq.${a.prop.id}`, pers);
    if (ok && affModificato) { ok = await salvaAffitto(); if (ok) await caricaAffitti(); }
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
          <div style={{ display: "grid", gap: 10 }}>
            <div className="note warn"><Ico n="warn" />Questo appartamento di Kross non è collegato a nessuna proprietà del CRM: niente proprietario, agente né property manager.</div>
            {proprietaLibere.length > 0 && (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <select value={propSel} onChange={(e) => setPropSel(e.target.value)} style={{ flex: "1 1 260px" }}>
                  <option value="">Collega a una proprietà del CRM…</option>
                  {proprietaLibere.map((x) => <option key={x.prop.id} value={x.prop.id}>{x.prop.nome}{nomeOwn(x.own) ? ` · ${nomeOwn(x.own)}` : ""}</option>)}
                </select>
                <button className="btn pri" disabled={!propSel} onClick={async () => {
                  const ok = await aggiorna("kross_appartamenti", `id_room_type=eq.${a.id_room_type}`, { proprieta_id: propSel });
                  setMsg(ok ? ["ok", "Collegato"] : ["err", "Collegamento non riuscito."]); if (ok) salvato(`k${a.id_room_type}`);
                }}>Collega</button>
              </div>
            )}
            <div className="hint">Se non è nell'elenco, crealo con «+ Aggiungi» e scegli questo appartamento di Kross.</div>
          </div>
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
          {sub && <>
            <Campo l="Affitto mensile al proprietario (€)" h={aff.iniz ? `Oggi: ${euro(Number(aff.iniz))} al mese.` : "Non ancora inserito."}>
              <input type="number" step="0.01" value={aff.importo} onChange={(e) => { const v = e.target.value; setAff((x) => ({ ...x, importo: v })); setMsg(null); }} placeholder="es. 1250" />
            </Campo>
            {aff.iniz !== "" && affModificato && (
              <Campo l="Il nuovo affitto vale dal" h="Il vecchio importo resta per i mesi prima: i margini passati non cambiano.">
                <input type="date" value={aff.dal} onChange={(e) => setAff((x) => ({ ...x, dal: e.target.value }))} />
              </Campo>
            )}
            {(affitti || []).length > 0 && (
              <div style={{ gridColumn: "1 / -1" }}>
                <label className="lab">Storico affitto</label>
                {(affitti || []).map((c) => (
                  <div className="row" key={c.id}><span>{c.voce}{c.note ? <span className="muted"> · {c.note}</span> : ""}</span>
                    <span>{euro(c.importo_mensile)} <span className="muted">{c.dal ? `dal ${dataIt(c.dal)}` : "da sempre"}{c.al ? ` al ${dataIt(c.al)}` : ""}</span></span></div>
                ))}
              </div>
            )}
          </>}
          {b.modello !== "sublocazione" && <>
          <Campo l="Commissione (%)"><input type="number" step="0.01" value={b.commissione ?? ""} onChange={(e) => set("commissione", e.target.value)} placeholder="es. 20" /></Campo>
          <Campo l="La commissione comprende l'IVA"><SiNo v={b.commissione_iva_inclusa} onChange={(x) => set("commissione_iva_inclusa", x)} si="Sì, IVA inclusa" no="No, IVA in aggiunta" /></Campo>
          <Campo l="Base di calcolo" h="Su cosa si applica la commissione.">
            <select value={b.base_calcolo} onChange={(e) => set("base_calcolo", e.target.value)}>
              <option value="alloggio_meno_ota">Alloggio meno commissione OTA</option><option value="alloggio_lordo">Alloggio lordo</option><option value="lordo_ospite">Totale pagato dall'ospite</option>
            </select>
          </Campo>
          <Campo l="Commissione OTA a carico del proprietario"><SiNo v={b.addebita_ota_al_proprietario} onChange={(x) => set("addebita_ota_al_proprietario", x)} /></Campo>
          </>}
        </div>
      </div>

      <div className="sec">
        <h2 style={{ marginBottom: 4 }}>Pulizie</h2>
        <div className="sub" style={{ marginBottom: 14 }}>Due cose diverse: quanto <b>paghiamo noi</b> l'impresa e quanto <b>paga l'ospite</b> come costo di pulizia sulla prenotazione.</div>
        <div className="grid2">
          <Campo l="Costo dell'impresa per ogni pulizia (€ + IVA)" h={`Scrivi l'importo senza IVA: ${b.costo_pulizia ? `${euro(Number(b.costo_pulizia))} + IVA = ${euro(Number(b.costo_pulizia) * 1.22)}` : "es. 85 → 103,70 € con IVA"}. Sulla singola prenotazione si può cambiare.`}>
            <input type="number" step="0.01" value={b.costo_pulizia ?? ""} onChange={(e) => set("costo_pulizia", e.target.value)} placeholder="es. 85" />
          </Campo>
          {b.modello !== "sublocazione" && (
            <Campo l="Chi paga l'impresa" h="Se la paga il proprietario, il costo con IVA si toglie dalla base di calcolo.">
              <SiNo v={b.base_meno_pulizie} onChange={(x) => set("base_meno_pulizie", x)} si="Il proprietario (tolto dalla base)" no="Valente" />
            </Campo>
          )}
          {b.modello !== "sublocazione" && (
            <Campo l="Pulizie pagate dall'ospite" h="L'importo «pulizie» che arriva da Kross sulla prenotazione.">
              <SiNo v={b.addebita_pulizie_al_proprietario} onChange={(x) => set("addebita_pulizie_al_proprietario", x)} si="Restano a Valente" no="Vanno al proprietario" />
            </Campo>
          )}
          <Campo l="Le pulizie pagate dall'ospite comprendono l'IVA?" h="Serve solo a calcolare quanto resta a Valente senza IVA.">
            <SiNo v={b.pulizie_iva_inclusa} onChange={(x) => set("pulizie_iva_inclusa", x)} si="Sì, IVA compresa" no="No, IVA da aggiungere" />
          </Campo>
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
  const [pren, { app, team }, costi, compensi, conf, bollette] = await Promise.all([
    leggiTutto("v_fat_prenotazione", "?select=id_reservation,id_room_type,mese_rendiconto,totale_ospite,ota,pulizie,prov_netta,quota_proprietario_lorda,tipo_gestione,costo_pulizia,base_meno_pulizie"),
    caricaAnagrafica(),
    leggi("fat_costi", "?select=*&order=categoria,voce"),
    leggi("fat_compensi", "?select=*&order=persona"),
    leggi("fat_config", "?select=chiave,valore"),
    leggi("fat_bollette", "?select=*"),
  ]);
  const cfg = Object.fromEntries(conf.map((c) => [c.chiave, c.valore]));
  return { pren, app, team, costi, compensi, bollette, ivaSub: Number(cfg.iva_sublocazione) || 0 };
}

function calcolaMargini(eco, periodo) {
  const mesi = mesiDi(periodo);
  const { pren, app, costi, compensi, bollette = [], ivaSub } = eco;
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
    const pm = pmDi(a), c = comp[pm.toLowerCase()];
    const pmGen = c?.pct_provvigione != null ? Number(c.pct_provvigione) : 0;
    const conti = mie.map((p) => contoPrenotazione({ ...p, tipo_gestione: sub ? "sublocazione" : "gestione" }, a, undefined, ivaSub, pmGen));
    const ricavo = conti.reduce((x, k) => x + k.ricavo, 0);
    const pmPct = a.regola?.pm_pct != null ? Number(a.regola.pm_pct) : pmGen;
    const pmFisso = c?.fisso_mensile ? (Number(c.fisso_mensile) / (seguiti[pm.toLowerCase()] || 1)) * mesi.length : 0;
    const costoPm = pmFisso + conti.reduce((x, k) => x + k.pm, 0);
    const agPct = !sub && a.prop?.agente && a.regola?.agente_pct != null ? Number(a.regola.agente_pct) : 0;
    const costoAg = conti.reduce((x, k) => x + k.agente, 0);
    const pulizieCosto = conti.reduce((x, k) => x + (k.aCaricoProprietario ? 0 : (k.pulizia || 0)), 0);
    const senzaCostoPul = conti.filter((k) => k.pulizia == null && !k.aCaricoProprietario).length;

    const perCat = {};
    mesi.forEach((m) => costi.forEach((k) => {
      if (!attivoNelMese(k, m)) return;
      let v = 0;
      if (k.id_room_type === a.id_room_type) v = Number(k.importo_mensile) || 0;
      else if (k.id_room_type == null) v = (Number(k.importo_mensile) || 0) / nApp;
      if (v) perCat[k.categoria] = (perCat[k.categoria] || 0) + v;
    }));
    const cp = Number(a.regola?.costo_pulizia) || 0;
    if (pulizieCosto) perCat.pulizie = (perCat.pulizie || 0) + pulizieCosto;
    bollette.forEach((b) => {
      const ids = b.id_room_types || [];
      if (!ids.includes(a.id_room_type)) return;
      const v = mesi.reduce((s, m) => s + quotaBollettaNelMese(b, m), 0) / ids.length;
      if (v) perCat.bollette = (perCat.bollette || 0) + v;
    });
    const costiTot = Object.values(perCat).reduce((s, v) => s + v, 0);
    const margine = ricavo - costoPm - costoAg - costiTot;
    return {
      a, sub, n: mie.length, incasso, ota, netto: incasso - ota, proprietario, ricavo, pm, pmPct, pmFisso, costoPm,
      agente: a.prop?.agente || null, agPct, agPctMancante: !sub && !!a.prop?.agente && a.regola?.agente_pct == null, costoAg,
      perCat, costiTot, margine, margPct: ricavo > 0 ? (margine / ricavo) * 100 : null, ivaAll, costoPulizia: cp, senzaCostoPul,
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
  const bolDaAss = sub ? (eco.bollette || []).filter((b) => !(b.id_room_types || []).length).length : 0;
  const senzaPul = righe.filter((r) => r.senzaCostoPul > 0).length;
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
        <Kpi t="Costi fissi" v={euro(tot.costiTot)} n={sub ? "affitti, bollette, quota gestionale…" : "quota gestionale e altri costi"} />
        <Kpi t="Resta a Valente Living" v={euro(tot.margine)} tono={tot.margine < 0 ? "warn" : "ok"} n={tot.ricavo > 0 ? `${pct((tot.margine / tot.ricavo) * 100)} del ricavo` : null} />
      </div>

      {(mancaAg > 0 || senzaCosti > 0 || bolDaAss > 0 || senzaPul > 0) && (
        <div className="note warn"><Ico n="warn" /><div>
          {mancaAg > 0 && <div>{mancaAg} appartamenti hanno un agente ma la sua quota è «da decidere»: il costo agente qui vale zero.</div>}
          {senzaPul > 0 && <div>{senzaPul} appartamenti hanno prenotazioni senza costo pulizia: inseriscilo nella scheda dell'appartamento (costo standard) o sulla singola prenotazione.</div>}
          {bolDaAss > 0 && <div>{bolDaAss} bollette non sono assegnate a nessun appartamento: assegnale in «Costi e compensi».</div>}
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
            {Object.keys(r.perCat).length ? Object.entries(r.perCat).map(([k, v]) => <Riga key={k} l={k === "pulizie" ? "Pulizie pagate all'impresa (IVA esclusa)" : etiCat(k)} v={v} meno />) : <div className="muted">Nessun costo inserito per questo appartamento.</div>}
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

/* Bollette (solo sublocazioni): ogni bolletta copre un periodo e si divide in parti uguali sugli
   appartamenti indicati; nei margini va nei mesi in proporzione ai giorni del periodo. */
const TIPI_BOLLETTA = [["luce", "Luce"], ["gas", "Gas"], ["acqua", "Acqua"], ["internet", "Internet"], ["rifiuti", "Rifiuti"], ["altro", "Altro"]];
const GG = 86400000;
function quotaBollettaNelMese(b, m) {
  const d0 = new Date(b.periodo_dal + "T00:00:00"), d1 = new Date(b.periodo_al + "T00:00:00");
  const giorni = Math.round((d1 - d0) / GG) + 1;
  const [y, mm] = m.split("-").map(Number);
  const m0 = new Date(y, mm - 1, 1), m1 = new Date(y, mm, 0);
  const a = d0 > m0 ? d0 : m0, z = d1 < m1 ? d1 : m1;
  const sovr = z >= a ? Math.round((z - a) / GG) + 1 : 0;
  return giorni > 0 ? (Number(b.importo) || 0) * sovr / giorni : 0;
}

function Bollette({ app, bollette, ricarica }) {
  const [nuova, setNuova] = useState(null);
  const [mod, setMod] = useState(null);
  const [err, setErr] = useState("");
  const nome = Object.fromEntries(app.map((a) => [a.id_room_type, a.nome_kross]));
  const daAssegnare = bollette.filter((b) => !(b.id_room_types || []).length).length;

  const salva = async (b) => {
    const corpo = { fornitore: b.fornitore.trim(), tipo: b.tipo, numero: b.numero || null, emessa_il: b.emessa_il || null,
      periodo_dal: b.periodo_dal, periodo_al: b.periodo_al, importo: Number(b.importo) || 0, indirizzo: b.indirizzo || null,
      codice_utenza: b.codice_utenza || null, id_room_types: b.id_room_types || [], note: b.note || null };
    if (!corpo.fornitore || !corpo.periodo_dal || !corpo.periodo_al) { setErr("Servono fornitore e periodo."); return; }
    const r = await fetch(`${SUPABASE_URL}/rest/v1/fat_bollette${b.id ? `?id=eq.${b.id}` : ""}`, {
      method: b.id ? "PATCH" : "POST", headers: intest({ "Content-Type": "application/json", Prefer: "return=minimal" }), body: JSON.stringify(corpo),
    });
    if (r.ok) { setErr(""); setNuova(null); setMod(null); ricarica(); } else setErr("Salvataggio non riuscito.");
  };
  const elimina = async (b) => {
    if (!window.confirm(`Eliminare la bolletta ${b.fornitore} ${b.numero || ""}?`)) return;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/fat_bollette?id=eq.${b.id}`, { method: "DELETE", headers: intest() });
    if (r.ok) ricarica(); else setErr("Eliminazione non riuscita.");
  };
  const vuota = { fornitore: "", tipo: "luce", numero: "", emessa_il: "", periodo_dal: "", periodo_al: "", importo: "", indirizzo: "", codice_utenza: "", id_room_types: [], note: "" };

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div className="sec" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2>Bollette</h2>
          <div className="sub">Quelle arrivate per email. Ogni bolletta si divide in parti uguali sugli appartamenti scelti e va nei mesi del suo periodo.</div>
          {daAssegnare > 0 && <div className="hint" style={{ color: "var(--warn)" }}>{daAssegnare} bollette senza appartamento: non entrano nei margini finché non le assegni.</div>}
        </div>
        <button className="btn pri" onClick={() => { setMod(null); setNuova({ ...vuota }); }}>+ Aggiungi bolletta</button>
      </div>
      {err && <div className="sec"><div className="note warn"><Ico n="warn" />{err}</div></div>}
      {nuova && <div className="sec" style={{ background: "#FAFAFB" }}><FormBolletta b={nuova} set={setNuova} app={app} salva={() => salva(nuova)} annulla={() => setNuova(null)} /></div>}
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>Fornitore</th><th>Periodo</th><th className="num">Importo</th><th>Appartamenti</th><th></th></tr></thead>
          <tbody>
            {bollette.map((b) => mod?.id === b.id ? (
              <tr key={b.id} style={{ cursor: "default" }}><td colSpan={5} style={{ background: "#FAFAFB" }}><FormBolletta b={mod} set={setMod} app={app} salva={() => salva(mod)} annulla={() => setMod(null)} /></td></tr>
            ) : (
              <tr key={b.id} style={{ cursor: "default" }}>
                <td><div style={{ fontWeight: 500 }}>{b.fornitore} <span className="pill">{(TIPI_BOLLETTA.find(([k]) => k === b.tipo) || [0, b.tipo])[1]}</span></div>
                  <div className="muted">{[b.numero, b.indirizzo].filter(Boolean).join(" · ")}</div>
                  {b.note && <div className="muted">{b.note}</div>}</td>
                <td style={{ whiteSpace: "nowrap" }}>{dataIt(b.periodo_dal)} → {dataIt(b.periodo_al)}</td>
                <td className="num">{euro(b.importo)}</td>
                <td>{(b.id_room_types || []).length ? (b.id_room_types || []).map((id) => <span key={id} className="pill" style={{ marginRight: 4, marginBottom: 3 }}>{nome[id] || `#${id}`}</span>) : <span className="pill warn">da assegnare</span>}</td>
                <td className="num" style={{ whiteSpace: "nowrap" }}>
                  <button className="btn" style={{ padding: "4px 10px" }} onClick={() => { setNuova(null); setMod({ ...vuota, ...b, numero: b.numero || "", emessa_il: b.emessa_il || "", indirizzo: b.indirizzo || "", codice_utenza: b.codice_utenza || "", note: b.note || "" }); }}>Modifica</button>{" "}
                  <button className="btn" style={{ padding: "4px 10px", color: "var(--err)" }} onClick={() => elimina(b)}>Elimina</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!bollette.length && <Vuoto t="Nessuna bolletta." />}
      </div>
    </div>
  );
}

function FormBolletta({ b, set, app, salva, annulla }) {
  const s = (k, v) => set((x) => ({ ...x, [k]: v }));
  const scelti = new Set(b.id_room_types || []);
  const tocca = (id) => { const n = new Set(scelti); n.has(id) ? n.delete(id) : n.add(id); s("id_room_types", [...n]); };
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="grid2">
        <Campo l="Fornitore"><input value={b.fornitore} onChange={(e) => s("fornitore", e.target.value)} placeholder="es. Enel" /></Campo>
        <Campo l="Tipo"><select value={b.tipo} onChange={(e) => s("tipo", e.target.value)}>{TIPI_BOLLETTA.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Campo>
        <Campo l="Importo totale (€)"><input type="number" step="0.01" value={b.importo} onChange={(e) => s("importo", e.target.value)} /></Campo>
        <Campo l="Periodo dal"><input type="date" value={b.periodo_dal} onChange={(e) => s("periodo_dal", e.target.value)} /></Campo>
        <Campo l="Periodo al"><input type="date" value={b.periodo_al} onChange={(e) => s("periodo_al", e.target.value)} /></Campo>
        <Campo l="Numero bolletta"><input value={b.numero} onChange={(e) => s("numero", e.target.value)} /></Campo>
        <Campo l="Indirizzo fornitura"><input value={b.indirizzo} onChange={(e) => s("indirizzo", e.target.value)} /></Campo>
        <Campo l="POD / PDR / codice cliente"><input value={b.codice_utenza} onChange={(e) => s("codice_utenza", e.target.value)} /></Campo>
        <Campo l="Note"><input value={b.note} onChange={(e) => s("note", e.target.value)} /></Campo>
      </div>
      <div>
        <label className="lab">Appartamenti su cui dividerla</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {app.map((a) => (
            <label key={a.id_room_type} className={"pill" + (scelti.has(a.id_room_type) ? " acc" : "")} style={{ cursor: "pointer", padding: "5px 10px", gap: 6 }}>
              <input type="checkbox" checked={scelti.has(a.id_room_type)} onChange={() => tocca(a.id_room_type)} style={{ width: 13, height: 13 }} />{a.nome_kross}
            </label>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button className="btn" onClick={annulla}>Annulla</button>
        <button className="btn pri" onClick={salva}>Salva</button>
      </div>
    </div>
  );
}

/* ───────────────────────────── Costi e compensi ───────────────────────────── */

function Costi({ modello }) {
  const [dati, setDati] = useState(null);
  const [nuovo, setNuovo] = useState(null);
  const [msg, setMsg] = useState("");
  const carica = useCallback(async () => {
    const [costi, compensi, { app, team }, bollette] = await Promise.all([
      leggi("fat_costi", "?select=*&order=categoria,voce"), leggi("fat_compensi", "?select=*&order=persona"), caricaAnagrafica(),
      leggi("fat_bollette", "?select=*&order=periodo_dal.desc"),
    ]);
    setDati({ costi, compensi, app, team, bollette });
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

      {modello === "sublocazione" && <Bollette app={appModello} bollette={dati.bollette} ricarica={carica} />}

      <div className="card" style={{ overflow: "hidden" }}>
        <div className="sec" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div><h2>Costi dei singoli appartamenti</h2><div className="sub">{modello === "sublocazione" ? "Affitto al proprietario, pulizie, manutenzione… (le bollette stanno sopra)." : "Eventuali costi che restano a carico di Valente."}</div></div>
          <button className="btn pri" onClick={() => setNuovo({ id_room_type: appModello[0]?.id_room_type ?? "", voce: "", categoria: modello === "sublocazione" ? "affitto" : "altro", importo_mensile: "", dal: "", al: "", note: "" })}>+ Aggiungi costo</button>
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

/* ───────────────────────────── Agenti: quali appartamenti ha portato ognuno ─────────────────────────────
   L'agente di un appartamento sta in proprieta.agente (uno solo per appartamento); la sua quota
   in fat_regole.agente_pct, % sulla provvigione di Valente senza IVA (20% per i mandati attuali). */

function Persone({ ruolo }) {
  const pm = ruolo === "pm";
  const campo = pm ? "gestore_interno" : "agente";
  const [dati, setDati] = useState(null);
  const [sel, setSel] = useState("");
  const [cerca, setCerca] = useState("");
  const [lav, setLav] = useState(null);
  const [msg, setMsg] = useState("");
  const anno = String(new Date().getFullYear());

  const carica = useCallback(async () => {
    const [{ app, team, soloCrm }, pren, compensi] = await Promise.all([
      caricaAnagrafica(),
      leggiTutto("v_fat_prenotazione", `?select=id_room_type,mese_rendiconto,prov_netta&mese_rendiconto=like.${anno}-*`),
      leggi("fat_compensi", "?select=*"),
    ]);
    setDati({ app, team, soloCrm, pren, compensi });
  }, [anno]);
  useEffect(() => { carica(); }, [carica]);

  const agenti = useMemo(() => {
    if (!dati) return [];
    const nomi = new Map();
    dati.team.filter((t) => (pm ? /property|pm|manager|burocr|titolare/i : /agent/i).test(t.ruolo)).forEach((t) => nomi.set(t.nome.toLowerCase(), t.nome));
    [...dati.app, ...dati.soloCrm].forEach((a) => { const n = String(a.prop?.[campo] || "").trim(); if (n && !nomi.has(n.toLowerCase())) nomi.set(n.toLowerCase(), n); });
    return [...nomi.values()].sort((a, b) => a.localeCompare(b, "it")).map((nome) => {
      const mie = [...dati.app, ...dati.soloCrm].filter((a) => String(a.prop?.[campo] || "").trim().toLowerCase() === nome.toLowerCase());
      const comp = dati.compensi.find((c) => c.persona.toLowerCase() === nome.toLowerCase());
      const maturato = mie.filter((a) => a.id_room_type != null).reduce((s, a) => {
        const pct = pm ? Number(a.regola?.pm_pct ?? comp?.pct_provvigione) || 0 : Number(a.regola?.agente_pct) || 0;
        const prov = dati.pren.filter((p) => p.id_room_type === a.id_room_type).reduce((x, p) => x + (Number(p.prov_netta) || 0), 0);
        return s + prov * pct / 100;
      }, 0);
      return { nome, n: mie.length, maturato, comp, nelTeam: dati.team.some((t) => t.nome.toLowerCase() === nome.toLowerCase()) };
    });
  }, [dati]);
  useEffect(() => { if (!sel && agenti.length) setSel(agenti[0].nome); }, [agenti, sel]);

  if (!dati) return <Vuoto t="Carico gli agenti…" />;
  const tutti = [...dati.app, ...dati.soloCrm].sort((a, b) => String(a.nome_kross).localeCompare(String(b.nome_kross), "it"));
  const q = cerca.trim().toLowerCase();
  const lista = tutti.filter((a) => !q || [a.nome_kross, a.citta, nomeOwn(a.own), a.prop?.[campo]].some((x) => String(x || "").toLowerCase().includes(q)));
  const suo = (a) => String(a.prop?.[campo] || "").trim().toLowerCase() === sel.toLowerCase();
  const chiave = (a) => (a.soloCrm ? `p${a.prop.id}` : `k${a.id_room_type}`);

  const spunta = async (a) => {
    if (!a.prop) return;
    const togli = suo(a);
    const altro = String(a.prop[campo] || "").trim();
    if (!togli && altro && !window.confirm(`«${a.nome_kross.trim()}» oggi è di ${altro}. Lo passo a ${sel}?`)) return;
    setLav(chiave(a)); setMsg("");
    let ok = await aggiorna("proprieta", `id=eq.${a.prop.id}`, { [campo]: togli ? null : sel });
    const gestione = (a.regola?.modello || a.tipo_gestione || "gestione") === "gestione";
    if (ok && !pm && a.id_room_type != null && gestione) {
      const pct = togli ? null : a.regola?.agente_pct > 0 ? a.regola.agente_pct : 20;
      ok = await inserisciOAggiorna("fat_regole", { id_room_type: a.id_room_type, agente_pct: pct, aggiornato_il: new Date().toISOString() }, "id_room_type");
    }
    if (!ok) setMsg("Salvataggio non riuscito.");
    await carica(); setLav(null);
  };
  const cambiaPct = async (a, v) => {
    const ok = await inserisciOAggiorna("fat_regole", { id_room_type: a.id_room_type, [pm ? "pm_pct" : "agente_pct"]: v === "" ? null : Number(v), aggiornato_il: new Date().toISOString() }, "id_room_type");
    if (!ok) setMsg("Salvataggio non riuscito."); else carica();
  };
  const ag = agenti.find((x) => x.nome === sel);

  return (
    <div className="split">
      <div className="card" style={{ overflow: "hidden" }}>
        <div className="sec" style={{ padding: "14px 16px" }}><h2>{pm ? "Property manager" : "Agenti"}</h2><div className="sub">{pm ? `Parte variabile maturata nel ${anno} (% sul ricavo); il fisso è indicato a parte.` : `Provvigione maturata nel ${anno} (sulla nostra provvigione, IVA esclusa).`}</div></div>
        <div className="alist" style={{ minHeight: 0 }}>
          {agenti.map((x) => (
            <div key={x.nome} className={"aitem" + (sel === x.nome ? " on" : "")} onClick={() => setSel(x.nome)}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500 }}>{x.nome}</div>
                <div className="muted">{x.n} appartamenti{pm && x.comp?.fisso_mensile ? ` · fisso ${euro(x.comp.fisso_mensile)}/mese` : ""}{!x.nelTeam ? " · non è nel team" : ""}</div>
              </div>
              <span className="num" style={{ fontWeight: 600, fontSize: 13 }}>{euro(x.maturato)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div className="sec" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <h2 style={{ fontSize: 17 }}>{sel || "—"}</h2>
            <div className="sub">{pm ? "Spunta gli appartamenti che gestisce. Sulla riga puoi mettere una % diversa solo per quell'appartamento; fisso e % generali stanno in «Costi e compensi»." : "Spunta gli appartamenti che ha portato. La quota parte dal 20% e si cambia sulla riga."}</div>
            {pm && ag && <div className="hint">Compenso: {ag.comp?.fisso_mensile ? `${euro(ag.comp.fisso_mensile)} al mese` : "nessun fisso"} · {ag.comp?.pct_provvigione != null ? `${String(ag.comp.pct_provvigione).replace(".", ",")}% sul ricavo` : "nessuna %"}</div>}
            {ag && !ag.nelTeam && <div className="hint" style={{ color: "var(--warn)" }}>Questo nome non corrisponde a nessun collaboratore del CRM: conviene spostare i suoi appartamenti sul nome giusto.</div>}
          </div>
          <Cerca v={cerca} set={setCerca} ph="Cerca appartamento…" w={280} />
        </div>
        {msg && <div className="sec"><div className="note warn"><Ico n="warn" />{msg}</div></div>}
        <div style={{ maxHeight: "calc(100vh - 300px)", overflow: "auto" }}>
          <table>
            <thead><tr><th style={{ width: 40 }}></th><th>Appartamento</th><th>Modello</th><th>Oggi è di</th><th className="num">{pm ? "% solo qui" : "Quota"}</th></tr></thead>
            <tbody>
              {lista.map((a) => {
                const mio = suo(a), gest = (a.regola?.modello || a.tipo_gestione || "gestione") === "gestione";
                const altro = String(a.prop?.[campo] || "").trim();
                return (
                  <tr key={chiave(a)} style={{ cursor: a.prop ? "pointer" : "default", opacity: lav === chiave(a) ? 0.5 : 1 }} className={mio ? "sel" : ""} onClick={() => spunta(a)}>
                    <td><input type="checkbox" checked={mio} disabled={!a.prop} readOnly /></td>
                    <td><div style={{ fontWeight: 500 }}>{a.nome_kross.trim()}</div><div className="muted">{[a.citta, nomeOwn(a.own), a.soloCrm && "non ancora su Kross", !a.prop && "da collegare a una proprietà"].filter(Boolean).join(" · ")}</div></td>
                    <td><span className="pill">{gest ? "Gestione" : "Sublocazione"}</span></td>
                    <td className="muted">{altro && !mio ? altro : mio ? "—" : "nessuno"}</td>
                    <td className="num" onClick={(e) => e.stopPropagation()}>
                      {mio && (gest || pm) && a.id_room_type != null
                        ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><input type="number" step="0.5" defaultValue={(pm ? a.regola?.pm_pct : a.regola?.agente_pct) ?? ""} placeholder={pm ? "—" : ""} onBlur={(e) => e.target.value !== String((pm ? a.regola?.pm_pct : a.regola?.agente_pct) ?? "") && cambiaPct(a, e.target.value)} style={{ width: 80, padding: "5px 8px", textAlign: "right" }} />%</span>
                        : <span className="muted">{mio && !gest ? "—" : ""}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────── Rendiconto mensile ─────────────────────────────
   Una riga per prenotazione (mese del check-in), voce per voce fino al netto, raggruppate per
   appartamento con i subtotali. Si scarica in Excel o si stampa. */

const COLONNE_G = [
  ["arrivo", "Arrivo"], ["ospite", "Ospite"], ["canale", "Canale"], ["notti", "Notti"],
  ["pernottamenti", "Pernottamenti"], ["pulizieOspite", "Pulizie ospite"], ["ota", "Comm. OTA + IVA"], ["costoPul", "Costo pulizia (+IVA)"],
  ["base", "Base di calcolo"], ["percValente", "% Valente (IVA incl.)"], ["proprietario", "Totale proprietario"], ["imposta", "Imposta trattenuta"],
  ["netto", "Netto proprietario"], ["agente", "Agente"], ["pm", "PM %"], ["resta", "Resta a Valente"],
];
const COLONNE_S = [
  ["arrivo", "Arrivo"], ["ospite", "Ospite"], ["canale", "Canale"], ["notti", "Notti"],
  ["pernottamenti", "Pernottamenti"], ["pulizieOspite", "Pulizie ospite"], ["totale", "Totale ospite"], ["ota", "Comm. OTA + IVA"],
  ["ricavo", "Ricavo (senza IVA, − OTA)"], ["costoPul", "Costo pulizia"], ["pm", "PM %"], ["resta", "Resta a Valente"],
];
const NUMERICHE = new Set(["notti", "pernottamenti", "pulizieOspite", "ota", "costoPul", "base", "percValente", "proprietario", "imposta", "netto", "agente", "pm", "resta", "totale", "ricavo"]);

function RendicontoMensile({ modello }) {
  const sub = modello === "sublocazione";
  const [righe, setRighe] = useState(null);
  const [ana, setAna] = useState({});
  const [cfg, setCfg] = useState({ ivaSub: 10, comp: {} });
  const [mese, setMese] = useState("");
  const [app, setApp] = useState("");
  const [affitti, setAffitti] = useState([]);
  useEffect(() => { if (sub) leggi("fat_costi", "?categoria=eq.affitto&select=*").then(setAffitti); }, [sub]);
  const affittoDel = (idRoom) => affitti.filter((c) => c.id_room_type === idRoom && attivoNelMese(c, mese)).reduce((x, c) => x + (Number(c.importo_mensile) || 0), 0);
  useEffect(() => {
    Promise.all([
      leggiTutto("v_fat_prenotazione", "?select=*&order=arrivo.asc"), caricaAnagrafica(),
      leggi("fat_config", "?select=chiave,valore"), leggi("fat_compensi", "?select=*"),
    ]).then(([r, { app }, c, k]) => {
      setRighe(r); setAna(Object.fromEntries(app.map((a) => [a.id_room_type, a])));
      setCfg({ ivaSub: Number((c.find((x) => x.chiave === "iva_sublocazione") || {}).valore) || 0, comp: Object.fromEntries(k.map((x) => [x.persona.toLowerCase(), x])) });
      const oggi = new Date(); oggi.setMonth(oggi.getMonth() - 1);
      setMese(oggi.toISOString().slice(0, 7));
    });
  }, []);

  const mesi = useMemo(() => [...new Set((righe || []).map((r) => r.mese_rendiconto).filter(Boolean))].sort().reverse(), [righe]);
  const delMese = useMemo(() => (righe || []).filter((r) => (r.tipo_gestione || "gestione") === modello && r.mese_rendiconto === mese), [righe, modello, mese]);
  const appartamenti = useMemo(() => [...new Set(delMese.map((r) => r.nome_proprieta || r.nome_kross))].sort((a, b) => a.localeCompare(b, "it")), [delMese]);

  const voci = useMemo(() => delMese.filter((r) => !app || (r.nome_proprieta || r.nome_kross) === app).map((r) => {
    const a = ana[r.id_room_type];
    const pmGen = Number(cfg.comp[String(a?.prop?.gestore_interno || "").trim().toLowerCase()]?.pct_provvigione) || 0;
    const c = contoPrenotazione(r, a, undefined, cfg.ivaSub, pmGen);
    const otaTot = (Number(r.ota) || 0) + (Number(r.ota_iva) || 0);
    return {
      gruppo: r.nome_proprieta || r.nome_kross, proprietario: nomeOwn(a?.own), r, c,
      v: {
        arrivo: dataBreve(r.arrivo) + " – " + dataBreve(r.partenza), ospite: r.ospite || "—", canale: canale(r.canale)[1], notti: Number(r.notti) || 0,
        pernottamenti: Number(r.alloggio) || 0, pulizieOspite: Number(r.pulizie) || 0, totale: Number(r.totale_ospite) || 0, ota: otaTot,
        costoPul: sub ? (c.pulizia ?? null) : (r.base_meno_pulizie ? Number(r.costo_pulizia_lordo) || null : c.pulizia),
        base: Number(r.base_importo) || 0, percValente: (Number(r.prov_netta) || 0) + (Number(r.prov_iva) || 0),
        proprietario: r.quota_proprietario_lorda != null ? Number(r.quota_proprietario_lorda) : null, imposta: r.cedolare != null ? Number(r.cedolare) : null,
        netto: r.netto_proprietario != null ? Number(r.netto_proprietario) : null, agente: c.agente, pm: c.pm, ricavo: c.ricavo, resta: c.resta,
      },
    };
  }), [delMese, app, ana, cfg, sub]);

  const gruppi = useMemo(() => {
    const m = new Map();
    voci.forEach((x) => { if (!m.has(x.gruppo)) m.set(x.gruppo, []); m.get(x.gruppo).push(x); });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "it"));
  }, [voci]);
  const COL = sub ? COLONNE_S : COLONNE_G;
  const VIS = COL.filter(([k]) => !["agente", "pm", "canale"].includes(k));   // a video; nell'Excel ci sono tutte
  const somma = (lista, k) => lista.reduce((t, x) => t + (Number(x.v[k]) || 0), 0);
  const fmt = (k, v) => (v == null ? "—" : !NUMERICHE.has(k) ? v : k === "notti" ? v : euro(v));
  const mancano = voci.filter((x) => x.c.pulizia == null && !(x.r.base_meno_pulizie && !sub)).length;

  const esportaExcel = async () => {
    const XLSX = await import("xlsx");
    const dati = [];
    gruppi.forEach(([g, lista]) => {
      lista.forEach((x) => dati.push({ Appartamento: g, Proprietario: x.proprietario, Codice: x.r.cod_reservation, ...Object.fromEntries(COL.map(([k, l]) => [l, x.v[k] == null ? "" : NUMERICHE.has(k) ? Math.round(x.v[k] * 100) / 100 : x.v[k]])) }));
      dati.push({ Appartamento: `Totale ${g}`, ...Object.fromEntries(COL.filter(([k]) => NUMERICHE.has(k)).map(([k, l]) => [l, Math.round(somma(lista, k) * 100) / 100])) });
    });
    dati.push({ Appartamento: "TOTALE MESE", ...Object.fromEntries(COL.filter(([k]) => NUMERICHE.has(k)).map(([k, l]) => [l, Math.round(somma(voci, k) * 100) / 100])) });
    const ws = XLSX.utils.json_to_sheet(dati); const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rendiconto");
    XLSX.writeFile(wb, `Rendiconto ${sub ? "sublocazioni" : "gestioni"} ${mese}${app ? " - " + app : ""}.xlsx`);
  };

  if (!righe) return <Vuoto t="Preparo il rendiconto…" />;
  return (
    <div style={{ display: "grid", gap: 16 }} className="rend">
      <style>{`.rend table{font-size:12px}.rend th,.rend td{padding:8px 8px;white-space:nowrap}.rend th{font-size:10.5px}.rend td:nth-child(2){white-space:normal;min-width:110px}@media print{body *{visibility:hidden}.rend,.rend *{visibility:visible}.rend{position:absolute;left:0;top:0;width:100%}.rend .noprint{display:none!important}.fx table{font-size:9px}.fx td,.fx th{padding:4px 5px}}`}</style>
      <div className="noprint" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <select value={mese} onChange={(e) => { setMese(e.target.value); setApp(""); }} style={{ width: 190 }}>
          {!mesi.includes(mese) && <option value={mese}>{meseEsteso(mese)}</option>}
          {mesi.map((m) => <option key={m} value={m}>{meseEsteso(m)}</option>)}
        </select>
        <select value={app} onChange={(e) => setApp(e.target.value)} style={{ width: 260 }}>
          <option value="">Tutti gli appartamenti</option>
          {appartamenti.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => window.print()}>Stampa / PDF</button>
          <button className="btn pri" onClick={esportaExcel} disabled={!voci.length}>Scarica Excel</button>
        </div>
      </div>
      <div>
        <h2 style={{ fontSize: 18 }}>Rendiconto {sub ? "sublocazioni" : "gestioni"} · {meseEsteso(mese)}{app ? ` · ${app}` : ""}</h2>
        <div className="sub">{voci.length} prenotazioni con check-in nel mese · importi in euro</div>
      </div>
      <div className="kpis">
        <Kpi t="Pernottamenti" v={euro(somma(voci, "pernottamenti"))} />
        <Kpi t="Commissioni OTA + IVA" v={euro(somma(voci, "ota"))} />
        {!sub && <Kpi t="Netto ai proprietari" v={euro(somma(voci, "netto"))} n={`imposta trattenuta ${euro(somma(voci, "imposta"))}`} />}
        {sub && <Kpi t="Ricavo" v={euro(somma(voci, "ricavo"))} />}
        <Kpi t="Resta a Valente" v={euro(somma(voci, "resta"))} n="prima dei costi fissi" tono={somma(voci, "resta") < 0 ? "warn" : "ok"} />
      </div>
      {mancano > 0 && <div className="note warn noprint"><Ico n="warn" />{mancano} prenotazioni non hanno il costo pulizia: il «Resta a Valente» è più alto del vero. Inseriscilo dalla scheda dell'appartamento o sulla singola prenotazione.</div>}
      {!voci.length ? <div className="card"><Vuoto t="Nessuna prenotazione in questo mese." /></div> : gruppi.map(([g, lista]) => (
        <div key={g} className="card" style={{ overflow: "hidden", breakInside: "avoid" }}>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div><b>{g}</b>{lista[0].proprietario && <span className="muted"> · {lista[0].proprietario}</span>}</div>
            <span className="muted">{lista.length} prenotazioni{sub && (() => { const af = affittoDel(lista[0].r.id_room_type); const resta = somma(lista, "resta") - af; return <> · affitto del mese <b style={{ color: "var(--ink)" }}>{af ? euro(af) : "non inserito"}</b> · resta dopo l'affitto <b style={{ color: resta < 0 ? "var(--err)" : "var(--ink)" }}>{euro(resta)}</b></>; })()}</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr>{VIS.map(([k, l]) => <th key={k} className={NUMERICHE.has(k) ? "num" : ""}>{l}</th>)}</tr></thead>
              <tbody>
                {lista.map((x) => (
                  <tr key={x.r.id_reservation} style={{ cursor: "default" }}>
                    {VIS.map(([k]) => <td key={k} className={NUMERICHE.has(k) ? "num" : ""} style={k === "resta" ? { fontWeight: 600, color: x.v.resta < 0 ? "var(--err)" : undefined } : undefined}>
                      {k === "costoPul" && x.v.costoPul == null ? <span className="pill warn">manca</span> : fmt(k, x.v[k])}</td>)}
                  </tr>
                ))}
              </tbody>
              <tfoot><tr>{VIS.map(([k], i) => <td key={k} className={NUMERICHE.has(k) ? "num" : ""} style={{ fontWeight: 600, borderTop: "1px solid var(--line)", padding: "10px 14px" }}>
                {i === 0 ? "Totale" : NUMERICHE.has(k) ? fmt(k, somma(lista, k)) : ""}</td>)}</tr></tfoot>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────────── Pagina ───────────────────────────── */

const TABS = [["prenotazioni", "Prenotazioni", "list"], ["rendiconto", "Rendiconto mensile", "doc"], ["margini", "Margini", "chart"], ["planner", "Planner", "cal"], ["appartamenti", "Appartamenti e criteri", "home"], ["pm", "Property manager", "user"], ["agenti", "Agenti", "user"], ["costi", "Costi e compensi", "euro"], ["impostazioni", "Impostazioni", "gear"]];

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
      {tab === "rendiconto" && <RendicontoMensile key={modello} modello={modello} />}
      {tab === "costi" && <Costi modello={modello} />}
      {tab === "agenti" && <Persone key="ag" ruolo="agente" />}
      {tab === "pm" && <Persone key="pm" ruolo="pm" />}
      {tab === "impostazioni" && <Impostazioni stato={stato} sincronizza={sincronizza} lavoro={lavoro} esitoSync={esitoSync} />}
    </div>
  );
}
