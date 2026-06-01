import { useState, useEffect, useCallback, useRef } from "react";

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
`;

const SB = ({ stato }) => <span className="pill" style={{ background: STATI_COLOR[stato] || "#888" }}>{stato || "—"}</span>;
const CT = ({ tipo }) => <span className="tag" style={tipo === "sublocazione" ? { background: "#fff8e1", color: "#b8860b", borderColor: "#d69c31" } : {}}>{tipo || "gestione"}</span>;
const DR = ({ label, val }) => val ? (
  <div style={{ display: "flex", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--cd)" }}>
    <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--gray)", minWidth: 130 }}>{label}</span>
    <span style={{ fontSize: 13, flex: 1, wordBreak: "break-all" }}>{val}</span>
  </div>
) : null;
const FG = ({ children }) => <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 20px" }}>{children}</div>;
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
const AiPanel = ({ onClose, proprieta, owners }) => {
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Ciao! Sono l'assistente AI di Valente Living. Posso aiutarti con informazioni sulle proprietà, scrivere email ai proprietari, spiegare procedure burocratiche e molto altro. Come posso aiutarti?" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
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
          <div key={i} className={m.role === "user" ? "msg-user" : "msg-ai"}>{m.content}</div>
        ))}
        {loading && (
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
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send(input))}
          placeholder="Chiedi qualcosa..."
          style={{ flex: 1, fontSize: 13 }}
          disabled={loading}
        />
        <button onClick={() => send(input)} disabled={loading || !input.trim()} style={{ padding: "8px 16px", background: input.trim() ? "var(--black)" : "var(--gl)", color: input.trim() ? "var(--white)" : "var(--gray)", border: "none", fontSize: 12, fontWeight: 600, transition: "all .2s", cursor: input.trim() ? "pointer" : "default" }}>
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
const EP2 = { nome: "", indirizzo: "", citta: "", cap: "", provincia: "", proprietario_id: "", tipo_contratto: "gestione", stato: "in lancio", cin: "", cir: "", commissione: "", commissione_iva_inclusa: true, posti_letto: "", camere: "", bagni: "", mq: "", catasto_foglio: "", catasto_mappale: "", catasto_sub: "", categoria_catastale: "", gestore_interno: "Tommaso", piattaforme: [], note: "", data_inizio: "" };
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

// ── Kanban View ──────────────────────────────────────────────────────────────
const KanbanView = ({ proprieta, owners }) => {
  const [workflow, setWorkflow] = useState({});
  const [drag, setDrag] = useState(null);
  const [selected, setSelected] = useState(null);
  const [tasks, setTasks] = useState({});
  const [scadenze, setScadenze] = useState({});
  const inLancio = proprieta.filter(p => ["in lancio", "mandato firmato", "mandato + cin"].includes(p.stato));
  const getPropCol = pid => workflow[pid] || "mandato";
  const getProgress = pid => {
    let done = 0, total = 0;
    WORKFLOW_COLUMNS.forEach(col => {
      const t = tasks[`${pid}-${col.id}`] || STEP_TASKS[col.id].map((t, i) => ({ id: i, label: t, done: false }));
      done += t.filter(x => x.done).length;
      total += t.length;
    });
    return total > 0 ? Math.round((done / total) * 100) : 0;
  };
  const getTasks = (pid, stepId) => tasks[`${pid}-${stepId}`] || STEP_TASKS[stepId].map((t, i) => ({ id: i, label: t, done: false }));
  const toggleTask = (pid, stepId, taskId) => { const key = `${pid}-${stepId}`; const cur = getTasks(pid, stepId); setTasks(t => ({ ...t, [key]: cur.map(tk => tk.id === taskId ? { ...tk, done: !tk.done } : tk) })); };
  const selProp = selected ? proprieta.find(p => p.id === selected) : null;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 8 }}>
        <div><h1 style={{ fontSize: 26, fontWeight: 700 }}>Workflow Lancio</h1><p style={{ fontSize: 12, color: "var(--gray)", marginTop: 4 }}>{inLancio.length} proprietà in onboarding</p></div>
      </div>
      <div className="gl" style={{ marginBottom: 24 }} />
      {inLancio.length === 0 ? <div style={{ textAlign: "center", padding: 60, color: "var(--gray)" }}>Nessuna proprietà in lancio.</div> : (
        <div style={{ overflowX: "auto", paddingBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, minWidth: "max-content" }}>
            {WORKFLOW_COLUMNS.map(col => (
              <div key={col.id} className="kcol" style={{ borderTop: `3px solid ${col.color}` }} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (drag) { setWorkflow(w => ({ ...w, [drag]: col.id })); setDrag(null); } }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: col.color, marginBottom: 10 }}>{col.label} <span style={{ marginLeft: 4, background: "rgba(0,0,0,.1)", padding: "1px 5px", borderRadius: 10, fontSize: 9, color: "var(--gray)" }}>{inLancio.filter(p => getPropCol(p.id) === col.id).length}</span></div>
                {inLancio.filter(p => getPropCol(p.id) === col.id).map(p => (
                  <div key={p.id} className="kcard" draggable onDragStart={() => setDrag(p.id)} onClick={() => setSelected(p.id)}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, lineHeight: 1.3 }}>{p.nome}</div>
                    <div style={{ fontSize: 11, color: "var(--gray)", marginBottom: 8 }}>{p.citta}</div>
                    <div style={{ height: 3, background: "var(--gl)", marginBottom: 4 }}><div style={{ height: "100%", background: col.color, width: `${getProgress(p.id)}%`, transition: "width .3s" }} /></div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--gray)" }}>
                      <span>{getProgress(p.id)}%</span>
                      {scadenze[p.id] && <span style={{ color: new Date(scadenze[p.id]) < new Date() ? "var(--red)" : "var(--gray)" }}>📅 {scadenze[p.id]}</span>}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
      {selProp && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 900, display: "flex", justifyContent: "flex-end" }} onClick={e => e.target === e.currentTarget && setSelected(null)}>
          <div style={{ background: "var(--cream)", width: "100%", maxWidth: 500, height: "100%", overflow: "auto", padding: 28 }} className="fi">
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <h2 style={{ fontSize: 18 }}>{selProp.nome}</h2>
              <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", fontSize: 22, color: "var(--gray)" }}>×</button>
            </div>
            <SB stato={selProp.stato} />
            <div className="gl" style={{ margin: "16px 0" }} />
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "var(--gold)", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 8 }}>Fase attuale</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {WORKFLOW_COLUMNS.map(col => <button key={col.id} onClick={() => setWorkflow(w => ({ ...w, [selProp.id]: col.id }))} style={{ padding: "4px 10px", fontSize: 11, fontWeight: 600, border: `1.5px solid ${col.color}`, background: getPropCol(selProp.id) === col.id ? col.color : "transparent", color: getPropCol(selProp.id) === col.id ? "#fff" : col.color }}>{col.label}</button>)}
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "var(--gold)", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 6 }}>Scadenza</p>
              <input type="date" value={scadenze[selProp.id] || ""} onChange={e => setScadenze(s => ({ ...s, [selProp.id]: e.target.value }))} />
            </div>
            {WORKFLOW_COLUMNS.map(col => {
              const taskList = getTasks(selProp.id, col.id);
              const done = taskList.filter(t => t.done).length;
              const isCur = getPropCol(selProp.id) === col.id;
              return (
                <div key={col.id} style={{ marginBottom: 12, border: `1px solid ${isCur ? col.color : "var(--gl)"}`, padding: 12, background: isCur ? `${col.color}08` : "var(--white)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: isCur ? col.color : "var(--gray)", textTransform: "uppercase", letterSpacing: ".06em" }}>{col.label}</p>
                    <span style={{ fontSize: 10, color: done === taskList.length ? "#2d6a4f" : "var(--gray)" }}>{done}/{taskList.length} ✓</span>
                  </div>
                  {taskList.map(t => <div key={t.id} className={`check ${t.done ? "done" : ""}`} onClick={() => toggleTask(selProp.id, col.id, t.id)}><input type="checkbox" checked={t.done} onChange={() => {}} /><span>{t.label}</span></div>)}
                </div>
              );
            })}
          </div>
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

// ── App ──────────────────────────────────────────────────────────────────────
export default function App() {
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

  const load = useCallback(async () => {
    setLoading(true);
    const [rP, rO] = await Promise.all([sb.get("proprieta", "?select=*&order=created_at.desc"), sb.get("proprietari", "?select=*&order=created_at.desc")]);
    if (rP.data) setProprieta(rP.data);
    if (rO.data) setOwners(rO.data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

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
    { id: "proprieta", label: "Proprietà", icon: "🏠", count: stats.totale },
    { id: "proprietari", label: "Proprietari", icon: "👤", count: owners.length },
    { id: "lancio", label: "Workflow Lancio", icon: "🚀", count: stats.onboarding },
    { id: "import", label: "Importa Monday", icon: "⬇️", count: null },
  ];

  return (
    <>
      <style>{CSS}</style>
      <div style={{ display: "flex", minHeight: "100vh" }}>
        {/* Sidebar */}
        <aside style={{ width: "var(--sw)", background: "var(--black)", color: "var(--white)", display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 100 }}>
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
              <button key={item.id} onClick={() => { setView(item.id); setSearch(""); setFStato(""); setFContratto(""); setFGestore(""); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", background: view === item.id ? "rgba(214,156,49,.15)" : "transparent", border: view === item.id ? "1px solid rgba(214,156,49,.3)" : "1px solid transparent", color: view === item.id ? "var(--gold)" : "rgba(255,255,255,.6)", fontSize: 13, fontWeight: view === item.id ? 600 : 400, marginBottom: 4, transition: "all .2s", textAlign: "left" }}>
                <span>{item.icon}</span><span style={{ flex: 1 }}>{item.label}</span>
                {item.count !== null && <span style={{ fontSize: 10, background: "rgba(255,255,255,.1)", padding: "1px 6px", borderRadius: 10 }}>{item.count}</span>}
              </button>
            ))}
          </nav>
          <div style={{ padding: "12px 20px", borderTop: "1px solid rgba(255,255,255,.08)" }}>
            <button onClick={() => setAiOpen(true)} style={{ width: "100%", padding: "10px", background: "linear-gradient(135deg, #D69C31, #f0c84a)", border: "none", color: "var(--black)", fontSize: 12, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              ✦ Assistente AI
            </button>
          </div>
          <div style={{ padding: "12px 20px" }}>
            <p style={{ fontSize: 9, color: "rgba(255,255,255,.3)", textAlign: "center" }}>v3.0 · Valente Living SRL</p>
          </div>
        </aside>

        {/* Main */}
        <main style={{ marginLeft: "var(--sw)", flex: 1, padding: "32px", minHeight: "100vh" }}>
          {loading ? <div style={{ textAlign: "center", padding: 60, color: "var(--gray)" }}>Caricamento...</div> :
            view === "lancio" ? <KanbanView proprieta={proprieta} owners={owners} /> :
            view === "import" ? <ImportView proprieta={proprieta} owners={owners} onImport={load} /> :
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
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
                  {filtP.map(p => {
                    const o = owners.find(x => x.id === p.proprietario_id);
                    return (
                      <div key={p.id} className="card fi" onClick={() => setDetP(p)}>
                        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: STATI_COLOR[p.stato] || "#ccc" }} />
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                          <h3 style={{ fontSize: 15, fontWeight: 600, flex: 1, paddingRight: 10 }}>{p.nome}</h3>
                          <SB stato={p.stato} />
                        </div>
                        <p style={{ fontSize: 12, color: "var(--gray)", marginBottom: 8 }}>{p.indirizzo}{p.citta ? `, ${p.citta}` : ""}{p.provincia ? ` (${p.provincia})` : ""}</p>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                          <CT tipo={p.tipo_contratto} />
                          {p.commissione && <span className="tag">{p.commissione}%</span>}
                          {p.posti_letto && <span className="tag">🛏 {p.posti_letto}</span>}
                          {!p.cin && p.stato === "attivo" && <span className="tag" style={{ color: "var(--red)", borderColor: "var(--red)" }}>No CIN</span>}
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--cd)" }}>
                          <span style={{ fontSize: 11, color: "var(--gray)" }}>{o ? `${o.cognome} ${o.nome}` : "—"}</span>
                          {p.cin && <span style={{ fontSize: 10, fontFamily: "monospace", color: "var(--gold)" }}>{p.cin.slice(0, 14)}…</span>}
                        </div>
                        {p.gestore_interno && <div style={{ position: "absolute", bottom: 12, right: 14, width: 26, height: 26, borderRadius: "50%", background: "var(--black)", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 9, fontWeight: 700, color: "var(--gold)" }}>{p.gestore_interno.slice(0, 2).toUpperCase()}</span></div>}
                      </div>
                    );
                  })}
                  {filtP.length === 0 && <div style={{ gridColumn: "1/-1", textAlign: "center", padding: 60, color: "var(--gray)" }}>Nessuna proprietà trovata.</div>}
                </div>
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
            {detP.note && <DR label="Note" val={detP.note} />}
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
      {aiOpen && <AiPanel onClose={() => setAiOpen(false)} proprieta={proprieta} owners={owners} />}

      {/* AI Button */}
      {!aiOpen && (
        <button className="ai-btn" onClick={() => setAiOpen(true)} title="Apri Assistente AI">
          ✦
        </button>
      )}
    </>
  );
}
