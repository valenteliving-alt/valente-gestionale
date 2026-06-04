import { useState, useEffect, useCallback, useRef, Fragment } from "react";

// PASSWORD PER ENTRARE NEL GESTIONALE — cambiala qui quando vuoi
const PASSWORD_SITO = "Living626!!";

const SUPABASE_URL = "https://heabtbdmwbjlgujsisor.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhlYWJ0YmRtd2JqbGd1anNpc29yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMjA4NDgsImV4cCI6MjA5NTg5Njg0OH0.FRk1tARhQHylLjfhACorn6O_E7ommm47tBTfJHOVxAU";

const sb = {
  async req(method, table, body, query = "") {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
      method, body: body ? JSON.stringify(body) : undefined,
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" }
    });
    const data = await r.json().catch(() => null);
    return { data, ok: r.ok };
  },
  get: (t, q) => sb.req("GET", t, null, q),
  post: (t, b) => sb.req("POST", t, b),
  patch: (t, id, b) => sb.req("PATCH", t, b, `?id=eq.${id}`),
  del: (t, id) => sb.req("DELETE", t, null, `?id=eq.${id}`),
};

const MONDAY_DATA = [
  { nome: "San Jacopo", indirizzo: "Via del Giglio 25", citta: "Pistoia", provincia: "PT", proprietario: "Tommaso Baroncelli", cin: "IT047014B4CICQGD6B", stato: "attivo", gestore: "Tommaso", commissione: 22.5 },
  { nome: "Il Leoncino", indirizzo: "Via del Giglio 25", citta: "Pistoia", provincia: "PT", proprietario: "Tommaso Baroncelli", cin: "IT047014B4YGGL3LZG", stato: "attivo", gestore: "Tommaso", commissione: 22.5 },
  { nome: "Il Micco", indirizzo: "Via del Giglio 25", citta: "Pistoia", provincia: "PT", proprietario: "Tommaso Baroncelli", cin: "IT047014B4PFJCCTIE", stato: "attivo", gestore: "Tommaso", commissione: 22.5 },
  { nome: "La Giostra", indirizzo: "Via del Giglio 25", citta: "Pistoia", provincia: "PT", proprietario: "Tommaso Baroncelli", cin: "IT047014B4DVGQBREO", stato: "attivo", gestore: "Tommaso", commissione: 22.5 },
  { nome: "Santa Barbara", indirizzo: "Piazza della Resistenza 13", citta: "Pistoia", provincia: "PT", proprietario: "Tommaso Baroncelli", cin: "IT047014B4WAIGISYF", stato: "attivo", gestore: "Tommaso", commissione: 22.5 },
  { nome: "Villa Valente Piano Terra", indirizzo: "Via Pesciatina 626", citta: "Capannori", provincia: "LU", proprietario: "Simona Lencioni", cin: "IT046007B4PSBX7MPK", stato: "attivo", gestore: "Francesco", commissione: 25 },
  { nome: "Villa Valente Suite", indirizzo: "Via Pesciatina 626", citta: "Capannori", provincia: "LU", proprietario: "Simona Lencioni", cin: "IT046007B4PSBX7MPK", stato: "attivo", gestore: "Francesco", commissione: 25 },
  { nome: "Villa Valente Primo Piano", indirizzo: "Via Pesciatina 626", citta: "Capannori", provincia: "LU", proprietario: "Simona Lencioni", cin: "IT046007B4PSBX7MPK", stato: "attivo", gestore: "Francesco", commissione: 25 },
  { nome: "Villa Valente Secondo Piano", indirizzo: "Via Pesciatina 626", citta: "Capannori", provincia: "LU", proprietario: "Simona Lencioni", cin: "IT046007B4PSBX7MPK", stato: "attivo", gestore: "Francesco", commissione: 25 },
  { nome: "Il Bastione", indirizzo: "Piazza della Resistenza 14", citta: "Pistoia", provincia: "PT", proprietario: "Tommaso Baroncelli", cin: "", stato: "ristrutturazione", gestore: "Tommaso", commissione: null },
  { nome: "70 Design Apartment", indirizzo: "Via Amati 27", citta: "Pistoia", provincia: "PT", proprietario: "Federica Baroncelli", cin: "IT047014C2ACRHZJ9C", stato: "attivo", gestore: "Tommaso", commissione: 15 },
  { nome: "Villa Marina", indirizzo: "Via San Biagio 66", citta: "Serravalle Pistoiese", provincia: "PT", proprietario: "Eredi Bardelli", cin: "IT047020C2VJ522Y7E", stato: "attivo", gestore: "Tommaso", commissione: 15 },
  { nome: "Corso Roma 2", indirizzo: "Corso Roma 37", citta: "Montecatini Terme", provincia: "PT", proprietario: "Igor Griva", cin: "047011LTN0086", stato: "attivo", gestore: "Tommaso", commissione: 25 },
  { nome: "Corso Roma 3", indirizzo: "Corso Roma 37", citta: "Montecatini Terme", provincia: "PT", proprietario: "Maria Grazia Vannelli", cin: "IT047011C2VWWKWIQ3", stato: "attivo", gestore: "Tommaso", commissione: 25 },
  { nome: "Appartamento Lucca Centro", indirizzo: "Via Fontana 15", citta: "Lucca", provincia: "LU", proprietario: "Alma Paloka", cin: "IT046017C2KOPOVBPF", stato: "attivo", gestore: "Francesco", commissione: 25 },
  { nome: "Quercianella", indirizzo: "Via Domenico Francesco Falcucci 79", citta: "Quercianella", provincia: "LI", proprietario: "Silvia Pascucci e Rosanna Gasparini", cin: "", stato: "attivo", gestore: "Francesco", commissione: null },
  { nome: "Viareggio Sodini", indirizzo: "Via Nicola Pisano 61", citta: "Viareggio", provincia: "LU", proprietario: "Dino Sodini", cin: "IT046033C2AD4PWQRU", stato: "attivo", gestore: "Francesco", commissione: 30 },
  { nome: "Villa Blu Lammari", indirizzo: "Via S. Biagio 58", citta: "Serravalle Pistoiese", provincia: "PT", proprietario: "Alberto Guiggiani e Loredana Fattorini", cin: "IT046007C2BRXEY43M", stato: "attivo", gestore: "Francesco", commissione: 25 },
  { nome: "Borgo a Buggiano Tafuri", indirizzo: "Via Veneto 1", citta: "Borgo a Buggiano", provincia: "PT", proprietario: "Maria Julia Pedro Tafuri", cin: "IT047003C24ESWE355", stato: "attivo", gestore: "Tommaso", commissione: 30 },
  { nome: "Via San Pierino Lucca", indirizzo: "Vicolo San Pierino 8", citta: "Lucca", provincia: "LU", proprietario: "Feven Ghebrenegus Salvati", cin: "IT046017C2VISIVLQ3", stato: "attivo", gestore: "Francesco", commissione: 22.5 },
  { nome: "Torre del Lago", indirizzo: "Via Colombo 73", citta: "Torre del Lago Puccini", provincia: "LU", proprietario: "Christine Zoller", cin: "IT046033C2O95WSEI2", stato: "attivo", gestore: "Francesco", commissione: 30 },
  { nome: "Via Astura 2 Roma", indirizzo: "Via Astura 2", citta: "Roma", provincia: "RM", proprietario: "Kim Nasini e Joseph Lobo", cin: "", stato: "attivo", gestore: "Francesco", commissione: null },
  { nome: "Napoli Palasciano", indirizzo: "Via Ferdinando Palasciano 11", citta: "Napoli", provincia: "NA", proprietario: "Fabrizia Mondò", cin: "IT063049C269QXPJID", stato: "attivo", gestore: "Francesco", commissione: null },
  { nome: "La Spezia Sub 18", indirizzo: "Via della Ghiara 37", citta: "La Spezia", provincia: "SP", proprietario: "Ioana Cristina Iancu", cin: "", stato: "mandato firmato", gestore: "Francesco", commissione: 22 },
  { nome: "La Spezia Sub 16", indirizzo: "Via della Ghiara 47", citta: "La Spezia", provincia: "SP", proprietario: "Ioana Cristina Iancu", cin: "", stato: "mandato firmato", gestore: "Francesco", commissione: 22 },
  { nome: "Appartamento Bologna", indirizzo: "Via Francesca Edera De Giovanni 39", citta: "Bologna", provincia: "BO", proprietario: "Gianni Ferreri", cin: "IT037006C2AM9BJXK3", stato: "attivo", gestore: "Tommaso", commissione: null },
  { nome: "Napoli Corso Garibaldi", indirizzo: "Corso Garibaldi", citta: "Napoli", provincia: "NA", proprietario: "Ulderico Izzo", cin: "IT063049C2LTUQNSJ4", stato: "attivo", gestore: "Tommaso", commissione: null },
  { nome: "Torre di Catilina", indirizzo: "Via Torre di Catilina", citta: "Pistoia", provincia: "PT", proprietario: "Paola Cecchi", cin: "IT047014C2T3GWVQPT", stato: "mandato firmato", gestore: "Tommaso", commissione: 22.5 },
  { nome: "Firenze I Macci", indirizzo: "Via dei Macci 35", citta: "Firenze", provincia: "FI", proprietario: "John Baacchiocchi", cin: "IT048017C2QCM7YWCT", stato: "attivo", gestore: "Tommaso", commissione: null },
  { nome: "San Gimignano", indirizzo: "Via del Corbizzo 3", citta: "San Gimignano", provincia: "SI", proprietario: "Tessa Lulli", cin: "IT052028C2H3TNDHKQ", stato: "mandato + cin", gestore: "Tommaso", commissione: 25 },
  { nome: "Pantelleria 1", indirizzo: "", citta: "Pantelleria", provincia: "TP", proprietario: "Gianni Ferreri", cin: "", stato: "attivo", gestore: "Tommaso", commissione: null },
  { nome: "Pantelleria 2", indirizzo: "", citta: "Pantelleria", provincia: "TP", proprietario: "Gianni Ferreri", cin: "", stato: "mandato firmato", gestore: "Tommaso", commissione: null },
  { nome: "Appartamento Lucca Castellaccio", indirizzo: "Via del Castellaccio", citta: "Lucca", provincia: "LU", proprietario: "John Anthony McCarthy", cin: "", stato: "mandato + cin", gestore: "Francesco", commissione: null },
  { nome: "Montaione 3 Appartamenti", indirizzo: "Via dell'Ecce Homo", citta: "Montaione", provincia: "FI", proprietario: "Ilan Meyer", cin: "", stato: "mandato firmato", gestore: "Francesco", commissione: null },
  { nome: "Lucca San Nicolao", indirizzo: "Via San Nicolao 33", citta: "Lucca", provincia: "LU", proprietario: "Federica Bianchi", cin: "IT046017C2VJE4D3ND", stato: "mandato firmato", gestore: "Francesco", commissione: null },
  { nome: "Appartamento Barga", indirizzo: "", citta: "Barga", provincia: "LU", proprietario: "Florina", cin: "", stato: "mandato firmato", gestore: "Francesco", commissione: null },
  { nome: "Villa Livorno", indirizzo: "Via Poggio di Mezzo", citta: "Livorno", provincia: "LI", proprietario: "Renato", cin: "", stato: "mandato firmato", gestore: "Francesco", commissione: null },
  { nome: "Lucca San Nicolao Piano Terra", indirizzo: "Via San Nicolao 67", citta: "Lucca", provincia: "LU", proprietario: "", cin: "", stato: "mandato firmato", gestore: "Francesco", commissione: null },
  { nome: "Via Squaglia Lucca", indirizzo: "Via Enrico Squaglia 364", citta: "Lucca", provincia: "LU", proprietario: "Nicola Fontanive", cin: "IT046017C2RS39MTAV", stato: "attivo", gestore: "Francesco", commissione: 23 },
  { nome: "Appt. Vipiteno", indirizzo: "Via Gänsbacher 25", citta: "Vipiteno", provincia: "BZ", proprietario: "Valentina Cammarota", cin: "", stato: "in lancio", gestore: "Tommaso", commissione: null },
  { nome: "Villa Acqua Elba", indirizzo: "", citta: "Elba", provincia: "LI", proprietario: "Olimpia Banci", cin: "", stato: "in lancio", gestore: "Tommaso", commissione: 10 },
  { nome: "Appartamenti Banci Firenze", indirizzo: "", citta: "Firenze", provincia: "FI", proprietario: "Olimpia Banci", cin: "", stato: "in lancio", gestore: "Tommaso", commissione: 18 },
];

const STATI = ["in lancio", "attivo", "mandato firmato", "mandato + cin", "ristrutturazione", "inattivo"];
const STATI_COLOR = { "attivo": "#2d6a4f", "in lancio": "#d69c31", "mandato firmato": "#1d6fa4", "mandato + cin": "#4a90d9", "ristrutturazione": "#e07b39", "inattivo": "#888" };
const CONTRATTI = ["gestione", "sublocazione"];
const PIATTAFORME = ["Airbnb", "Booking", "VRBO", "Direct", "Expedia"];
const GESTORI = ["Tommaso", "Francesco", "Jacopo"];

const WORKFLOW_COLUMNS = [
  { id: "mandato", label: "Mandato", color: "#1d6fa4" },
  { id: "scia", label: "SCIA", color: "#e07b39" },
  { id: "cin", label: "CIN", color: "#8b5cf6" },
  { id: "cir", label: "CIR/Ross1000", color: "#0891b2" },
  { id: "geis", label: "GEIS", color: "#d69c31" },
  { id: "alloggiati", label: "Alloggiati Web", color: "#059669" },
  { id: "annunci", label: "Annunci Online", color: "#2d6a4f" },
];

const STEP_TASKS = {
  mandato: ["Raccogliere documenti proprietario", "Verificare dati catastali", "Firmare mandato", "Registrare contratto AdE"],
  scia: ["Verificare SUAP competente", "Raccogliere planimetria", "Presentare SCIA al Comune", "Ricevere ricevuta protocollazione"],
  cin: ["Accedere al portale BDSR", "Inserire dati immobile", "Caricare planimetria", "Ottenere CIN", "Esporre CIN esterno"],
  cir: ["Accedere Ross1000 con SPID", "Verificare codice regione", "Inserire CIR in GEIS"],
  geis: ["Accedere GEIS con SPID", "Inserire CIR struttura", "Configurare imposta soggiorno", "Prima comunicazione trimestrale"],
  alloggiati: ["Compilare modulo questura", "Inviare PEC alla Questura", "Ricevere credenziali", "Configurare Alloggiati Web"],
  annunci: ["Fotografare immobile", "Creare annuncio Airbnb", "Creare annuncio Booking", "Impostare prezzi", "Attivare Kross Booking"],
};

const QUICK_PROMPTS = [
  "Quali proprietà non hanno ancora il CIN?",
  "Scrivi una email di benvenuto per un nuovo proprietario",
  "Quali sono le proprietà di Tommaso attive?",
  "Spiega la procedura per ottenere il CIN",
  "Qual è la commissione media del portfolio?",
  "Proprietà in fase di lancio: cosa manca?",
  "Scrivi una PEC per richiedere credenziali Alloggiati Web",
  "Procedura imposta di soggiorno Bologna",
];

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Poppins:wght@300;400;500;600&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--cream:#FBF9F8;--cd:#F0EAE2;--black:#0A0A0A;--gold:#D69C31;--white:#fff;--gray:#6b6b6b;--gl:#e4ddd8;--red:#c0392b;--sw:240px}
body{font-family:'Poppins',sans-serif;background:var(--cream);color:var(--black);min-height:100vh}
h1,h2,h3{font-family:'Playfair Display',serif}
input,select,textarea{font-family:'Poppins',sans-serif;font-size:13px;background:var(--white);border:1px solid var(--gl);color:var(--black);padding:8px 12px;width:100%;outline:none;transition:border-color .2s}
input:focus,select:focus,textarea:focus{border-color:var(--gold)}
button{font-family:'Poppins',sans-serif;cursor:pointer}
::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:var(--gold)}
.pill{display:inline-block;padding:3px 10px;font-size:11px;font-weight:500;border-radius:20px;text-transform:uppercase;letter-spacing:.04em;color:#fff}
.tag{display:inline-block;padding:2px 8px;font-size:10px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;background:var(--cd);color:var(--gray);border:1px solid var(--gl)}
.bp{background:var(--black);color:var(--white);border:none;padding:10px 24px;font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;transition:background .2s}
.bp:hover{background:var(--gold);color:var(--black)}
.bg{background:transparent;color:var(--gray);border:1px solid var(--gl);padding:8px 16px;font-size:12px;font-weight:500;transition:all .2s}
.bg:hover{border-color:var(--black);color:var(--black)}
.bd{background:transparent;color:var(--red);border:1px solid #e8c4c0;padding:8px 16px;font-size:12px;font-weight:500;transition:all .2s}
.bd:hover{background:var(--red);color:#fff}
.gl{height:2px;background:linear-gradient(90deg,var(--gold),transparent)}
.fi{animation:fi .3s ease}
@keyframes fi{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.card{background:var(--white);border:1px solid var(--gl);padding:18px 20px;cursor:pointer;transition:box-shadow .2s,border-color .2s;position:relative;overflow:hidden}
.card:hover{box-shadow:0 4px 20px rgba(0,0,0,.08);border-color:var(--gold)}
.kcard{background:var(--white);border:1px solid var(--gl);padding:14px;margin-bottom:10px;cursor:pointer;transition:all .2s;border-radius:2px}
.kcard:hover{border-color:var(--gold);box-shadow:0 2px 10px rgba(0,0,0,.06)}
.kcol{background:var(--cd);padding:12px;min-height:200px;flex:1;min-width:170px}
.check{display:flex;align-items:center;gap:10px;padding:6px 0;font-size:12px;cursor:pointer;border-bottom:1px solid var(--cd)}
.check input[type=checkbox]{width:14px;height:14px;accent-color:var(--gold);cursor:pointer;flex-shrink:0}
.check.done span{text-decoration:line-through;color:var(--gray)}
.msg-user{background:var(--black);color:var(--white);padding:12px 16px;max-width:80%;margin-left:auto;font-size:13px;line-height:1.5}
.msg-ai{background:var(--white);border:1px solid var(--gl);padding:12px 16px;max-width:90%;font-size:13px;line-height:1.6;white-space:pre-wrap}
.msg-ai strong{font-weight:600;color:var(--black)}
.typing{display:flex;gap:4px;padding:12px 16px;background:var(--white);border:1px solid var(--gl);width:60px}
.dot{width:6px;height:6px;border-radius:50%;background:var(--gold);animation:bounce 1.2s infinite}
.dot:nth-child(2){animation-delay:.2s}
.dot:nth-child(3){animation-delay:.4s}
@keyframes bounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-8px)}}
.ai-btn{position:fixed;bottom:28px;right:28px;width:56px;height:56px;background:var(--black);border:none;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:0 4px 20px rgba(0,0,0,.3);transition:all .2s;z-index:500}
.ai-btn:hover{background:var(--gold);transform:scale(1.05)}
.ai-panel{position:fixed;bottom:0;right:0;width:420px;height:100vh;background:var(--cream);border-left:1px solid var(--gl);display:flex;flex-direction:column;z-index:600;animation:slideIn .3s ease}
@keyframes slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}
.sidebar{position:fixed;top:0;left:0;bottom:0;width:var(--sw);z-index:100;background:var(--black);color:var(--white);display:flex;flex-direction:column;overflow-y:auto}
.main{margin-left:var(--sw);flex:1;padding:32px;min-height:100vh;min-width:0}
.topbar{display:none}
.backdrop{display:none}
.fg{display:grid;grid-template-columns:1fr 1fr;gap:14px 20px}
@media (max-width:768px){
  .sidebar{transform:translateX(-100%);transition:transform .25s ease;width:min(82vw,300px);box-shadow:0 0 40px rgba(0,0,0,.45)}
  .sidebar.open{transform:translateX(0)}
  .main{margin-left:0;padding:16px;padding-top:64px}
  .topbar{display:flex;position:fixed;top:0;left:0;right:0;height:52px;background:var(--black);color:var(--white);align-items:center;gap:14px;padding:0 16px;z-index:90}
  .backdrop{display:block;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:95}
  .ai-panel{width:100%;right:0}
  .ai-btn{bottom:18px;right:18px;width:50px;height:50px;font-size:20px}
  .fg{grid-template-columns:1fr}
}
`;

const SB = ({ stato }) => <span className="pill" style={{ background: STATI_COLOR[stato] || "#888" }}>{stato || "—"}</span>;
const CT = ({ tipo }) => <span className="tag" style={tipo === "sublocazione" ? { background: "#fff8e1", color: "#b8860b", borderColor: "#d69c31" } : {}}>{tipo || "gestione"}</span>;
const DR = ({ label, val }) => val ? (
  <div style={{ display: "flex", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--cd)" }}>
    <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--gray)", minWidth: 130 }}>{label}</span>
    <span style={{ fontSize: 13, flex: 1, wordBreak: "break-all" }}>{val}</span>
  </div>
) : null;
const FG = ({ children }) => <div className="fg">{children}</div>;
const FF = ({ label, span = 1, children }) => (
  <div style={{ gridColumn: `span ${span}` }}>
    <label style={{ display: "block", fontSize: 10, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--gray)", marginBottom: 5 }}>{label}</label>
    {children}
  </div>
);
const ST = ({ children }) => (
  <div style={{ marginBottom: 16, marginTop: 8 }}>
    <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--gold)", marginBottom: 6 }}>{children}</p>
    <div className="gl" style={{ width: 60 }} />
  </div>
);
const Modal = ({ title, onClose, children }) => (
  <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={e => e.target === e.currentTarget && onClose()}>
    <div style={{ background: "var(--cream)", width: "100%", maxWidth: 680, maxHeight: "90vh", overflow: "auto" }} className="fi">
      <div style={{ padding: "24px 28px 16px", borderBottom: "1px solid var(--gl)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ fontSize: 18 }}>{title}</h2>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, color: "var(--gray)" }}>×</button>
      </div>
      <div className="gl" />
      <div style={{ padding: 28 }}>{children}</div>
    </div>
  </div>
);

// ── AI Chat Panel ────────────────────────────────────────────────────────────
// Estrae l'eventuale blocco dati-proprietario dalla risposta dell'AI e separa il testo da mostrare
function estraiAzioneProprietario(text) {
  const m = text.match(/\[\[PROPRIETARIO\]\]([\s\S]*?)\[\[\/PROPRIETARIO\]\]/);
  if (!m) return { testo: text.trim(), action: null };
  const testo = text.replace(m[0], "").trim();
  let data = null;
  try { data = JSON.parse(m[1].trim()); } catch { data = null; }
  if (data && (data.nome || data.cognome || data.codice_fiscale)) {
    return { testo: testo || "Ho letto i dati del proprietario dal documento.", action: { kind: "crea_proprietario", data, status: "idle" } };
  }
  return { testo: testo || text.trim(), action: null };
}

const AiPanel = ({ onClose, proprieta, owners, onDataChanged }) => {
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Ciao! Sono l'assistente AI di Valente Living. Posso aiutarti con informazioni sulle proprietà, scrivere email ai proprietari, spiegare procedure burocratiche e molto altro. Come posso aiutarti?" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [pendingData, setPendingData] = useState(null);
  const fileRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const buildContext = () => {
    const propList = proprieta.map(p => {
      const o = owners.find(x => x.id === p.proprietario_id);
      return `- ${p.nome} (${p.citta}, ${p.provincia || ""}) | Stato: ${p.stato} | CIN: ${p.cin || "mancante"} | CIR: ${p.cir || "mancante"} | Proprietario: ${o ? o.cognome + " " + o.nome : "non associato"} | Gestore: ${p.gestore_interno || "—"} | Commissione: ${p.commissione ? p.commissione + "%" : "—"}`;
    }).join("\n");

    const ownerList = owners.map(o => `- ${o.cognome} ${o.nome} | CF: ${o.codice_fiscale || "—"} | Email: ${o.email || "—"} | Tel: ${o.telefono || "—"} | PEC: ${o.pec || "—"}`).join("\n");

    return `PROPRIETÀ NEL DATABASE (${proprieta.length} totali):\n${propList || "Nessuna proprietà nel database"}\n\nPROPRIETARI (${owners.length} totali):\n${ownerList || "Nessun proprietario"}`;
  };

  const send = async (text) => {
    if (!text.trim() || loading) return;
    const userMsg = { role: "user", content: text };
    setMessages(m => [...m, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));
      const res = await fetch("/api/ai-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, context: buildContext() }),
      });
      const data = await res.json();
      setMessages(m => [...m, { role: "assistant", content: data.content || data.error || "Errore nella risposta." }]);
    } catch {
      setMessages(m => [...m, { role: "assistant", content: "Errore di connessione. Riprova." }]);
    }
    setLoading(false);
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || loading || analyzing) return;

    if (file.size > 10 * 1024 * 1024) {
      setMessages(m => [...m, { role: "assistant", content: "Il file supera i 10 MB. Caricane uno più piccolo." }]);
      return;
    }

    setMessages(m => [...m, { role: "user", content: `📎 ${file.name}` }]);
    setAnalyzing(true);

    try {
      const base64 = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(",")[1]);
        r.onerror = () => reject(new Error("lettura del file fallita"));
        r.readAsDataURL(file);
      });

      const resp = await fetch("/.netlify/functions/analyze-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, mediaType: file.type, data: base64, context: buildContext() }),
      });
      const raw = await resp.text();

      if (!resp.ok) {
        setMessages(m => [...m, { role: "assistant", content: `DEBUG — la function ha risposto con stato ${resp.status}.\n\n${raw.slice(0, 600)}` }]);
        setAnalyzing(false);
        return;
      }

      let data = {};
      try {
        data = JSON.parse(raw);
      } catch {
        setMessages(m => [...m, { role: "assistant", content: `DEBUG — risposta non in formato JSON:\n\n${raw.slice(0, 600)}` }]);
        setAnalyzing(false);
        return;
      }

      const reply = data.content || data.analysis || data.result || data.text || data.error || "Nessun risultato dall'analisi.";
      const ext = estraiAzioneProprietario(reply);
      const action = ext.action ? { ...ext.action, file: { data: base64, name: file.name, type: file.type, size: file.size } } : null;
      setMessages(m => [...m, { role: "assistant", content: ext.testo, action }]);
    } catch (err) {
      setMessages(m => [...m, { role: "assistant", content: `DEBUG — errore di rete: ${err.message}` }]);
    }
    setAnalyzing(false);
  };

  const eseguiAzione = async (idx) => {
    const msg = messages[idx];
    if (!msg || !msg.action || msg.action.status === "loading" || msg.action.status === "done") return;
    setMessages(ms => ms.map((x, i) => i === idx ? { ...x, action: { ...x.action, status: "loading" } } : x));

    try {
      if (msg.action.kind === "crea_proprietario") {
        const d = msg.action.data || {};
        const cf = (d.codice_fiscale || "").trim().toUpperCase();
        if (cf && owners.some(o => (o.codice_fiscale || "").trim().toUpperCase() === cf)) {
          setMessages(ms => ms.map((x, i) => i === idx ? { ...x, action: { ...x.action, status: "idle" } } : x)
            .concat({ role: "assistant", content: "Esiste già un proprietario con codice fiscale " + cf + ". Non l'ho ricreato per evitare doppioni." }));
          return;
        }
        const payload = {
          nome: d.nome || "", cognome: d.cognome || "", codice_fiscale: cf,
          email: d.email || "", telefono: d.telefono || "", pec: d.pec || "",
          indirizzo: d.indirizzo || "", citta: d.citta || "",
        };
        const res = await sb.post("proprietari", payload);
        if (!res.ok) throw new Error("post fallita");
        const nuovo = Array.isArray(res.data) ? res.data[0] : res.data;
        const nuovoId = nuovo && nuovo.id;
        if (onDataChanged) await onDataChanged();
        const nomeC = (payload.nome + " " + payload.cognome).trim() || "il proprietario";

        // Allega al nuovo proprietario il documento già caricato in chat (nessun secondo caricamento)
        let allegatoMsg = "";
        const f = msg.action.file;
        if (nuovoId && f && f.data) {
          if (f.size && f.size > 4 * 1024 * 1024) {
            allegatoMsg = " Il documento supera i 4 MB, quindi non l'ho allegato in automatico: puoi caricarlo a mano dalla sua scheda.";
          } else {
            try {
              const ra = await fetch("/.netlify/functions/allegati", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "upload", proprietario_id: String(nuovoId), nome_file: f.name, tipo: f.type, data: f.data }),
              });
              allegatoMsg = ra.ok
                ? " Ho anche allegato il documento alla sua scheda."
                : " Non sono riuscito ad allegare il documento (puoi farlo a mano dagli Allegati della scheda).";
            } catch {
              allegatoMsg = " Non sono riuscito ad allegare il documento (puoi farlo a mano dagli Allegati della scheda).";
            }
          }
        }

        setMessages(ms => ms.map((x, i) => i === idx ? { ...x, action: { ...x.action, status: "done" } } : x)
          .concat({ role: "assistant", content: "Fatto! Ho creato " + nomeC + " nella sezione Proprietari." + allegatoMsg }));
      }
    } catch (e) {
      setMessages(ms => ms.map((x, i) => i === idx ? { ...x, action: { ...x.action, status: "idle" } } : x)
        .concat({ role: "assistant", content: "Non sono riuscito a creare il proprietario. Riprova, oppure crealo a mano dalla sezione Proprietari." }));
    }
  };

  return (
    <div className="ai-panel">
      {/* Header */}
      <div style={{ padding: "16px 20px", background: "var(--black)", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <div style={{ width: 36, height: 36, background: "var(--gold)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>✦</div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--white)", fontFamily: "Playfair Display" }}>Assistente AI</p>
          <p style={{ fontSize: 10, color: "rgba(255,255,255,.5)", letterSpacing: ".06em", textTransform: "uppercase" }}>Valente Living · Powered by Claude</p>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,.6)", fontSize: 20 }}>×</button>
      </div>

      {/* Quick prompts */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--gl)", flexShrink: 0 }}>
        <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--gray)", marginBottom: 8 }}>Domande rapide</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {QUICK_PROMPTS.slice(0, 4).map((q, i) => (
            <button key={i} onClick={() => send(q)} style={{ padding: "4px 10px", fontSize: 10, fontWeight: 500, background: "var(--white)", border: "1px solid var(--gl)", color: "var(--gray)", transition: "all .15s", cursor: "pointer" }}
              onMouseEnter={e => { e.target.style.borderColor = "var(--gold)"; e.target.style.color = "var(--black)"; }}
              onMouseLeave={e => { e.target.style.borderColor = "var(--gl)"; e.target.style.color = "var(--gray)"; }}>
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflow: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.map((m, i) => (
          <Fragment key={i}>
            <div className={m.role === "user" ? "msg-user" : "msg-ai"}>{m.content}</div>
            {m.action && m.action.kind === "crea_proprietario" && (
              <div style={{ alignSelf: "flex-start", maxWidth: "85%" }}>
                <button
                  onClick={() => eseguiAzione(i)}
                  disabled={m.action.status === "loading" || m.action.status === "done"}
                  style={{ padding: "9px 14px", background: m.action.status === "done" ? "var(--gl)" : "var(--gold)", color: m.action.status === "done" ? "var(--gray)" : "#fff", border: "none", fontSize: 12, fontWeight: 600, cursor: m.action.status === "done" ? "default" : "pointer" }}>
                  {m.action.status === "loading"
                    ? "Creazione…"
                    : m.action.status === "done"
                    ? "✓ Proprietario creato"
                    : "+ Crea proprietario" + ((m.action.data.nome || m.action.data.cognome) ? ": " + [m.action.data.nome, m.action.data.cognome].filter(Boolean).join(" ") : "")}
                </button>
              </div>
            )}
          </Fragment>
        ))}
        {(loading || analyzing) && (
          <div className="typing">
            <div className="dot" /><div className="dot" /><div className="dot" />
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* More quick prompts */}
      <div style={{ padding: "8px 16px", borderTop: "1px solid var(--gl)", flexShrink: 0 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {QUICK_PROMPTS.slice(4).map((q, i) => (
            <button key={i} onClick={() => send(q)} style={{ padding: "3px 8px", fontSize: 10, background: "transparent", border: "1px solid var(--gl)", color: "var(--gray)", cursor: "pointer" }}
              onMouseEnter={e => { e.target.style.borderColor = "var(--gold)"; }}
              onMouseLeave={e => { e.target.style.borderColor = "var(--gl)"; }}>
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div style={{ padding: "12px 16px", borderTop: "1px solid var(--gl)", flexShrink: 0, display: "flex", gap: 8 }}>
        <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" style={{ display: "none" }} onChange={handleFile} />
        <button onClick={() => fileRef.current?.click()} disabled={loading || analyzing} title="Allega un documento (PDF o immagine)"
          style={{ padding: "8px 12px", background: "var(--white)", border: "1px solid var(--gl)", color: "var(--gray)", fontSize: 15, cursor: (loading || analyzing) ? "default" : "pointer" }}>
          📎
        </button>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send(input))}
          placeholder="Chiedi qualcosa..."
          style={{ flex: 1, fontSize: 13 }}
          disabled={loading || analyzing}
        />
        <button onClick={() => send(input)} disabled={loading || analyzing || !input.trim()} style={{ padding: "8px 16px", background: input.trim() ? "var(--black)" : "var(--gl)", color: input.trim() ? "var(--white)" : "var(--gray)", border: "none", fontSize: 12, fontWeight: 600, transition: "all .2s", cursor: input.trim() ? "pointer" : "default" }}>
          ↑
        </button>
      </div>
    </div>
  );
};

// ── Form Proprietario ────────────────────────────────────────────────────────
const EP = { nome: "", cognome: "", codice_fiscale: "", email: "", telefono: "", pec: "", indirizzo: "", citta: "", note: "" };
const OwnerForm = ({ init = EP, onSave, onClose, loading }) => {
  const [f, setF] = useState(init);
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));
  return (
    <>
      <ST>Anagrafica</ST><FG>
        <FF label="Nome"><input value={f.nome} onChange={e => s("nome", e.target.value)} /></FF>
        <FF label="Cognome"><input value={f.cognome} onChange={e => s("cognome", e.target.value)} /></FF>
        <FF label="Codice Fiscale" span={2}><input value={f.codice_fiscale} onChange={e => s("codice_fiscale", e.target.value.toUpperCase())} style={{ fontFamily: "monospace", letterSpacing: ".1em" }} /></FF>
      </FG>
      <div style={{ marginTop: 20 }}><ST>Contatti</ST><FG>
        <FF label="Email"><input value={f.email} onChange={e => s("email", e.target.value)} type="email" /></FF>
        <FF label="Telefono"><input value={f.telefono} onChange={e => s("telefono", e.target.value)} /></FF>
        <FF label="PEC" span={2}><input value={f.pec} onChange={e => s("pec", e.target.value)} /></FF>
        <FF label="Indirizzo" span={2}><input value={f.indirizzo} onChange={e => s("indirizzo", e.target.value)} /></FF>
        <FF label="Città"><input value={f.citta} onChange={e => s("citta", e.target.value)} /></FF>
      </FG></div>
      <div style={{ marginTop: 20 }}><ST>Note</ST><textarea value={f.note} onChange={e => s("note", e.target.value)} rows={3} /></div>
      <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
        <button className="bg" onClick={onClose}>Annulla</button>
        <button className="bp" onClick={() => onSave(f)} disabled={loading}>{loading ? "..." : "Salva"}</button>
      </div>
    </>
  );
};

// ── Form Proprietà ───────────────────────────────────────────────────────────
const EP2 = { nome: "", indirizzo: "", citta: "", cap: "", provincia: "", proprietario_id: "", tipo_contratto: "gestione", stato: "in lancio", cin: "", cir: "", commissione: "", commissione_iva_inclusa: true, posti_letto: "", camere: "", bagni: "", mq: "", catasto_foglio: "", catasto_mappale: "", catasto_sub: "", categoria_catastale: "", gestore_interno: "Tommaso", piattaforme: [], note: "", data_inizio: "", personale_pulizie: "", telefono_pulizie: "" };
const PropForm = ({ init = EP2, owners, onSave, onClose, loading }) => {
  const [f, setF] = useState(init);
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));
  const tp = p => setF(prev => ({ ...prev, piattaforme: prev.piattaforme?.includes(p) ? prev.piattaforme.filter(x => x !== p) : [...(prev.piattaforme || []), p] }));
  return (
    <>
      <ST>Dati Proprietà</ST><FG>
        <FF label="Nome" span={2}><input value={f.nome} onChange={e => s("nome", e.target.value)} /></FF>
        <FF label="Proprietario" span={2}><select value={f.proprietario_id} onChange={e => s("proprietario_id", e.target.value)}><option value="">— Seleziona —</option>{owners.map(o => <option key={o.id} value={o.id}>{o.cognome} {o.nome}</option>)}</select></FF>
        <FF label="Tipo Contratto"><select value={f.tipo_contratto} onChange={e => s("tipo_contratto", e.target.value)}>{CONTRATTI.map(c => <option key={c}>{c}</option>)}</select></FF>
        <FF label="Stato"><select value={f.stato} onChange={e => s("stato", e.target.value)}>{STATI.map(ss => <option key={ss}>{ss}</option>)}</select></FF>
        <FF label="Gestore"><select value={f.gestore_interno} onChange={e => s("gestore_interno", e.target.value)}>{GESTORI.map(g => <option key={g}>{g}</option>)}</select></FF>
        <FF label="Data Inizio"><input type="date" value={f.data_inizio} onChange={e => s("data_inizio", e.target.value)} /></FF>
      </FG>
      <div style={{ marginTop: 20 }}><ST>Indirizzo</ST><FG>
        <FF label="Via" span={2}><input value={f.indirizzo} onChange={e => s("indirizzo", e.target.value)} /></FF>
        <FF label="Città"><input value={f.citta} onChange={e => s("citta", e.target.value)} /></FF>
        <FF label="CAP"><input value={f.cap} onChange={e => s("cap", e.target.value)} /></FF>
        <FF label="Prov"><input value={f.provincia} onChange={e => s("provincia", e.target.value)} maxLength={2} style={{ textTransform: "uppercase" }} /></FF>
      </FG></div>
      <div style={{ marginTop: 20 }}><ST>Compliance</ST><FG>
        <FF label="CIN" span={2}><input value={f.cin} onChange={e => s("cin", e.target.value)} style={{ fontFamily: "monospace" }} /></FF>
        <FF label="CIR" span={2}><input value={f.cir} onChange={e => s("cir", e.target.value)} style={{ fontFamily: "monospace" }} /></FF>
      </FG></div>
      <div style={{ marginTop: 20 }}><ST>Catasto</ST><FG>
        <FF label="Foglio"><input value={f.catasto_foglio} onChange={e => s("catasto_foglio", e.target.value)} /></FF>
        <FF label="Mappale"><input value={f.catasto_mappale} onChange={e => s("catasto_mappale", e.target.value)} /></FF>
        <FF label="Sub"><input value={f.catasto_sub} onChange={e => s("catasto_sub", e.target.value)} /></FF>
        <FF label="Categoria"><input value={f.categoria_catastale} onChange={e => s("categoria_catastale", e.target.value)} placeholder="A/2" /></FF>
      </FG></div>
      <div style={{ marginTop: 20 }}><ST>Commissione & Ricettività</ST><FG>
        <FF label="Commissione %"><input type="number" value={f.commissione} onChange={e => s("commissione", e.target.value)} /></FF>
        <FF label="IVA"><select value={f.commissione_iva_inclusa ? "si" : "no"} onChange={e => s("commissione_iva_inclusa", e.target.value === "si")}><option value="si">IVA inclusa</option><option value="no">+ IVA</option></select></FF>
        <FF label="Letti"><input type="number" value={f.posti_letto} onChange={e => s("posti_letto", e.target.value)} /></FF>
        <FF label="Camere"><input type="number" value={f.camere} onChange={e => s("camere", e.target.value)} /></FF>
        <FF label="Bagni"><input type="number" value={f.bagni} onChange={e => s("bagni", e.target.value)} /></FF>
        <FF label="MQ"><input type="number" value={f.mq} onChange={e => s("mq", e.target.value)} /></FF>
      </FG></div>
      <div style={{ marginTop: 20 }}><ST>Pulizie</ST><FG>
        <FF label="Personale pulizie" span={2}><input value={f.personale_pulizie || ""} onChange={e => s("personale_pulizie", e.target.value)} /></FF>
        <FF label="Telefono pulizie" span={2}><input value={f.telefono_pulizie || ""} onChange={e => s("telefono_pulizie", e.target.value)} /></FF>
      </FG></div>
      <div style={{ marginTop: 20 }}><ST>Piattaforme</ST>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {PIATTAFORME.map(p => <button key={p} onClick={() => tp(p)} style={{ padding: "6px 14px", fontSize: 12, fontWeight: 600, border: "1.5px solid", borderColor: f.piattaforme?.includes(p) ? "var(--gold)" : "var(--gl)", background: f.piattaforme?.includes(p) ? "var(--gold)" : "transparent", color: f.piattaforme?.includes(p) ? "var(--black)" : "var(--gray)", transition: "all .15s" }}>{p}</button>)}
        </div>
      </div>
      <div style={{ marginTop: 20 }}><ST>Note</ST><textarea value={f.note} onChange={e => s("note", e.target.value)} rows={3} /></div>
      <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
        <button className="bg" onClick={onClose}>Annulla</button>
        <button className="bp" onClick={() => onSave(f)} disabled={loading}>{loading ? "..." : "Salva"}</button>
      </div>
    </>
  );
};

// ── Workflow Lancio ──────────────────────────────────────────────────────────
const KanbanView = ({ proprieta, owners, onDataChanged, onEdit }) => {
  const [saving, setSaving] = useState(null);
  const inLancio = proprieta.filter(p => ["in lancio", "mandato firmato", "mandato + cin"].includes(p.stato));
  const parseSteps = p => { try { return p.workflow_steps ? JSON.parse(p.workflow_steps) : {}; } catch { return {}; } };
  const stepDone = (p, stepId) => {
    if (stepId === "cin") return !!(p.cin && String(p.cin).trim());
    if (stepId === "cir") return !!(p.cir && String(p.cir).trim());
    return parseSteps(p)[stepId] === true;
  };
  const nDone = p => WORKFLOW_COLUMNS.filter(c => stepDone(p, c.id)).length;
  const progress = p => Math.round((nDone(p) / WORKFLOW_COLUMNS.length) * 100);
  const toggleStep = async (p, stepId) => {
    if (stepId === "cin" || stepId === "cir") { if (onEdit) onEdit(p); return; }
    const st = parseSteps(p); st[stepId] = !st[stepId];
    setSaving(p.id);
    await sb.patch("proprieta", p.id, { workflow_steps: JSON.stringify(st) });
    if (onDataChanged) await onDataChanged();
    setSaving(null);
  };
  const rendiAttiva = async (p) => {
    if (!confirm("Rendere attiva questa proprietà? Uscirà dal Workflow e comparirà in Proprietà.")) return;
    setSaving(p.id);
    await sb.patch("proprieta", p.id, { stato: "attivo" });
    if (onDataChanged) await onDataChanged();
    setSaving(null);
  };
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 8, gap: 12 }}>
        <div><h1 style={{ fontSize: 26, fontWeight: 700 }}>Workflow Lancio</h1><p style={{ fontSize: 12, color: "var(--gray)", marginTop: 4 }}>{inLancio.length} proprietà in onboarding</p></div>
        <button className="bp" onClick={() => onEdit && onEdit("new")}>+ Nuova proprietà</button>
      </div>
      <div className="gl" style={{ marginBottom: 24 }} />
      {inLancio.length === 0 ? <div style={{ textAlign: "center", padding: 60, color: "var(--gray)" }}>Nessuna proprietà in lancio.</div> : (
        <div style={{ display: "grid", gap: 14 }}>
          {inLancio.map(p => {
            const pct = progress(p);
            const owner = owners.find(o => o.id === p.proprietario_id);
            const busy = saving === p.id;
            const complete = pct === 100;
            return (
              <div key={p.id} className="card" style={{ padding: 18, opacity: busy ? .55 : 1, transition: "opacity .15s" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>{p.nome}</div>
                    <div style={{ fontSize: 12, color: "var(--gray)", marginTop: 2 }}>{[p.citta, p.provincia].filter(Boolean).join(", ")}{owner ? ` · ${owner.cognome || ""} ${owner.nome || ""}`.replace(/ +$/, "") : ""}</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: complete ? "#2d6a4f" : "var(--gold)", lineHeight: 1 }}>{pct}%</div>
                    <div style={{ fontSize: 10, color: "var(--gray)", marginTop: 3 }}>{nDone(p)}/{WORKFLOW_COLUMNS.length} step</div>
                  </div>
                </div>
                <div style={{ height: 6, background: "var(--gl)", marginBottom: 14 }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: complete ? "#2d6a4f" : "var(--gold)", transition: "width .35s ease" }} />
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 14 }}>
                  {WORKFLOW_COLUMNS.map(col => {
                    const done = stepDone(p, col.id);
                    const auto = col.id === "cin" || col.id === "cir";
                    return (
                      <button key={col.id} onClick={() => toggleStep(p, col.id)} disabled={busy}
                        title={auto ? (done ? "Compilato" : "Si spunta da solo quando inserisci il dato — clic per aprire la scheda") : (done ? "Fatto — clic per annullare" : "Clic quando completato")}
                        style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 11px", fontSize: 11.5, fontWeight: 600, cursor: "pointer", transition: "all .15s",
                          border: `1.5px solid ${done ? "#2d6a4f" : "var(--gl)"}`, background: done ? "#2d6a4f" : "transparent", color: done ? "#fff" : "var(--gray)" }}>
                        <span style={{ fontSize: 12, lineHeight: 1 }}>{done ? "✓" : (auto ? "✎" : "○")}</span>{col.label}
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <button className="bg" onClick={() => onEdit && onEdit(p)} disabled={busy}>Compila dati</button>
                  <button className="bp" onClick={() => rendiAttiva(p)} disabled={busy} style={{ marginLeft: "auto" }}>✓ Rendi attiva</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ── Import View ──────────────────────────────────────────────────────────────
const ImportView = ({ proprieta, owners, onImport }) => {
  const [selected, setSelected] = useState([]);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);
  const existing = proprieta.map(p => p.nome.toLowerCase());
  const toImport = MONDAY_DATA.filter(m => !existing.includes(m.nome.toLowerCase()));
  const toggle = nome => setSelected(s => s.includes(nome) ? s.filter(n => n !== nome) : [...s, nome]);
  const all = () => setSelected(selected.length === toImport.length ? [] : toImport.map(m => m.nome));
  const doImport = async () => {
    setImporting(true);
    for (const item of MONDAY_DATA.filter(m => selected.includes(m.nome))) {
      const o = owners.find(x => `${x.cognome} ${x.nome}`.toLowerCase() === item.proprietario?.toLowerCase() || `${x.nome} ${x.cognome}`.toLowerCase() === item.proprietario?.toLowerCase());
      await sb.post("proprieta", { nome: item.nome, indirizzo: item.indirizzo || null, citta: item.citta, provincia: item.provincia, proprietario_id: o?.id || null, cin: item.cin || null, stato: item.stato || "in lancio", gestore_interno: item.gestore, commissione: item.commissione || null, tipo_contratto: "gestione", note: item.note || null });
    }
    await onImport(); setImporting(false); setDone(true);
  };
  if (done) return <div style={{ textAlign: "center", padding: 60 }}><div style={{ fontSize: 48, marginBottom: 16 }}>✅</div><h2 style={{ marginBottom: 8 }}>Importazione completata!</h2><p style={{ color: "var(--gray)" }}>{selected.length} proprietà importate da Monday.com</p></div>;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 8 }}>
        <div><h1 style={{ fontSize: 26, fontWeight: 700 }}>Importa da Monday</h1><p style={{ fontSize: 12, color: "var(--gray)", marginTop: 4 }}>{toImport.length} disponibili · {selected.length} selezionate</p></div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="bg" onClick={all}>{selected.length === toImport.length ? "Deseleziona tutto" : "Seleziona tutto"}</button>
          <button className="bp" onClick={doImport} disabled={selected.length === 0 || importing}>{importing ? "Importando..." : `Importa ${selected.length}`}</button>
        </div>
      </div>
      <div className="gl" style={{ marginBottom: 24 }} />
      {toImport.length === 0 ? <div style={{ textAlign: "center", padding: 60, color: "var(--gray)" }}>Tutte le proprietà Monday sono già nel gestionale!</div> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
          {toImport.map(item => (
            <div key={item.nome} onClick={() => toggle(item.nome)} style={{ background: "var(--white)", border: `2px solid ${selected.includes(item.nome) ? "var(--gold)" : "var(--gl)"}`, padding: "14px 16px", cursor: "pointer", transition: "all .15s", position: "relative" }}>
              {selected.includes(item.nome) && <div style={{ position: "absolute", top: 10, right: 10, width: 20, height: 20, background: "var(--gold)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "var(--black)", fontWeight: 700 }}>✓</div>}
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{item.nome}</h3>
              <p style={{ fontSize: 11, color: "var(--gray)", marginBottom: 8 }}>{item.citta} {item.provincia ? `(${item.provincia})` : ""}</p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}><SB stato={item.stato} />{item.commissione && <span className="tag">{item.commissione}%</span>}{item.cin && <span className="tag" style={{ color: "var(--gold)", borderColor: "var(--gold)" }}>CIN ✓</span>}</div>
              <p style={{ fontSize: 11, color: "var(--gray)" }}>👤 {item.proprietario || "—"} · {item.gestore}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Vista Proprietà: tile compatte, riga elenco, raggruppamento per zona ───────
const PROV_NOMI = { PT: "Pistoia", LU: "Lucca", LI: "Livorno", NA: "Napoli", SP: "La Spezia", BO: "Bologna", FI: "Firenze", SI: "Siena", RM: "Roma", TP: "Trapani", BZ: "Bolzano", PI: "Pisa", MS: "Massa-Carrara", PO: "Prato", AR: "Arezzo", GR: "Grosseto" };
const areaLabel = (key, modo) => {
  if (key === "—" || !key) return modo === "citta" ? "Senza città" : "Senza provincia";
  return modo === "citta" ? key : (PROV_NOMI[key] || key);
};

const PropTile = ({ p, o, onClick }) => (
  <div className="card fi" onClick={onClick} style={{ padding: 12 }}>
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: STATI_COLOR[p.stato] || "#ccc" }} />
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
      <h3 style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.25 }}>{p.nome}</h3>
      <SB stato={p.stato} />
    </div>
    <p style={{ fontSize: 11, color: "var(--gray)", marginBottom: 8 }}>{p.citta || "—"}{p.provincia ? ` (${p.provincia})` : ""}</p>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 10, color: "var(--gray)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o ? `${o.cognome} ${o.nome}` : "—"}</span>
      <span style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
        {p.commissione && <span className="tag" style={{ fontSize: 9, padding: "1px 5px" }}>{p.commissione}%</span>}
        {!p.cin && p.stato === "attivo" && <span className="tag" style={{ fontSize: 9, padding: "1px 5px", color: "var(--red)", borderColor: "var(--red)" }}>No CIN</span>}
      </span>
    </div>
  </div>
);

const PropRow = ({ p, o, onClick }) => (
  <div className="fi" onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "var(--white)", border: "1px solid var(--gl)", cursor: "pointer" }}
    onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--gold)"; }} onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--gl)"; }}>
    <span style={{ width: 9, height: 9, borderRadius: "50%", background: STATI_COLOR[p.stato] || "#ccc", flexShrink: 0 }} />
    <div style={{ flex: 2, minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.nome}</div>
      <div style={{ fontSize: 11, color: "var(--gray)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.indirizzo}{p.citta ? `, ${p.citta}` : ""}{p.provincia ? ` (${p.provincia})` : ""}</div>
    </div>
    <div style={{ flex: 1, minWidth: 0, fontSize: 11, color: "var(--gray)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o ? `${o.cognome} ${o.nome}` : "—"}</div>
    <div style={{ width: 50, textAlign: "right", fontSize: 11, color: "var(--gray)", flexShrink: 0 }}>{p.commissione ? `${p.commissione}%` : "—"}</div>
    <div style={{ width: 130, textAlign: "right", flexShrink: 0, display: "flex", justifyContent: "flex-end", gap: 6, alignItems: "center" }}>
      {!p.cin && p.stato === "attivo" && <span className="tag" style={{ fontSize: 9, color: "var(--red)", borderColor: "var(--red)" }}>No CIN</span>}
      <SB stato={p.stato} />
    </div>
  </div>
);

function Allegati({ proprietaId, proprietarioId, linkProprietarioId, proprietaIds }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState("");
  const fileRef = useRef(null);

  const idsKey = (proprietaIds || []).join(",");
  const carica = useCallback(async () => {
    setLoading(true); setErr("");
    const ids = idsKey ? idsKey.split(",") : [];
    // Quali "caselle" interrogare: se è un immobile solo lui; se è un proprietario, lui + tutti i suoi immobili
    const targets = [];
    if (proprietaId) targets.push({ proprieta_id: proprietaId });
    else if (proprietarioId) {
      targets.push({ proprietario_id: proprietarioId });
      ids.forEach((pid) => targets.push({ proprieta_id: pid }));
    }
    try {
      const results = await Promise.all(targets.map((t) =>
        fetch("/.netlify/functions/allegati", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "list", ...t }),
        }).then((r) => (r.ok ? r.json() : { files: [] })).catch(() => ({ files: [] }))
      ));
      const merged = [];
      const visti = new Set();
      results.forEach((d) => (d.files || []).forEach((f) => {
        const k = f.id || f.path;
        if (!visti.has(k)) { visti.add(k); merged.push(f); }
      }));
      setFiles(merged);
    } catch { setErr("Impossibile contattare il server."); setFiles([]); }
    setLoading(false);
  }, [proprietaId, proprietarioId, idsKey]);

  useEffect(() => { carica(); }, [carica]);

  const caricaFiles = async (fileList) => {
    const arr = Array.from(fileList || []);
    if (arr.length === 0 || busy) return;
    setErr("");
    const troppoGrandi = arr.filter(f => f.size > 4 * 1024 * 1024).map(f => f.name);
    const validi = arr.filter(f => f.size <= 4 * 1024 * 1024);
    setBusy(true);
    const target = proprietaId ? { proprieta_id: proprietaId, proprietario_id: linkProprietarioId || null } : { proprietario_id: proprietarioId };
    const falliti = [];
    for (let i = 0; i < validi.length; i++) {
      const file = validi[i];
      setProgress("Carico " + (i + 1) + " di " + validi.length + "…");
      try {
        const base64 = await new Promise((res, rej) => {
          const rd = new FileReader();
          rd.onload = () => res(String(rd.result).split(",")[1]);
          rd.onerror = () => rej(new Error("lettura fallita"));
          rd.readAsDataURL(file);
        });
        const r = await fetch("/.netlify/functions/allegati", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "upload", nome_file: file.name, tipo: file.type, data: base64, ...target }),
        });
        if (!r.ok) falliti.push(file.name);
      } catch { falliti.push(file.name); }
    }
    setProgress("");
    setBusy(false);
    const messaggi = [];
    if (troppoGrandi.length) messaggi.push("Saltati perché oltre 4 MB: " + troppoGrandi.join(", "));
    if (falliti.length) messaggi.push("Non caricati: " + falliti.join(", "));
    setErr(messaggi.join(" · "));
    await carica();
  };

  const apri = async (path) => {
    setErr("");
    try {
      const r = await fetch("/.netlify/functions/allegati", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sign", path }),
      });
      const d = await r.json();
      if (r.ok && d.url) window.open(d.url, "_blank");
      else setErr(d.error || "Impossibile aprire il file.");
    } catch { setErr("Impossibile aprire il file."); }
  };

  const elimina = async (f) => {
    if (!confirm("Eliminare questo allegato?")) return;
    setErr("");
    try {
      const r = await fetch("/.netlify/functions/allegati", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id: f.id, path: f.path }),
      });
      if (r.ok) await carica();
      else { const d = await r.json(); setErr(d.error || "Eliminazione fallita."); }
    } catch { setErr("Eliminazione fallita."); }
  };

  return (
    <div
      style={{ marginTop: 24, border: dragOver ? "2px dashed var(--gold)" : "2px dashed transparent", padding: dragOver ? 10 : 0, background: dragOver ? "rgba(214,156,49,.06)" : "transparent", transition: "all .12s" }}
      onDragOver={(e) => { e.preventDefault(); if (!busy) setDragOver(true); }}
      onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); caricaFiles(e.dataTransfer.files); }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--gold)" }}>Allegati</p>
        <button className="bg" onClick={() => fileRef.current?.click()} disabled={busy} style={{ padding: "6px 12px", fontSize: 11 }}>{busy ? (progress || "Carico…") : "+ Carica file"}</button>
        <input ref={fileRef} type="file" multiple style={{ display: "none" }} onChange={(e) => { caricaFiles(e.target.files); e.target.value = ""; }} />
      </div>
      {dragOver && <div style={{ fontSize: 12, color: "var(--gold)", textAlign: "center", padding: "8px 0" }}>Rilascia qui i file da caricare</div>}
      {err && <div style={{ fontSize: 12, color: "var(--red)", marginBottom: 8 }}>{err}</div>}
      {loading ? (
        <p style={{ fontSize: 12, color: "var(--gray)" }}>Caricamento…</p>
      ) : files.length === 0 ? (
        <p style={{ fontSize: 12, color: "var(--gray)" }}>Nessun allegato. Trascina qui i file (anche più di uno) oppure usa "+ Carica file".</p>
      ) : (
        files.map(f => (
          <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "var(--white)", border: "1px solid var(--gl)", marginBottom: 6 }}>
            <span style={{ flex: 1, fontSize: 12, wordBreak: "break-all" }}>{f.nome_file}</span>
            <button onClick={() => apri(f.path)} style={{ background: "none", border: "none", color: "var(--gold)", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Apri</button>
            <button onClick={() => elimina(f)} style={{ background: "none", border: "none", color: "var(--red)", fontSize: 11, cursor: "pointer" }}>Elimina</button>
          </div>
        ))
      )}
    </div>
  );
}

function Smistamento({ proprieta, owners, onDataChanged }) {
  const [rows, setRows] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [archiviando, setArchiviando] = useState(false);
  const [nota, setNota] = useState("");
  const fileRef = useRef(null);
  const idRef = useRef(0);

  const aggiungiFiles = async (fileList) => {
    const tutti = Array.from(fileList || []);
    if (tutti.length === 0) return;
    setNota("");
    const validi = tutti.filter(f => f.size <= 4 * 1024 * 1024);
    const grandi = tutti.filter(f => f.size > 4 * 1024 * 1024).map(f => f.name);
    if (grandi.length) setNota("Saltati perché oltre 4 MB: " + grandi.join(", "));
    const nuovi = [];
    for (const file of validi) {
      const data = await new Promise((res) => {
        const rd = new FileReader();
        rd.onload = () => res(String(rd.result).split(",")[1]);
        rd.onerror = () => res(null);
        rd.readAsDataURL(file);
      });
      nuovi.push({ rid: ++idRef.current, file: { name: file.name, type: file.type, size: file.size, data }, stato: data ? "analizzando" : "errore", analisi: data ? null : { motivo: "Lettura del file non riuscita." }, scelta: { tipo: "", id: "" } });
    }
    setRows(rs => [...rs, ...nuovi]);
    for (const row of nuovi) {
      if (!row.file.data) continue;
      try {
        const r = await fetch("/.netlify/functions/smista-documento", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: row.file.name, mediaType: row.file.type, data: row.file.data,
            proprieta: proprieta.map(p => ({ id: String(p.id), nome: p.nome, indirizzo: p.indirizzo, citta: p.citta, cin: p.cin })),
            proprietari: owners.map(o => ({ id: String(o.id), nome: o.nome, cognome: o.cognome, codice_fiscale: o.codice_fiscale })),
          }),
        });
        const d = await r.json();
        if (!r.ok || !d || d.error) {
          setRows(rs => rs.map(x => x.rid === row.rid ? { ...x, stato: "errore", analisi: { motivo: (d && d.error) || "Analisi non riuscita." } } : x));
        } else {
          let scelta = { tipo: "", id: "" };
          if (d.tipo_destinazione === "proprietario" && d.id_destinazione) scelta = { tipo: "proprietario", id: String(d.id_destinazione) };
          else if (d.tipo_destinazione === "proprieta" && d.id_destinazione) scelta = { tipo: "proprieta", id: String(d.id_destinazione) };
          else if (d.tipo_destinazione === "nuovo_proprietario") scelta = { tipo: "nuovo_proprietario", id: "" };
          setRows(rs => rs.map(x => x.rid === row.rid ? { ...x, stato: "pronto", analisi: d, scelta } : x));
        }
      } catch {
        setRows(rs => rs.map(x => x.rid === row.rid ? { ...x, stato: "errore", analisi: { motivo: "Errore di rete durante l'analisi." } } : x));
      }
    }
  };

  const valoreScelta = (row) => {
    if (row.scelta.tipo === "nuovo_proprietario") return "nuovo_proprietario";
    if (row.scelta.tipo && row.scelta.id) return row.scelta.tipo + ":" + row.scelta.id;
    return "";
  };

  const cambiaScelta = (rid, val) => {
    setRows(rs => rs.map(x => {
      if (x.rid !== rid) return x;
      if (!val) return { ...x, scelta: { tipo: "", id: "" } };
      if (val === "nuovo_proprietario") return { ...x, scelta: { tipo: "nuovo_proprietario", id: "" } };
      const i = val.indexOf(":");
      return { ...x, scelta: { tipo: val.slice(0, i), id: val.slice(i + 1) } };
    }));
  };

  const rimuovi = (rid) => setRows(rs => rs.filter(x => x.rid !== rid));

  const archivia = async () => {
    setArchiviando(true);
    const daFare = rows.filter(r => r.stato === "pronto" && r.scelta.tipo);
    for (const row of daFare) {
      setRows(rs => rs.map(x => x.rid === row.rid ? { ...x, stato: "archiviando" } : x));
      try {
        let proprieta_id = null, proprietario_id = null, destNome = "";
        if (row.scelta.tipo === "proprieta") {
          proprieta_id = row.scelta.id;
          const prop = proprieta.find(p => String(p.id) === String(row.scelta.id));
          destNome = (prop && prop.nome) || "proprietà";
          if (prop && prop.proprietario_id) proprietario_id = String(prop.proprietario_id);
        }
        else if (row.scelta.tipo === "proprietario") {
          proprietario_id = row.scelta.id;
          const ow = owners.find(o => String(o.id) === String(row.scelta.id));
          destNome = ow ? ((ow.cognome || "") + " " + (ow.nome || "")).trim() : "proprietario";
        }
        else if (row.scelta.tipo === "nuovo_proprietario") {
          const pn = (row.analisi && row.analisi.proprietario_nuovo) || {};
          const cf = (pn.codice_fiscale || "").trim().toUpperCase();
          destNome = ((pn.cognome || "") + " " + (pn.nome || "")).trim() || "nuovo proprietario";
          const esistente = owners.find(o => cf && (o.codice_fiscale || "").trim().toUpperCase() === cf);
          if (esistente) proprietario_id = String(esistente.id);
          else {
            const res = await sb.post("proprietari", {
              nome: pn.nome || "", cognome: pn.cognome || "", codice_fiscale: cf,
              email: pn.email || "", telefono: pn.telefono || "", pec: pn.pec || "",
              indirizzo: pn.indirizzo || "", citta: pn.citta || "",
            });
            if (!res.ok) throw new Error("owner");
            const nuovo = Array.isArray(res.data) ? res.data[0] : res.data;
            proprietario_id = nuovo && String(nuovo.id);
          }
        }
        if (proprieta_id && proprietario_id) destNome = destNome + " (+ proprietario)";
        const ra = await fetch("/.netlify/functions/allegati", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "upload", proprieta_id, proprietario_id, nome_file: row.file.name, tipo: row.file.type, data: row.file.data }),
        });
        if (!ra.ok) throw new Error("allegato");
        setRows(rs => rs.map(x => x.rid === row.rid ? { ...x, stato: "archiviato", dest: destNome } : x));
      } catch {
        setRows(rs => rs.map(x => x.rid === row.rid ? { ...x, stato: "errore", analisi: { ...(x.analisi || {}), motivo: "Archiviazione non riuscita." } } : x));
      }
    }
    setArchiviando(false);
    if (onDataChanged) await onDataChanged();
  };

  const pronti = rows.filter(r => r.stato === "pronto" && r.scelta.tipo).length;

  return (
    <>
      <div style={{ marginBottom: 8 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700 }}>Smistamento documenti</h1>
        <p style={{ fontSize: 12, color: "var(--gray)", marginTop: 4 }}>Trascina più documenti insieme: l'AI propone dove archiviarli, tu confermi e archivi.</p>
      </div>
      <div className="gl" style={{ marginBottom: 24 }} />

      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); aggiungiFiles(e.dataTransfer.files); }}
        style={{ border: dragOver ? "2px dashed var(--gold)" : "2px dashed var(--gl)", background: dragOver ? "rgba(214,156,49,.06)" : "var(--white)", padding: 36, textAlign: "center", cursor: "pointer", transition: "all .12s" }}
      >
        <input ref={fileRef} type="file" multiple style={{ display: "none" }} onChange={(e) => { aggiungiFiles(e.target.files); e.target.value = ""; }} />
        <p style={{ fontSize: 14, fontWeight: 600, color: dragOver ? "var(--gold)" : "var(--black)" }}>{dragOver ? "Rilascia qui i documenti" : "Trascina qui i documenti o clicca per selezionarli"}</p>
        <p style={{ fontSize: 12, color: "var(--gray)", marginTop: 6 }}>PDF o immagini, fino a 4 MB ciascuno. Puoi caricarne più di uno.</p>
      </div>

      {nota && <div style={{ fontSize: 12, color: "var(--red)", marginTop: 12 }}>{nota}</div>}

      {rows.length > 0 && (
        <div style={{ marginTop: 24 }}>
          {rows.map(row => (
            <div key={row.rid} style={{ background: "var(--white)", border: "1px solid var(--gl)", padding: 14, marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, wordBreak: "break-all" }}>{row.file.name}</span>
                {row.stato === "analizzando" && <span style={{ fontSize: 11, color: "var(--gray)" }}>Analizzo…</span>}
                {row.stato === "archiviando" && <span style={{ fontSize: 11, color: "var(--gray)" }}>Archivio…</span>}
                {row.stato === "archiviato" && <span style={{ fontSize: 11, color: "#2d6a4f", fontWeight: 600 }}>✓ Archiviato{row.dest ? " · " + row.dest : ""}</span>}
                {row.stato === "errore" && <span style={{ fontSize: 11, color: "var(--red)", fontWeight: 600 }}>Errore</span>}
              </div>

              {row.stato === "errore" && <p style={{ fontSize: 12, color: "var(--red)" }}>{row.analisi && row.analisi.motivo}</p>}

              {(row.stato === "pronto" || row.stato === "archiviando") && (
                <>
                  {row.analisi && row.analisi.categoria && (
                    <p style={{ fontSize: 12, color: "var(--gray)", marginBottom: 6 }}>
                      Tipo rilevato: <strong style={{ color: "var(--black)" }}>{row.analisi.categoria}</strong>
                      {row.analisi.confidenza ? " · confidenza " + row.analisi.confidenza : ""}
                    </p>
                  )}
                  {row.analisi && row.analisi.motivo && <p style={{ fontSize: 11, color: "var(--gray)", fontStyle: "italic", marginBottom: 8 }}>{row.analisi.motivo}</p>}
                  <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--gold)", display: "block", marginBottom: 4 }}>Archivia in</label>
                  <select value={valoreScelta(row)} onChange={(e) => cambiaScelta(row.rid, e.target.value)} disabled={row.stato !== "pronto"} style={{ width: "100%", maxWidth: 360, padding: "8px 10px", fontSize: 13, border: "1px solid var(--gl)", background: "var(--cream)" }}>
                    <option value="">— scegli destinazione —</option>
                    {row.analisi && row.analisi.proprietario_nuovo && (row.analisi.proprietario_nuovo.cognome || row.analisi.proprietario_nuovo.nome) && (
                      <option value="nuovo_proprietario">➕ Crea nuovo proprietario: {row.analisi.proprietario_nuovo.cognome || ""} {row.analisi.proprietario_nuovo.nome || ""}</option>
                    )}
                    <optgroup label="Proprietari">
                      {owners.map(o => <option key={o.id} value={"proprietario:" + o.id}>{o.cognome} {o.nome}</option>)}
                    </optgroup>
                    <optgroup label="Proprietà">
                      {proprieta.map(p => <option key={p.id} value={"proprieta:" + p.id}>{p.nome}</option>)}
                    </optgroup>
                  </select>
                </>
              )}

              {row.stato !== "archiviato" && row.stato !== "archiviando" && (
                <div style={{ marginTop: 8 }}>
                  <button onClick={() => rimuovi(row.rid)} style={{ background: "none", border: "none", color: "var(--red)", fontSize: 11, cursor: "pointer", padding: 0 }}>Rimuovi</button>
                </div>
              )}
            </div>
          ))}

          <button className="bp" onClick={archivia} disabled={archiviando || pronti === 0} style={{ marginTop: 8 }}>
            {archiviando ? "Archivio…" : "Archivia tutto" + (pronti ? " (" + pronti + ")" : "")}
          </button>
        </div>
      )}
    </>
  );
}

// ── App ──────────────────────────────────────────────────────────────────────
// ─── Mappa Italia: coordinate città / province ──────────────────────────────
const MAP_CITY = {
  "pistoia":[43.93,10.92],"lucca":[43.84,10.50],"firenze":[43.77,11.25],"napoli":[40.85,14.27],
  "bologna":[44.49,11.34],"la spezia":[44.10,9.83],"montecatini terme":[43.88,10.77],"viareggio":[43.87,10.25],
  "borgo a buggiano":[43.88,10.74],"buggiano":[43.87,10.73],"massa":[44.04,10.14],"carrara":[44.08,10.10],
  "pisa":[43.72,10.40],"livorno":[43.55,10.31],"prato":[43.88,11.10],"siena":[43.32,11.33],"arezzo":[43.46,11.88],
  "grosseto":[42.76,11.11],"portoferraio":[42.81,10.31],"elba":[42.78,10.32],"isola d elba":[42.78,10.32],
  "roma":[41.90,12.50],"rome":[41.90,12.50],"milano":[45.46,9.19],"torino":[45.07,7.69],"venezia":[45.44,12.33],
  "verona":[45.44,10.99],"genova":[44.41,8.93],"bari":[41.12,16.87],"palermo":[38.12,13.36],"catania":[37.50,15.09],
  "cagliari":[39.22,9.12],"rimini":[44.06,12.57],"sanremo":[43.82,7.78],"como":[45.81,9.08],"brescia":[45.54,10.22],
  "padova":[45.41,11.88],"trieste":[45.65,13.77],"perugia":[43.11,12.39],"ancona":[43.62,13.52],"pescara":[42.46,14.21],
  "salerno":[40.68,14.76],"sorrento":[40.63,14.37],"amalfi":[40.63,14.60],"bergamo":[45.70,9.67],"parma":[44.80,10.33],
  "modena":[44.65,10.93],"ferrara":[44.84,11.62],"ravenna":[44.42,12.20],"forli":[44.22,12.04],"cesena":[44.14,12.24],
  "trento":[46.07,11.12],"bolzano":[46.50,11.35],"udine":[46.06,13.24],"cuneo":[44.39,7.55],"piacenza":[45.05,9.69],
  "pavia":[45.19,9.16],"varese":[45.82,8.83],"pesaro":[43.91,12.91],"rapallo":[44.35,9.23],"pietrasanta":[43.96,10.23]
};
const MAP_PROV = {
  "pt":[43.93,10.92],"lu":[43.84,10.50],"fi":[43.77,11.25],"na":[40.85,14.27],"bo":[44.49,11.34],"sp":[44.10,9.83],
  "ms":[44.04,10.14],"pi":[43.72,10.40],"li":[43.55,10.31],"po":[43.88,11.10],"si":[43.32,11.33],"ar":[43.46,11.88],
  "gr":[42.76,11.11],"ge":[44.41,8.93],"rm":[41.90,12.50],"mi":[45.46,9.19],"to":[45.07,7.69],"ve":[45.44,12.33],
  "ba":[41.12,16.87],"pa":[38.12,13.36],"ct":[37.50,15.09],"ca":[39.22,9.12],"rn":[44.06,12.57],"vr":[45.44,10.99]
};
function mapNorm(s) { return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim(); }

const ITALY_VB="0 0 611 782";
const ITALY=[{n:"Piemonte",d:"M40 132L39 129L43 124L38 121L40 117L41 119L44 120L47 117L52 117L57 113L69 115L74 112L78 112L79 109L78 106L79 103L76 99L76 87L82 86L84 83L84 79L90 76L90 74L86 69L98 61L97 58L104 55L105 62L103 66L104 69L108 71L112 78L117 79L118 84L110 92L111 96L110 100L114 104L114 107L116 107L116 109L115 109L117 111L117 117L121 119L124 125L118 126L120 128L116 131L113 128L109 127L107 132L110 135L108 135L109 137L108 138L111 137L109 139L112 142L115 149L117 148L120 150L123 147L126 147L127 151L129 151L131 156L134 158L135 162L139 163L142 167L141 177L138 178L135 175L133 176L132 172L128 172L126 174L127 179L123 179L121 184L117 178L113 177L111 182L103 182L100 185L95 181L92 184L93 188L92 189L90 190L87 196L85 196L87 198L86 201L87 204L86 206L81 207L83 209L71 206L69 207L69 210L71 210L69 212L66 207L66 204L54 208L47 206L43 202L34 200L33 197L28 192L28 188L31 188L26 181L32 175L32 171L37 170L34 164L34 161L27 160L21 157L21 150L18 149L15 144L22 140L28 142L28 140L31 139L32 137L38 136L40 132Z"},{n:"Valle d'Aosta/Vallée d'Aoste",d:"M69 90L76 91L76 99L79 103L78 106L79 109L78 112L74 112L69 115L57 113L52 117L47 117L44 120L41 119L40 117L39 120L36 120L36 118L34 118L32 112L34 109L29 108L24 103L25 96L31 95L35 91L39 95L41 93L43 95L48 91L52 92L61 86L66 87L69 90Z"},{n:"Lombardia",d:"M114 104L109 99L111 96L110 92L118 84L117 80L119 78L124 81L121 86L126 88L129 94L127 97L133 97L136 92L131 87L133 86L132 83L135 81L135 78L143 70L146 64L143 57L145 53L149 52L151 55L154 53L154 61L158 66L166 67L167 63L169 64L178 61L180 63L180 67L183 68L182 71L186 71L189 69L185 63L188 59L182 57L182 51L185 46L192 44L192 48L195 50L201 50L203 53L211 56L210 61L205 63L208 64L209 70L207 73L208 75L207 78L202 86L205 90L204 93L205 97L207 97L206 99L211 98L214 96L221 96L211 111L212 121L211 122L215 124L214 128L216 132L218 130L222 134L226 135L229 138L229 141L231 141L231 143L239 143L238 147L242 147L242 149L249 153L250 153L250 154L236 155L233 153L224 156L216 154L216 151L211 155L206 156L200 152L198 153L190 148L183 148L179 142L176 144L176 142L174 142L175 145L172 144L172 147L168 143L166 147L162 145L162 142L160 144L158 142L157 145L156 144L151 145L147 154L145 155L145 157L148 159L149 162L145 165L148 168L147 171L144 171L143 169L143 171L141 171L142 167L139 163L135 162L134 158L131 156L129 151L127 151L126 147L120 150L117 148L115 149L112 142L109 139L111 137L109 138L108 138L109 137L108 135L110 135L107 132L109 127L113 128L116 131L120 128L118 126L124 125L121 119L117 117L117 111L115 109L116 109L116 107L114 107L114 104Z"},{n:"Trentino-Alto Adige/Südtirol",d:"M279 50L269 53L272 57L271 57L270 62L267 62L270 64L270 68L274 69L273 71L276 73L275 74L272 78L263 79L264 83L262 83L262 88L254 85L247 87L246 91L242 91L236 105L230 104L226 107L221 104L224 98L221 96L212 96L212 98L208 100L205 97L205 90L202 86L207 78L208 75L207 73L209 70L208 64L205 63L211 59L209 55L203 52L204 46L199 43L200 38L202 37L201 34L203 30L207 31L213 29L217 32L216 34L230 36L233 32L234 26L237 24L237 23L245 21L249 23L252 20L255 22L260 20L266 23L277 17L289 15L288 19L284 20L286 25L285 26L288 29L291 28L293 31L292 35L295 35L297 39L301 41L297 45L291 45L287 47L287 45L281 42L279 50Z"},{n:"Veneto",d:"M212 121L211 111L221 96L224 98L221 104L226 107L230 104L235 106L238 103L237 99L239 100L238 98L242 91L246 91L247 87L254 85L262 88L262 83L264 83L263 79L273 78L276 73L273 71L274 69L272 67L270 68L270 64L267 62L270 62L271 57L272 57L269 54L271 52L278 51L280 47L281 42L287 45L287 47L291 45L297 45L301 41L314 44L308 50L310 55L304 55L301 61L295 65L294 68L302 76L302 79L297 83L299 88L303 91L305 97L309 97L311 99L316 95L317 97L320 95L323 97L325 95L327 103L328 103L330 108L332 109L322 111L295 125L292 135L294 145L305 153L297 164L292 160L292 154L285 155L280 152L268 152L259 158L255 155L250 155L250 153L242 149L242 147L238 147L239 143L233 144L230 143L231 141L229 141L229 138L226 135L222 134L218 130L216 132L214 128L215 127L215 123L211 122L212 121Z"},{n:"Friuli-Venezia Giulia",d:"M356 57L348 62L348 65L345 66L347 72L353 71L359 74L351 82L350 85L353 88L358 87L355 96L356 98L366 102L372 109L368 112L362 112L366 111L363 109L364 108L364 109L364 108L364 106L360 103L358 101L354 100L353 98L352 102L354 103L346 107L336 104L332 109L330 108L328 103L327 103L325 95L323 97L320 95L317 97L316 95L311 99L307 96L305 97L303 91L299 89L297 83L302 79L302 76L294 68L295 65L301 61L304 55L310 55L309 49L315 43L319 46L331 46L338 50L345 48L362 51L360 57L356 57Z"},{n:"Liguria",d:"M61 222L61 219L65 217L66 214L71 210L69 209L69 207L83 209L82 206L86 206L87 204L85 199L86 198L87 198L85 196L87 196L90 190L93 189L92 184L93 182L95 181L100 185L103 182L111 182L113 177L118 178L121 184L123 179L127 179L126 174L128 172L132 172L133 176L135 175L138 178L143 175L155 179L156 184L154 184L153 188L161 187L163 189L164 192L173 198L174 204L176 202L177 203L175 205L179 205L179 209L181 208L184 209L179 213L173 208L173 209L172 208L171 209L172 212L143 193L142 196L139 195L138 192L128 189L127 190L123 188L119 188L107 194L104 197L103 203L96 206L93 213L90 216L91 218L86 223L66 230L59 230L58 225L61 222Z"},{n:"Emilia-Romagna",d:"M148 168L145 165L149 162L148 159L145 157L145 155L147 154L151 145L156 144L157 145L158 142L160 144L162 142L162 145L166 147L168 143L172 147L172 144L175 145L174 142L176 142L176 144L179 142L185 149L190 148L208 156L216 151L216 154L224 156L229 153L236 155L244 153L255 155L259 158L268 152L280 152L285 155L291 154L292 160L297 164L296 165L294 164L293 164L297 164L292 161L290 169L295 198L303 209L315 218L314 224L309 227L307 223L302 224L303 216L298 218L298 222L300 223L298 224L297 227L292 229L292 231L287 233L286 231L282 232L277 231L264 223L264 221L261 216L266 208L258 208L259 205L254 205L250 200L243 205L239 206L242 208L241 209L231 210L229 208L229 206L225 211L217 205L212 205L209 208L204 201L195 197L193 198L187 193L181 190L179 185L171 185L168 190L164 192L161 187L153 188L154 184L156 184L155 179L151 176L148 178L141 176L141 171L143 171L143 169L144 171L147 171L148 168Z"},{n:"Toscana",d:"M175 205L177 203L175 202L174 204L173 198L165 192L168 190L171 185L179 185L181 190L187 193L193 198L195 197L204 201L209 208L211 205L217 205L224 211L229 206L229 208L231 210L241 209L242 208L239 206L243 205L250 200L254 205L259 205L258 208L266 208L261 216L264 221L265 224L281 232L286 231L287 233L292 231L296 234L293 236L293 233L292 236L287 239L288 241L285 246L282 247L285 250L279 253L284 257L284 261L289 261L282 265L280 264L279 268L274 271L274 276L277 277L275 286L276 289L269 292L268 294L267 292L266 293L269 297L267 300L269 303L260 309L257 309L256 312L259 314L259 317L253 317L251 321L241 318L236 322L233 318L234 316L235 317L236 317L238 317L238 310L235 309L227 298L216 293L218 291L218 286L212 284L204 285L204 281L205 281L206 275L206 265L195 245L196 243L195 244L192 224L187 217L181 213L183 208L181 208L180 209L179 205L175 205ZM184 305L184 309L182 308L184 305ZM195 296L187 298L185 294L189 293L192 294L193 292L197 294L200 289L202 290L201 295L199 296L201 299L200 299L199 299L197 296L196 298L195 296ZM172 276L172 279L170 280L170 277L172 276ZM196 325L195 325L194 323L196 323L196 325ZM288 230L286 228L289 228L289 229L288 230ZM223 320L225 322L225 325L223 323L222 322L223 320Z"},{n:"Umbria",d:"M334 303L321 306L322 309L313 313L314 315L311 317L308 315L307 319L304 322L303 319L300 320L301 318L298 318L298 313L295 315L292 314L291 309L290 308L290 305L288 303L286 302L279 304L275 301L274 299L277 296L274 295L273 291L276 289L275 286L277 277L275 277L274 272L279 268L280 264L282 265L289 261L284 261L284 257L279 254L285 250L283 246L285 246L288 241L293 242L295 240L296 243L293 245L294 246L302 247L308 253L316 251L314 256L317 259L316 262L320 267L318 271L322 274L322 283L326 285L326 289L329 286L335 291L339 290L339 296L336 296L334 303Z"},{n:"Marche",d:"M302 247L294 246L293 245L296 243L296 241L291 242L287 239L292 236L293 233L293 236L296 234L292 231L292 229L297 227L298 224L301 222L304 224L307 223L308 227L311 227L314 224L315 218L322 221L341 236L349 241L352 240L357 245L357 248L367 270L372 287L362 290L359 293L353 292L351 298L346 301L341 297L336 298L340 293L338 289L335 291L329 286L326 289L326 285L322 283L322 274L318 271L320 267L316 262L317 259L314 256L316 251L308 253L302 247Z"},{n:"Lazio",d:"M269 293L271 291L273 291L277 296L274 300L279 304L286 302L288 303L290 305L290 308L291 309L292 314L298 313L298 318L301 318L300 320L303 319L304 322L307 319L308 315L311 317L314 315L313 313L322 309L321 306L334 303L336 298L342 299L345 303L347 304L346 307L336 307L334 310L335 314L332 317L336 320L334 322L345 334L339 337L331 334L331 336L328 338L328 342L330 345L332 344L345 350L345 357L347 356L355 361L359 358L362 359L364 362L372 364L375 368L377 376L374 378L375 380L369 383L370 391L364 396L357 394L355 395L355 397L341 391L330 396L322 385L311 381L308 382L299 369L295 365L292 363L290 363L289 362L290 362L289 362L285 351L274 343L270 343L261 328L251 321L253 317L259 317L259 314L256 312L257 309L260 309L268 304L267 300L269 297L265 294L267 292L269 293ZM327 415L325 417L324 418L324 416L327 415Z"},{n:"Abruzzo",d:"M373 366L370 363L364 362L362 359L358 358L355 361L347 356L345 357L345 350L332 344L330 345L328 341L331 334L339 337L345 334L334 322L336 320L332 317L335 314L334 310L336 307L345 308L347 304L344 302L344 300L351 298L353 292L359 293L361 290L370 287L372 287L375 299L382 310L388 317L395 321L401 329L410 334L411 339L414 341L413 343L414 343L400 361L398 361L397 356L394 353L392 354L390 351L383 357L385 362L382 362L381 365L379 363L377 366L373 366Z"},{n:"Molise",d:"M405 387L382 378L379 381L381 385L378 385L374 378L377 376L376 371L373 366L377 366L379 363L381 365L382 362L385 362L383 357L390 351L392 354L394 353L397 356L398 361L400 361L414 344L414 341L431 350L429 361L432 364L426 370L423 369L421 370L421 376L425 379L417 383L414 381L413 383L405 387Z"},{n:"Campania",d:"M382 378L384 379L384 378L389 379L405 387L413 383L414 381L417 383L425 379L429 383L429 385L427 386L428 389L438 394L436 395L437 398L435 400L437 404L442 405L444 404L451 407L452 411L450 416L447 419L442 418L443 421L441 421L443 424L443 428L449 432L446 436L451 439L451 444L459 451L460 455L464 458L463 461L460 463L459 468L456 470L458 472L450 471L445 476L440 473L438 474L438 471L431 464L426 464L420 460L424 450L419 439L415 433L412 431L409 434L406 433L404 436L399 435L396 436L391 439L392 435L399 430L398 427L395 426L391 422L391 421L389 421L387 422L386 422L387 422L386 423L385 424L384 424L384 423L381 421L379 422L380 425L378 424L376 415L364 396L370 391L369 383L374 380L378 385L381 385L379 381L382 378ZM373 430L369 430L369 426L373 427L373 430Z"},{n:"Puglia",d:"M429 385L429 382L421 376L421 370L423 369L426 370L432 364L429 361L431 350L444 352L477 349L482 353L483 359L469 370L469 375L471 380L502 397L525 405L536 412L546 422L563 431L570 432L568 434L571 433L575 441L583 446L592 456L597 469L595 470L594 473L592 474L591 477L589 489L581 486L571 477L572 473L570 472L572 468L568 464L567 459L564 457L547 456L532 449L534 445L528 442L522 443L515 449L513 446L509 444L509 431L507 430L509 429L506 427L505 428L501 426L501 428L500 427L500 428L498 426L493 430L486 422L483 416L481 415L479 417L472 413L475 408L467 401L463 405L453 404L451 407L444 404L439 404L435 400L438 394L428 389L427 386L429 385Z"},{n:"Basilicata",d:"M446 436L449 432L443 428L443 424L441 421L443 421L442 418L447 419L450 416L452 412L451 406L452 405L462 405L467 401L475 408L472 413L479 417L481 415L483 416L486 422L493 430L498 426L500 428L500 427L501 428L502 426L509 429L507 430L509 431L509 444L513 446L516 450L505 468L494 466L493 474L490 480L491 482L486 480L484 480L484 482L481 481L476 482L474 478L475 476L468 477L466 475L461 480L457 474L456 473L458 472L456 470L459 468L459 464L463 461L464 458L460 455L459 451L451 444L451 439L446 436Z"},{n:"Calabria",d:"M472 510L467 505L464 496L462 486L463 485L461 480L462 478L465 475L474 476L474 478L476 482L481 481L484 482L484 480L486 480L490 482L490 480L493 474L494 466L504 467L505 468L503 473L504 478L497 489L499 493L499 497L504 500L511 500L516 505L530 514L528 521L527 524L529 527L527 534L529 537L532 539L527 547L520 545L503 552L499 559L502 573L501 578L487 589L481 597L480 603L476 610L462 611L456 605L457 603L455 591L464 586L469 575L470 570L465 565L465 564L473 559L480 559L483 556L484 551L484 545L481 544L478 538L476 521L472 510Z"},{n:"Sicilia",d:"M322 604L331 600L329 596L332 593L336 594L342 591L345 594L346 598L353 598L354 603L363 607L377 603L390 605L401 603L407 601L412 595L414 596L420 593L429 598L435 593L436 588L436 591L439 592L451 586L456 588L453 590L449 601L435 621L433 633L429 638L429 650L435 651L437 655L435 656L435 654L434 655L434 658L436 661L435 661L436 663L439 664L438 668L441 670L438 670L432 676L429 684L431 690L431 691L428 693L425 690L422 690L418 688L414 690L400 684L394 673L388 666L379 663L370 664L367 661L359 658L354 652L349 651L342 647L335 639L328 638L323 633L311 634L308 629L301 625L301 622L299 618L302 614L300 611L303 605L302 604L309 600L310 598L313 598L314 593L315 594L318 600L322 604ZM293 609L296 611L296 612L294 611L292 611L293 609ZM276 681L280 684L280 687L278 688L276 686L274 683L276 681ZM418 571L415 569L415 568L418 568L418 571ZM423 577L424 580L425 581L422 580L422 579L423 577ZM423 572L424 574L422 577L419 574L420 572L423 572ZM303 767L309 767L309 768L307 768L306 767L303 767Z"},{n:"Sardegna",d:"M102 449L97 437L92 438L93 436L92 435L90 439L90 438L89 435L92 431L89 428L93 418L91 415L92 412L97 420L107 422L117 416L121 416L132 402L139 400L139 396L138 394L139 395L143 394L143 395L145 396L145 398L145 396L147 398L149 397L149 399L152 399L151 400L153 404L157 400L159 403L156 410L159 408L158 410L160 409L164 411L161 410L160 412L159 415L157 415L156 415L156 416L160 417L163 416L161 418L164 420L164 419L165 420L167 421L165 421L164 424L168 431L168 436L170 440L172 441L169 450L162 459L162 464L167 470L165 477L166 480L165 482L163 511L161 518L162 521L160 523L160 529L157 534L156 532L153 533L146 527L142 526L139 529L136 527L132 533L134 537L132 540L124 548L118 545L114 549L114 547L112 547L113 545L111 543L110 538L107 536L105 537L104 542L102 543L100 534L103 533L105 537L106 535L100 526L104 522L101 516L103 513L101 510L105 502L104 491L107 494L110 484L106 481L104 485L102 482L103 474L101 473L107 470L105 464L106 458L105 455L101 453L102 449ZM154 395L155 399L153 399L154 397L153 397L153 396L154 396L154 395ZM152 394L153 397L152 396L150 397L152 394ZM96 404L100 405L99 407L95 407L94 409L95 411L93 411L93 408L96 406L96 404ZM97 529L97 534L93 531L96 529L97 529Z"}];
function MappaItalia({ proprieta }) {
  const PAD = 14, K = 0.7518, UNIT = 65, LNG0 = 6.6, LAT1 = 47.1;
  const px = (la, lo) => [PAD + (lo - LNG0) * K * UNIT, PAD + (LAT1 - la) * UNIT];

  const groups = {};
  const nonMappate = [];
  (proprieta || []).forEach((p) => {
    const c = mapNorm(p.citta), pr = mapNorm(p.provincia);
    const coord = MAP_CITY[c] || MAP_PROV[pr] || null;
    if (!coord) { nonMappate.push(p); return; }
    const key = coord.join(",");
    (groups[key] = groups[key] || { coord, items: [] }).items.push(p);
  });
  const dots = [];
  Object.values(groups).forEach((g) => {
    const [bx, by] = px(g.coord[0], g.coord[1]);
    const n = g.items.length;
    g.items.forEach((p, i) => {
      let ox = 0, oy = 0;
      if (n > 1) { const ang = (i / n) * Math.PI * 2; const r = 7 + (i % 3) * 3.5; ox = Math.cos(ang) * r; oy = Math.sin(ang) * r; }
      const sub = p.tipo_contratto === "sublocazione";
      dots.push({ x: bx + ox, y: by + oy, color: sub ? "#D69C31" : "#2d6a4f", name: p.nome, citta: p.citta || "", tipo: sub ? "sublocazione" : "gestione", attivo: p.stato === "attivo" });
    });
  });
  const nGest = (proprieta || []).filter((p) => p.tipo_contratto !== "sublocazione").length;
  const nSub = (proprieta || []).filter((p) => p.tipo_contratto === "sublocazione").length;

  const perCitta = {};
  (proprieta || []).forEach((p) => { const c = (p.citta || "—").trim() || "—"; perCitta[c] = (perCitta[c] || 0) + 1; });
  const cittaList = Object.entries(perCitta).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <div style={{ marginBottom: 8 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700 }}>Le nostre proprietà in Italia</h1>
        <p style={{ fontSize: 12, color: "var(--gray)", marginTop: 4 }}>{(proprieta || []).length} proprietà · {nGest} gestioni · {nSub} sublocazioni</p>
      </div>
      <div className="gl" style={{ marginBottom: 24 }} />
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div className="card" style={{ flex: "1 1 380px", minWidth: 300, padding: 20, display: "flex", justifyContent: "center" }}>
          <svg viewBox={ITALY_VB} style={{ width: "100%", maxWidth: 480, height: "auto" }}>
            {ITALY.map((r) => (
              <path key={r.n} d={r.d} fill="#f4f0e9" stroke="#cdbfa6" strokeWidth="0.8" strokeLinejoin="round">
                <title>{r.n}</title>
              </path>
            ))}
            {dots.map((d, i) => (
              <circle key={i} cx={d.x} cy={d.y} r="5" fill={d.color} stroke="#fff" strokeWidth="1.2" opacity={d.attivo ? 1 : 0.55}>
                <title>{d.name}{d.citta ? " — " + d.citta : ""} ({d.tipo})</title>
              </circle>
            ))}
          </svg>
        </div>
        <div style={{ flex: "1 1 220px", minWidth: 220 }}>
          <div className="card" style={{ padding: 18, marginBottom: 16 }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--gold)", marginBottom: 12 }}>Legenda</p>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}><span style={{ width: 12, height: 12, borderRadius: "50%", background: "#2d6a4f", display: "inline-block" }} /><span style={{ fontSize: 13 }}>Gestione <strong>({nGest})</strong></span></div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 12, height: 12, borderRadius: "50%", background: "#D69C31", display: "inline-block" }} /><span style={{ fontSize: 13 }}>Sublocazione <strong>({nSub})</strong></span></div>
            <p style={{ fontSize: 11, color: "var(--gray)", marginTop: 10 }}>I puntini più chiari sono immobili non ancora attivi.</p>
          </div>
          <div className="card" style={{ padding: 18 }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--gold)", marginBottom: 12 }}>Per città</p>
            {cittaList.map(([c, n]) => (
              <div key={c} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0", borderBottom: "1px solid var(--gl)" }}>
                <span>{c}</span><span style={{ fontWeight: 600 }}>{n}</span>
              </div>
            ))}
            {nonMappate.length > 0 && <p style={{ fontSize: 11, color: "var(--gray)", marginTop: 10 }}>{nonMappate.length} non mostrate sulla mappa (città non riconosciuta): {nonMappate.map(p => p.citta).filter(Boolean).join(", ") || "—"}</p>}
          </div>
        </div>
      </div>
    </>
  );
}

function App() {
  const [view, setView] = useState("proprieta");
  const [proprieta, setProprieta] = useState([]);
  const [owners, setOwners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [fStato, setFStato] = useState("");
  const [fContratto, setFContratto] = useState("");
  const [fGestore, setFGestore] = useState("");
  const [modalP, setModalP] = useState(null);
  const [modalO, setModalO] = useState(null);
  const [detP, setDetP] = useState(null);
  const [detO, setDetO] = useState(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [propVista, setPropVista] = useState("griglia");
  const [propRaggr, setPropRaggr] = useState("provincia");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [leads, setLeads] = useState([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [leadsError, setLeadsError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [rP, rO] = await Promise.all([sb.get("proprieta", "?select=*&order=created_at.desc"), sb.get("proprietari", "?select=*&order=created_at.desc")]);
    if (rP.data) setProprieta(rP.data);
    if (rO.data) setOwners(rO.data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadLeads = useCallback(async () => {
    setLeadsLoading(true); setLeadsError("");
    try {
      const r = await fetch("/.netlify/functions/hubspot", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "leads" }),
      });
      const data = await r.json();
      if (!r.ok) { setLeadsError(data.error || "Errore nel caricamento dei lead."); setLeads([]); }
      else setLeads(data.leads || []);
    } catch { setLeadsError("Impossibile contattare HubSpot. Riprova."); setLeads([]); }
    setLeadsLoading(false);
  }, []);

  useEffect(() => { if (view === "lead") loadLeads(); }, [view, loadLeads]);

  const saveP = async (f) => {
    setSaving(true);
    const clean = { ...f, commissione: f.commissione ? parseFloat(f.commissione) : null, posti_letto: f.posti_letto ? parseInt(f.posti_letto) : null, camere: f.camere ? parseInt(f.camere) : null, bagni: f.bagni ? parseInt(f.bagni) : null, mq: f.mq ? parseInt(f.mq) : null };
    if (modalP === "new") await sb.post("proprieta", clean); else await sb.patch("proprieta", modalP.id, clean);
    await load(); setSaving(false); setModalP(null);
  };
  const saveO = async (f) => { setSaving(true); if (modalO === "new") await sb.post("proprietari", f); else await sb.patch("proprietari", modalO.id, f); await load(); setSaving(false); setModalO(null); };
  const delP = async id => { if (!confirm("Eliminare?")) return; await sb.del("proprieta", id); await load(); setDetP(null); };
  const delO = async id => { if (!confirm("Eliminare?")) return; await sb.del("proprietari", id); await load(); setDetO(null); };

  const filtP = proprieta.filter(p => {
    const q = search.toLowerCase();
    const o = owners.find(x => x.id === p.proprietario_id);
    return (!q || p.nome?.toLowerCase().includes(q) || p.citta?.toLowerCase().includes(q) || o?.cognome?.toLowerCase().includes(q) || p.cin?.toLowerCase().includes(q) || o?.nome?.toLowerCase().includes(q))
      && (!fStato || p.stato === fStato) && (!fContratto || p.tipo_contratto === fContratto) && (!fGestore || p.gestore_interno === fGestore);
  });
  const filtO = owners.filter(o => { const q = search.toLowerCase(); return !q || o.cognome?.toLowerCase().includes(q) || o.nome?.toLowerCase().includes(q) || o.codice_fiscale?.toLowerCase().includes(q); });
  const stats = { totale: proprieta.length, attivi: proprieta.filter(p => p.stato === "attivo").length, lancio: proprieta.filter(p => p.stato === "in lancio").length, onboarding: proprieta.filter(p => ["in lancio", "mandato firmato", "mandato + cin"].includes(p.stato)).length, senzaCin: proprieta.filter(p => !p.cin && p.stato === "attivo").length };

  const navItems = [
    { id: "mappa", label: "Mappa", icon: "🗺️", count: null },
    { id: "proprieta", label: "Proprietà", icon: "🏠", count: stats.totale },
    { id: "proprietari", label: "Proprietari", icon: "👤", count: owners.length },
    { id: "lancio", label: "Workflow Lancio", icon: "🚀", count: stats.onboarding },
    { id: "import", label: "Importa Monday", icon: "⬇️", count: null },
    { id: "lead", label: "Lead", icon: "🎯", count: null },
    { id: "smistamento", label: "Smistamento doc", icon: "📥", count: null },
  ];

  return (
    <>
      <style>{CSS}</style>
      <div style={{ display: "flex", minHeight: "100vh" }}>
        {/* Mobile top bar */}
        <div className="topbar">
          <button onClick={() => setSidebarOpen(true)} aria-label="Apri menu" style={{ background: "none", border: "none", color: "#fff", fontSize: 24, lineHeight: 1, padding: 4, cursor: "pointer" }}>☰</button>
          <span style={{ fontFamily: "Playfair Display", fontSize: 16, fontWeight: 700 }}>Valente <span style={{ color: "var(--gold)" }}>Living</span></span>
        </div>
        {sidebarOpen && <div className="backdrop" onClick={() => setSidebarOpen(false)} />}
        {/* Sidebar */}
        <aside className={"sidebar" + (sidebarOpen ? " open" : "")}>
          <div style={{ padding: "28px 20px 20px" }}>
            <span style={{ fontFamily: "Playfair Display", fontSize: 13, fontWeight: 700, letterSpacing: ".15em", color: "var(--gold)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Valente</span>
            <span style={{ fontFamily: "Playfair Display", fontSize: 22, fontWeight: 700, lineHeight: 1, display: "block" }}>Living</span>
            <span style={{ fontSize: 9, letterSpacing: ".15em", textTransform: "uppercase", color: "rgba(255,255,255,.4)" }}>Property Manager v3.0</span>
          </div>
          <div className="gl" style={{ margin: "0 20px 20px" }} />
          <div style={{ padding: "0 20px 20px" }}>
            <div style={{ background: "rgba(255,255,255,.05)", padding: "12px 14px" }}>
              <p style={{ fontSize: 9, letterSpacing: ".1em", textTransform: "uppercase", color: "rgba(255,255,255,.4)", marginBottom: 8 }}>Portfolio</p>
              <div style={{ fontSize: 28, fontFamily: "Playfair Display", fontWeight: 700, color: "var(--gold)", lineHeight: 1 }}>{stats.totale}</div>
              <p style={{ fontSize: 10, color: "rgba(255,255,255,.5)", marginTop: 2 }}>proprietà totali</p>
              <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <div style={{ textAlign: "center" }}><div style={{ fontSize: 14, fontWeight: 700, color: "#2d6a4f" }}>{stats.attivi}</div><div style={{ fontSize: 8, color: "rgba(255,255,255,.4)" }}>attivi</div></div>
                <div style={{ textAlign: "center" }}><div style={{ fontSize: 14, fontWeight: 700, color: "var(--gold)" }}>{stats.onboarding}</div><div style={{ fontSize: 8, color: "rgba(255,255,255,.4)" }}>lancio</div></div>
                <div style={{ textAlign: "center" }}><div style={{ fontSize: 14, fontWeight: 700, color: "#aaa" }}>{owners.length}</div><div style={{ fontSize: 8, color: "rgba(255,255,255,.4)" }}>owner</div></div>
                {stats.senzaCin > 0 && <div style={{ textAlign: "center" }}><div style={{ fontSize: 14, fontWeight: 700, color: "#e07b39" }}>{stats.senzaCin}</div><div style={{ fontSize: 8, color: "rgba(255,255,255,.4)" }}>no CIN</div></div>}
              </div>
            </div>
          </div>
          <nav style={{ flex: 1, padding: "0 12px" }}>
            {navItems.map(item => (
              <button key={item.id} onClick={() => { setView(item.id); setSearch(""); setFStato(""); setFContratto(""); setFGestore(""); setSidebarOpen(false); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", background: view === item.id ? "rgba(214,156,49,.15)" : "transparent", border: view === item.id ? "1px solid rgba(214,156,49,.3)" : "1px solid transparent", color: view === item.id ? "var(--gold)" : "rgba(255,255,255,.6)", fontSize: 13, fontWeight: view === item.id ? 600 : 400, marginBottom: 4, transition: "all .2s", textAlign: "left" }}>
                <span>{item.icon}</span><span style={{ flex: 1 }}>{item.label}</span>
                {item.count !== null && <span style={{ fontSize: 10, background: "rgba(255,255,255,.1)", padding: "1px 6px", borderRadius: 10 }}>{item.count}</span>}
              </button>
            ))}
          </nav>
          <div style={{ padding: "12px 20px", borderTop: "1px solid rgba(255,255,255,.08)" }}>
            <button onClick={() => { setAiOpen(true); setSidebarOpen(false); }} style={{ width: "100%", padding: "10px", background: "linear-gradient(135deg, #D69C31, #f0c84a)", border: "none", color: "var(--black)", fontSize: 12, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              ✦ Assistente AI
            </button>
          </div>
          <div style={{ padding: "12px 20px" }}>
            <p style={{ fontSize: 9, color: "rgba(255,255,255,.3)", textAlign: "center" }}>v3.0 · Valente Living SRL</p>
          </div>
        </aside>

        {/* Main */}
        <main className="main">
          {loading ? <div style={{ textAlign: "center", padding: 60, color: "var(--gray)" }}>Caricamento...</div> :
            view === "mappa" ? <MappaItalia proprieta={proprieta} /> :
            view === "lancio" ? <KanbanView proprieta={proprieta} owners={owners} onDataChanged={load} onEdit={setModalP} /> :
            view === "import" ? <ImportView proprieta={proprieta} owners={owners} onImport={load} /> :
            view === "smistamento" ? <Smistamento proprieta={proprieta} owners={owners} onDataChanged={load} /> :
            view === "lead" ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 8, gap: 12 }}>
                  <div><h1 style={{ fontSize: 26, fontWeight: 700 }}>Lead</h1><p style={{ fontSize: 12, color: "var(--gray)", marginTop: 4 }}>Contatti assegnati a te su HubSpot{leads.length ? ` · ${leads.length}` : ""}</p></div>
                  <button className="bg" onClick={loadLeads} disabled={leadsLoading}>{leadsLoading ? "Aggiorno…" : "↻ Aggiorna"}</button>
                </div>
                <div className="gl" style={{ marginBottom: 24 }} />
                {leadsError ? (
                  <div style={{ padding: 20, background: "var(--white)", border: "1px solid var(--gl)", fontSize: 13 }}>
                    <div style={{ color: "var(--red)", fontWeight: 600, marginBottom: 6 }}>{leadsError}</div>
                    <div style={{ color: "var(--gray)", fontSize: 12 }}>Se è la prima volta, controlla che il token <strong>HUBSPOT_TOKEN</strong> sia stato aggiunto tra le variabili di Netlify.</div>
                  </div>
                ) : leadsLoading ? (
                  <div style={{ textAlign: "center", padding: 60, color: "var(--gray)" }}>Caricamento lead da HubSpot…</div>
                ) : leads.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 60, color: "var(--gray)" }}>Nessun lead assegnato a te.</div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
                    {leads.map(l => (
                      <div key={l.id} className="card fi" style={{ cursor: "default" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 10 }}>
                          <h3 style={{ fontSize: 15, fontWeight: 600 }}>{l.nome}</h3>
                          {l.stato && <span className="tag">{l.stato}</span>}
                        </div>
                        {l.email && <p style={{ fontSize: 12, color: "var(--gray)", marginBottom: 4, wordBreak: "break-all" }}>✉ {l.email}</p>}
                        {l.telefono && <p style={{ fontSize: 12, color: "var(--gray)", marginBottom: 4 }}>📞 {l.telefono}</p>}
                        {(l.citta || l.azienda) && <p style={{ fontSize: 12, color: "var(--gray)" }}>{[l.azienda, l.citta].filter(Boolean).join(" · ")}</p>}
                        <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--cd)" }}>
                          <a href={`https://app.hubspot.com/contacts/25704633/record/0-1/${l.id}`} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "var(--gold)", fontWeight: 600, textDecoration: "none" }}>Apri su HubSpot →</a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) :
            view === "proprietari" ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 8 }}>
                  <div><h1 style={{ fontSize: 26, fontWeight: 700 }}>Proprietari</h1><p style={{ fontSize: 12, color: "var(--gray)", marginTop: 4 }}>{filtO.length} proprietari</p></div>
                  <button className="bp" onClick={() => setModalO("new")}>+ Nuovo Proprietario</button>
                </div>
                <div className="gl" style={{ marginBottom: 24 }} />
                <input placeholder="Cerca per nome, CF..." value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 300, marginBottom: 24 }} />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
                  {filtO.map(o => {
                    const pc = proprieta.filter(p => p.proprietario_id === o.id).length;
                    return (
                      <div key={o.id} className="card fi" onClick={() => setDetO(o)}>
                        <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 12 }}>
                          <div style={{ width: 42, height: 42, background: "var(--black)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><span style={{ fontFamily: "Playfair Display", fontSize: 14, fontWeight: 700, color: "var(--gold)" }}>{o.cognome?.[0]}{o.nome?.[0]}</span></div>
                          <div><h3 style={{ fontSize: 15, fontWeight: 600 }}>{o.cognome} {o.nome}</h3><p style={{ fontSize: 11, color: "var(--gray)" }}>{o.citta || "—"}</p></div>
                        </div>
                        {o.codice_fiscale && <p style={{ fontSize: 11, fontFamily: "monospace", color: "var(--gray)", letterSpacing: ".06em", marginBottom: 6 }}>{o.codice_fiscale}</p>}
                        {o.email && <p style={{ fontSize: 12, color: "var(--gray)", marginBottom: 4 }}>✉ {o.email}</p>}
                        {o.telefono && <p style={{ fontSize: 12, color: "var(--gray)" }}>📞 {o.telefono}</p>}
                        <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--cd)" }}><span className="tag">{pc} proprietà</span></div>
                      </div>
                    );
                  })}
                  {filtO.length === 0 && <div style={{ gridColumn: "1/-1", textAlign: "center", padding: 60, color: "var(--gray)" }}>Nessun proprietario trovato.</div>}
                </div>
              </>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 8 }}>
                  <div><h1 style={{ fontSize: 26, fontWeight: 700 }}>Proprietà</h1><p style={{ fontSize: 12, color: "var(--gray)", marginTop: 4 }}>{filtP.length} di {stats.totale}</p></div>
                  <button className="bp" onClick={() => setModalP("new")}>+ Nuova Proprietà</button>
                </div>
                <div className="gl" style={{ marginBottom: 24 }} />
                <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
                  <input placeholder="Cerca nome, città, proprietario, CIN..." value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 300, flex: 1 }} />
                  <select value={fStato} onChange={e => setFStato(e.target.value)} style={{ width: 150 }}><option value="">Tutti gli stati</option>{STATI.map(s => <option key={s}>{s}</option>)}</select>
                  <select value={fContratto} onChange={e => setFContratto(e.target.value)} style={{ width: 140 }}><option value="">Tutti contratti</option>{CONTRATTI.map(c => <option key={c}>{c}</option>)}</select>
                  <select value={fGestore} onChange={e => setFGestore(e.target.value)} style={{ width: 130 }}><option value="">Tutti gestori</option>{GESTORI.map(g => <option key={g}>{g}</option>)}</select>
                  <div style={{ display: "flex", gap: 6, marginLeft: "auto", alignItems: "stretch" }}>
                    <button onClick={() => setPropVista("griglia")} title="Vista a griglia" style={{ padding: "0 14px", border: "1px solid var(--gl)", background: propVista === "griglia" ? "var(--black)" : "var(--white)", color: propVista === "griglia" ? "var(--white)" : "var(--gray)", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Griglia</button>
                    <button onClick={() => setPropVista("elenco")} title="Vista a elenco" style={{ padding: "0 14px", border: "1px solid var(--gl)", background: propVista === "elenco" ? "var(--black)" : "var(--white)", color: propVista === "elenco" ? "var(--white)" : "var(--gray)", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Elenco</button>
                    <select value={propRaggr} onChange={e => setPropRaggr(e.target.value)} style={{ width: 160 }}>
                      <option value="provincia">Zona: per provincia</option>
                      <option value="citta">Zona: per città</option>
                      <option value="nessuno">Zona: nessuna</option>
                    </select>
                  </div>
                </div>
                {(() => {
                  if (filtP.length === 0) return <div style={{ textAlign: "center", padding: 60, color: "var(--gray)" }}>Nessuna proprietà trovata.</div>;
                  let groups;
                  if (propRaggr === "nessuno") {
                    groups = [{ key: "__all__", label: null, items: filtP }];
                  } else {
                    const map = {};
                    filtP.forEach(p => { const k = (propRaggr === "citta" ? (p.citta || "") : (p.provincia || "")) || "—"; (map[k] = map[k] || []).push(p); });
                    groups = Object.keys(map).sort((a, b) => map[b].length - map[a].length).map(k => ({ key: k, label: areaLabel(k, propRaggr), items: map[k] }));
                  }
                  return groups.map(g => (
                    <div key={g.key} style={{ marginBottom: g.label ? 26 : 0 }}>
                      {g.label && (
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                          <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase" }}>{g.label}</h2>
                          <span style={{ fontSize: 11, color: "var(--gray)" }}>{g.items.length}</span>
                          <div style={{ flex: 1, height: 1, background: "var(--gl)" }} />
                        </div>
                      )}
                      {propVista === "griglia" ? (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 12 }}>
                          {g.items.map(p => <PropTile key={p.id} p={p} o={owners.find(x => x.id === p.proprietario_id)} onClick={() => setDetP(p)} />)}
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {g.items.map(p => <PropRow key={p.id} p={p} o={owners.find(x => x.id === p.proprietario_id)} onClick={() => setDetP(p)} />)}
                        </div>
                      )}
                    </div>
                  ));
                })()}
              </>
            )
          }
        </main>
      </div>

      {/* Detail Proprietà */}
      {detP && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 900, display: "flex", justifyContent: "flex-end" }} onClick={e => e.target === e.currentTarget && setDetP(null)}>
          <div style={{ background: "var(--cream)", width: "100%", maxWidth: 480, height: "100%", overflow: "auto", padding: 32 }} className="fi">
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <h2 style={{ fontSize: 20, flex: 1, paddingRight: 16 }}>{detP.nome}</h2>
              <button onClick={() => setDetP(null)} style={{ background: "none", border: "none", fontSize: 22, color: "var(--gray)" }}>×</button>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}><SB stato={detP.stato} /><CT tipo={detP.tipo_contratto} /></div>
            <div className="gl" style={{ marginBottom: 20 }} />
            <DR label="Indirizzo" val={`${detP.indirizzo || ""}${detP.citta ? ", " + detP.citta : ""}${detP.provincia ? " (" + detP.provincia + ")" : ""}`} />
            <DR label="Proprietario" val={(() => { const o = owners.find(x => x.id === detP.proprietario_id); return o ? `${o.cognome} ${o.nome}` : null; })()} />
            <DR label="Gestore" val={detP.gestore_interno} />
            <DR label="Data Inizio" val={detP.data_inizio} />
            <DR label="Commissione" val={detP.commissione ? `${detP.commissione}% ${detP.commissione_iva_inclusa ? "(IVA inc.)" : "(+ IVA)"}` : null} />
            <DR label="Letti / Camere" val={detP.posti_letto || detP.camere ? `${detP.posti_letto || "—"} letti · ${detP.camere || "—"} camere · ${detP.bagni || "—"} bagni` : null} />
            <DR label="MQ" val={detP.mq ? `${detP.mq} mq` : null} />
            <DR label="CIN" val={detP.cin} />
            <DR label="CIR" val={detP.cir} />
            <DR label="Catasto" val={[detP.catasto_foglio && `Foglio ${detP.catasto_foglio}`, detP.catasto_mappale && `Mapp. ${detP.catasto_mappale}`, detP.catasto_sub && `Sub ${detP.catasto_sub}`, detP.categoria_catastale].filter(Boolean).join(" · ") || null} />
            {detP.piattaforme?.length > 0 && <div style={{ padding: "8px 0", borderBottom: "1px solid var(--cd)" }}><span style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--gray)", display: "block", marginBottom: 6 }}>Piattaforme</span><div style={{ display: "flex", gap: 6 }}>{detP.piattaforme.map(pp => <span key={pp} className="tag">{pp}</span>)}</div></div>}
            <DR label="Pulizie" val={[detP.personale_pulizie, detP.telefono_pulizie].filter(Boolean).join(" · ") || null} />
            {detP.note && <DR label="Note" val={detP.note} />}
            <Allegati proprietaId={detP.id} linkProprietarioId={detP.proprietario_id} />
            <div style={{ display: "flex", gap: 10, marginTop: 28 }}>
              <button className="bp" style={{ flex: 1 }} onClick={() => { setModalP(detP); setDetP(null); }}>Modifica</button>
              <button className="bd" onClick={() => delP(detP.id)}>Elimina</button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Proprietario */}
      {detO && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 900, display: "flex", justifyContent: "flex-end" }} onClick={e => e.target === e.currentTarget && setDetO(null)}>
          <div style={{ background: "var(--cream)", width: "100%", maxWidth: 420, height: "100%", overflow: "auto", padding: 32 }} className="fi">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                <div style={{ width: 50, height: 50, background: "var(--black)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontFamily: "Playfair Display", fontSize: 18, fontWeight: 700, color: "var(--gold)" }}>{detO.cognome?.[0]}{detO.nome?.[0]}</span></div>
                <h2 style={{ fontSize: 20 }}>{detO.cognome} {detO.nome}</h2>
              </div>
              <button onClick={() => setDetO(null)} style={{ background: "none", border: "none", fontSize: 22, color: "var(--gray)" }}>×</button>
            </div>
            <div className="gl" style={{ marginBottom: 20 }} />
            <DR label="Codice Fiscale" val={detO.codice_fiscale} />
            <DR label="Email" val={detO.email} />
            <DR label="Telefono" val={detO.telefono} />
            <DR label="PEC" val={detO.pec} />
            <DR label="Indirizzo" val={`${detO.indirizzo || ""}${detO.citta ? ", " + detO.citta : ""}`} />
            {detO.note && <DR label="Note" val={detO.note} />}
            <div style={{ marginTop: 24 }}>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--gold)", marginBottom: 12 }}>Proprietà Gestite</p>
              {proprieta.filter(p => p.proprietario_id === detO.id).map(p => (
                <div key={p.id} onClick={() => { setDetO(null); setDetP(p); }} style={{ padding: "10px 12px", background: "var(--white)", border: "1px solid var(--gl)", marginBottom: 6, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "var(--gold)"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "var(--gl)"}>
                  <div><p style={{ fontSize: 13, fontWeight: 600 }}>{p.nome}</p><p style={{ fontSize: 11, color: "var(--gray)" }}>{p.citta}</p></div>
                  <SB stato={p.stato} />
                </div>
              ))}
            </div>
            <Allegati proprietarioId={detO.id} proprietaIds={proprieta.filter(p => p.proprietario_id === detO.id).map(p => p.id)} />
            <div style={{ display: "flex", gap: 10, marginTop: 28 }}>
              <button className="bp" style={{ flex: 1 }} onClick={() => { setModalO(detO); setDetO(null); }}>Modifica</button>
              <button className="bd" onClick={() => delO(detO.id)}>Elimina</button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {modalP && <Modal title={modalP === "new" ? "Nuova Proprietà" : `Modifica — ${modalP.nome}`} onClose={() => setModalP(null)}><PropForm init={modalP === "new" ? EP2 : modalP} owners={owners} onSave={saveP} onClose={() => setModalP(null)} loading={saving} /></Modal>}
      {modalO && <Modal title={modalO === "new" ? "Nuovo Proprietario" : `Modifica — ${modalO.cognome} ${modalO.nome}`} onClose={() => setModalO(null)}><OwnerForm init={modalO === "new" ? EP : modalO} onSave={saveO} onClose={() => setModalO(null)} loading={saving} /></Modal>}

      {/* AI Panel */}
      {aiOpen && <AiPanel onClose={() => setAiOpen(false)} proprieta={proprieta} owners={owners} onDataChanged={load} />}

      {/* AI Button */}
      {!aiOpen && (
        <button className="ai-btn" onClick={() => setAiOpen(true)} title="Apri Assistente AI">
          ✦
        </button>
      )}
    </>
  );
}

// ── Schermata password (cancello d'ingresso) ─────────────────────────────────
export default function Gate() {
  const [ok, setOk] = useState(() => { try { return sessionStorage.getItem("vl_auth") === "1"; } catch { return false; } });
  const [val, setVal] = useState("");
  const [err, setErr] = useState(false);
  if (ok) return <App />;
  const submit = () => {
    if (val === PASSWORD_SITO) { try { sessionStorage.setItem("vl_auth", "1"); } catch { /* ignore */ } setOk(true); }
    else { setErr(true); }
  };
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#FBF9F8", fontFamily: "'Poppins', sans-serif", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 340 }}>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 700, color: "#000", textAlign: "center", marginBottom: 6 }}>Valente Living</h1>
        <p style={{ fontSize: 13, color: "#777", textAlign: "center", marginBottom: 24 }}>Inserisci la password per accedere</p>
        <input type="password" value={val} autoFocus placeholder="Password"
          onChange={e => { setVal(e.target.value); setErr(false); }}
          onKeyDown={e => e.key === "Enter" && submit()}
          style={{ width: "100%", padding: "12px 14px", border: "1px solid #ddd", fontSize: 15, marginBottom: 12, boxSizing: "border-box", outline: "none" }} />
        {err && <p style={{ color: "#c0392b", fontSize: 12, marginBottom: 12, textAlign: "center" }}>Password errata, riprova.</p>}
        <button onClick={submit}
          style={{ width: "100%", padding: "12px", background: "#000", color: "#fff", border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer", borderRadius: 999, letterSpacing: ".05em" }}>
          ENTRA
        </button>
      </div>
    </div>
  );
}
