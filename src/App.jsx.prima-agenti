import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from "react";
import Archivio from "./Archivio";
import Schede from "./Schede";
import MessaggiAI from "./MessaggiAI";
import Ecosistema from "./Ecosistema";
import Guida from "./Guida";
import Compliance from "./Compliance";
import Ricorrenti from "./Ricorrenti";
import Team from "./Team";
import PortaleAgente from "./PortaleAgente";
import Valutazione from "./Valutazione";

const SUPABASE_URL = "https://heabtbdmwbjlgujsisor.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhlYWJ0YmRtd2JqbGd1anNpc29yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMjA4NDgsImV4cCI6MjA5NTg5Njg0OH0.FRk1tARhQHylLjfhACorn6O_E7ommm47tBTfJHOVxAU";

// PWA + Notifiche Push (aggiunto in v20, non tocca nulla del resto)
const VAPID_PUBLIC_KEY = "BEQcbEOtepP_yLBi2KCETBEeRxetSDHtGKqk8n6EdyrFXWZbSjBDfARB_bEml2aWpKGamfNfG2eaKmYrCCVxXhM";
function urlBase64ToUint8Array(s) {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
function setupPWA() {
  if (typeof window === "undefined" || window.__vlPwaDone) return;
  window.__vlPwaDone = true;
  const head = document.head;
  const mk = (tag, attrs) => { const el = document.createElement(tag); Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v)); head.appendChild(el); };
  if (!head.querySelector('link[rel="manifest"]')) mk("link", { rel: "manifest", href: "/manifest.json" });
  if (!head.querySelector('link[rel="apple-touch-icon"]')) mk("link", { rel: "apple-touch-icon", href: "/icon-192.png" });
  if (!head.querySelector('meta[name="theme-color"]')) mk("meta", { name: "theme-color", content: "#0A0A0A" });
  if (!head.querySelector('meta[name="apple-mobile-web-app-capable"]')) mk("meta", { name: "apple-mobile-web-app-capable", content: "yes" });
  if (!head.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')) mk("meta", { name: "apple-mobile-web-app-status-bar-style", content: "black" });
  if (!head.querySelector('meta[name="apple-mobile-web-app-title"]')) mk("meta", { name: "apple-mobile-web-app-title", content: "Valente" });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
}

// Invia una notifica push a tutti i dispositivi iscritti (fire-and-forget) — aggiunto v21
function inviaPush(title, body, url) {
  try {
    fetch("/.netlify/functions/invia-notifica", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, url: url || "/" }),
    }).catch(() => {});
  } catch (_) { /* ignora */ }
}

/* ── Sessione utente (Supabase Auth) ──────────────────────────────────────────
   Il token dell'utente loggato sostituisce la chiave anonima in ogni chiamata:
   così il database può distinguere chi sta scrivendo e applicare i permessi. */
const AUTH_KEY = "vl_sessione";
const auth = {
  leggi() {
    try { return JSON.parse(localStorage.getItem(AUTH_KEY) || "null"); } catch { return null; }
  },
  scrivi(s) {
    try { s ? localStorage.setItem(AUTH_KEY, JSON.stringify(s)) : localStorage.removeItem(AUTH_KEY); } catch { /* ignora */ }
  },
  token() { const s = auth.leggi(); return (s && s.access_token) || null; },
  utente() { const s = auth.leggi(); return (s && s.user) || null; },

  async login(email, password) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email: String(email).trim(), password }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error_description || d.msg || d.message || "Accesso non riuscito.");
    auth.scrivi({ access_token: d.access_token, refresh_token: d.refresh_token, scade: Date.now() + (d.expires_in || 3600) * 1000, user: d.user });
    return d.user;
  },

  // Rinnova il token quando sta per scadere, così non si viene buttati fuori
  async rinnova() {
    const s = auth.leggi();
    if (!s || !s.refresh_token) return null;
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: s.refresh_token }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { auth.scrivi(null); return null; }
    auth.scrivi({ access_token: d.access_token, refresh_token: d.refresh_token, scade: Date.now() + (d.expires_in || 3600) * 1000, user: d.user || s.user });
    return d.access_token;
  },

  async logout() {
    const t = auth.token();
    if (t) {
      try { await fetch(`${SUPABASE_URL}/auth/v1/logout`, { method: "POST", headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${t}` } }); } catch { /* ignora */ }
    }
    auth.scrivi(null);
  },
};

const sb = {
  async req(method, table, body, query = "", riprova = true) {
    const s = auth.leggi();
    // Se il token è scaduto (o quasi) lo rinnovo prima di chiamare
    if (s && s.scade && s.scade - Date.now() < 60000) await auth.rinnova();
    const token = auth.token() || SUPABASE_KEY;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
      method, body: body ? JSON.stringify(body) : undefined,
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "return=representation" }
    });
    if (r.status === 401 && riprova && auth.leggi()) {
      const nuovo = await auth.rinnova();
      if (nuovo) return sb.req(method, table, body, query, false);
    }
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
const STATI_COLOR = { "attivo": "#2d6a4f", "in lancio": "#6366F1", "mandato firmato": "#1d6fa4", "mandato + cin": "#4a90d9", "ristrutturazione": "#e07b39", "inattivo": "#888" };
const CONTRATTI = ["gestione", "sublocazione"];
const PIATTAFORME = ["Airbnb", "Booking", "VRBO", "Direct", "Expedia"];
const GESTORI = ["Tommaso", "Francesco", "Jacopo"];

const WORKFLOW_COLUMNS = [
  { id: "mandato", label: "Mandato", color: "#1d6fa4" },
  { id: "scia", label: "SCIA", color: "#e07b39" },
  { id: "cin", label: "CIN", color: "#8b5cf6" },
  { id: "cir", label: "ISTAT", color: "#0891b2" },
  { id: "geis", label: "GEIS", color: "#6366F1" },
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
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--cream:#F6F7F9;--cd:#ECEEF3;--black:#0F172A;--gold:#6366F1;--white:#fff;--gray:#64748B;--gl:#E2E8F0;--red:#E11D48;--sw:240px;--r:12px;--shadow:0 1px 2px rgba(15,23,42,.04),0 4px 14px rgba(15,23,42,.05);--shadow-lg:0 8px 30px rgba(15,23,42,.10)}
html{scroll-behavior:smooth}
body{font-family:'Inter',sans-serif;background:var(--cream);color:var(--black);min-height:100vh;-webkit-font-smoothing:antialiased}
h1,h2,h3{font-family:'Inter',sans-serif;letter-spacing:-.02em;font-weight:700}
input,select,textarea{font-family:'Inter',sans-serif;font-size:13px;background:var(--white);border:1px solid var(--gl);color:var(--black);padding:10px 13px;width:100%;outline:none;border-radius:10px;transition:border-color .15s,box-shadow .15s}
input:hover,select:hover,textarea:hover{border-color:#B6C2D4}
input:focus,select:focus,textarea:focus{border-color:var(--gold);box-shadow:0 0 0 3px rgba(99,102,241,.15)}
input::placeholder,textarea::placeholder{color:#A2ACBD}
select{cursor:pointer}
button{font-family:'Inter',sans-serif;cursor:pointer;border-radius:10px;transition:transform .12s,box-shadow .15s,background .15s,color .15s,border-color .15s}
button:active{transform:scale(.97)}
button:focus-visible,input:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
::-webkit-scrollbar{width:8px;height:8px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:#CBD5E1;border-radius:99px}
::-webkit-scrollbar-thumb:hover{background:var(--gold)}
.pill{display:inline-block;padding:3px 10px;font-size:11px;font-weight:600;border-radius:20px;letter-spacing:.02em;color:#fff}
.tag{display:inline-block;padding:2px 9px;font-size:10px;font-weight:600;letter-spacing:.03em;background:var(--cd);color:var(--gray);border:1px solid transparent;border-radius:6px}
.bp{background:var(--gold);color:#fff;border:none;padding:10px 20px;font-size:12.5px;font-weight:600;letter-spacing:0;text-transform:none;box-shadow:0 1px 3px rgba(99,102,241,.35)}
.bp:hover{background:#4F46E5;color:#fff;box-shadow:0 4px 14px rgba(99,102,241,.4)}
.bp:disabled{opacity:.55;cursor:default;box-shadow:none}
.bg{background:var(--white);color:#475569;border:1px solid var(--gl);padding:8px 16px;font-size:12px;font-weight:500}
.bg:hover{border-color:#94A3B8;color:var(--black);box-shadow:var(--shadow)}
.bd{background:transparent;color:var(--red);border:1px solid #FBCFE0;padding:8px 16px;font-size:12px;font-weight:500}
.bd:hover{background:var(--red);color:#fff;border-color:var(--red)}
.gl{height:1px;background:var(--gl);border-radius:2px}
.fi{animation:fi .3s ease}
@keyframes fi{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.card{background:var(--white);border:1px solid var(--gl);padding:18px 20px;cursor:pointer;transition:box-shadow .2s,border-color .2s,transform .2s;position:relative;overflow:hidden;border-radius:var(--r);box-shadow:var(--shadow)}
.card:hover{box-shadow:var(--shadow-lg);border-color:var(--gold);transform:translateY(-2px)}
.kcard{background:var(--white);border:1px solid var(--gl);padding:14px;margin-bottom:10px;cursor:pointer;transition:all .2s;border-radius:10px;box-shadow:var(--shadow)}
.kcard:hover{border-color:var(--gold);box-shadow:var(--shadow-lg);transform:translateY(-1px)}
.kcol{background:var(--cd);padding:12px;min-height:200px;flex:1;min-width:170px;border-radius:var(--r)}
.check{display:flex;align-items:center;gap:10px;padding:7px 0;font-size:12px;cursor:pointer;border-bottom:1px solid var(--cd)}
.check:hover{background:rgba(99,102,241,.04)}
.check input[type=checkbox]{width:15px;height:15px;accent-color:var(--gold);cursor:pointer;flex-shrink:0}
.check.done span{text-decoration:line-through;color:var(--gray)}
.msg-user{background:var(--black);color:var(--white);padding:12px 16px;max-width:80%;margin-left:auto;font-size:13px;line-height:1.5;border-radius:14px 14px 4px 14px}
.msg-ai{background:var(--white);border:1px solid var(--gl);padding:12px 16px;max-width:90%;font-size:13px;line-height:1.6;white-space:pre-wrap;border-radius:14px 14px 14px 4px;box-shadow:var(--shadow)}
.msg-ai strong{font-weight:600;color:var(--black)}
.typing{display:flex;gap:4px;padding:12px 16px;background:var(--white);border:1px solid var(--gl);width:60px;border-radius:14px 14px 14px 4px}
table{border-collapse:collapse}
tbody tr{transition:background .12s}
tbody tr:hover{background:rgba(99,102,241,.05)}
.dot{width:6px;height:6px;border-radius:50%;background:var(--gold);animation:bounce 1.2s infinite}
.dot:nth-child(2){animation-delay:.2s}
.dot:nth-child(3){animation-delay:.4s}
@keyframes bounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-8px)}}
.ai-btn{position:fixed;bottom:28px;right:28px;width:56px;height:56px;background:var(--black);border:none;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:0 4px 20px rgba(0,0,0,.3);transition:all .2s;z-index:500}
.ai-btn:hover{background:var(--gold);transform:scale(1.08)}
.ai-panel{position:fixed;bottom:0;right:0;width:420px;height:100vh;background:var(--cream);border-left:1px solid var(--gl);display:flex;flex-direction:column;z-index:600;animation:slideIn .3s ease;box-shadow:-12px 0 40px rgba(0,0,0,.12)}
@keyframes slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}
.sidebar{position:fixed;top:0;left:0;bottom:0;width:var(--sw);z-index:100;background:linear-gradient(180deg,#0F1226 0%,#131A33 100%);color:var(--white);display:flex;flex-direction:column;overflow-y:auto;scrollbar-width:thin}
.sidebar::-webkit-scrollbar-thumb{background:rgba(255,255,255,.15)}
.sidebar nav button{border-radius:10px}
.sidebar nav button:not(.nav-on):hover{background:rgba(255,255,255,.06)!important;color:#fff!important}
.nav-group{font-size:9px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.32);padding:14px 12px 6px}
.main{margin-left:var(--sw);flex:1;padding:32px;min-height:100vh;min-width:0}
.topbar{display:none}
.backdrop{display:none;animation:fadeIn .2s ease}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
.fg{display:grid;grid-template-columns:1fr 1fr;gap:14px 20px}
.msgai-top{position:fixed;top:14px;right:18px;z-index:450;display:flex;align-items:center;gap:8px;background:linear-gradient(135deg,#6366F1,#818CF8);color:#fff;border:none;border-radius:999px;padding:10px 20px;font-size:12.5px;font-weight:700;letter-spacing:.02em;cursor:pointer;box-shadow:0 4px 18px rgba(99,102,241,.4);transition:transform .15s}
.msgai-top:hover{transform:scale(1.05)}
@media (max-width:768px){
  .sidebar{transform:translateX(-100%);transition:transform .25s ease;width:min(82vw,300px);box-shadow:0 0 40px rgba(0,0,0,.45)}
  .sidebar.open{transform:translateX(0)}
  .sidebar nav button{padding-top:13px!important;padding-bottom:13px!important}
  .main{margin-left:0;padding:14px;padding-top:64px}
  .topbar{display:flex;position:fixed;top:0;left:0;right:0;height:52px;background:rgba(15,18,38,.92);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);color:var(--white);align-items:center;gap:14px;padding:0 16px;z-index:90}
  .backdrop{display:block;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:95}
  .ai-panel{width:100%;right:0}
  .ai-btn{bottom:18px;right:18px;width:50px;height:50px;font-size:20px}
  .fg{grid-template-columns:1fr}
  .msgai-top{top:62px;right:12px;padding:8px 14px;font-size:11.5px}
  .home-grid{grid-template-columns:1fr !important}
  input,select,textarea{font-size:16px;padding:12px 14px}
  .bp,.bg,.bd{padding-top:11px;padding-bottom:11px}
  table{display:block;overflow-x:auto;-webkit-overflow-scrolling:touch}
}
`;

const SB = ({ stato }) => <span className="pill" style={{ background: STATI_COLOR[stato] || "#888" }}>{stato || "—"}</span>;
const CT = ({ tipo }) => <span className="tag" style={tipo === "sublocazione" ? { background: "#EEF2FF", color: "#4F46E5", borderColor: "transparent" } : {}}>{tipo || "gestione"}</span>;
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
/* Selettore con ricerca: sostituisce le tendine lunghe (proprietari, immobili).
   Le voci sono sempre ordinate alfabeticamente e filtrabili scrivendo. */
const SelectRicerca = ({ value, onChange, opzioni, placeholder = "— Seleziona —", vuoto = "— Nessuno —" }) => {
  const [aperto, setAperto] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef(null);
  const ordinate = useMemo(
    () => [...opzioni].sort((a, b) => String(a.label).localeCompare(String(b.label), "it", { sensitivity: "base" })),
    [opzioni]
  );
  const filtrate = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? ordinate.filter(o => String(o.label).toLowerCase().includes(t)) : ordinate;
  }, [ordinate, q]);
  const selezionata = opzioni.find(o => String(o.value) === String(value));

  useEffect(() => {
    if (!aperto) return;
    const fuori = (e) => { if (box.current && !box.current.contains(e.target)) { setAperto(false); setQ(""); } };
    document.addEventListener("mousedown", fuori);
    return () => document.removeEventListener("mousedown", fuori);
  }, [aperto]);

  const scegli = (v) => { onChange(v); setAperto(false); setQ(""); };

  return (
    <div ref={box} style={{ position: "relative" }}>
      <button type="button" onClick={() => setAperto(a => !a)}
        style={{ width: "100%", textAlign: "left", padding: "10px 13px", fontSize: 13, background: "var(--white)", border: "1px solid var(--gl)", borderRadius: 10, color: selezionata ? "var(--black)" : "#A2ACBD", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selezionata ? selezionata.label : placeholder}</span>
        <span style={{ fontSize: 10, color: "var(--gray)" }}>▾</span>
      </button>
      {aperto && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 1100, background: "var(--white)", border: "1px solid var(--gl)", borderRadius: 12, boxShadow: "0 12px 40px rgba(15,23,42,.18)", overflow: "hidden" }}>
          <div style={{ padding: 8, borderBottom: "1px solid var(--cd)" }}>
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Cerca…"
              onKeyDown={e => { if (e.key === "Enter" && filtrate.length) { e.preventDefault(); scegli(filtrate[0].value); } if (e.key === "Escape") setAperto(false); }} />
          </div>
          <div style={{ maxHeight: 260, overflowY: "auto" }}>
            <button type="button" onClick={() => scegli("")}
              style={{ width: "100%", textAlign: "left", padding: "9px 13px", fontSize: 12.5, background: "transparent", border: "none", color: "var(--gray)", borderRadius: 0 }}>{vuoto}</button>
            {filtrate.map(o => {
              const sel = String(o.value) === String(value);
              return (
                <button key={o.value} type="button" onClick={() => scegli(o.value)}
                  style={{ width: "100%", textAlign: "left", padding: "9px 13px", fontSize: 12.5, background: sel ? "#EEF2FF" : "transparent", border: "none", color: sel ? "#4F46E5" : "var(--black)", fontWeight: sel ? 600 : 400, borderRadius: 0, display: "flex", alignItems: "center", gap: 8 }}
                  onMouseEnter={e => { if (!sel) e.currentTarget.style.background = "var(--cream)"; }}
                  onMouseLeave={e => { if (!sel) e.currentTarget.style.background = "transparent"; }}>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label}</span>
                  {sel && <span style={{ fontSize: 11 }}>✓</span>}
                </button>
              );
            })}
            {filtrate.length === 0 && <div style={{ padding: "12px 13px", fontSize: 12, color: "var(--gray)" }}>Nessun risultato per "{q}"</div>}
          </div>
        </div>
      )}
    </div>
  );
};

const Modal = ({ title, onClose, children }) => (
  <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={e => e.target === e.currentTarget && onClose()}>
    <div style={{ background: "var(--cream)", width: "100%", maxWidth: 680, maxHeight: "90vh", overflow: "auto", borderRadius: 16, boxShadow: "0 24px 70px rgba(0,0,0,.28)" }} className="fi">
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
                body: JSON.stringify({ action: "upload", token: auth.token(), proprietario_id: String(nuovoId), nome_file: f.name, tipo: f.type, data: f.data }),
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
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--white)", fontFamily: "Inter" }}>Assistente AI</p>
          <p style={{ fontSize: 10, color: "rgba(255,255,255,.5)", letterSpacing: ".06em", textTransform: "uppercase" }}>Valente Living · Powered by Claude</p>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,.6)", fontSize: 20 }}>×</button>
      </div>

      {/* Quick prompts */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--gl)", flexShrink: 0 }}>
        <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--gray)", marginBottom: 8 }}>Domande rapide</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {QUICK_PROMPTS.slice(0, 4).map((q, i) => (
            <button key={i} onClick={() => send(q)} style={{ padding: "4px 10px", fontSize: 10, fontWeight: 500, background: "var(--white)", border: "1px solid var(--gl)", borderRadius: 12, boxShadow: "var(--shadow)", color: "var(--gray)", transition: "all .15s", cursor: "pointer" }}
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
          style={{ padding: "8px 12px", background: "var(--white)", border: "1px solid var(--gl)", borderRadius: 12, boxShadow: "var(--shadow)", color: "var(--gray)", fontSize: 15, cursor: (loading || analyzing) ? "default" : "pointer" }}>
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
const PropForm = ({ init = EP2, owners, onSave, onClose, loading, gestori = GESTORI }) => {
  const [f, setF] = useState(init);
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));
  const tp = p => setF(prev => ({ ...prev, piattaforme: prev.piattaforme?.includes(p) ? prev.piattaforme.filter(x => x !== p) : [...(prev.piattaforme || []), p] }));
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState("");
  const compilaAI = async () => {
    if (!f.id) { setAiMsg("Salva prima l'immobile: poi potrò leggere i documenti che gli hai allegato."); return; }
    setAiBusy(true); setAiMsg("Cerco i documenti dell'immobile…");
    try {
      const lr = await fetch("/.netlify/functions/allegati", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "list", token: auth.token(), proprieta_id: f.id }) });
      const ld = await lr.json();
      let list = ld.files || [];
      if (!list.length) { setAiMsg("Nessun documento allegato a questo immobile. Carica un mandato o una visura e riprova."); setAiBusy(false); return; }
      const rank = (n) => { n = (n || "").toLowerCase(); if (/mandat/.test(n)) return 0; if (/visur|catast/.test(n)) return 1; if (/cin|cir/.test(n)) return 2; if (/contratt/.test(n)) return 3; return 5; };
      list = list.map(x => ({ ...x, _n: x.nome_file || x.path || "" })).sort((a, b) => rank(a._n) - rank(b._n)).slice(0, 3);
      setAiMsg("Leggo i documenti con l'AI…");
      const files = [];
      for (const it of list) {
        try {
          const sr = await fetch("/.netlify/functions/allegati", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sign", token: auth.token(), path: it.path }) });
          const sd = await sr.json();
          if (!sd.url) continue;
          const blob = await (await fetch(sd.url)).blob();
          if (blob.size > 4 * 1024 * 1024) continue;
          const data = await new Promise((res, rej) => { const rd = new FileReader(); rd.onload = () => res(String(rd.result).split(",")[1]); rd.onerror = () => rej(new Error("read")); rd.readAsDataURL(blob); });
          files.push({ nome: it._n, tipo: it.tipo || blob.type || "", data });
        } catch { /* salto questo file */ }
      }
      if (!files.length) { setAiMsg("Non sono riuscito a leggere i documenti allegati."); setAiBusy(false); return; }
      const er = await fetch("/.netlify/functions/estrai-dati", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ files }) });
      const ed = await er.json();
      if (!er.ok || ed.error) { setAiMsg("Errore: " + (ed.error || "estrazione non riuscita")); setAiBusy(false); return; }
      const fields = ed.fields || {};
      const mappa = ["indirizzo", "citta", "cap", "provincia", "cin", "cir", "catasto_foglio", "catasto_mappale", "catasto_sub", "categoria_catastale", "commissione", "posti_letto", "camere", "bagni", "mq"];
      const empty = (v) => v === undefined || v === null || String(v).trim() === "";
      const patch = {}; let n = 0;
      mappa.forEach((k) => { const val = fields[k]; if (!empty(val) && empty(f[k])) { patch[k] = String(val); n++; } });
      if (n) setF((prev) => ({ ...prev, ...patch }));
      setAiMsg(n ? `✨ Compilati ${n} campi dai documenti. Controlla i codici (CIN, catasto) e poi Salva.` : "Non ho trovato dati nuovi: i campi sono già compilati, o i documenti non li contengono.");
    } catch (e) { setAiMsg("Errore: " + (e && e.message ? e.message : "imprevisto")); }
    setAiBusy(false);
  };
  return (
    <>
      {f.id && (
        <div style={{ marginBottom: 18, padding: 14, background: "rgba(99,102,241,.08)", border: "1px solid rgba(99,102,241,.35)" }}>
          <button type="button" onClick={compilaAI} disabled={aiBusy} style={{ padding: "8px 16px", fontSize: 12, fontWeight: 700, letterSpacing: ".04em", border: "none", background: aiBusy ? "#bbb" : "linear-gradient(135deg, #6366F1, #818CF8)", color: "#fff", cursor: aiBusy ? "default" : "pointer", borderRadius: 999 }}>
            {aiBusy ? "Leggo i documenti…" : "✨ Compila con AI dai documenti"}
          </button>
          {aiMsg && <p style={{ fontSize: 12, color: "var(--gray)", marginTop: 10, lineHeight: 1.4 }}>{aiMsg}</p>}
        </div>
      )}
      <ST>Dati Proprietà</ST><FG>
        <FF label="Nome" span={2}><input value={f.nome} onChange={e => s("nome", e.target.value)} /></FF>
        <FF label="Proprietario" span={2}>
          <SelectRicerca value={f.proprietario_id} onChange={v => s("proprietario_id", v)}
            opzioni={owners.map(o => ({ value: o.id, label: `${o.cognome || ""} ${o.nome || ""}`.trim() }))}
            placeholder="— Seleziona —" vuoto="— Nessun proprietario —" />
        </FF>
        <FF label="Tipo Contratto"><select value={f.tipo_contratto} onChange={e => s("tipo_contratto", e.target.value)}>{CONTRATTI.map(c => <option key={c}>{c}</option>)}</select></FF>
        <FF label="Stato"><select value={f.stato} onChange={e => s("stato", e.target.value)}>{STATI.map(ss => <option key={ss}>{ss}</option>)}</select></FF>
        <FF label="Gestore">
          <select value={f.gestore_interno || ""} onChange={e => s("gestore_interno", e.target.value)}>
            <option value="">— Non assegnato —</option>
            {gestori.map(g => <option key={g}>{g}</option>)}
          </select>
        </FF>
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

// ── Team: helper condiviso per collaboratori e task ──────────────────────────
async function fnTeam(payload) {
  const r = await fetch("/.netlify/functions/team", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, token: auth.token() }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) throw new Error(d.error || "Errore.");
  return d;
}
const COLORI_COLL = ["#6366F1", "#0891b2", "#e07b39", "#2d6a4f", "#8b5cf6", "#b8860b", "#c0392b", "#1d6fa4"];

// ── Workflow Lancio ──────────────────────────────────────────────────────────
const KanbanView = ({ proprieta, owners, onDataChanged, onEdit, onApriScheda }) => {
  const [saving, setSaving] = useState(null);
  const [noteAperte, setNoteAperte] = useState(null); // id proprietà con le note aperte
  const [noteDraft, setNoteDraft] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteSalvate, setNoteSalvate] = useState(false);
  const [fPersona, setFPersona] = useState(""); // filtro per assegnatario
  const [collaboratori, setCollaboratori] = useState([]);
  const [task, setTask] = useState([]);
  const [nuovoColl, setNuovoColl] = useState(null); // { nome, ruolo } quando si crea un collaboratore
  const [taskAperti, setTaskAperti] = useState(null); // id proprietà con i task aperti
  const [nuovoTask, setNuovoTask] = useState({ titolo: "", assegnato_a: "", scadenza: "" });

  const caricaTeam = useCallback(async () => {
    try {
      const [c, t] = await Promise.all([fnTeam({ action: "list_collaboratori" }), fnTeam({ action: "list_task" })]);
      setCollaboratori(c.collaboratori || []);
      setTask(t.task || []);
    } catch { /* silenzioso */ }
  }, []);
  useEffect(() => { caricaTeam(); }, [caricaTeam]);

  const attivi = collaboratori.filter(c => c.attivo !== false);
  const collDi = (nome) => collaboratori.find(c => c.nome === nome);
  const taskDi = (propId) => task.filter(t => String(t.proprieta_id) === String(propId));

  const creaCollaboratore = async () => {
    if (!nuovoColl || !nuovoColl.nome.trim()) return;
    try {
      const usati = collaboratori.map(c => c.colore);
      const colore = COLORI_COLL.find(c => !usati.includes(c)) || COLORI_COLL[collaboratori.length % COLORI_COLL.length];
      const d = await fnTeam({ action: "save_collaboratore", nome: nuovoColl.nome.trim(), ruolo: nuovoColl.ruolo.trim() || null, colore });
      setCollaboratori(cs => [...cs, d.collaboratore].sort((a, b) => a.nome.localeCompare(b.nome)));
      setNuovoColl(null);
    } catch (e) { alert(e.message); }
  };

  const salvaTask = async (payload) => {
    const d = await fnTeam({ action: "save_task", ...payload });
    setTask(ts => {
      const altri = ts.filter(x => x.id !== d.task.id);
      return [d.task, ...altri];
    });
    return d.task;
  };
  const aggiungiTask = async (p) => {
    if (!nuovoTask.titolo.trim()) return;
    try {
      await salvaTask({ titolo: nuovoTask.titolo.trim(), assegnato_a: nuovoTask.assegnato_a || p.gestore_interno || null, proprieta_id: p.id, scadenza: nuovoTask.scadenza || null, stato: "da fare" });
      setNuovoTask({ titolo: "", assegnato_a: "", scadenza: "" });
    } catch (e) { alert(e.message); }
  };
  const toggleTask = async (t) => {
    try { await salvaTask({ id: t.id, stato: t.stato === "fatto" ? "da fare" : "fatto" }); }
    catch (e) { alert(e.message); }
  };
  const eliminaTask = async (t) => {
    if (!confirm(`Eliminare il task "${t.titolo}"?`)) return;
    try { await fnTeam({ action: "delete_task", id: t.id }); setTask(ts => ts.filter(x => x.id !== t.id)); }
    catch (e) { alert(e.message); }
  };
  const tutteInLancio = proprieta.filter(p => ["in lancio", "mandato firmato", "mandato + cin"].includes(p.stato));
  const inLancio = fPersona
    ? tutteInLancio.filter(p => fPersona === "__nessuno" ? !p.gestore_interno : p.gestore_interno === fPersona)
    : tutteInLancio;

  const apriNote = (p) => {
    if (noteAperte === p.id) { setNoteAperte(null); return; }
    setNoteAperte(p.id); setNoteDraft(p.note || ""); setNoteSalvate(false);
  };
  const salvaNote = async (p) => {
    setNoteSaving(true); setNoteSalvate(false);
    await sb.patch("proprieta", p.id, { note: noteDraft.trim() || null });
    if (onDataChanged) await onDataChanged();
    setNoteSaving(false); setNoteSalvate(true);
    setTimeout(() => setNoteSalvate(false), 2500);
  };
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
  // Assegnazione della proprietà a chi ci lavora
  const assegna = async (p, gestore) => {
    setSaving(p.id);
    await sb.patch("proprieta", p.id, { gestore_interno: gestore || null });
    if (onDataChanged) await onDataChanged();
    setSaving(null);
  };
  const coloreGestore = (g) => {
    const c = collaboratori.find(x => x.nome === g);
    return (c && c.colore) || "#94A3B8";
  };
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 8, gap: 12 }}>
        <div><h1 style={{ fontSize: 26, fontWeight: 700 }}>Workflow Lancio</h1><p style={{ fontSize: 12, color: "var(--gray)", marginTop: 4 }}>{inLancio.length} proprietà in onboarding{fPersona ? ` · filtro attivo` : ""}</p></div>
        <button className="bp" onClick={() => onEdit && onEdit("new")}>+ Nuova proprietà</button>
      </div>
      <div className="gl" style={{ marginBottom: 16 }} />

      {/* Filtro per persona assegnata */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 20 }}>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--gray)", marginRight: 2 }}>Chi ci lavora</span>
        {[["", `Tutti (${tutteInLancio.length})`], ...attivi.map(c => [c.nome, `${c.nome} (${tutteInLancio.filter(p => p.gestore_interno === c.nome).length})`]), ["__nessuno", `Non assegnate (${tutteInLancio.filter(p => !p.gestore_interno).length})`]].map(([v, l]) => (
          <button key={v || "tutti"} onClick={() => setFPersona(v)}
            style={{
              padding: "5px 12px", fontSize: 11.5, fontWeight: 600,
              border: `1px solid ${fPersona === v ? "var(--black)" : "var(--gl)"}`,
              background: fPersona === v ? "var(--black)" : "var(--white)",
              color: fPersona === v ? "#fff" : "var(--gray)",
            }}>{l}</button>
        ))}
      </div>
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
                    <div onClick={() => onApriScheda && onApriScheda(p)}
                      title="Apri la scheda completa con tutti i documenti"
                      style={{ fontSize: 16, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}
                      onMouseEnter={e => { e.currentTarget.style.color = "var(--gold)"; }}
                      onMouseLeave={e => { e.currentTarget.style.color = "var(--black)"; }}>
                      {p.nome}
                      <span style={{ fontSize: 11, color: "var(--gray)" }}>↗</span>
                    </div>
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
                {/* Assegnazione a chi ci lavora */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--gray)" }}>Assegnata a</span>
                  {attivi.map(c => {
                    const sel = p.gestore_interno === c.nome;
                    return (
                      <button key={c.id} onClick={() => assegna(p, sel ? "" : c.nome)} disabled={busy}
                        title={sel ? "Clic per togliere l'assegnazione" : `Assegna a ${c.nome}${c.ruolo ? " · " + c.ruolo : ""}`}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", fontSize: 11.5, fontWeight: 600,
                          border: `1.5px solid ${sel ? (c.colore || "#94A3B8") : "var(--gl)"}`,
                          background: sel ? (c.colore || "#94A3B8") : "transparent",
                          color: sel ? "#fff" : "var(--gray)",
                        }}>
                        <span style={{ width: 16, height: 16, borderRadius: "50%", background: sel ? "rgba(255,255,255,.25)" : (c.colore || "#94A3B8"), color: "#fff", fontSize: 9, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{c.nome[0]}</span>
                        {c.nome}
                      </button>
                    );
                  })}
                  <button onClick={() => setNuovoColl({ nome: "", ruolo: "" })} title="Aggiungi un collaboratore"
                    style={{ padding: "5px 10px", fontSize: 11.5, fontWeight: 600, border: "1px dashed var(--gl)", background: "transparent", color: "var(--gray)" }}>+ Collaboratore</button>
                  {!p.gestore_interno && <span style={{ fontSize: 11, color: "var(--red)" }}>non assegnata</span>}
                </div>

                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <button className="bg" onClick={() => onEdit && onEdit(p)} disabled={busy}>Compila dati</button>
                  <button className="bg" onClick={() => apriNote(p)} disabled={busy}>
                    📝 Note{p.note ? " ✓" : ""}
                  </button>
                  {(() => {
                    const ts = taskDi(p.id);
                    const aperti = ts.filter(t => t.stato !== "fatto").length;
                    return (
                      <button className="bg" onClick={() => setTaskAperti(taskAperti === p.id ? null : p.id)} disabled={busy}>
                        ☑︎ Task{ts.length ? ` ${ts.length - aperti}/${ts.length}` : ""}
                        {aperti > 0 && <span style={{ marginLeft: 6, background: "var(--red)", color: "#fff", fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 10 }}>{aperti}</span>}
                      </button>
                    );
                  })()}
                  <button className="bp" onClick={() => rendiAttiva(p)} disabled={busy} style={{ marginLeft: "auto" }}>✓ Rendi attiva</button>
                </div>

                {/* Task assegnabili */}
                {taskAperti === p.id && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--cd)" }}>
                    <label style={{ display: "block", fontSize: 10, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--gray)", marginBottom: 8 }}>Task</label>
                    {taskDi(p.id).length === 0 && <div style={{ fontSize: 12, color: "var(--gray)", marginBottom: 8 }}>Nessun task. Aggiungine uno qui sotto.</div>}
                    {taskDi(p.id).sort((a, b) => (a.stato === "fatto" ? 1 : 0) - (b.stato === "fatto" ? 1 : 0)).map(t => {
                      const fatto = t.stato === "fatto";
                      const c = collDi(t.assegnato_a);
                      const scaduto = !fatto && t.scadenza && new Date(t.scadenza) < new Date(new Date().toDateString());
                      return (
                        <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--cd)" }}>
                          <input type="checkbox" checked={fatto} onChange={() => toggleTask(t)} style={{ width: 15, height: 15, accentColor: "var(--gold)", flexShrink: 0 }} />
                          <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, textDecoration: fatto ? "line-through" : "none", color: fatto ? "var(--gray)" : "var(--black)" }}>{t.titolo}</span>
                          {t.assegnato_a && (
                            <span className="tag" style={{ background: (c && c.colore) || "#94A3B8", color: "#fff", borderColor: "transparent" }}>{t.assegnato_a}</span>
                          )}
                          {t.scadenza && <span style={{ fontSize: 10.5, color: scaduto ? "var(--red)" : "var(--gray)", fontWeight: scaduto ? 700 : 400, whiteSpace: "nowrap" }}>{scaduto ? "⚠ " : ""}{t.scadenza}</span>}
                          <button onClick={() => eliminaTask(t)} style={{ background: "none", border: "none", color: "var(--red)", fontSize: 14, padding: "0 4px" }}>×</button>
                        </div>
                      );
                    })}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                      <input value={nuovoTask.titolo} onChange={e => setNuovoTask(v => ({ ...v, titolo: e.target.value }))}
                        onKeyDown={e => { if (e.key === "Enter") aggiungiTask(p); }}
                        placeholder="Nuovo task… (es. Richiedere CIN sul portale)" style={{ flex: "1 1 220px" }} />
                      <select value={nuovoTask.assegnato_a} onChange={e => setNuovoTask(v => ({ ...v, assegnato_a: e.target.value }))} style={{ width: "auto", minWidth: 130 }}>
                        <option value="">{p.gestore_interno ? `${p.gestore_interno} (default)` : "Non assegnato"}</option>
                        {attivi.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}
                      </select>
                      <input type="date" value={nuovoTask.scadenza} onChange={e => setNuovoTask(v => ({ ...v, scadenza: e.target.value }))} style={{ width: "auto", minWidth: 140 }} />
                      <button className="bp" onClick={() => aggiungiTask(p)}>+ Aggiungi</button>
                    </div>
                  </div>
                )}

                {/* Note e descrizioni dell'immobile in lancio */}
                {noteAperte === p.id ? (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--cd)" }}>
                    <label style={{ display: "block", fontSize: 10, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--gray)", marginBottom: 6 }}>
                      Note e descrizione
                    </label>
                    <textarea
                      value={noteDraft}
                      onChange={e => setNoteDraft(e.target.value)}
                      rows={5}
                      placeholder={"Appunti sul lancio: cosa manca, contatti utili, accordi col proprietario, stato lavori, arredo, foto da fare…"}
                      style={{ lineHeight: 1.5 }}
                    />
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                      <button className="bp" onClick={() => salvaNote(p)} disabled={noteSaving}>{noteSaving ? "Salvo…" : "Salva note"}</button>
                      <button className="bg" onClick={() => setNoteAperte(null)}>Chiudi</button>
                      {noteSalvate && <span style={{ fontSize: 11.5, color: "#2d6a4f", fontWeight: 600 }}>✓ Salvate</span>}
                    </div>
                  </div>
                ) : p.note ? (
                  <div onClick={() => apriNote(p)} title="Clicca per modificare le note"
                    style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--cd)", fontSize: 12, color: "var(--gray)", lineHeight: 1.5, whiteSpace: "pre-wrap", cursor: "pointer" }}>
                    {p.note.length > 220 ? p.note.slice(0, 220) + "…" : p.note}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {/* Creazione rapida collaboratore */}
      {nuovoColl && (
        <Modal title="Nuovo collaboratore" onClose={() => setNuovoColl(null)}>
          <FG>
            <FF label="Nome" span={2}>
              <input autoFocus value={nuovoColl.nome} onChange={e => setNuovoColl(v => ({ ...v, nome: e.target.value }))}
                onKeyDown={e => { if (e.key === "Enter") creaCollaboratore(); }} placeholder="es. Giulia" />
            </FF>
            <FF label="Ruolo" span={2}>
              <input value={nuovoColl.ruolo} onChange={e => setNuovoColl(v => ({ ...v, ruolo: e.target.value }))} placeholder="es. Compliance manager, Contabile, Property manager" />
            </FF>
          </FG>
          <p style={{ fontSize: 11.5, color: "var(--gray)", marginTop: 12 }}>
            Il collaboratore comparirà subito tra le persone assegnabili, con un colore assegnato in automatico.
          </p>
          <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
            <button className="bg" onClick={() => setNuovoColl(null)}>Annulla</button>
            <button className="bp" onClick={creaCollaboratore}>Crea collaboratore</button>
          </div>
        </Modal>
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

/* Mandato di gestione: il contratto lo compila il gestionale con i dati che ha già,
   così non si ricopia niente a mano. Il modulo si apre nel valutatore, che sa
   riempire il modello Word. */
const LINGUE_CONTRATTO = [{ cod: "it", nome: "Italiano" }, { cod: "en", nome: "English" }];

/* Carica una libreria esterna una sola volta, quando serve davvero. */
function caricaScript(src) {
  return new Promise((ok, ko) => {
    if ([...document.scripts].some(s => s.src === src)) return ok();
    const s = document.createElement("script");
    s.src = src; s.onload = () => ok(); s.onerror = () => ko(new Error("Libreria non caricata: " + src));
    document.head.appendChild(s);
  });
}

const CDN = {
  zip: "https://unpkg.com/pizzip@3.1.8/dist/pizzip.js",
  docx: "https://unpkg.com/docxtemplater@3.62.2/build/docxtemplater.js",
  pdf: "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
};

const oggiIt = () => new Date().toLocaleDateString("it-IT");
const traTerm = (anni) => { const d = new Date(); d.setFullYear(d.getFullYear() + anni); return d.toLocaleDateString("it-IT"); };

/* Il mandato si compila qui dentro e si scarica: niente pagine intermedie.
   Il modello Word sta in public/, i dati arrivano dalla scheda immobile. */
function GeneraMandato({ p, o }) {
  const [lingua, setLingua] = useState("it");
  const [aperto, setAperto] = useState(false);
  const [busy, setBusy] = useState("");
  const [errore, setErrore] = useState("");
  const [f, setF] = useState(null);

  if (!p) return null;

  const inizializza = () => {
    setErrore("");
    setF({
      // proprietario
      nome: (o && o.nome) || "", cognome: (o && o.cognome) || "", cf: (o && o.codice_fiscale) || "",
      luogo_nascita: "", data_nascita: "",
      residenza: o ? [o.indirizzo, o.citta].filter(Boolean).join(", ") : "",
      telefono: (o && o.telefono) || "", email: (o && o.email) || "",
      // immobile
      tipo_immobile: "Appartamento",
      indirizzo_immobile: p.indirizzo || "", comune_immobile: p.citta || "", provincia_immobile: p.provincia || "",
      foglio: p.catasto_foglio || "", particella: p.catasto_mappale || "", subalterno: p.catasto_sub || "",
      categoria_catastale: p.categoria_catastale || "", superficie: p.mq || "", rendita_catastale: "",
      // contratto
      percentuale_commissione: p.commissione != null ? String(p.commissione) : "20",
      data_inizio: oggiIt(), data_fine: traTerm(2),
      budget_interventi: "70", budget_interventi_lettere: "settanta",
      max_ospiti: p.posti_letto ? String(p.posti_letto) : "6",
      giorni_uso_proprietario: "30",
    });
    setAperto(true);
  };

  const campo = (k, v) => setF(x => ({ ...x, [k]: v }));

  // Riempie il modello Word e restituisce lo zip pronto
  const componi = async () => {
    await caricaScript(CDN.zip);
    await caricaScript(CDN.docx);
    const file = lingua === "it" ? "/template.docx" : `/template-${lingua}.docx`;
    const r = await fetch(file);
    const tipo = r.headers.get("content-type") || "";
    if (!r.ok || tipo.includes("html")) {
      const nome = (LINGUE_CONTRATTO.find(l => l.cod === lingua) || {}).nome || lingua;
      throw new Error(`Manca il modello di contratto in ${nome}. Per ora puoi generarlo in italiano.`);
    }
    const zip = new window.PizZip(await r.arrayBuffer());
    const doc = new window.docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
    doc.render({
      proprietari: [{
        nome: f.nome, cognome: f.cognome, cf: f.cf, luogo_nascita: f.luogo_nascita,
        data_nascita: f.data_nascita, residenza: f.residenza, telefono: f.telefono, email: f.email, sep: ". ",
      }],
      tipo_immobile: f.tipo_immobile, indirizzo_immobile: f.indirizzo_immobile,
      comune_immobile: f.comune_immobile, provincia_immobile: f.provincia_immobile,
      foglio: f.foglio, particella: f.particella, subalterno: f.subalterno,
      categoria_catastale: f.categoria_catastale, superficie: f.superficie, rendita_catastale: f.rendita_catastale,
      percentuale_commissione: f.percentuale_commissione, data_inizio: f.data_inizio, data_fine: f.data_fine,
      budget_interventi: f.budget_interventi, budget_interventi_lettere: f.budget_interventi_lettere,
      max_ospiti: f.max_ospiti, giorni_uso_proprietario: f.giorni_uso_proprietario,
    });
    return doc.getZip();
  };

  const nomeFile = (est) => {
    const chi = (f.cognome || p.nome || "mandato").replace(/[^a-zA-Z0-9]/g, "_");
    return `Mandato_Valente_Living_${chi}_${oggiIt().replace(/\//g, "-")}.${est}`;
  };

  const scarica = (blob, nome) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = nome;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  };

  const faiWord = async () => {
    setBusy("word"); setErrore("");
    try {
      const zip = await componi();
      scarica(zip.generate({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", compression: "DEFLATE" }), nomeFile("docx"));
    } catch (e) { setErrore(e.message); }
    setBusy("");
  };

  const faiPdf = async () => {
    setBusy("pdf"); setErrore("");
    try {
      const zip = await componi();
      await caricaScript(CDN.pdf);
      // Dal Word compilato prendo il testo, paragrafo per paragrafo, e lo impagino
      const xml = zip.file("word/document.xml").asText();
      const paragrafi = xml.split(/<\/w:p>/)
        .map(b => b.replace(/<w:tab[^>]*\/>/g, "\t").replace(/<[^>]+>/g, ""))
        .map(s => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim());
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ unit: "mm", format: "a4" });
      const margine = 18, larghezza = 210 - margine * 2, fondo = 297 - margine;
      let y = margine;
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(10);
      paragrafi.forEach(par => {
        if (!par) { y += 3; return; }
        const righe = pdf.splitTextToSize(par, larghezza);
        righe.forEach(riga => {
          if (y > fondo) { pdf.addPage(); y = margine; }
          pdf.text(riga, margine, y); y += 5;
        });
        y += 2;
      });
      pdf.save(nomeFile("pdf"));
    } catch (e) { setErrore(e.message); }
    setBusy("");
  };

  return (
    <div style={{ marginTop: 20, background: "var(--cream)", border: "1px solid var(--gl)", borderRadius: 10, padding: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>📄 Mandato di gestione</div>
      <p style={{ fontSize: 11, color: "var(--gray)", marginBottom: 10, lineHeight: 1.5 }}>
        Precompilato con i dati dell'immobile{o ? " e del proprietario" : ""}: completi le poche righe mancanti e scarichi.
        {!o && <> Collega prima un proprietario per riempire anche la sua parte.</>}
      </p>

      {!aperto ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select value={lingua} onChange={e => setLingua(e.target.value)} style={{ width: "auto", minWidth: 120 }}>
            {LINGUE_CONTRATTO.map(l => <option key={l.cod} value={l.cod}>{l.nome}</option>)}
          </select>
          <button className="bp" onClick={inizializza} style={{ fontSize: 12 }}>Prepara mandato</button>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--gray)", margin: "10px 0 6px" }}>Proprietario</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8 }}>
            <label style={{ fontSize: 10.5, color: "var(--gray)" }}>Nome<input value={f.nome} onChange={e => campo("nome", e.target.value)} style={{ width: "100%", marginTop: 3 }} /></label>
            <label style={{ fontSize: 10.5, color: "var(--gray)" }}>Cognome<input value={f.cognome} onChange={e => campo("cognome", e.target.value)} style={{ width: "100%", marginTop: 3 }} /></label>
            <label style={{ fontSize: 10.5, color: "var(--gray)" }}>Codice fiscale<input value={f.cf} onChange={e => campo("cf", e.target.value)} style={{ width: "100%", marginTop: 3 }} /></label>
            <label style={{ fontSize: 10.5, color: "var(--gray)" }}>Luogo di nascita<input value={f.luogo_nascita} onChange={e => campo("luogo_nascita", e.target.value)} style={{ width: "100%", marginTop: 3 }} /></label>
            <label style={{ fontSize: 10.5, color: "var(--gray)" }}>Data di nascita<input value={f.data_nascita} onChange={e => campo("data_nascita", e.target.value)} placeholder="gg/mm/aaaa" style={{ width: "100%", marginTop: 3 }} /></label>
            <label style={{ fontSize: 10.5, color: "var(--gray)" }}>Residenza<input value={f.residenza} onChange={e => campo("residenza", e.target.value)} style={{ width: "100%", marginTop: 3 }} /></label>
          </div>

          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--gray)", margin: "12px 0 6px" }}>Immobile e catasto</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8 }}>
            <label style={{ fontSize: 10.5, color: "var(--gray)" }}>Tipo<input value={f.tipo_immobile} onChange={e => campo("tipo_immobile", e.target.value)} style={{ width: "100%", marginTop: 3 }} /></label>
            <label style={{ fontSize: 10.5, color: "var(--gray)" }}>Indirizzo<input value={f.indirizzo_immobile} onChange={e => campo("indirizzo_immobile", e.target.value)} style={{ width: "100%", marginTop: 3 }} /></label>
            <label style={{ fontSize: 10.5, color: "var(--gray)" }}>Comune<input value={f.comune_immobile} onChange={e => campo("comune_immobile", e.target.value)} style={{ width: "100%", marginTop: 3 }} /></label>
            <label style={{ fontSize: 10.5, color: "var(--gray)" }}>Foglio<input value={f.foglio} onChange={e => campo("foglio", e.target.value)} style={{ width: "100%", marginTop: 3 }} /></label>
            <label style={{ fontSize: 10.5, color: "var(--gray)" }}>Particella<input value={f.particella} onChange={e => campo("particella", e.target.value)} style={{ width: "100%", marginTop: 3 }} /></label>
            <label style={{ fontSize: 10.5, color: "var(--gray)" }}>Subalterno<input value={f.subalterno} onChange={e => campo("subalterno", e.target.value)} style={{ width: "100%", marginTop: 3 }} /></label>
            <label style={{ fontSize: 10.5, color: "var(--gray)" }}>Categoria<input value={f.categoria_catastale} onChange={e => campo("categoria_catastale", e.target.value)} style={{ width: "100%", marginTop: 3 }} /></label>
            <label style={{ fontSize: 10.5, color: "var(--gray)" }}>Superficie (mq)<input value={f.superficie} onChange={e => campo("superficie", e.target.value)} style={{ width: "100%", marginTop: 3 }} /></label>
            <label style={{ fontSize: 10.5, color: "var(--gray)" }}>Rendita catastale<input value={f.rendita_catastale} onChange={e => campo("rendita_catastale", e.target.value)} style={{ width: "100%", marginTop: 3 }} /></label>
          </div>

          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--gray)", margin: "12px 0 6px" }}>Condizioni</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8 }}>
            <label style={{ fontSize: 10.5, color: "var(--gray)" }}>Provvigione (%)<input value={f.percentuale_commissione} onChange={e => campo("percentuale_commissione", e.target.value)} style={{ width: "100%", marginTop: 3 }} /></label>
            <label style={{ fontSize: 10.5, color: "var(--gray)" }}>Max ospiti<input value={f.max_ospiti} onChange={e => campo("max_ospiti", e.target.value)} style={{ width: "100%", marginTop: 3 }} /></label>
            <label style={{ fontSize: 10.5, color: "var(--gray)" }}>Data inizio<input value={f.data_inizio} onChange={e => campo("data_inizio", e.target.value)} style={{ width: "100%", marginTop: 3 }} /></label>
            <label style={{ fontSize: 10.5, color: "var(--gray)" }}>Data fine<input value={f.data_fine} onChange={e => campo("data_fine", e.target.value)} style={{ width: "100%", marginTop: 3 }} /></label>
            <label style={{ fontSize: 10.5, color: "var(--gray)" }}>Budget interventi (€)<input value={f.budget_interventi} onChange={e => campo("budget_interventi", e.target.value)} style={{ width: "100%", marginTop: 3 }} /></label>
            <label style={{ fontSize: 10.5, color: "var(--gray)" }}>…in lettere<input value={f.budget_interventi_lettere} onChange={e => campo("budget_interventi_lettere", e.target.value)} style={{ width: "100%", marginTop: 3 }} /></label>
            <label style={{ fontSize: 10.5, color: "var(--gray)" }}>Giorni uso proprietario<input value={f.giorni_uso_proprietario} onChange={e => campo("giorni_uso_proprietario", e.target.value)} style={{ width: "100%", marginTop: 3 }} /></label>
            <label style={{ fontSize: 10.5, color: "var(--gray)" }}>Lingua
              <select value={lingua} onChange={e => setLingua(e.target.value)} style={{ width: "100%", marginTop: 3 }}>
                {LINGUE_CONTRATTO.map(l => <option key={l.cod} value={l.cod}>{l.nome}</option>)}
              </select>
            </label>
          </div>

          {errore && <div style={{ fontSize: 11.5, color: "var(--red)", marginTop: 10 }}>{errore}</div>}

          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            <button className="bp" onClick={faiWord} disabled={!!busy} style={{ fontSize: 12 }}>
              {busy === "word" ? "Preparo…" : "⬇ Scarica Word"}
            </button>
            <button className="bg" onClick={faiPdf} disabled={!!busy} style={{ fontSize: 12 }}>
              {busy === "pdf" ? "Preparo…" : "⬇ Scarica PDF"}
            </button>
            <button className="bg" onClick={() => setAperto(false)} style={{ fontSize: 12, marginLeft: "auto" }}>Chiudi</button>
          </div>
          <p style={{ fontSize: 10, color: "var(--gray)", marginTop: 8, lineHeight: 1.5 }}>
            Il Word mantiene l'impaginazione originale del contratto. Il PDF è la stessa versione compilata,
            impaginata in modo semplice: usalo per invio e archiviazione, il Word se devi ancora ritoccare qualcosa.
          </p>
        </>
      )}
    </div>
  );
}

/* Un immobile appena entrato resta in evidenza per una settimana: il tempo di
   accorgersene, assegnarlo e far partire la pratica. */
const GIORNI_NOVITA = 7;
function appenaArrivata(p) {
  if (!p || !p.created_at) return false;
  return (Date.now() - new Date(p.created_at).getTime()) < GIORNI_NOVITA * 86400000;
}

const PropRow = ({ p, o, onClick, gestori = [], coloreGestore, onAssegna }) => (
  <div className="fi" onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "var(--white)", border: "1px solid var(--gl)", borderRadius: 12, boxShadow: "var(--shadow)", cursor: "pointer" }}
    onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--gold)"; }} onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--gl)"; }}>
    <span style={{ width: 9, height: 9, borderRadius: "50%", background: STATI_COLOR[p.stato] || "#ccc", flexShrink: 0 }} title={p.stato} />
    <div style={{ flex: 2, minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {p.nome}
        {appenaArrivata(p) && (
          <span title={`Aggiunta ${new Date(p.created_at).toLocaleDateString("it-IT")}${p.agente ? ` da ${p.agente}` : ""}`}
            style={{ marginLeft: 8, fontSize: 9, fontWeight: 700, letterSpacing: ".06em", padding: "2px 7px", borderRadius: 99, background: "#DCFCE7", color: "#166534", verticalAlign: "middle" }}>
            NUOVA
          </span>
        )}
      </div>
      <div style={{ fontSize: 11, color: "var(--gray)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.indirizzo}{p.citta ? `, ${p.citta}` : ""}{p.provincia ? ` (${p.provincia})` : ""}</div>
    </div>

    {/* Proprietario */}
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 11.5, color: "var(--black)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o ? `${o.cognome} ${o.nome}` : "—"}</div>
      <div style={{ fontSize: 10, color: "var(--gray)" }}>proprietario</div>
    </div>

    {/* Codici e posti letto */}
    <div style={{ width: 120, flexShrink: 0, minWidth: 0 }}>
      <div style={{ fontSize: 10.5, fontFamily: "monospace", color: p.cin ? "var(--gray)" : "var(--red)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {p.cin ? p.cin : "CIN mancante"}
      </div>
      <div style={{ fontSize: 10, color: "var(--gray)" }}>
        {[p.posti_letto && `${p.posti_letto} letti`, p.camere && `${p.camere} cam`].filter(Boolean).join(" · ") || "—"}
      </div>
    </div>

    {/* Gestore: assegnabile al volo */}
    <div style={{ width: 130, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
      <select
        value={p.gestore_interno || ""}
        onChange={e => onAssegna && onAssegna(p, e.target.value)}
        title="Assegna il property manager"
        style={{
          fontSize: 11, padding: "5px 8px", borderRadius: 8,
          borderColor: p.gestore_interno ? (coloreGestore ? coloreGestore(p.gestore_interno) : "var(--gl)") : "#FBCFE0",
          color: p.gestore_interno ? "var(--black)" : "var(--red)",
          fontWeight: p.gestore_interno ? 600 : 400,
        }}>
        <option value="">Non assegnato</option>
        {gestori.map(g => <option key={g} value={g}>{g}</option>)}
      </select>
    </div>

    <div style={{ width: 46, textAlign: "right", fontSize: 11, color: "var(--gray)", flexShrink: 0 }}>{p.commissione ? `${p.commissione}%` : "—"}</div>
    <div style={{ width: 120, textAlign: "right", flexShrink: 0, display: "flex", justifyContent: "flex-end", gap: 6, alignItems: "center" }}>
      <SB stato={p.stato} />
    </div>
  </div>
);

const OwnerRow = ({ o, pc, props = [], onClick, onApriProp }) => (
  <div className="fi" onClick={onClick} style={{ padding: "10px 14px", background: "var(--white)", border: "1px solid var(--gl)", borderRadius: 12, boxShadow: "var(--shadow)", cursor: "pointer" }}
    onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--gold)"; }} onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--gl)"; }}>
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 30, height: 30, background: "var(--black)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><span style={{ fontFamily: "Inter", fontSize: 11, fontWeight: 700, color: "var(--gold)" }}>{o.cognome?.[0]}{o.nome?.[0]}</span></div>
      <div style={{ flex: "1.4 1 0", minWidth: 0, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.cognome} {o.nome}</div>
      <div style={{ flex: "1 1 0", minWidth: 0, fontSize: 11, fontFamily: "monospace", letterSpacing: ".04em", color: "var(--gray)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.codice_fiscale || "—"}</div>
      <div style={{ flex: "1.3 1 0", minWidth: 0, fontSize: 12, color: "var(--gray)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.email || "—"}</div>
      <div style={{ width: 125, fontSize: 12, color: "var(--gray)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0 }}>{o.telefono || "—"}</div>
      <div style={{ width: 110, fontSize: 12, color: "var(--gray)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0 }}>{o.citta || "—"}</div>
      <span className="tag" style={{ flexShrink: 0, background: pc ? "#EEF2FF" : "var(--cd)", color: pc ? "#4F46E5" : "var(--gray)" }}>{pc === 0 ? "nessun immobile" : `${pc} immobil${pc === 1 ? "e" : "i"}`}</span>
    </div>
    {/* Appartamenti del proprietario: cliccabili singolarmente */}
    {props.length > 0 && (
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, paddingLeft: 42 }}>
        {props.map(p => (
          <span key={p.id}
            onClick={e => { e.stopPropagation(); onApriProp && onApriProp(p); }}
            title={`${p.nome} · ${p.citta || ""} · ${p.stato || ""}${p.cin ? "" : " · CIN mancante"}`}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, padding: "3px 9px", borderRadius: 7,
              background: "var(--cream)", border: "1px solid var(--gl)", color: "var(--black)",
            }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: STATI_COLOR[p.stato] || "#888", flexShrink: 0 }} />
            {p.nome}
            {!p.cin && <span style={{ color: "var(--red)", fontWeight: 700 }} title="CIN mancante">!</span>}
          </span>
        ))}
      </div>
    )}
  </div>
);

// Macro-categorie documenti: qualificano gli allegati in base al nome file
const DOC_CATEGORIE = [
  { id: "cu", label: "Certificazioni Uniche", icon: "📄", color: "#2d6a4f", match: /\b(cu|certificazione\s*unica|certificazioni\s*uniche)\b|_cu_|cu20\d\d/i },
  { id: "cin", label: "CIN / CIR / Codici", icon: "🔢", color: "#8b5cf6", match: /\b(cin|cir|ross\s*1000|geis|codice\s*identificativo)\b/i },
  { id: "mandato", label: "Mandati / Incarichi", icon: "✍️", color: "#1d6fa4", match: /\b(mandat|incaric|contratt|procura)\w*/i },
  { id: "planimetria", label: "Planimetrie", icon: "📐", color: "#0891b2", match: /\b(planimetr|piantina|disegno|layout)\w*/i },
  { id: "catasto", label: "Visure / Catasto", icon: "🗂️", color: "#e07b39", match: /\b(visur|catast|atto|rogito|ape|certificazione\s*energetica)\w*/i },
  { id: "anagrafica", label: "Documenti d'identità / Anagrafica", icon: "🪪", color: "#b8860b", match: /\b(carta\s*identit|ci\b|passaport|patente|codice\s*fiscale|cf\b|tessera|anagraf)\w*/i },
  { id: "scia", label: "SCIA / Comune", icon: "🏛️", color: "#6366F1", match: /\b(scia|suap|comune|protocoll|asseverazione)\w*/i },
  { id: "altro", label: "Altri documenti", icon: "📎", color: "#888", match: /.*/ },
];
function categoriaDoc(nome) {
  const n = (nome || "").toLowerCase();
  for (const c of DOC_CATEGORIE) { if (c.id !== "altro" && c.match.test(n)) return c; }
  return DOC_CATEGORIE[DOC_CATEGORIE.length - 1];
}

function Allegati({ proprietaId, proprietarioId, linkProprietarioId, proprietaIds, etichette }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState("");
  const [descrivendo, setDescrivendo] = useState(null); // { fatti, totale } durante la descrizione automatica
  const fileRef = useRef(null);
  const backfillFatto = useRef(false);

  const idsKey = (proprietaIds || []).join(",");
  const carica = useCallback(async () => {
    setLoading(true); setErr("");
    backfillFatto.current = false; // riabilita un giro di descrizione automatica ad ogni (ri)caricamento
    const ids = idsKey ? idsKey.split(",") : [];
    // Quali "caselle" interrogare: se è un immobile solo lui; se è un proprietario, lui + tutti i suoi immobili
    const targets = [];
    if (proprietaId) {
      targets.push({ proprieta_id: proprietaId });
      // Includi anche i documenti del proprietario collegato (es. carta d'identità, CF)
      if (linkProprietarioId) targets.push({ proprietario_id: linkProprietarioId });
    } else if (proprietarioId) {
      targets.push({ proprietario_id: proprietarioId });
      ids.forEach((pid) => targets.push({ proprieta_id: pid }));
    }
    try {
      const results = await Promise.all(targets.map((t) =>
        fetch("/.netlify/functions/allegati", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "list", token: auth.token(), ...t }),
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

  // Descrizione automatica del documento (PDF/immagine): l'AI genera una frase + parole chiave
  const descrivi = async (f, data) => {
    try {
      const r = await fetch("/.netlify/functions/allegati", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "describe", token: auth.token(), id: f.id, path: f.path, tipo: f.tipo, nome_file: f.nome_file, data }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.file) setFiles(fs => fs.map(x => x.id === f.id ? { ...x, ...d.file } : x));
    } catch { /* silenzioso */ }
  };

  // Backfill: descrive i documenti della proprietà che ancora non hanno una descrizione
  useEffect(() => {
    if (loading || backfillFatto.current || descrivendo) return;
    if (!files.some(f => !f.ai_stato)) return;
    backfillFatto.current = true;
    (async () => {
      const daFare = files.filter(f => !f.ai_stato);
      setDescrivendo({ fatti: 0, totale: daFare.length });
      for (let i = 0; i < daFare.length; i++) {
        await descrivi(daFare[i]);
        setDescrivendo({ fatti: i + 1, totale: daFare.length });
      }
      setDescrivendo(null);
    })();
  }, [files, loading, descrivendo]);

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
          body: JSON.stringify({ action: "upload", token: auth.token(), nome_file: file.name, tipo: file.type, data: base64, ...target }),
        });
        if (!r.ok) falliti.push(file.name);
        else { const dd = await r.json().catch(() => ({})); if (dd.file) await descrivi(dd.file, base64); }
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
        body: JSON.stringify({ action: "sign", token: auth.token(), path }),
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
        body: JSON.stringify({ action: "delete", token: auth.token(), id: f.id, path: f.path }),
      });
      if (r.ok) await carica();
      else { const d = await r.json(); setErr(d.error || "Eliminazione fallita."); }
    } catch { setErr("Eliminazione fallita."); }
  };

  return (
    <div
      style={{ marginTop: 24, border: dragOver ? "2px dashed var(--gold)" : "2px dashed transparent", padding: dragOver ? 10 : 0, background: dragOver ? "rgba(99,102,241,.06)" : "transparent", transition: "all .12s" }}
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
      {descrivendo && <div style={{ fontSize: 11, color: "var(--gold)", fontWeight: 600, marginBottom: 8 }}>✨ Descrivo i documenti… {descrivendo.fatti}/{descrivendo.totale}</div>}
      {err && <div style={{ fontSize: 12, color: "var(--red)", marginBottom: 8 }}>{err}</div>}
      {loading ? (
        <p style={{ fontSize: 12, color: "var(--gray)" }}>Caricamento…</p>
      ) : files.length === 0 ? (
        <p style={{ fontSize: 12, color: "var(--gray)" }}>Nessun allegato. Trascina qui i file (anche più di uno) oppure usa "+ Carica file".</p>
      ) : (
        DOC_CATEGORIE.map(cat => {
          const elenco = files.filter(f => categoriaDoc(f.nome_file).id === cat.id);
          if (elenco.length === 0) return null;
          return (
            <div key={cat.id} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 12 }}>{cat.icon}</span>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: cat.color }}>{cat.label}</span>
                <span style={{ fontSize: 10, color: "var(--gray)", background: "var(--cd)", padding: "0 6px", borderRadius: 10 }}>{elenco.length}</span>
                <div style={{ flex: 1, height: 1, background: "var(--gl)" }} />
              </div>
              {elenco.map(f => (
                <div key={f.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 10px", background: "var(--white)", border: "1px solid var(--gl)", borderRadius: 12, boxShadow: "var(--shadow)", borderLeft: `3px solid ${cat.color}`, marginBottom: 6 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, wordBreak: "break-all" }}>{f.nome_file}</div>
                    {(() => {
                      // Etichetta di provenienza: da quale appartamento o proprietario arriva il documento
                      if (!etichette) return null;
                      const nomeP = f.proprieta_id && etichette.prop && etichette.prop[String(f.proprieta_id)];
                      const nomeO = !f.proprieta_id && f.proprietario_id && etichette.own && etichette.own[String(f.proprietario_id)];
                      const testo = nomeP ? `🏠 ${nomeP}` : nomeO ? `👤 ${nomeO}` : null;
                      if (!testo) return null;
                      return <span className="tag" style={{ marginTop: 4, background: nomeP ? "#EEF2FF" : "#FEF3C7", color: nomeP ? "#4F46E5" : "#92400E", borderColor: "transparent" }}>{testo}</span>;
                    })()}
                    {f.ai_descrizione && <div style={{ fontSize: 11, color: "var(--gray)", marginTop: 2 }}><span style={{ color: "var(--gold)" }} title="Descrizione generata dall'AI">✨</span> {f.ai_descrizione}</div>}
                  </div>
                  <button onClick={() => apri(f.path)} style={{ background: "none", border: "none", color: "var(--gold)", fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>Apri</button>
                  <button onClick={() => elimina(f)} style={{ background: "none", border: "none", color: "var(--red)", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }}>Elimina</button>
                </div>
              ))}
            </div>
          );
        })
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
          body: JSON.stringify({ action: "upload", token: auth.token(), proprieta_id, proprietario_id, nome_file: row.file.name, tipo: row.file.type, data: row.file.data }),
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
        style={{ border: dragOver ? "2px dashed var(--gold)" : "2px dashed var(--gl)", background: dragOver ? "rgba(99,102,241,.06)" : "var(--white)", padding: 36, textAlign: "center", cursor: "pointer", transition: "all .12s" }}
      >
        <input ref={fileRef} type="file" multiple style={{ display: "none" }} onChange={(e) => { aggiungiFiles(e.target.files); e.target.value = ""; }} />
        <p style={{ fontSize: 14, fontWeight: 600, color: dragOver ? "var(--gold)" : "var(--black)" }}>{dragOver ? "Rilascia qui i documenti" : "Trascina qui i documenti o clicca per selezionarli"}</p>
        <p style={{ fontSize: 12, color: "var(--gray)", marginTop: 6 }}>PDF o immagini, fino a 4 MB ciascuno. Puoi caricarne più di uno.</p>
      </div>

      {nota && <div style={{ fontSize: 12, color: "var(--red)", marginTop: 12 }}>{nota}</div>}

      {rows.length > 0 && (
        <div style={{ marginTop: 24 }}>
          {rows.map(row => (
            <div key={row.rid} style={{ background: "var(--white)", border: "1px solid var(--gl)", borderRadius: 12, boxShadow: "var(--shadow)", padding: 14, marginBottom: 10 }}>
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
function MappaItalia({ proprieta, compact = false, onApri }) {
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
      dots.push({ x: bx + ox, y: by + oy, color: sub ? "#6366F1" : "#2d6a4f", name: p.nome, citta: p.citta || "", tipo: sub ? "sublocazione" : "gestione", attivo: p.stato === "attivo" });
    });
  });
  const nGest = (proprieta || []).filter((p) => p.tipo_contratto !== "sublocazione").length;
  const nSub = (proprieta || []).filter((p) => p.tipo_contratto === "sublocazione").length;

  const perCitta = {};
  (proprieta || []).forEach((p) => { const c = (p.citta || "—").trim() || "—"; perCitta[c] = (perCitta[c] || 0) + 1; });
  const cittaList = Object.entries(perCitta).sort((a, b) => b[1] - a[1]);

  if (compact) {
    return (
      <div className="card" onClick={onApri} style={{ padding: 16, cursor: onApri ? "pointer" : "default" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--gold)" }}>Mappa portfolio</p>
          <span style={{ fontSize: 11, color: "var(--gray)" }}>{(proprieta || []).length} immobili</span>
        </div>
        <svg viewBox={ITALY_VB} style={{ width: "100%", height: "auto", maxHeight: 320 }}>
          {ITALY.map((r) => (
            <path key={r.n} d={r.d} fill="#f4f0e9" stroke="#cdbfa6" strokeWidth="0.8" strokeLinejoin="round"><title>{r.n}</title></path>
          ))}
          {dots.map((d, i) => (
            <circle key={i} cx={d.x} cy={d.y} r="5" fill={d.color} stroke="#fff" strokeWidth="1.2" opacity={d.attivo ? 1 : 0.55}>
              <title>{d.name}{d.citta ? " — " + d.citta : ""} ({d.tipo})</title>
            </circle>
          ))}
        </svg>
        <div style={{ display: "flex", gap: 16, marginTop: 8, justifyContent: "center" }}>
          <span style={{ fontSize: 11, color: "var(--gray)", display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: "50%", background: "#2d6a4f" }} />Gestione {nGest}</span>
          <span style={{ fontSize: 11, color: "var(--gray)", display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: "50%", background: "#6366F1" }} />Subloc. {nSub}</span>
        </div>
      </div>
    );
  }

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
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 12, height: 12, borderRadius: "50%", background: "#6366F1", display: "inline-block" }} /><span style={{ fontSize: 13 }}>Sublocazione <strong>({nSub})</strong></span></div>
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

/* ============ SEZIONE GESTIONE: dashboard direzionale + import Krossbooking ============ */
let _xlsxPromise = null;
const loadXLSX = () => _xlsxPromise || (_xlsxPromise = new Promise((res, rej) => {
  if (window.XLSX) return res(window.XLSX);
  const s = document.createElement("script");
  s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
  s.onload = () => res(window.XLSX);
  s.onerror = () => { _xlsxPromise = null; rej(new Error("cdn")); };
  document.head.appendChild(s);
}));
const EURO = (n) => "€ " + Math.round(n || 0).toLocaleString("it-IT");
const DG_num = (v) => { if (v === null || v === undefined || v === "") return null; if (typeof v === "number") return v; const n = parseFloat(String(v).replace(/\./g, "").replace(",", ".")); return isNaN(n) ? null : n; };
const DG_date = (v) => { if (!v) return null; if (v instanceof Date) return v.toISOString().slice(0, 10); const s = String(v).trim(); const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/); if (m) return `${m[3]}-${m[2]}-${m[1]}`; return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null; };
const DG_ts = (v) => { if (!v) return null; if (v instanceof Date) return v.toISOString(); const s = String(v).trim(); const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}:\d{2}(:\d{2})?)/); if (m) return `${m[3]}-${m[2]}-${m[1]}T${m[4]}`; if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.replace(" ", "T"); const d = DG_date(v); return d ? d + "T00:00:00" : null; };
const DG_map = (r) => ({
  id: parseInt(r["ID"]), numero: r["Numero"] || null, check_in: DG_date(r["Check in"]), check_out: DG_date(r["Check-out"]),
  notti: DG_num(r["Notti"]), n_camere: DG_num(r["N. Camere"]), camere: r["Camere"] || null, ospiti: DG_num(r["Ospiti"]),
  email: r["Email"] || null, telefono: r["Telefono"] ? String(r["Telefono"]) : null, canale: r["Canale"] || null,
  codice_ota: r["Codice OTA"] ? String(r["Codice OTA"]) : null, riferimento: r["Riferimento"] || null, stato: r["Stato"] || null,
  data_inserimento: DG_ts(r["Data inserimento"]), data_cancellazione: DG_ts(r["Data cancellazione"]),
  addebiti: DG_num(r["Addebiti"]), addebito_soggiorno: DG_num(r["Addebito soggiorno"]), tassa_soggiorno: DG_num(r["Addebito tassa di soggiorno"]),
  altri_addebiti: DG_num(r["Altri addebiti"]), da_pagare: DG_num(r["Da pagare"]), pagato: DG_num(r["Pagato"]),
  nazione: r["Nazione"] || null, lingua: r["Lingua"] || null, commissioni_ota: DG_num(r["Commissioni"]),
  proprietario: r["Proprietario"] || null, quota_proprietario: DG_num(r["Quota Proprietario"]), quota_pm: DG_num(r["Quota PM"]),
  ota_account: r["OTA account"] || null, metodo_acquisizione: r["Metodo acquisizione"] || null, inserito_da: r["Inserito da"] || null,
  note: r["Note"] || null, updated_at: new Date().toISOString(),
});

function ImportKross({ onDone, compact }) {
  const [rows, setRows] = useState([]); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const onFile = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    let XLSX; try { XLSX = await loadXLSX(); } catch (_) { setMsg("⚠️ Libreria Excel non raggiungibile: controlla la connessione e riprova."); return; }
    const wb = XLSX.read(await f.arrayBuffer(), { cellDates: true });
    const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
    const mapped = data.map(DG_map).filter((r) => Number.isInteger(r.id));
    setRows(mapped); setMsg(`${mapped.length} prenotazioni lette dal file — pronte per l'import.`);
  };
  const go = async () => {
    setBusy(true); let ok = 0, err = 0;
    for (let i = 0; i < rows.length; i += 400) {
      const batch = rows.slice(i, i + 400);
      const r = await fetch(`${SUPABASE_URL}/rest/v1/prenotazioni?on_conflict=id`, {
        method: "POST", body: JSON.stringify(batch),
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      });
      if (r.ok) ok += batch.length; else { err += batch.length; console.error(await r.text()); }
      setMsg(`Importazione… ${Math.min(i + 400, rows.length)}/${rows.length}`);
    }
    setMsg(err ? `⚠️ ${ok} importate, ${err} errori (vedi console)` : `✅ ${ok} prenotazioni importate/aggiornate.`);
    setBusy(false); setRows([]); onDone && onDone();
  };
  return (
    <div style={{ background: "#fff", border: "1px solid var(--gl)", padding: compact ? 18 : 32, marginBottom: 24 }}>
      {!compact && <h3 style={{ marginBottom: 6 }}>Importa prenotazioni Krossbooking</h3>}
      <div style={{ fontSize: 12, color: "var(--gray)", marginBottom: 12 }}>Krossbooking → Prenotazioni → Esporta Excel, poi carica qui il file. Le prenotazioni esistenti vengono aggiornate, mai duplicate.</div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <input type="file" accept=".xlsx" onChange={onFile} disabled={busy} style={{ width: "auto" }} />
        {rows.length > 0 && <button className="bp" onClick={go} disabled={busy}>{busy ? "Importazione…" : `Importa ${rows.length}`}</button>}
      </div>
      {msg && <div style={{ marginTop: 10, fontSize: 13, fontWeight: 500 }}>{msg}</div>}
    </div>
  );
}

function DashboardGestione() {
  const [rows, setRows] = useState(null); const [ov, setOv] = useState([]);
  const [anno, setAnno] = useState("tutti"); const [regime, setRegime] = useState("tutti"); const [showImp, setShowImp] = useState(false);
  const load = useCallback(async () => {
    let all = [], off = 0;
    while (true) {
      const { data, ok } = await sb.get("v_prenotazioni_ripartizione", `?select=*&order=check_in.asc&limit=1000&offset=${off}`);
      if (!ok || !Array.isArray(data)) break;
      all = all.concat(data); if (data.length < 1000) break; off += 1000;
    }
    setRows(all);
    const o = await sb.get("v_sovrapposizioni", "?select=*&limit=20"); setOv(Array.isArray(o.data) ? o.data : []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const att = useMemo(() => (rows || []).filter((r) => !r.is_cancellata &&
    (anno === "tutti" || (r.check_in || "").startsWith(anno)) &&
    (regime === "tutti" || (regime === "sub" ? r.is_sublocazione : !r.is_sublocazione))), [rows, anno, regime]);

  const D = useMemo(() => {
    if (!att.length) return null;
    const ric = (r) => (r.addebiti || 0) - (r.tassa_soggiorno || 0);
    const sum = (a, f) => a.reduce((s, r) => s + (f(r) || 0), 0);
    const gest = att.filter((r) => !r.is_sublocazione), sub = att.filter((r) => r.is_sublocazione);
    const qpm = sum(gest, (r) => r.quota_pm), notti = sum(att, (r) => r.notti);
    const mesi = {}; att.forEach((r) => { const m = (r.check_in || "").slice(0, 7); if (!m) return; mesi[m] = mesi[m] || { g: 0, s: 0 }; mesi[m][r.is_sublocazione ? "s" : "g"] += ric(r); });
    const apps = {}; att.forEach((r) => { const k = r.proprieta_nome || r.camere || "?"; const a = (apps[k] = apps[k] || { nome: k, citta: r.proprieta_citta || "—", sub: r.is_sublocazione, n: 0, notti: 0, ric: 0, qpm: 0, qprop: 0 }); a.n++; a.notti += r.notti || 0; a.ric += ric(r); a.qpm += r.quota_pm || 0; a.qprop += r.quota_proprietario || 0; });
    const can = {}; (rows || []).forEach((r) => { const c = r.canale || "—"; const x = (can[c] = can[c] || { n: 0, canc: 0, ric: 0, comm: 0 }); x.n++; if (r.is_cancellata) x.canc++; else { x.ric += ric(r); x.comm += r.commissioni_ota || 0; } });
    return {
      nAtt: att.length, nCanc: (rows || []).filter((r) => r.is_cancellata).length,
      ric: sum(att, ric), ricSub: sum(sub, ric), qpm, notti, adr: notti ? sum(att, ric) / notti : 0,
      casc: { lordo: qpm, iva: qpm - qpm / 1.22, ag: sum(gest, (r) => r.quota_agente), pm: sum(gest, (r) => r.quota_pm_operativo), val: sum(gest, (r) => r.netto_valente) },
      mesi: Object.entries(mesi).sort().map(([m, v]) => ({ m, ...v })),
      apps: Object.values(apps).sort((a, b) => b.ric - a.ric),
      can: Object.entries(can).map(([c, v]) => ({ c, ...v })).sort((a, b) => b.ric - a.ric),
      nonMap: [...new Set(att.filter((r) => !r.proprieta_id && !(r.camere || "").includes(",")).map((r) => r.camere))],
      senzaProp: [...new Set(att.filter((r) => !r.proprietario && !r.is_sublocazione && !(r.camere || "").includes(",")).map((r) => r.camere))],
    };
  }, [att, rows]);

  const thS = (r) => ({ textAlign: r ? "right" : "left", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--gray)", fontWeight: 500, padding: 8, borderBottom: "1px solid var(--black)" });
  const tdS = (r) => ({ padding: 8, borderBottom: "1px solid var(--gl)", textAlign: r ? "right" : "left", fontSize: 12.5 });
  const Card = ({ children, style }) => <div style={{ background: "#fff", border: "1px solid var(--gl)", padding: 24, ...style }}>{children}</div>;
  const H2 = ({ t, s }) => <div style={{ margin: "34px 0 14px" }}><h2 style={{ fontSize: 19 }}>{t}</h2><div style={{ fontSize: 12, color: "var(--gray)", marginTop: 3 }}>{s}</div></div>;
  const Kpi = ({ l, v, n, gold }) => <div style={{ background: "#fff", padding: "18px 16px" }}><div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--gray)" }}>{l}</div><div style={{ fontFamily: "'Inter',serif", fontSize: 24, fontWeight: 600, marginTop: 6, color: gold ? "var(--gold)" : "var(--black)" }}>{v}</div><div style={{ fontSize: 11, color: "var(--gray)", marginTop: 3 }}>{n}</div></div>;
  const Chk = ({ ok, children }) => <div style={{ display: "flex", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--gl)", fontSize: 13, alignItems: "flex-start" }}><span style={{ minWidth: 9, height: 9, borderRadius: "50%", marginTop: 5, background: ok ? "#2E7D32" : "#B26A00", display: "inline-block" }} /><div>{children}</div></div>;

  if (rows === null) return <div style={{ textAlign: "center", padding: 60, color: "var(--gray)" }}>Caricamento dati gestione…</div>;
  if (!rows.length) return (
    <div>
      <h2 style={{ fontSize: 22, marginBottom: 4 }}>Gestione</h2>
      <div style={{ fontSize: 13, color: "var(--gray)", marginBottom: 20 }}>Nessuna prenotazione nel database: importa il primo export per accendere la dashboard.</div>
      <ImportKross onDone={load} />
    </div>
  );

  const mx = D ? Math.max(...D.mesi.map((x) => x.g + x.s), 1) : 1;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div><h2 style={{ fontSize: 22 }}>Gestione</h2><div style={{ fontSize: 12, color: "var(--gray)", marginTop: 3 }}>{rows.length} prenotazioni in archivio · fonte Krossbooking</div></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[["tutti", "Tutto"], ["2025", "2025"], ["2026", "2026"]].map(([v, l]) => <button key={v} className={anno === v ? "bp" : "bg"} onClick={() => setAnno(v)}>{l}</button>)}
          {[["tutti", "Tutti"], ["gest", "Gestioni"], ["sub", "Sublocazioni"]].map(([v, l]) => <button key={v} className={regime === v ? "bp" : "bg"} onClick={() => setRegime(v)}>{l}</button>)}
          <button className="bg" onClick={() => setShowImp(!showImp)}>⬆ Aggiorna dati</button>
        </div>
      </div>
      {showImp && <div style={{ marginTop: 16 }}><ImportKross compact onDone={() => { setShowImp(false); load(); }} /></div>}
      {!D ? <div style={{ color: "var(--gray)", marginTop: 24 }}>Nessuna prenotazione per i filtri selezionati.</div> : <>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(165px,1fr))", gap: 1, background: "var(--gl)", border: "1px solid var(--gl)", marginTop: 20 }}>
          <Kpi l="Ricavi totali" v={EURO(D.ric)} n="netto tassa di soggiorno" />
          <Kpi l="Compensi gestioni" v={EURO(D.qpm)} n="Quota PM, IVA inclusa" />
          <Kpi l="Ricavi sublocazioni" v={EURO(D.ricSub)} n="lordo costi e affitti" />
          <Kpi l="Netto Valente" v={EURO(D.casc.val)} n="dopo IVA, agenti, PM op." gold />
          <Kpi l="Notti · ADR" v={`${D.notti.toLocaleString("it-IT")} · € ${Math.round(D.adr)}`} n="vendute / media a notte" />
          <Kpi l="Prenotazioni" v={D.nAtt} n={`${D.nCanc} cancellate`} />
        </div>

        <H2 t="Ripartizione compensi di gestione" s="Quota PM ÷ 1,22 (IVA) → 20% agenti → dell'80%: 40% PM operativo, 60% Valente Living" />
        <Card>
          {[["Quota PM lorda", D.casc.lordo, "var(--black)", 1], ["di cui IVA 22%", D.casc.iva, "#C9C2B8", 0], ["Quota agenti (20%)", D.casc.ag, "#C9C2B8", 0], ["PM operativo (40% dell'80%)", D.casc.pm, "#C9C2B8", 0], ["Netto Valente Living", D.casc.val, "var(--gold)", 1]].map(([l, v, c, b]) => (
            <div key={l} style={{ display: "flex", alignItems: "center", gap: 14, margin: "10px 0" }}>
              <div style={{ width: 210, fontSize: 12, fontWeight: b ? 600 : 400 }}>{l}</div>
              <div style={{ flex: 1, height: 22, background: "var(--cd)" }}><div style={{ width: `${(v / (D.casc.lordo || 1)) * 100}%`, height: "100%", background: c }} /></div>
              <div style={{ width: 92, textAlign: "right", fontSize: 13, fontWeight: 600 }}>{EURO(v)}</div>
            </div>
          ))}
          <div style={{ fontSize: 11, color: "var(--gray)", marginTop: 10 }}>Le sublocazioni ({EURO(D.ricSub)}) restano interamente a Valente Living: il margine reale si calcola dopo affitti e costi diretti.</div>
        </Card>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 24 }}>
          <div><H2 t="Andamento mensile" s="nero gestioni · oro sublocazioni · per mese di check-in" />
            <Card><svg viewBox="0 0 560 250" style={{ width: "100%", display: "block" }}>
              {D.mesi.map((m, i) => { const bw = 524 / D.mesi.length, x = 30 + i * bw + 2, hg = (m.g / mx) * 200, hs = (m.s / mx) * 200; return (
                <Fragment key={m.m}>
                  <rect x={x} y={220 - hg - hs} width={bw - 4} height={hs} fill="var(--gold)" />
                  <rect x={x} y={220 - hg} width={bw - 4} height={hg} fill="#0A0A0A" />
                  <text x={x + bw / 2 - 2} y={236} fontSize="8.5" fill="#999" textAnchor="middle">{m.m.slice(5)}/{m.m.slice(2, 4)}</text>
                  <text x={x + bw / 2 - 2} y={214 - hg - hs} fontSize="8.5" textAnchor="middle">{Math.round((m.g + m.s) / 1000)}k</text>
                </Fragment>); })}
            </svg></Card></div>
          <div><H2 t="Canali di vendita" s="volume, incidenza commissioni, cancellazioni" />
            <Card><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr>{["Canale", "Pren.", "Ricavo", "Comm.", "% Canc."].map((h, i) => <th key={h} style={thS(i > 0)}>{h}</th>)}</tr></thead>
              <tbody>{D.can.map((c) => <tr key={c.c}><td style={tdS()}>{c.c}</td><td style={tdS(1)}>{c.n - c.canc}</td><td style={tdS(1)}>{EURO(c.ric)}</td><td style={tdS(1)}>{c.comm ? ((c.comm / c.ric) * 100).toFixed(1) + "%" : "—"}</td><td style={tdS(1)}>{Math.round((c.canc / c.n) * 100)}%</td></tr>)}</tbody></table></Card></div>
        </div>

        <H2 t="Portafoglio appartamenti" s="ordinato per ricavo · ADR = ricavo medio a notte" />
        <Card style={{ padding: "8px 16px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr>{["Appartamento", "Città", "Regime", "Pren.", "Notti", "ADR", "Ricavo", "Quota PM", "Quota propr."].map((h, i) => <th key={h} style={thS(i > 2)}>{h}</th>)}</tr></thead>
            <tbody>{D.apps.map((a) => <tr key={a.nome}>
              <td style={tdS()}>{a.nome}</td><td style={tdS()}>{a.citta}</td>
              <td style={tdS()}><CT tipo={a.sub ? "sublocazione" : "gestione"} /></td>
              <td style={tdS(1)}>{a.n}</td><td style={tdS(1)}>{a.notti}</td><td style={tdS(1)}>€ {Math.round(a.ric / Math.max(a.notti, 1))}</td>
              <td style={{ ...tdS(1), fontWeight: 600 }}>{EURO(a.ric)}</td><td style={tdS(1)}>{a.sub ? "—" : EURO(a.qpm)}</td><td style={tdS(1)}>{a.sub ? "—" : EURO(a.qprop)}</td></tr>)}</tbody></table>
        </Card>

        <H2 t="Controlli di coerenza" s="verifiche automatiche eseguite sui dati live" />
        <Card>
          <Chk ok={!ov.length}>{ov.length ? <>⚠ <b>{ov.length} sovrapposizioni di date</b> (stessa unità, periodi incrociati): {ov.slice(0, 3).map((o) => `${o.camere} ${o.prenotazione_a}/${o.prenotazione_b}`).join(" · ")}</> : <><b>Nessuna sovrapposizione di date</b> tra prenotazioni attive — zero double booking.</>}</Chk>
          <Chk ok={!D.nonMap.length}>{D.nonMap.length ? <>Unità non collegate a schede CRM: <b>{D.nonMap.join(", ")}</b></> : <>Tutte le unità sono collegate a una scheda proprietà.</>}</Chk>
          <Chk ok={!D.senzaProp.length}>{D.senzaProp.length ? <>Gestioni senza proprietario in Krossbooking (fuori dai rendiconti): <b>{D.senzaProp.join(", ")}</b></> : <>Tutte le gestioni hanno il proprietario configurato in Krossbooking.</>}</Chk>
        </Card>
      </>}
    </div>
  );
}
/* ============ FINE SEZIONE GESTIONE ============ */


/* ============ SEZIONE CONTABILITÀ: spese, fatture, rendiconti, IVA ============ */
/* Gli incassi ospiti NON si reinseriscono qui: arrivano dalle prenotazioni Krossbooking
   (vista v_prenotazioni_ripartizione), così non esistono doppioni tra Gestione e Contabilità. */
const SPESE_CATEGORIE = ["pulizie", "lavanderia", "manutenzione", "utenze", "forniture", "marketing", "software", "tasse e imposte", "consulenze", "altro"];
const METODI_PAG = ["bonifico", "carta", "contanti", "PayPal", "altro"];
const C_oggi = () => new Date().toISOString().slice(0, 10);
const C_num = (v) => { if (v === null || v === undefined || v === "") return 0; const n = parseFloat(String(v).replace(",", ".")); return isNaN(n) ? 0 : n; };
const C_iva = (importo, pct) => { const p = C_num(pct); return p ? importo - importo / (1 + p / 100) : 0; };
const C_dataIT = (d) => d ? String(d).slice(0, 10).split("-").reverse().join("/") : "—";
const C_MESI = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
const C_meseLabel = (ym) => { const [a, m] = (ym || "").split("-"); return m ? C_MESI[parseInt(m) - 1] + " " + a : ym; };
const C_fineMese = (ym) => { const [a, m] = ym.split("-").map(Number); return ym + "-" + String(new Date(a, m, 0).getDate()).padStart(2, "0"); };
const C_thS = (r) => ({ textAlign: r ? "right" : "left", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--gray)", fontWeight: 500, padding: 8, borderBottom: "1px solid var(--black)", whiteSpace: "nowrap" });
const C_tdS = (r) => ({ padding: 8, borderBottom: "1px solid var(--gl)", textAlign: r ? "right" : "left", fontSize: 12.5 });
const C_Card = ({ children, style }) => <div style={{ background: "#fff", border: "1px solid var(--gl)", padding: 20, ...style }}>{children}</div>;
const C_Kpi = ({ l, v, n, gold }) => <div style={{ background: "#fff", padding: "16px 14px" }}><div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--gray)" }}>{l}</div><div style={{ fontFamily: "'Inter',serif", fontSize: 22, fontWeight: 600, marginTop: 6, color: gold ? "var(--gold)" : "var(--black)" }}>{v}</div>{n && <div style={{ fontSize: 11, color: "var(--gray)", marginTop: 3 }}>{n}</div>}</div>;
const FATT_STATI = { bozza: "#888", emessa: "#1d6fa4", incassata: "#2d6a4f", scaduta: "#c0392b", annullata: "#aaa" };
const REND_STATI = { bozza: "#888", inviato: "#1d6fa4", liquidato: "#2d6a4f" };

// ── Form Spesa ──
const EMPTY_SPESA = { data: "", proprieta_id: "", categoria: "pulizie", descrizione: "", fornitore: "", importo: "", iva_pct: "22", addebito: "valente", metodo_pagamento: "bonifico", pagata: true, note: "" };
const SpesaForm = ({ init, proprieta, onSave, onClose, loading }) => {
  const [f, setF] = useState({ ...EMPTY_SPESA, data: C_oggi(), ...init });
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));
  return (
    <>
      <ST>Dati spesa</ST><FG>
        <FF label="Data"><input type="date" value={f.data || ""} onChange={e => s("data", e.target.value)} /></FF>
        <FF label="Categoria"><select value={f.categoria} onChange={e => s("categoria", e.target.value)}>{SPESE_CATEGORIE.map(c => <option key={c}>{c}</option>)}</select></FF>
        <FF label="Immobile (opzionale)" span={2}><select value={f.proprieta_id || ""} onChange={e => s("proprieta_id", e.target.value)}><option value="">— Spesa generale Valente —</option>{proprieta.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></FF>
        <FF label="Descrizione" span={2}><input value={f.descrizione || ""} onChange={e => s("descrizione", e.target.value)} placeholder="Es. intervento idraulico bagno" /></FF>
        <FF label="Fornitore" span={2}><input value={f.fornitore || ""} onChange={e => s("fornitore", e.target.value)} /></FF>
      </FG>
      <div style={{ marginTop: 20 }}><ST>Importo e addebito</ST><FG>
        <FF label="Importo € (IVA incl.)"><input type="number" step="0.01" value={f.importo} onChange={e => s("importo", e.target.value)} /></FF>
        <FF label="IVA %"><input type="number" value={f.iva_pct} onChange={e => s("iva_pct", e.target.value)} /></FF>
        <FF label="A carico di"><select value={f.addebito} onChange={e => s("addebito", e.target.value)}><option value="valente">Valente Living</option><option value="proprietario">Proprietario (in rendiconto)</option></select></FF>
        <FF label="Pagamento"><select value={f.metodo_pagamento || ""} onChange={e => s("metodo_pagamento", e.target.value)}>{METODI_PAG.map(m => <option key={m}>{m}</option>)}</select></FF>
        <FF label="Stato"><select value={f.pagata ? "si" : "no"} onChange={e => s("pagata", e.target.value === "si")}><option value="si">Pagata</option><option value="no">Da pagare</option></select></FF>
      </FG></div>
      {f.addebito === "proprietario" && !f.proprieta_id && <p style={{ fontSize: 12, color: "var(--red)", marginTop: 12 }}>Per addebitare la spesa a un proprietario devi collegarla a un immobile.</p>}
      <div style={{ marginTop: 20 }}><ST>Note</ST><textarea value={f.note || ""} onChange={e => s("note", e.target.value)} rows={2} /></div>
      <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
        <button className="bg" onClick={onClose}>Annulla</button>
        <button className="bp" onClick={() => onSave(f)} disabled={loading || !C_num(f.importo) || (f.addebito === "proprietario" && !f.proprieta_id)}>{loading ? "..." : "Salva"}</button>
      </div>
    </>
  );
};

// ── Form Fattura ──
const EMPTY_FATT = { numero: "", data: "", proprietario_id: "", proprieta_id: "", descrizione: "", imponibile: "", iva_pct: "22", stato: "emessa", data_incasso: "", metodo_incasso: "", periodo_da: "", periodo_a: "", note: "" };
const FatturaForm = ({ init, proprieta, owners, onSave, onClose, loading }) => {
  const [f, setF] = useState({ ...EMPTY_FATT, data: C_oggi(), ...init });
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));
  const totale = C_num(f.imponibile) * (1 + C_num(f.iva_pct) / 100);
  return (
    <>
      <ST>Documento</ST><FG>
        <FF label="Numero"><input value={f.numero || ""} onChange={e => s("numero", e.target.value)} placeholder="Es. 12/2026" /></FF>
        <FF label="Data"><input type="date" value={f.data || ""} onChange={e => s("data", e.target.value)} /></FF>
        <FF label="Cliente (proprietario)" span={2}>
          <SelectRicerca value={f.proprietario_id || ""} onChange={v => s("proprietario_id", v)}
            opzioni={owners.map(o => ({ value: o.id, label: `${o.cognome || ""} ${o.nome || ""}`.trim() }))}
            placeholder="— Altro cliente —" vuoto="— Altro cliente —" />
        </FF>
        <FF label="Immobile (opzionale)" span={2}>
          <SelectRicerca value={f.proprieta_id || ""} onChange={v => s("proprieta_id", v)}
            opzioni={proprieta.map(p => ({ value: p.id, label: p.nome }))}
            placeholder="— Nessun immobile —" vuoto="— Nessun immobile —" />
        </FF>
        <FF label="Descrizione" span={2}><input value={f.descrizione || ""} onChange={e => s("descrizione", e.target.value)} placeholder="Es. compensi di gestione maggio 2026" /></FF>
        <FF label="Periodo da"><input type="date" value={f.periodo_da || ""} onChange={e => s("periodo_da", e.target.value)} /></FF>
        <FF label="Periodo a"><input type="date" value={f.periodo_a || ""} onChange={e => s("periodo_a", e.target.value)} /></FF>
      </FG>
      <div style={{ marginTop: 20 }}><ST>Importi</ST><FG>
        <FF label="Imponibile €"><input type="number" step="0.01" value={f.imponibile} onChange={e => s("imponibile", e.target.value)} /></FF>
        <FF label="IVA %"><input type="number" value={f.iva_pct} onChange={e => s("iva_pct", e.target.value)} /></FF>
        <FF label="Totale (auto)"><input value={totale ? totale.toFixed(2) : ""} readOnly style={{ background: "var(--cd)" }} /></FF>
        <FF label="Stato"><select value={f.stato} onChange={e => s("stato", e.target.value)}>{Object.keys(FATT_STATI).map(x => <option key={x}>{x}</option>)}</select></FF>
        {f.stato === "incassata" && <FF label="Data incasso"><input type="date" value={f.data_incasso || ""} onChange={e => s("data_incasso", e.target.value)} /></FF>}
      </FG></div>
      <div style={{ marginTop: 20 }}><ST>Note</ST><textarea value={f.note || ""} onChange={e => s("note", e.target.value)} rows={2} /></div>
      <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
        <button className="bg" onClick={onClose}>Annulla</button>
        <button className="bp" onClick={() => onSave({ ...f, importo_totale: totale || null })} disabled={loading || !C_num(f.imponibile)}>{loading ? "..." : "Salva"}</button>
      </div>
    </>
  );
};

function ContabilitaView({ proprieta, owners }) {
  const [tab, setTab] = useState("panoramica");
  const [spese, setSpese] = useState(null);
  const [fatture, setFatture] = useState(null);
  const [rendiconti, setRendiconti] = useState(null);
  const [pren, setPren] = useState(null);
  const [trans, setTrans] = useState(null);
  const [modalS, setModalS] = useState(null);   // "new" | spesa
  const [modalF, setModalF] = useState(null);   // "new" | fattura
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const [rS, rF, rR, rT] = await Promise.all([
      sb.get("spese", "?select=*&order=data.desc&limit=3000"),
      sb.get("fatture", "?select=*&order=data.desc&limit=2000"),
      sb.get("rendiconti", "?select=*&order=periodo_da.desc&limit=1000"),
      sb.get("transazioni_cdg", "?select=*&order=data.desc&limit=5000"),
    ]);
    setSpese(Array.isArray(rS.data) ? rS.data : []);
    setFatture(Array.isArray(rF.data) ? rF.data : []);
    setRendiconti(Array.isArray(rR.data) ? rR.data : []);
    setTrans(Array.isArray(rT.data) ? rT.data : []);
    // Prenotazioni dalla stessa vista della dashboard Gestione: nessun doppione di dati
    let all = [], off = 0;
    while (true) {
      const { data, ok } = await sb.get("v_prenotazioni_ripartizione", `?select=*&order=check_in.asc&limit=1000&offset=${off}`);
      if (!ok || !Array.isArray(data)) break;
      all = all.concat(data); if (data.length < 1000) break; off += 1000;
    }
    setPren(all);
  }, []);
  useEffect(() => { load(); }, [load]);

  const propNome = (id) => { const p = proprieta.find(x => String(x.id) === String(id)); return p ? p.nome : "—"; };
  const ownerNome = (id) => { const o = owners.find(x => String(x.id) === String(id)); return o ? `${o.cognome || ""} ${o.nome || ""}`.trim() : "—"; };

  const saveSpesa = async (f) => {
    setSaving(true);
    const clean = { data: f.data || C_oggi(), proprieta_id: f.proprieta_id || null, categoria: f.categoria, descrizione: f.descrizione || null, fornitore: f.fornitore || null, importo: C_num(f.importo), iva_pct: C_num(f.iva_pct), addebito: f.addebito, metodo_pagamento: f.metodo_pagamento || null, pagata: !!f.pagata, note: f.note || null };
    if (modalS === "new") await sb.post("spese", clean); else await sb.patch("spese", modalS.id, clean);
    await load(); setSaving(false); setModalS(null);
  };
  const delSpesa = async (sp) => {
    if (sp.rendiconto_id) { alert("Questa spesa è già dentro un rendiconto: elimina prima il rendiconto."); return; }
    if (!confirm("Eliminare questa spesa?")) return;
    await sb.del("spese", sp.id); await load();
  };
  const saveFatt = async (f) => {
    setSaving(true);
    const clean = { numero: f.numero || null, data: f.data || C_oggi(), proprietario_id: f.proprietario_id || null, proprieta_id: f.proprieta_id || null, descrizione: f.descrizione || null, imponibile: C_num(f.imponibile), iva_pct: C_num(f.iva_pct), importo_totale: C_num(f.importo_totale) || C_num(f.imponibile) * (1 + C_num(f.iva_pct) / 100), stato: f.stato, data_incasso: f.data_incasso || null, metodo_incasso: f.metodo_incasso || null, periodo_da: f.periodo_da || null, periodo_a: f.periodo_a || null, note: f.note || null };
    if (modalF === "new") await sb.post("fatture", clean); else await sb.patch("fatture", modalF.id, clean);
    await load(); setSaving(false); setModalF(null);
  };
  const incassaFatt = async (f) => { await sb.patch("fatture", f.id, { stato: "incassata", data_incasso: C_oggi() }); await load(); };
  const delFatt = async (f) => { if (!confirm("Eliminare questa fattura?")) return; await sb.del("fatture", f.id); await load(); };

  if (spese === null || fatture === null || rendiconti === null || pren === null || trans === null)
    return <div style={{ textAlign: "center", padding: 60, color: "var(--gray)" }}>Caricamento contabilità…</div>;

  const TABS = [["spese", "Spese"], ["entrata", "Fatture in entrata"], ["fatture", "Fatture & Incassi"], ["rendiconti", "Rendiconti proprietari"], ["banca", "Banca"], ["fiscale", "Riepilogo IVA"]];
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 8 }}>
        <div><h1 style={{ fontSize: 26, fontWeight: 700 }}>Gestione</h1>
          <p style={{ fontSize: 12, color: "var(--gray)", marginTop: 4 }}>Dashboard prenotazioni, contabilità e fogli di controllo di gestione — tutto in un'unica vista</p></div>
      </div>
      <div className="gl" style={{ marginBottom: 18 }} />
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--gray)", marginBottom: 6 }}>Panoramica</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          <button className={tab === "panoramica" ? "bp" : "bg"} onClick={() => { setTab("panoramica"); setMsg(""); }}>📊 Dashboard prenotazioni</button>
        </div>
        <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--gray)", marginBottom: 6 }}>Contabilità interna</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {TABS.map(([id, l]) => <button key={id} className={tab === id ? "bp" : "bg"} onClick={() => { setTab(id); setMsg(""); }}>{l}</button>)}
        </div>
        <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--gray)", marginBottom: 6 }}>File Google · Controllo di gestione</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {CDG_FOGLI.map((f) => { const gid = "g:" + f.gid; return <button key={gid} className={tab === gid ? "bp" : "bg"} style={{ fontSize: 12 }} onClick={() => { setTab(gid); setMsg(""); }}>{f.nome}</button>; })}
        </div>
      </div>
      {msg && <div style={{ marginBottom: 14, fontSize: 13, fontWeight: 500, color: "var(--gold)" }}>{msg}</div>}

      {tab === "panoramica" && <DashboardGestione />}
      {tab === "spese" && <SpeseTab spese={spese} proprieta={proprieta} propNome={propNome} onNew={() => setModalS("new")} onEdit={setModalS} onDel={delSpesa} />}
      {tab === "fatture" && <FattureTab fatture={fatture} ownerNome={ownerNome} propNome={propNome} onNew={() => setModalF("new")} onEdit={setModalF} onDel={delFatt} onIncassa={incassaFatt} />}
      {tab === "rendiconti" && <RendicontiTab rendiconti={rendiconti} spese={spese} pren={pren} proprieta={proprieta} owners={owners} ownerNome={ownerNome} propNome={propNome} onChanged={load} setMsg={setMsg} />}
      {tab === "entrata" && <EntrataTab proprieta={proprieta} onChanged={load} setMsg={setMsg} />}
      {tab === "banca" && <BancaTab trans={trans} />}
      {tab === "fiscale" && <FiscaleTab pren={pren} spese={spese} fatture={fatture} />}
      {tab.startsWith("g:") && (() => { const f = CDG_FOGLI.find((x) => "g:" + x.gid === tab); if (!f) return null; return f.statusCol ? <FoglioWritableTab key={f.gid} foglio={f} /> : <FoglioGoogleTab key={f.gid} foglio={f} />; })()}

      {modalS && <Modal title={modalS === "new" ? "Nuova spesa" : "Modifica spesa"} onClose={() => setModalS(null)}>
        <SpesaForm init={modalS === "new" ? {} : modalS} proprieta={proprieta} onSave={saveSpesa} onClose={() => setModalS(null)} loading={saving} /></Modal>}
      {modalF && <Modal title={modalF === "new" ? "Nuova fattura" : "Modifica fattura"} onClose={() => setModalF(null)}>
        <FatturaForm init={modalF === "new" ? {} : modalF} proprieta={proprieta} owners={owners} onSave={saveFatt} onClose={() => setModalF(null)} loading={saving} /></Modal>}
    </div>
  );
}

// ── Tab Spese ──
function SpeseTab({ spese, proprieta, propNome, onNew, onEdit, onDel }) {
  const [anno, setAnno] = useState("tutti");
  const [mese, setMese] = useState("tutti");
  const [fProp, setFProp] = useState("");
  const [fCat, setFCat] = useState("");
  const [fAdd, setFAdd] = useState("");
  const anni = [...new Set(spese.map(s => (s.data || "").slice(0, 4)).filter(Boolean))].sort().reverse();
  const filt = spese.filter(s =>
    (anno === "tutti" || (s.data || "").startsWith(anno)) &&
    (mese === "tutti" || (s.data || "").slice(5, 7) === mese) &&
    (!fProp || String(s.proprieta_id) === fProp) &&
    (!fCat || s.categoria === fCat) &&
    (!fAdd || s.addebito === fAdd));
  const tot = filt.reduce((a, s) => a + C_num(s.importo), 0);
  const totProp = filt.filter(s => s.addebito === "proprietario").reduce((a, s) => a + C_num(s.importo), 0);
  const ivaCred = filt.filter(s => s.addebito === "valente").reduce((a, s) => a + C_iva(C_num(s.importo), s.iva_pct), 0);
  const daPagare = filt.filter(s => !s.pagata).reduce((a, s) => a + C_num(s.importo), 0);
  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        <select value={anno} onChange={e => setAnno(e.target.value)} style={{ width: 110 }}><option value="tutti">Tutti gli anni</option>{anni.map(a => <option key={a}>{a}</option>)}</select>
        <select value={mese} onChange={e => setMese(e.target.value)} style={{ width: 130 }}><option value="tutti">Tutti i mesi</option>{C_MESI.map((m, i) => <option key={m} value={String(i + 1).padStart(2, "0")}>{m}</option>)}</select>
        <select value={fProp} onChange={e => setFProp(e.target.value)} style={{ width: 180 }}><option value="">Tutti gli immobili</option>{proprieta.map(p => <option key={p.id} value={String(p.id)}>{p.nome}</option>)}</select>
        <select value={fCat} onChange={e => setFCat(e.target.value)} style={{ width: 150 }}><option value="">Tutte le categorie</option>{SPESE_CATEGORIE.map(c => <option key={c}>{c}</option>)}</select>
        <select value={fAdd} onChange={e => setFAdd(e.target.value)} style={{ width: 160 }}><option value="">Tutti gli addebiti</option><option value="valente">Valente Living</option><option value="proprietario">Proprietario</option></select>
        <button className="bp" style={{ marginLeft: "auto" }} onClick={onNew}>+ Nuova spesa</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 1, background: "var(--gl)", border: "1px solid var(--gl)", marginBottom: 20 }}>
        <C_Kpi l="Spese nel periodo" v={EURO(tot)} n={`${filt.length} movimenti`} />
        <C_Kpi l="A carico proprietari" v={EURO(totProp)} n="da recuperare in rendiconto" />
        <C_Kpi l="A carico Valente" v={EURO(tot - totProp)} n="costi propri" />
        <C_Kpi l="IVA detraibile" v={EURO(ivaCred)} n="su spese Valente" gold />
        {daPagare > 0 && <C_Kpi l="Da pagare" v={EURO(daPagare)} n="spese non saldate" />}
      </div>
      {filt.length === 0 ? <div style={{ textAlign: "center", padding: 50, color: "var(--gray)" }}>Nessuna spesa registrata per i filtri scelti. Usa "+ Nuova spesa".</div> : (
        <C_Card style={{ padding: "8px 16px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["Data", "Immobile", "Categoria", "Descrizione", "Fornitore", "A carico", "Importo", ""].map((h, i) => <th key={h || "x"} style={C_thS(i === 6)}>{h}</th>)}</tr></thead>
            <tbody>{filt.map(s => (
              <tr key={s.id} style={{ opacity: s.pagata ? 1 : .65 }}>
                <td style={C_tdS()}>{C_dataIT(s.data)}</td>
                <td style={C_tdS()}>{s.proprieta_id ? propNome(s.proprieta_id) : <span style={{ color: "var(--gray)" }}>generale</span>}</td>
                <td style={C_tdS()}><span className="tag">{s.categoria}</span></td>
                <td style={C_tdS()}>{s.descrizione || "—"}{!s.pagata && <span style={{ color: "var(--red)", fontSize: 10, marginLeft: 6 }}>da pagare</span>}{s.rendiconto_id && <span style={{ color: "#1d6fa4", fontSize: 10, marginLeft: 6 }}>in rendiconto</span>}</td>
                <td style={C_tdS()}>{s.fornitore || "—"}</td>
                <td style={C_tdS()}>{s.addebito === "proprietario" ? "Proprietario" : "Valente"}</td>
                <td style={{ ...C_tdS(1), fontWeight: 600 }}>{EURO(C_num(s.importo))}</td>
                <td style={C_tdS(1)}>
                  <button onClick={() => onEdit(s)} style={{ background: "none", border: "none", color: "var(--gold)", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Modifica</button>
                  <button onClick={() => onDel(s)} style={{ background: "none", border: "none", color: "var(--red)", fontSize: 11, cursor: "pointer" }}>Elimina</button>
                </td>
              </tr>))}</tbody>
          </table>
        </C_Card>
      )}
    </>
  );
}

// ── Tab Fatture & Incassi ──
function FattureTab({ fatture, ownerNome, propNome, onNew, onEdit, onDel, onIncassa }) {
  const [anno, setAnno] = useState("tutti");
  const anni = [...new Set(fatture.map(f => (f.data || "").slice(0, 4)).filter(Boolean))].sort().reverse();
  const filt = fatture.filter(f => anno === "tutti" || (f.data || "").startsWith(anno));
  const attive = filt.filter(f => f.stato !== "annullata" && f.stato !== "bozza");
  const emesso = attive.reduce((a, f) => a + C_num(f.importo_totale), 0);
  const incassato = attive.filter(f => f.stato === "incassata").reduce((a, f) => a + C_num(f.importo_totale), 0);
  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        <select value={anno} onChange={e => setAnno(e.target.value)} style={{ width: 110 }}><option value="tutti">Tutti gli anni</option>{anni.map(a => <option key={a}>{a}</option>)}</select>
        <button className="bp" style={{ marginLeft: "auto" }} onClick={onNew}>+ Nuova fattura</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 1, background: "var(--gl)", border: "1px solid var(--gl)", marginBottom: 20 }}>
        <C_Kpi l="Fatturato emesso" v={EURO(emesso)} n={`${attive.length} fatture`} />
        <C_Kpi l="Incassato" v={EURO(incassato)} n="fatture saldate" gold />
        <C_Kpi l="Da incassare" v={EURO(emesso - incassato)} n="emesse non saldate" />
      </div>
      <p style={{ fontSize: 11, color: "var(--gray)", marginBottom: 14 }}>Qui registri le fatture che Valente Living emette (compensi di gestione, servizi). Gli incassi dei soggiorni restano in Gestione: non vanno reinseriti.</p>
      {filt.length === 0 ? <div style={{ textAlign: "center", padding: 50, color: "var(--gray)" }}>Nessuna fattura registrata.</div> : (
        <C_Card style={{ padding: "8px 16px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["N.", "Data", "Cliente", "Descrizione", "Imponibile", "IVA", "Totale", "Stato", ""].map((h, i) => <th key={h || "x"} style={C_thS(i >= 4 && i <= 6)}>{h}</th>)}</tr></thead>
            <tbody>{filt.map(f => (
              <tr key={f.id}>
                <td style={C_tdS()}>{f.numero || "—"}</td>
                <td style={C_tdS()}>{C_dataIT(f.data)}</td>
                <td style={C_tdS()}>{f.proprietario_id ? ownerNome(f.proprietario_id) : (f.proprieta_id ? propNome(f.proprieta_id) : "—")}</td>
                <td style={C_tdS()}>{f.descrizione || "—"}</td>
                <td style={C_tdS(1)}>{EURO(C_num(f.imponibile))}</td>
                <td style={C_tdS(1)}>{EURO(C_num(f.importo_totale) - C_num(f.imponibile))}</td>
                <td style={{ ...C_tdS(1), fontWeight: 600 }}>{EURO(C_num(f.importo_totale))}</td>
                <td style={C_tdS()}><span className="pill" style={{ background: FATT_STATI[f.stato] || "#888" }}>{f.stato}</span>{f.data_incasso ? <span style={{ fontSize: 10, color: "var(--gray)", marginLeft: 6 }}>{C_dataIT(f.data_incasso)}</span> : null}</td>
                <td style={{ ...C_tdS(1), whiteSpace: "nowrap" }}>
                  {(f.stato === "emessa" || f.stato === "scaduta") && <button onClick={() => onIncassa(f)} style={{ background: "none", border: "none", color: "#2d6a4f", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>✓ Incassata</button>}
                  <button onClick={() => onEdit(f)} style={{ background: "none", border: "none", color: "var(--gold)", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Modifica</button>
                  <button onClick={() => onDel(f)} style={{ background: "none", border: "none", color: "var(--red)", fontSize: 11, cursor: "pointer" }}>Elimina</button>
                </td>
              </tr>))}</tbody>
          </table>
        </C_Card>
      )}
    </>
  );
}

// ── Tab Rendiconti proprietari ──
function RendicontiTab({ rendiconti, spese, pren, proprieta, owners, ownerNome, propNome, onChanged, setMsg }) {
  const [ownerId, setOwnerId] = useState("");
  const [mese, setMese] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); });
  const [busy, setBusy] = useState(false);
  const [anteprima, setAnteprima] = useState(null);

  const genera = () => {
    setMsg("");
    const o = owners.find(x => String(x.id) === ownerId);
    if (!o) return;
    const da = mese + "-01", a = C_fineMese(mese);
    const propIds = new Set(proprieta.filter(p => String(p.proprietario_id) === ownerId).map(p => String(p.id)));
    if (!propIds.size) { setAnteprima({ vuoto: "Questo proprietario non ha immobili collegati nel CRM." }); return; }
    const giaFatto = rendiconti.find(r => String(r.proprietario_id) === ownerId && r.periodo_da === da);
    const righe = pren.filter(r => r.proprieta_id && propIds.has(String(r.proprieta_id)) && !r.is_cancellata && !r.is_sublocazione && (r.check_in || "") >= da && (r.check_in || "") <= a);
    const speseRow = spese.filter(s => s.addebito === "proprietario" && !s.rendiconto_id && s.proprieta_id && propIds.has(String(s.proprieta_id)) && (s.data || "") <= a);
    const ricavi = righe.reduce((x, r) => x + (C_num(r.addebiti) - C_num(r.tassa_soggiorno)), 0);
    const tassa = righe.reduce((x, r) => x + C_num(r.tassa_soggiorno), 0);
    const comm = righe.reduce((x, r) => x + C_num(r.quota_pm), 0);
    const quotaProp = righe.reduce((x, r) => x + (r.quota_proprietario != null ? C_num(r.quota_proprietario) : C_num(r.addebiti) - C_num(r.tassa_soggiorno) - C_num(r.quota_pm)), 0);
    const totSpese = speseRow.reduce((x, s) => x + C_num(s.importo), 0);
    setAnteprima({
      owner: o, da, a, righe, speseRow, ricavi, tassa, comm, quotaProp, totSpese,
      netto: quotaProp - totSpese, giaFatto,
      vuoto: righe.length === 0 && speseRow.length === 0 ? "Nessuna prenotazione né spesa da rendicontare nel periodo." : null,
    });
  };

  const salva = async () => {
    if (!anteprima || anteprima.vuoto || anteprima.giaFatto) return;
    setBusy(true);
    const a = anteprima;
    const dettaglio = {
      prenotazioni: a.righe.map(r => ({ id: r.id, numero: r.numero, immobile: r.proprieta_nome || r.camere, check_in: r.check_in, check_out: r.check_out, notti: r.notti, ricavo: C_num(r.addebiti) - C_num(r.tassa_soggiorno), quota_pm: C_num(r.quota_pm), quota_proprietario: r.quota_proprietario != null ? C_num(r.quota_proprietario) : null })),
      spese: a.speseRow.map(s => ({ id: s.id, data: s.data, immobile: propNome(s.proprieta_id), categoria: s.categoria, descrizione: s.descrizione, importo: C_num(s.importo) })),
    };
    const res = await sb.post("rendiconti", {
      proprietario_id: a.owner.id, periodo_da: a.da, periodo_a: a.a,
      ricavi_lordi: a.ricavi, tassa_soggiorno: a.tassa, commissioni_pm: a.comm,
      spese_addebitate: a.totSpese, netto_proprietario: a.netto,
      n_prenotazioni: a.righe.length, n_notti: a.righe.reduce((x, r) => x + (r.notti || 0), 0),
      stato: "bozza", dettaglio,
    });
    if (res.ok) {
      const nuovo = Array.isArray(res.data) ? res.data[0] : res.data;
      for (const s of a.speseRow) await sb.patch("spese", s.id, { rendiconto_id: nuovo.id });
      setMsg("Rendiconto creato in bozza per " + (a.owner.cognome || "") + " " + (a.owner.nome || "") + " · " + C_meseLabel(mese) + ".");
      setAnteprima(null);
      await onChanged();
    } else setMsg("Errore nel salvataggio: esiste già un rendiconto per questo periodo?");
    setBusy(false);
  };

  const cambiaStato = async (r, stato) => {
    const patch = { stato };
    if (stato === "inviato") patch.data_invio = C_oggi();
    if (stato === "liquidato") patch.data_pagamento = C_oggi();
    await sb.patch("rendiconti", r.id, patch); await onChanged();
  };
  const elimina = async (r) => {
    if (!confirm("Eliminare il rendiconto? Le spese collegate torneranno disponibili per un nuovo rendiconto.")) return;
    const daLiberare = spese.filter(s => s.rendiconto_id === r.id);
    for (const s of daLiberare) await sb.patch("spese", s.id, { rendiconto_id: null });
    await sb.del("rendiconti", r.id); await onChanged();
  };

  return (
    <>
      <C_Card style={{ marginBottom: 22 }}>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--gold)", marginBottom: 12 }}>Genera rendiconto mensile</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <select value={ownerId} onChange={e => { setOwnerId(e.target.value); setAnteprima(null); }} style={{ width: 220 }}>
            <option value="">— Proprietario —</option>
            {owners.map(o => <option key={o.id} value={String(o.id)}>{o.cognome} {o.nome}</option>)}
          </select>
          <input type="month" value={mese} onChange={e => { setMese(e.target.value); setAnteprima(null); }} style={{ width: 160 }} />
          <button className="bp" onClick={genera} disabled={!ownerId || !mese}>Calcola</button>
        </div>
        <p style={{ fontSize: 11, color: "var(--gray)", marginTop: 10 }}>Prenotazioni per mese di check-in (stessi criteri della dashboard Gestione) + spese a carico del proprietario non ancora rendicontate.</p>

        {anteprima && (
          <div style={{ marginTop: 18, borderTop: "1px solid var(--gl)", paddingTop: 16 }}>
            {anteprima.vuoto ? <p style={{ fontSize: 13, color: "var(--gray)" }}>{anteprima.vuoto}</p> : (
              <>
                {anteprima.giaFatto && <p style={{ fontSize: 12, color: "var(--red)", marginBottom: 10 }}>Esiste già un rendiconto {C_meseLabel(mese)} per questo proprietario ({anteprima.giaFatto.stato}). Eliminalo prima di rigenerarlo.</p>}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 1, background: "var(--gl)", border: "1px solid var(--gl)", marginBottom: 14 }}>
                  <C_Kpi l="Ricavi lordi" v={EURO(anteprima.ricavi)} n={`${anteprima.righe.length} pren. · ${anteprima.righe.reduce((x, r) => x + (r.notti || 0), 0)} notti`} />
                  <C_Kpi l="Compenso Valente" v={EURO(anteprima.comm)} n="quota PM, IVA inclusa" />
                  <C_Kpi l="Spese addebitate" v={EURO(anteprima.totSpese)} n={`${anteprima.speseRow.length} voci`} />
                  <C_Kpi l="Netto al proprietario" v={EURO(anteprima.netto)} gold />
                </div>
                {anteprima.righe.length > 0 && (
                  <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
                    <thead><tr>{["Immobile", "Check-in", "Notti", "Ricavo", "Quota Valente", "Quota propr."].map((h, i) => <th key={h} style={C_thS(i > 1)}>{h}</th>)}</tr></thead>
                    <tbody>{anteprima.righe.map(r => (
                      <tr key={r.id}>
                        <td style={C_tdS()}>{r.proprieta_nome || r.camere}</td>
                        <td style={C_tdS()}>{C_dataIT(r.check_in)}</td>
                        <td style={C_tdS(1)}>{r.notti}</td>
                        <td style={C_tdS(1)}>{EURO(C_num(r.addebiti) - C_num(r.tassa_soggiorno))}</td>
                        <td style={C_tdS(1)}>{EURO(C_num(r.quota_pm))}</td>
                        <td style={C_tdS(1)}>{EURO(r.quota_proprietario != null ? C_num(r.quota_proprietario) : C_num(r.addebiti) - C_num(r.tassa_soggiorno) - C_num(r.quota_pm))}</td>
                      </tr>))}</tbody>
                  </table>
                )}
                {anteprima.speseRow.length > 0 && (
                  <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
                    <thead><tr>{["Spesa da addebitare", "Data", "Immobile", "Importo"].map((h, i) => <th key={h} style={C_thS(i === 3)}>{h}</th>)}</tr></thead>
                    <tbody>{anteprima.speseRow.map(s => (
                      <tr key={s.id}><td style={C_tdS()}>{s.categoria}{s.descrizione ? " · " + s.descrizione : ""}</td><td style={C_tdS()}>{C_dataIT(s.data)}</td><td style={C_tdS()}>{propNome(s.proprieta_id)}</td><td style={C_tdS(1)}>{EURO(C_num(s.importo))}</td></tr>))}</tbody>
                  </table>
                )}
                <button className="bp" onClick={salva} disabled={busy || !!anteprima.giaFatto}>{busy ? "Salvo…" : "Salva rendiconto (bozza)"}</button>
              </>
            )}
          </div>
        )}
      </C_Card>

      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--gold)", marginBottom: 10 }}>Rendiconti salvati</p>
      {rendiconti.length === 0 ? <div style={{ textAlign: "center", padding: 40, color: "var(--gray)" }}>Nessun rendiconto ancora. Generane uno qui sopra.</div> : (
        <C_Card style={{ padding: "8px 16px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["Proprietario", "Periodo", "Ricavi", "Compensi", "Spese", "Netto", "Stato", ""].map((h, i) => <th key={h || "x"} style={C_thS(i >= 2 && i <= 5)}>{h}</th>)}</tr></thead>
            <tbody>{rendiconti.map(r => (
              <tr key={r.id}>
                <td style={C_tdS()}>{ownerNome(r.proprietario_id)}</td>
                <td style={C_tdS()}>{C_meseLabel((r.periodo_da || "").slice(0, 7))}</td>
                <td style={C_tdS(1)}>{EURO(C_num(r.ricavi_lordi))}</td>
                <td style={C_tdS(1)}>{EURO(C_num(r.commissioni_pm))}</td>
                <td style={C_tdS(1)}>{EURO(C_num(r.spese_addebitate))}</td>
                <td style={{ ...C_tdS(1), fontWeight: 600 }}>{EURO(C_num(r.netto_proprietario))}</td>
                <td style={C_tdS()}><span className="pill" style={{ background: REND_STATI[r.stato] || "#888" }}>{r.stato}</span></td>
                <td style={{ ...C_tdS(1), whiteSpace: "nowrap" }}>
                  {r.stato === "bozza" && <button onClick={() => cambiaStato(r, "inviato")} style={{ background: "none", border: "none", color: "#1d6fa4", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Segna inviato</button>}
                  {r.stato === "inviato" && <button onClick={() => cambiaStato(r, "liquidato")} style={{ background: "none", border: "none", color: "#2d6a4f", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>✓ Liquidato</button>}
                  <button onClick={() => elimina(r)} style={{ background: "none", border: "none", color: "var(--red)", fontSize: 11, cursor: "pointer" }}>Elimina</button>
                </td>
              </tr>))}</tbody>
          </table>
        </C_Card>
      )}
    </>
  );
}

// ── Tab Riepilogo IVA / fiscale ──
function FiscaleTab({ pren, spese, fatture }) {
  const anni = [...new Set([
    ...pren.filter(r => !r.is_cancellata).map(r => (r.check_in || "").slice(0, 4)),
    ...spese.map(s => (s.data || "").slice(0, 4)),
    ...fatture.map(f => (f.data || "").slice(0, 4)),
  ].filter(Boolean))].sort().reverse();
  const [anno, setAnno] = useState(anni[0] || String(new Date().getFullYear()));

  const inQ = (d, q) => { const m = parseInt((d || "").slice(5, 7)); return m >= q * 3 - 2 && m <= q * 3; };
  const Y = (d) => (d || "").startsWith(anno);
  const gest = pren.filter(r => !r.is_cancellata && !r.is_sublocazione && Y(r.check_in));
  const sub = pren.filter(r => !r.is_cancellata && r.is_sublocazione && Y(r.check_in));
  const fattOk = fatture.filter(f => f.stato !== "annullata" && f.stato !== "bozza" && Y(f.data));
  const spValente = spese.filter(s => s.addebito === "valente" && Y(s.data));

  const quart = [1, 2, 3, 4].map(q => {
    const g = gest.filter(r => inQ(r.check_in, q));
    const ivaTeor = g.reduce((x, r) => x + (r.pm_netto_iva != null ? C_num(r.quota_pm) - C_num(r.pm_netto_iva) : C_num(r.quota_pm) * (22 / 122)), 0);
    const fq = fattOk.filter(f => inQ(f.data, q));
    const ivaFatt = fq.reduce((x, f) => x + (C_num(f.importo_totale) - C_num(f.imponibile)), 0);
    const sq = spValente.filter(s => inQ(s.data, q));
    const ivaCred = sq.reduce((x, s) => x + C_iva(C_num(s.importo), s.iva_pct), 0);
    return { q, ivaTeor, ivaFatt, nFatt: fq.length, ivaCred, saldoTeor: ivaTeor - ivaCred, saldoFatt: ivaFatt - ivaCred };
  });

  const ricaviGest = gest.reduce((x, r) => x + C_num(r.addebiti) - C_num(r.tassa_soggiorno), 0);
  const ricaviSub = sub.reduce((x, r) => x + C_num(r.addebiti) - C_num(r.tassa_soggiorno), 0);
  const compensi = gest.reduce((x, r) => x + C_num(r.quota_pm), 0);
  const nettoVal = gest.reduce((x, r) => x + C_num(r.netto_valente), 0);
  const totSpese = spValente.reduce((x, s) => x + C_num(s.importo), 0);
  const totFatt = fattOk.reduce((x, f) => x + C_num(f.importo_totale), 0);
  const totIncassato = fattOk.filter(f => f.stato === "incassata").reduce((x, f) => x + C_num(f.importo_totale), 0);

  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 18, alignItems: "center" }}>
        <select value={anno} onChange={e => setAnno(e.target.value)} style={{ width: 110 }}>{(anni.length ? anni : [anno]).map(a => <option key={a}>{a}</option>)}</select>
        <span style={{ fontSize: 11, color: "var(--gray)" }}>Anno fiscale (prenotazioni per check-in, spese e fatture per data documento)</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(165px,1fr))", gap: 1, background: "var(--gl)", border: "1px solid var(--gl)", marginBottom: 22 }}>
        <C_Kpi l="Ricavi gestioni" v={EURO(ricaviGest)} n="lordo ospiti, netto tassa sogg." />
        <C_Kpi l="Compensi Valente" v={EURO(compensi)} n="quota PM, IVA inclusa" />
        <C_Kpi l="Ricavi sublocazioni" v={EURO(ricaviSub)} n="lordo costi e affitti" />
        <C_Kpi l="Fatturato emesso" v={EURO(totFatt)} n={`incassato ${EURO(totIncassato)}`} />
        <C_Kpi l="Spese Valente" v={EURO(totSpese)} n="IVA inclusa" />
        <C_Kpi l="Margine stimato" v={EURO(nettoVal + ricaviSub - totSpese)} n="netto Valente + sub − spese" gold />
      </div>

      <C_Card>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--gold)", marginBottom: 12 }}>IVA per trimestre · {anno}</p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["Trimestre", "IVA teorica (da prenotazioni)", "IVA da fatture emesse", "IVA detraibile (spese)", "Saldo teorico", "Saldo da fatture"].map((h, i) => <th key={h} style={C_thS(i > 0)}>{h}</th>)}</tr></thead>
            <tbody>{quart.map(x => (
              <tr key={x.q}>
                <td style={C_tdS()}>Q{x.q} · {C_MESI[(x.q - 1) * 3].slice(0, 3)}–{C_MESI[x.q * 3 - 1].slice(0, 3)}</td>
                <td style={C_tdS(1)}>{EURO(x.ivaTeor)}</td>
                <td style={C_tdS(1)}>{x.nFatt ? EURO(x.ivaFatt) : "—"}</td>
                <td style={C_tdS(1)}>{EURO(x.ivaCred)}</td>
                <td style={{ ...C_tdS(1), fontWeight: 600 }}>{EURO(x.saldoTeor)}</td>
                <td style={{ ...C_tdS(1), fontWeight: 600 }}>{x.nFatt ? EURO(x.saldoFatt) : "—"}</td>
              </tr>))}</tbody>
          </table>
        </div>
        <p style={{ fontSize: 11, color: "var(--gray)", marginTop: 12, lineHeight: 1.5 }}>
          L'IVA teorica è calcolata sui compensi di gestione delle prenotazioni (quota PM ÷ 1,22), come nella dashboard Gestione. Quando registri le fatture emesse, la colonna "da fatture" diventa il riferimento reale. Sono valori indicativi per il monitoraggio: per le liquidazioni fa fede il commercialista.
        </p>
      </C_Card>
    </>
  );
}
// ── Tab Banca: transazioni Qonto dal foglio "Controllo di gestione" (sync automatica) ──
function BancaTab({ trans }) {
  const [mese, setMese] = useState("tutti");
  const [fConto, setFConto] = useState("");
  const [fMacro, setFMacro] = useState("");
  const [fSede, setFSede] = useState("");
  const mesi = [...new Set(trans.map(t => (t.data || "").slice(0, 7)).filter(Boolean))].sort().reverse();
  const conti = [...new Set(trans.map(t => t.conto).filter(Boolean))].sort();
  const macros = [...new Set(trans.map(t => t.macro).filter(Boolean))].sort();
  const sedi = [...new Set(trans.map(t => t.sede).filter(Boolean))].sort();
  const filt = trans.filter(t =>
    (mese === "tutti" || (t.data || "").startsWith(mese)) &&
    (!fConto || t.conto === fConto) &&
    (!fMacro || t.macro === fMacro) &&
    (!fSede || t.sede === fSede));
  const entrate = filt.filter(t => C_num(t.importo) > 0).reduce((a, t) => a + C_num(t.importo), 0);
  const uscite = filt.filter(t => C_num(t.importo) < 0).reduce((a, t) => a + C_num(t.importo), 0);
  const daClass = filt.filter(t => t.macro === "DIMMI TU" || t.categoria === "Non trovato").length;
  const ultimaSync = trans.length ? trans.reduce((m, t) => (t.synced_at || "") > m ? t.synced_at : m, "") : null;
  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        <select value={mese} onChange={e => setMese(e.target.value)} style={{ width: 150 }}><option value="tutti">Tutti i mesi</option>{mesi.map(m => <option key={m} value={m}>{C_meseLabel(m)}</option>)}</select>
        <select value={fConto} onChange={e => setFConto(e.target.value)} style={{ width: 140 }}><option value="">Tutti i conti</option>{conti.map(c => <option key={c}>{c}</option>)}</select>
        <select value={fMacro} onChange={e => setFMacro(e.target.value)} style={{ width: 190 }}><option value="">Tutte le macro</option>{macros.map(m => <option key={m}>{m}</option>)}</select>
        <select value={fSede} onChange={e => setFSede(e.target.value)} style={{ width: 190 }}><option value="">Tutte le proprietà</option>{sedi.map(s => <option key={s}>{s}</option>)}</select>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 1, background: "var(--gl)", border: "1px solid var(--gl)", marginBottom: 14 }}>
        <C_Kpi l="Entrate" v={EURO(entrate)} n={`${filt.filter(t => C_num(t.importo) > 0).length} movimenti`} />
        <C_Kpi l="Uscite" v={EURO(Math.abs(uscite))} n={`${filt.filter(t => C_num(t.importo) < 0).length} movimenti`} />
        <C_Kpi l="Saldo periodo" v={EURO(entrate + uscite)} gold />
        <C_Kpi l="Da classificare" v={daClass} n='macro "DIMMI TU" nel foglio' />
      </div>
      <p style={{ fontSize: 11, color: "var(--gray)", marginBottom: 14 }}>
        Fonte: foglio "Controllo di gestione Valente Living" (Qonto, aggiornato ogni notte da Pachino e sincronizzato qui in automatico{ultimaSync ? " · ultima sync " + C_dataIT(ultimaSync) : ""}). Sola lettura: per correggere classificazioni o note si lavora sul foglio. Le spese registrate a mano nella scheda Spese sono un'altra cosa: lì decidi tu cosa addebitare ai proprietari.
      </p>
      {filt.length === 0 ? <div style={{ textAlign: "center", padding: 50, color: "var(--gray)" }}>Nessuna transazione per i filtri scelti.</div> : (
        <C_Card style={{ padding: "8px 16px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["Data", "Descrizione", "Macro", "Categoria", "Proprietà", "Conto", "Importo"].map((h, i) => <th key={h} style={C_thS(i === 6)}>{h}</th>)}</tr></thead>
            <tbody>{filt.map(t => (
              <tr key={t.transaction_id}>
                <td style={C_tdS()}>{C_dataIT(t.data)}</td>
                <td style={{ ...C_tdS(), maxWidth: 380, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={t.descrizione}>{t.descrizione}</td>
                <td style={C_tdS()}>{t.macro === "DIMMI TU" ? <span className="tag" style={{ color: "var(--red)", borderColor: "var(--red)" }}>da classificare</span> : <span className="tag">{t.macro || "—"}</span>}</td>
                <td style={C_tdS()}>{t.categoria || "—"}</td>
                <td style={C_tdS()}>{t.sede || "—"}</td>
                <td style={C_tdS()}>{t.conto || "—"}</td>
                <td style={{ ...C_tdS(1), fontWeight: 600, color: C_num(t.importo) >= 0 ? "#2d6a4f" : "var(--red)", whiteSpace: "nowrap" }}>{(C_num(t.importo) >= 0 ? "+" : "−") + " " + EURO(Math.abs(C_num(t.importo))).replace("€ ", "€ ")}</td>
              </tr>))}</tbody>
          </table>
        </C_Card>
      )}
    </>
  );
}

// ── Tab Fatture in entrata: fatture passive rilevate dalle email (sync giornaliera) ──
const C_valuta = (n, v) => v && v !== "EUR" ? (v === "USD" ? "$ " : v + " ") + Number(n || 0).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : EURO(n);
function EntrataTab({ proprieta, onChanged, setMsg }) {
  const [rows, setRows] = useState(null);
  const [fStato, setFStato] = useState("da_registrare");
  const [busy, setBusy] = useState(null);
  const load = useCallback(async () => {
    const r = await sb.get("fatture_ricevute", "?select=*&order=data.desc&limit=500");
    setRows(Array.isArray(r.data) ? r.data : []);
  }, []);
  useEffect(() => { load(); }, [load]);
  if (rows === null) return <div style={{ textAlign: "center", padding: 50, color: "var(--gray)" }}>Caricamento…</div>;

  const filt = rows.filter(r => !fStato || r.stato === fStato);
  const daReg = rows.filter(r => r.stato === "da_registrare");
  const totDaReg = daReg.filter(r => !r.valuta || r.valuta === "EUR").reduce((a, r) => a + C_num(r.importo_totale), 0);
  const nEstere = daReg.filter(r => r.valuta && r.valuta !== "EUR").length;

  const registra = async (f) => {
    let importoEur = C_num(f.importo_totale);
    let notaValuta = "";
    if (f.valuta && f.valuta !== "EUR") {
      const risp = prompt("Fattura in " + f.valuta + " (" + C_valuta(importoEur, f.valuta) + ").\nInserisci l'importo EFFETTIVO addebitato in EUR sul conto (lo trovi nella scheda Banca):", "");
      if (risp === null) return;
      const v = C_num(risp);
      if (!v) { alert("Importo non valido: registrazione annullata."); return; }
      notaValuta = " · originale " + C_valuta(C_num(f.importo_totale), f.valuta);
      importoEur = v;
    }
    setBusy(f.thread_id);
    const res = await sb.post("spese", {
      data: f.data || C_oggi(), categoria: f.categoria && SPESE_CATEGORIE.includes(f.categoria) ? f.categoria : "altro",
      descrizione: ((f.numero_fattura ? "Fatt. " + f.numero_fattura + " · " : "") + (f.oggetto || "")).slice(0, 200) || null,
      fornitore: f.fornitore || null, importo: importoEur, iva_pct: 22,
      addebito: "valente", metodo_pagamento: "bonifico", pagata: false,
      note: "Da fattura ricevuta via email" + notaValuta,
    });
    if (res.ok) {
      const nuova = Array.isArray(res.data) ? res.data[0] : res.data;
      await sb.req("PATCH", "fatture_ricevute", { stato: "registrata", spesa_id: nuova && nuova.id }, `?thread_id=eq.${f.thread_id}`);
      setMsg("Registrata in Spese (da pagare): " + (f.fornitore || "") + " " + EURO(importoEur));
      await load(); if (onChanged) onChanged();
    } else setMsg("Errore nella registrazione.");
    setBusy(null);
  };
  const ignora = async (f, val) => {
    setBusy(f.thread_id);
    await sb.req("PATCH", "fatture_ricevute", { stato: val }, `?thread_id=eq.${f.thread_id}`);
    await load(); setBusy(null);
  };

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 1, background: "var(--gl)", border: "1px solid var(--gl)", marginBottom: 16 }}>
        <C_Kpi l="Da registrare" v={daReg.length} n={EURO(totDaReg) + " in EUR" + (nEstere ? " + " + nEstere + " in valuta estera" : "")} gold={daReg.length > 0} />
        <C_Kpi l="Registrate" v={rows.filter(r => r.stato === "registrata").length} n="già in Spese" />
        <C_Kpi l="Ignorate" v={rows.filter(r => r.stato === "ignorata").length} />
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center" }}>
        <select value={fStato} onChange={e => setFStato(e.target.value)} style={{ width: 170 }}>
          <option value="da_registrare">Da registrare</option><option value="registrata">Registrate</option><option value="ignorata">Ignorate</option><option value="">Tutte</option>
        </select>
        <span style={{ fontSize: 11, color: "var(--gray)" }}>Rilevate automaticamente dalla posta ogni mattina · "Registra" le inserisce in Spese come "da pagare" senza doppioni</span>
      </div>
      {filt.length === 0 ? <div style={{ textAlign: "center", padding: 50, color: "var(--gray)" }}>Nessuna fattura {fStato === "da_registrare" ? "da registrare" : ""}.</div> : (
        <C_Card style={{ padding: "8px 16px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["Data", "Fornitore", "Oggetto", "N. fattura", "Categoria", "Importo", "Stato", ""].map((h, i) => <th key={h || "x"} style={C_thS(i === 5)}>{h}</th>)}</tr></thead>
            <tbody>{filt.map(f => (
              <tr key={f.thread_id}>
                <td style={C_tdS()}>{C_dataIT(f.data)}</td>
                <td style={{ ...C_tdS(), fontWeight: 600 }}>{f.fornitore || "—"}</td>
                <td style={{ ...C_tdS(), maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={f.oggetto}>{f.oggetto || "—"}</td>
                <td style={C_tdS()}>{f.numero_fattura || "—"}</td>
                <td style={C_tdS()}><span className="tag">{f.categoria || "altro"}</span></td>
                <td style={{ ...C_tdS(1), fontWeight: 600, whiteSpace: "nowrap" }}>{f.importo_totale != null ? C_valuta(C_num(f.importo_totale), f.valuta) : "—"}{f.valuta && f.valuta !== "EUR" && <span className="tag" style={{ marginLeft: 6, fontSize: 9, color: "#b8860b", borderColor: "#6366F1" }}>{f.valuta}</span>}</td>
                <td style={C_tdS()}><span className="pill" style={{ background: f.stato === "registrata" ? "#2d6a4f" : f.stato === "ignorata" ? "#888" : "#6366F1" }}>{f.stato.replace("_", " ")}</span></td>
                <td style={{ ...C_tdS(1), whiteSpace: "nowrap" }}>
                  <a href={`https://mail.google.com/mail/u/0/#all/${f.thread_id}`} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "var(--gold)", fontWeight: 600, textDecoration: "none", marginRight: 8 }}>Email →</a>
                  {f.stato === "da_registrare" && <>
                    <button onClick={() => registra(f)} disabled={busy === f.thread_id} style={{ background: "none", border: "none", color: "#2d6a4f", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>{busy === f.thread_id ? "…" : "✓ Registra"}</button>
                    <button onClick={() => ignora(f, "ignorata")} disabled={busy === f.thread_id} style={{ background: "none", border: "none", color: "var(--red)", fontSize: 11, cursor: "pointer" }}>Ignora</button>
                  </>}
                  {f.stato === "ignorata" && <button onClick={() => ignora(f, "da_registrare")} disabled={busy === f.thread_id} style={{ background: "none", border: "none", color: "var(--gray)", fontSize: 11, cursor: "pointer" }}>↩ Riapri</button>}
                </td>
              </tr>))}</tbody>
          </table>
        </C_Card>
      )}
    </>
  );
}

/* ============ FINE SEZIONE CONTABILITÀ ============ */

/* ============ SEZIONE NOTIFICHE: posta Gmail classificata per priorità ============ */
/* I dati arrivano dalla tabella email_notifiche, alimentata ogni ora dalla sync Gmail (Cowork). */
const PRIO_INFO = { 3: { label: "Alta", color: "#c0392b" }, 2: { label: "Media", color: "#6366F1" }, 1: { label: "Bassa", color: "#8a8a8a" } };
const N_quando = (d) => {
  if (!d) return "—";
  const t = new Date(d), ore = (Date.now() - t.getTime()) / 36e5;
  if (ore < 1) return Math.max(1, Math.round(ore * 60)) + " min fa";
  if (ore < 24) return Math.round(ore) + " h fa";
  return t.toLocaleDateString("it-IT", { day: "2-digit", month: "short" }) + " " + t.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
};

function NotificheView({ onDataChanged }) {
  const [rows, setRows] = useState(null);
  const [fPrio, setFPrio] = useState("");
  const [fCat, setFCat] = useState("");
  const [mostraGestite, setMostraGestite] = useState(false);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    const r = await sb.get("email_notifiche", "?select=*&order=priorita.desc,data.desc&limit=500");
    setRows(Array.isArray(r.data) ? r.data : []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const segnaGestita = async (n, val) => {
    setBusy(n.thread_id);
    await sb.req("PATCH", "email_notifiche", { gestita: val }, `?thread_id=eq.${n.thread_id}`);
    await load(); setBusy(null);
    if (onDataChanged) onDataChanged();
  };

  if (rows === null) return <div style={{ textAlign: "center", padding: 60, color: "var(--gray)" }}>Caricamento notifiche…</div>;

  const cats = [...new Set(rows.map(r => r.categoria).filter(Boolean))].sort();
  const filt = rows.filter(r =>
    (mostraGestite || !r.gestita) &&
    (!fPrio || String(r.priorita) === fPrio) &&
    (!fCat || r.categoria === fCat));
  const aperte = rows.filter(r => !r.gestita);
  const nAlta = aperte.filter(r => r.priorita === 3).length;
  const ultimaSync = rows.length ? rows.reduce((m, r) => (r.synced_at || "") > m ? r.synced_at : m, "") : null;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 8 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700 }}>Notifiche</h1>
          <p style={{ fontSize: 12, color: "var(--gray)", marginTop: 4 }}>
            Posta valenteliving@gmail.com classificata per priorità · aggiornata ogni ora{ultimaSync ? " · ultima sync " + N_quando(ultimaSync) : ""}
          </p>
        </div>
        <button className="bg" onClick={load}>↻ Aggiorna</button>
      </div>
      <div className="gl" style={{ marginBottom: 18 }} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 1, background: "var(--gl)", border: "1px solid var(--gl)", marginBottom: 18 }}>
        <C_Kpi l="Da gestire" v={aperte.length} n="notifiche aperte" />
        <C_Kpi l="Priorità alta" v={nAlta} n="adempimenti, PEC, urgenze" gold={nAlta > 0} />
        <C_Kpi l="Non lette su Gmail" v={aperte.filter(r => !r.letto).length} n="tra le aperte" />
        <C_Kpi l="Gestite" v={rows.length - aperte.length} n="archiviate" />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        <select value={fPrio} onChange={e => setFPrio(e.target.value)} style={{ width: 140 }}>
          <option value="">Tutte le priorità</option><option value="3">Alta</option><option value="2">Media</option><option value="1">Bassa</option>
        </select>
        <select value={fCat} onChange={e => setFCat(e.target.value)} style={{ width: 160 }}>
          <option value="">Tutte le categorie</option>{cats.map(c => <option key={c}>{c}</option>)}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--gray)", cursor: "pointer" }}>
          <input type="checkbox" checked={mostraGestite} onChange={e => setMostraGestite(e.target.checked)} style={{ width: 14, height: 14, accentColor: "var(--gold)" }} />
          mostra anche gestite
        </label>
      </div>

      {filt.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--gray)" }}>Nessuna notifica da gestire. 🎉</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filt.map(n => {
            const pi = PRIO_INFO[n.priorita] || PRIO_INFO[1];
            return (
              <div key={n.thread_id} className="fi" style={{ display: "flex", gap: 12, padding: "12px 16px", background: "var(--white)", border: "1px solid var(--gl)", borderRadius: 12, boxShadow: "var(--shadow)", borderLeft: `4px solid ${pi.color}`, opacity: n.gestita ? .55 : 1, alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: n.letto ? 500 : 700 }}>{n.oggetto}</span>
                    {!n.letto && <span className="tag" style={{ fontSize: 9, color: "#1d6fa4", borderColor: "#1d6fa4" }}>non letta</span>}
                    {n.categoria && <span className="tag" style={{ fontSize: 9 }}>{n.categoria}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--gray)", marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.anteprima}</div>
                  <div style={{ fontSize: 11, color: "var(--gray)" }}>
                    <strong style={{ color: "var(--black)" }}>{n.mittente}</strong> · {N_quando(n.data)}{n.motivo ? " · " + n.motivo : ""}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end", flexShrink: 0 }}>
                  <span className="pill" style={{ background: pi.color }}>{pi.label}</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <a href={`https://mail.google.com/mail/u/0/#all/${n.thread_id}`} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "var(--gold)", fontWeight: 600, textDecoration: "none" }}>Apri in Gmail →</a>
                    <button onClick={() => segnaGestita(n, !n.gestita)} disabled={busy === n.thread_id}
                      style={{ background: "none", border: "none", color: n.gestita ? "var(--gray)" : "#2d6a4f", fontSize: 11, fontWeight: 600, cursor: "pointer", padding: 0 }}>
                      {busy === n.thread_id ? "…" : n.gestita ? "↩ Riapri" : "✓ Gestita"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
/* ============ FINE SEZIONE NOTIFICHE ============ */



// ── Foglio Google "Controllo di gestione" (ticket) — letto in tempo reale ─────
const TICKET_CSV = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTOVM-nXRUikGSR32-5EnyAK9NonBHGRnldrbbLIdD2Z7g1oPw6hRbqFyvzA4AvzIgYSOZjVL8y0Ch_/pub?output=csv";
const SYNC_MS = 12 * 60 * 60 * 1000; // sincronizza 2 volte al giorno
function parseCSV(t) {
  const rows = []; let f = "", row = [], q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else { if (c === '"') q = true; else if (c === ",") { row.push(f); f = ""; } else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; } else if (c !== "\r") f += c; }
  }
  if (f.length || row.length) { row.push(f); rows.push(row); }
  return rows;
}
const TICKET_STATO_COLOR = { "completata": "#2d6a4f", "in corso": "#1d6fa4", "in attesa": "#e07b39", "da fare": "#6366F1", "aperto": "#6366F1", "annullata": "#888" };

function AttivitaView() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [updated, setUpdated] = useState(null);

  const carica = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const txt = await (await fetch(TICKET_CSV, { cache: "no-store" })).text();
      const raw = parseCSV(txt);
      const hi = raw.findIndex(r => r.join("|").toLowerCase().includes("attività") && r.join("|").toLowerCase().includes("stato"));
      const header = hi >= 0 ? raw[hi] : [];
      const idx = (name) => header.findIndex(h => (h || "").toLowerCase().includes(name));
      const iA = idx("attività"), iS = idx("stato"), iMit = idx("mittente"), iDest = idx("destinatario"), iScad = idx("scadenza"), iNoteM = header.findIndex(h => /note\s*mittente/i.test(h || "")), iNoteD = header.findIndex(h => /note\s*destinatario/i.test(h || "")), iId = idx("ticket id");
      const data = raw.slice(hi + 1).map(r => ({
        attivita: r[iA] || "", stato: (r[iS] || "").trim(), mittente: r[iMit] || "", destinatario: r[iDest] || "",
        scadenza: r[iScad] || "", noteM: r[iNoteM] || "", noteD: r[iNoteD] || "", id: r[iId] || "",
      })).filter(t => t.attivita && t.attivita.toLowerCase() !== "attività");
      setRows(data); setUpdated(new Date());
    } catch { setErr("Impossibile leggere il foglio dei ticket. Verifica la connessione."); }
    setLoading(false);
  }, []);

  useEffect(() => { carica(); const t = setInterval(carica, SYNC_MS); return () => clearInterval(t); }, [carica]);

  const aperti = rows.filter(t => !/complet|annull/i.test(t.stato)).length;
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 8, gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700 }}>Attività &amp; Ticket</h1>
          <p style={{ fontSize: 12, color: "var(--gray)", marginTop: 4 }}>
            Controllo di gestione · {rows.length} ticket{aperti ? ` · ${aperti} aperti` : ""}
            {updated && <> · sincronizzato {updated.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</>}
          </p>
        </div>
        <button className="bg" onClick={carica} disabled={loading}>{loading ? "Sincronizzo…" : "↻ Sincronizza"}</button>
      </div>
      <div className="gl" style={{ marginBottom: 12 }} />
      <p style={{ fontSize: 11, color: "var(--gray)", marginBottom: 20 }}>🔄 Si sincronizza in automatico 2 volte al giorno dal foglio Google condiviso con i proprietari.</p>
      {err && <div style={{ fontSize: 13, color: "var(--red)", marginBottom: 12 }}>{err}</div>}
      {loading && rows.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--gray)" }}>Sincronizzazione in corso…</div>
      ) : rows.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--gray)" }}>Nessun ticket presente sul foglio.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
          {rows.map((t, i) => {
            const col = TICKET_STATO_COLOR[t.stato.toLowerCase()] || "#888";
            return (
              <div key={i} className="card fi" style={{ cursor: "default", borderTop: `3px solid ${col}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600 }}>{t.attivita}</h3>
                  {t.stato && <span className="pill" style={{ background: col, flexShrink: 0 }}>{t.stato}</span>}
                </div>
                {t.destinatario && <p style={{ fontSize: 12, color: "var(--gray)", marginBottom: 3 }}>👤 {t.destinatario}</p>}
                {t.scadenza && <p style={{ fontSize: 12, color: "var(--gray)", marginBottom: 3 }}>📅 {t.scadenza}</p>}
                {(t.noteM || t.noteD) && <p style={{ fontSize: 11, color: "var(--gray)", marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--cd)" }}>{[t.noteM, t.noteD].filter(Boolean).join(" · ")}</p>}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ── Workbook "Controllo di gestione Valente Living" — tutti i fogli, live ─────
const CDG_PUB = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTOVM-nXRUikGSR32-5EnyAK9NonBHGRnldrbbLIdD2Z7g1oPw6hRbqFyvzA4AvzIgYSOZjVL8y0Ch_/pub";
const CDG_FOGLI = [
  { nome: "Tickets", gid: "1944759845" },
  { nome: "Transazioni 2026", gid: "940145677" },
  { nome: "Proprietà", gid: "579946916" },
  { nome: "Property Managers", gid: "1447853709" },
  { nome: "Distinte di pagamento + F24", gid: "1939873154" },
  { nome: "Scadenzario in Uscita", gid: "750917577", sheet: "Scadenzario in Uscita (pagamenti)", statusCol: "STATO" },
  { nome: "Scadenzario in Entrata", gid: "863375586", sheet: "Scadenzario in Entrata (fatture da emettere)", statusCol: "STATO FATTURA" },
  { nome: "Fatture Valente Living", gid: "662136451" },
  { nome: "Lista Fornitori", gid: "1167038705" },
  { nome: "Configurazione gestione", gid: "1292179885" },
  { nome: "Fatture dei fornitori", gid: "2131643750" },
  { nome: "Via ruga degli Orlandi", gid: "570047146" },
  { nome: "Crediti e debiti", gid: "1357534243" },
];
const CDG_NUM_RE = /^[€$\s]*-?\d{1,3}(?:[.\s]\d{3})*(?:,\d+)?\s*%?$|^[€$\s]*-?\d+(?:[.,]\d+)?\s*%?$/;
const cdgNum = (v) => parseFloat(String(v).replace(/[^0-9,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
const CDG_BRIDGE = "/.netlify/functions/cdg-bridge";
function FoglioWritableTab({ foglio }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState({ col: null, dir: 1 });
  const [savingRow, setSavingRow] = useState(null);
  const [msg, setMsg] = useState("");

  const carica = useCallback(async () => {
    setLoading(true); setErr(""); setMsg("");
    try {
      const r = await fetch(`${CDG_BRIDGE}?action=read&sheet=${encodeURIComponent(foglio.sheet)}`, { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "errore");
      setData({ headers: j.headers, rows: j.rows, headerRow: j.headerRow });
    } catch (e) { setErr("Impossibile leggere il foglio dal vivo."); }
    setLoading(false);
  }, [foglio.sheet]);
  useEffect(() => { carica(); }, [carica]);

  const colIdx = data ? data.headers.indexOf(foglio.statusCol) : -1;
  const opzioni = useMemo(() => {
    if (!data || colIdx < 0) return [];
    const s = new Set();
    data.rows.forEach((r) => { const v = (r[colIdx] || "").trim(); if (v) s.add(v); });
    return [...s];
  }, [data, colIdx]);

  const righe = useMemo(() => {
    if (!data) return [];
    let idx = data.rows.map((r, i) => ({ r, i }));
    if (q.trim()) { const s = q.toLowerCase(); idx = idx.filter((o) => o.r.some((v) => v.toLowerCase().includes(s))); }
    if (sort.col !== null) {
      idx = [...idx].sort((a, b) => {
        const x = a.r[sort.col] || "", y = b.r[sort.col] || "";
        const num = CDG_NUM_RE.test(x) && CDG_NUM_RE.test(y);
        let c = num ? (cdgNum(x) - cdgNum(y)) : x.localeCompare(y, "it", { numeric: true });
        if (Number.isNaN(c)) c = 0;
        return c * sort.dir;
      });
    }
    return idx;
  }, [data, q, sort, colIdx]);

  const setStato = async (rowIndex, value) => {
    const absRow = data.headerRow + rowIndex + 2;
    setSavingRow(rowIndex); setMsg("");
    const prev = data.rows[rowIndex][colIdx];
    setData((d) => { const rows = d.rows.map((r) => r.slice()); rows[rowIndex][colIdx] = value; return { ...d, rows }; });
    try {
      const r = await fetch(CDG_BRIDGE, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sheet: foglio.sheet, row: absRow, col: foglio.statusCol, value }) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "errore");
      setMsg(`✓ Salvato sul foglio Google: ${foglio.statusCol} = "${value}"`);
    } catch (e) {
      setData((d) => { const rows = d.rows.map((r) => r.slice()); rows[rowIndex][colIdx] = prev; return { ...d, rows }; });
      setMsg("⚠️ Salvataggio non riuscito, riprova.");
    }
    setSavingRow(null);
  };

  const onSelect = (rowIndex, e) => {
    const v = e.target.value;
    if (v === "__altro__") { const c = window.prompt(`Nuovo valore per ${foglio.statusCol}:`); if (c && c.trim()) setStato(rowIndex, c.trim()); return; }
    setStato(rowIndex, v);
  };

  const clickSort = (ci) => setSort((s) => (s.col === ci ? { col: ci, dir: -s.dir } : { col: ci, dir: 1 }));

  if (data === null) return <div style={{ textAlign: "center", padding: 50, color: "var(--gray)" }}>{err || `Caricamento «${foglio.nome}» dal vivo…`}</div>;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Cerca in ${foglio.nome}…`} style={{ flex: 1, minWidth: 220, maxWidth: 360, padding: "9px 12px", border: "1px solid var(--gl)", fontSize: 13 }} />
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--gray)" }}>{righe.length} righe</span>
          <button className="bg" onClick={carica} disabled={loading}>{loading ? "…" : "↻ Aggiorna"}</button>
        </div>
      </div>
      <div style={{ fontSize: 11, color: "var(--gray)", marginBottom: 8 }}>✏️ Modificabile: cambia la colonna <b>{foglio.statusCol}</b> dal menu e si aggiorna direttamente sul foglio Google.</div>
      {msg && <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: msg[0] === "✓" ? "#2d6a4f" : "var(--red)" }}>{msg}</div>}
      {err && <div style={{ fontSize: 13, color: "var(--red)", marginBottom: 10 }}>{err}</div>}
      <div style={{ overflow: "auto", maxHeight: "64vh", border: "1px solid var(--gl)", background: "#fff" }}>
        <table style={{ borderCollapse: "collapse", fontSize: 12.5, width: "max-content", minWidth: "100%" }}>
          <thead><tr>{data.headers.map((h, ci) => (
            <th key={ci} onClick={() => clickSort(ci)} style={{ position: "sticky", top: 0, zIndex: 1, cursor: "pointer", padding: "8px 10px", borderBottom: "2px solid var(--black)", borderRight: "1px solid var(--gl)", textAlign: "left", fontSize: 10.5, letterSpacing: .5, textTransform: "uppercase", color: ci === colIdx ? "var(--gold)" : "var(--gray)", fontWeight: 600, background: "#faf8f4", whiteSpace: "nowrap", userSelect: "none" }}>
              {h || "—"}{sort.col === ci ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
            </th>))}</tr></thead>
          <tbody>
            {righe.map(({ r, i }) => (
              <tr key={i}>{data.headers.map((_, ci) => ci === colIdx ? (
                <td key={ci} style={{ padding: "5px 8px", borderBottom: "1px solid var(--gl)", borderRight: "1px solid var(--gl)", background: "#fffdf6" }}>
                  <select value={opzioni.includes(r[ci]) ? r[ci] : (r[ci] || "")} disabled={savingRow === i} onChange={(e) => onSelect(i, e)} style={{ fontSize: 12, padding: "3px 6px", border: "1px solid var(--gl)", maxWidth: 180 }}>
                    {!opzioni.includes(r[ci]) && <option value={r[ci] || ""}>{r[ci] || "—"}</option>}
                    {opzioni.map((o) => <option key={o} value={o}>{o}</option>)}
                    <option value="__altro__">✎ Altro…</option>
                  </select>
                </td>
              ) : (
                <td key={ci} style={{ padding: "7px 10px", borderBottom: "1px solid var(--gl)", borderRight: "1px solid var(--gl)", whiteSpace: "nowrap", maxWidth: 340, overflow: "hidden", textOverflow: "ellipsis" }} title={r[ci] || ""}>{r[ci] || ""}</td>
              ))}</tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 11, color: "var(--gray)", marginTop: 10 }}>Scrive direttamente sul foglio Google «{foglio.sheet}». Le altre colonne sono in sola lettura.</p>
    </div>
  );
}

function FoglioGoogleTab({ foglio }) {
  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState({ col: null, dir: 1 });

  const carica = useCallback(async () => {
    setLoading(true); setErr(""); setQ(""); setSort({ col: null, dir: 1 });
    try {
      const txt = await (await fetch(`${CDG_PUB}?gid=${foglio.gid}&single=true&output=csv`, { cache: "no-store" })).text();
      const r0 = parseCSV(txt);
      const maxc = r0.reduce((m, r) => Math.max(m, r.length), 0);
      const keep = [];
      for (let c = 0; c < maxc; c++) if (r0.some((r) => (r[c] || "").trim() !== "")) keep.push(c);
      setRaw(r0.map((r) => keep.map((c) => (r[c] || "").trim())).filter((r) => r.some((v) => v !== "")));
    } catch { setErr("Impossibile leggere il foglio. Verifica la connessione."); }
    setLoading(false);
  }, [foglio.gid]);
  useEffect(() => { carica(); }, [carica]);

  const { intro, header, body } = useMemo(() => {
    if (!raw || !raw.length) return { intro: [], header: [], body: [] };
    let hi = 0, best = -1;
    for (let i = 0; i < Math.min(8, raw.length); i++) { const c = raw[i].filter((v) => v !== "").length; if (c > best) { best = c; hi = i; } }
    return { intro: raw.slice(0, hi), header: raw[hi] || [], body: raw.slice(hi + 1) };
  }, [raw]);

  const view = useMemo(() => {
    let rows = body;
    if (q.trim()) { const s = q.toLowerCase(); rows = rows.filter((r) => r.some((v) => v.toLowerCase().includes(s))); }
    if (sort.col !== null) {
      rows = [...rows].sort((a, b) => {
        const x = a[sort.col] || "", y = b[sort.col] || "";
        const numeric = CDG_NUM_RE.test(x) && CDG_NUM_RE.test(y);
        let c = numeric ? (cdgNum(x) - cdgNum(y)) : x.localeCompare(y, "it", { numeric: true });
        if (Number.isNaN(c)) c = 0;
        return c * sort.dir;
      });
    }
    return rows;
  }, [body, q, sort]);

  const clickSort = (ci) => setSort((s) => (s.col === ci ? { col: ci, dir: -s.dir } : { col: ci, dir: 1 }));

  if (raw === null) return <div style={{ textAlign: "center", padding: 50, color: "var(--gray)" }}>Caricamento «{foglio.nome}»…</div>;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Cerca in ${foglio.nome}…`} style={{ flex: 1, minWidth: 220, maxWidth: 360, padding: "9px 12px", border: "1px solid var(--gl)", fontSize: 13 }} />
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--gray)" }}>{view.length} righe{q ? ` su ${body.length}` : ""}</span>
          <button className="bg" onClick={carica} disabled={loading}>{loading ? "…" : "↻ Aggiorna"}</button>
        </div>
      </div>
      {err && <div style={{ fontSize: 13, color: "var(--red)", marginBottom: 12 }}>{err}</div>}
      {intro.length > 0 && <div style={{ fontSize: 11, color: "var(--gray)", marginBottom: 10, lineHeight: 1.5 }}>{intro.map((r, i) => <div key={i}>{r.filter(Boolean).join(" · ")}</div>)}</div>}
      {body.length === 0 ? <div style={{ textAlign: "center", padding: 50, color: "var(--gray)" }}>Foglio vuoto.</div> : (
        <div style={{ overflow: "auto", maxHeight: "64vh", border: "1px solid var(--gl)", background: "#fff" }}>
          <table style={{ borderCollapse: "collapse", fontSize: 12.5, width: "max-content", minWidth: "100%" }}>
            <thead>
              <tr>{header.map((h, ci) => (
                <th key={ci} onClick={() => clickSort(ci)} title="Ordina" style={{ position: "sticky", top: 0, zIndex: 1, cursor: "pointer", padding: "8px 10px", borderBottom: "2px solid var(--black)", borderRight: "1px solid var(--gl)", textAlign: "left", fontSize: 10.5, letterSpacing: .5, textTransform: "uppercase", color: "var(--gray)", fontWeight: 600, background: "#faf8f4", whiteSpace: "nowrap", userSelect: "none" }}>
                  {h || "—"}{sort.col === ci ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
                </th>))}</tr>
            </thead>
            <tbody>
              {view.map((r, ri) => (
                <tr key={ri}>{header.map((_, ci) => (
                  <td key={ci} style={{ padding: "7px 10px", borderBottom: "1px solid var(--gl)", borderRight: "1px solid var(--gl)", whiteSpace: "nowrap", maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis" }} title={r[ci] || ""}>{r[ci] || ""}</td>
                ))}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p style={{ fontSize: 11, color: "var(--gray)", marginTop: 10 }}>Fonte: file Google «Controllo di gestione Valente Living» · sola lettura · clic sull'intestazione per ordinare.</p>
    </div>
  );
}
// ── Home / Dashboard: roadmap a 100, mappa, timeline, prossimi obiettivi ──────
const OBIETTIVO_IMMOBILI = 100;
function fmtData(d) {
  if (!d) return null;
  const dt = new Date(d);
  if (isNaN(dt)) return String(d);
  return dt.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}
function HomeView({ proprieta, owners, stats, onVai, onApriProp }) {
  const totale = stats.totale;
  const pct = Math.min(100, Math.round((totale / OBIETTIVO_IMMOBILI) * 100));
  const mancanti = Math.max(0, OBIETTIVO_IMMOBILI - totale);

  const conData = (proprieta || []).map(p => ({ p, d: p.data_inizio || p.created_at || null }))
    .filter(x => x.d).sort((a, b) => new Date(a.d) - new Date(b.d));
  const inArrivo = (proprieta || []).filter(p => ["in lancio", "mandato firmato", "mandato + cin"].includes(p.stato));
  const eventi = [...conData.slice(-8)];

  // Arrivi recenti: restano in cima finché non li si è guardati e assegnati
  const novita = (proprieta || []).filter(appenaArrivata)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const milestoneNext = [25, 40, 50, 75, 100].find(m => m > totale) || 100;
  const obiettivi = [
    inArrivo.length ? { t: `Lanciare ${inArrivo.length} immobili in pipeline`, s: "in onboarding (mandato/lancio)", c: "#6366F1", go: "lancio" } : null,
    stats.senzaCin ? { t: `Ottenere il CIN per ${stats.senzaCin} immobili attivi`, s: "CIN mancante", c: "#e07b39", go: "proprieta" } : null,
    { t: `Raggiungere ${milestoneNext} immobili`, s: `mancano ${milestoneNext - totale} immobili`, c: "#1d6fa4", go: "proprieta" },
    { t: `Obiettivo finale: ${OBIETTIVO_IMMOBILI} immobili`, s: `mancano ${mancanti}`, c: "#2d6a4f", go: "proprieta" },
  ].filter(Boolean);

  return (
    <>
      {novita.length > 0 && (
        <div style={{ background: "var(--white)", border: "1px solid rgba(22,101,52,.3)", borderRadius: 12, boxShadow: "var(--shadow)", padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#166534", marginBottom: 8 }}>
            ✨ {novita.length} nuov{novita.length === 1 ? "o immobile" : "i immobili"} negli ultimi {GIORNI_NOVITA} giorni
          </div>
          {novita.map(p => (
            <div key={p.id} onClick={() => onApriProp && onApriProp(p)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderTop: "1px solid var(--cd)", cursor: "pointer", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>{p.nome}</span>
                <span style={{ fontSize: 11, color: "var(--gray)", marginLeft: 6 }}>{[p.citta, p.provincia && `(${p.provincia})`].filter(Boolean).join(" ")}</span>
              </div>
              <span style={{ fontSize: 11, color: "var(--gray)" }}>
                {p.agente ? `portato da ${p.agente}` : "inserito internamente"} · {new Date(p.created_at).toLocaleDateString("it-IT")}
              </span>
              {!p.gestore_interno && <span className="tag" style={{ background: "#FEF3C7", color: "#92400E", borderColor: "transparent" }}>da assegnare</span>}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginBottom: 8 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700 }}>Valente Living · Dashboard</h1>
        <p style={{ fontSize: 12, color: "var(--gray)", marginTop: 4 }}>Dove siamo e dove stiamo andando</p>
      </div>
      <div className="gl" style={{ marginBottom: 24 }} />

      <div className="card" style={{ cursor: "default", padding: 24, marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--gold)", marginBottom: 6 }}>Roadmap verso {OBIETTIVO_IMMOBILI} immobili</p>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontFamily: "Inter", fontSize: 44, fontWeight: 700, lineHeight: 1 }}>{totale}</span>
              <span style={{ fontSize: 16, color: "var(--gray)" }}>/ {OBIETTIVO_IMMOBILI}</span>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <span style={{ fontFamily: "Inter", fontSize: 40, fontWeight: 700, color: "var(--gold)" }}>{pct}%</span>
            <p style={{ fontSize: 11, color: "var(--gray)" }}>mancano {mancanti} immobili</p>
          </div>
        </div>
        <div style={{ height: 16, background: "var(--cd)", borderRadius: 999, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg, #2d6a4f, var(--gold))", borderRadius: 999, transition: "width .6s ease" }} />
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 16, flexWrap: "wrap" }}>
          {[{ n: stats.attivi, l: "attivi", c: "#2d6a4f" }, { n: stats.onboarding, l: "in lancio", c: "#6366F1" }, { n: owners.length, l: "proprietari", c: "#1d6fa4" }, { n: stats.senzaCin, l: "senza CIN", c: "#e07b39" }].map((k, i) => (
            <div key={i} style={{ flex: "1 1 90px", background: "var(--cream)", border: "1px solid var(--gl)", padding: "10px 12px" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: k.c, fontFamily: "Inter" }}>{k.n}</div>
              <div style={{ fontSize: 10, color: "var(--gray)", textTransform: "uppercase", letterSpacing: ".06em" }}>{k.l}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "start" }} className="home-grid">
        <MappaItalia proprieta={proprieta} compact />

        <div className="card" style={{ cursor: "default", padding: 20 }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--gold)", marginBottom: 14 }}>Prossimi obiettivi</p>
          {obiettivi.map((o, i) => (
            <div key={i} onClick={() => onVai(o.go)} style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 0", borderBottom: i < obiettivi.length - 1 ? "1px solid var(--cd)" : "none", cursor: "pointer" }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: o.c, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 600 }}>{o.t}</p>
                <p style={{ fontSize: 11, color: "var(--gray)" }}>{o.s}</p>
              </div>
              <span style={{ color: "var(--gray)", fontSize: 16 }}>›</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ cursor: "default", padding: 20, marginTop: 24 }}>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--gold)", marginBottom: 16 }}>Timeline crescita</p>
        {eventi.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--gray)" }}>Aggiungi la "Data inizio" agli immobili per popolare la timeline cronologica.</p>
        ) : (
          <div style={{ position: "relative", paddingLeft: 18 }}>
            <div style={{ position: "absolute", left: 4, top: 4, bottom: 4, width: 2, background: "var(--gl)" }} />
            {eventi.map(({ p, d }, i) => (
              <div key={p.id || i} onClick={() => onApriProp(p)} style={{ position: "relative", paddingBottom: 16, cursor: "pointer" }}>
                <span style={{ position: "absolute", left: -18, top: 2, width: 10, height: 10, borderRadius: "50%", background: STATI_COLOR[p.stato] || "#888", border: "2px solid var(--cream)" }} />
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600 }}>{p.nome}</p>
                    <p style={{ fontSize: 11, color: "var(--gray)" }}>{p.citta || ""}{p.provincia ? ` (${p.provincia})` : ""}</p>
                  </div>
                  <span style={{ fontSize: 11, color: "var(--gray)", whiteSpace: "nowrap" }}>{fmtData(d)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        {inArrivo.length > 0 && (
          <div style={{ marginTop: 8, paddingTop: 14, borderTop: "1px solid var(--cd)" }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: "var(--gray)", marginBottom: 8 }}>In arrivo ({inArrivo.length})</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {inArrivo.map(p => <span key={p.id} onClick={() => onApriProp(p)} className="tag" style={{ cursor: "pointer", borderColor: STATI_COLOR[p.stato] }}>{p.nome}</span>)}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function App({ utente, onLogout }) {
  const [view, setView] = useState("home");
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
  const [propVista, setPropVista] = useState("elenco");
  const [ownVista, setOwnVista] = useState("elenco");
  const [propRaggr, setPropRaggr] = useState("provincia");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [leads, setLeads] = useState([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [leadsError, setLeadsError] = useState("");
  const [notifStato, setNotifStato] = useState("idle"); // idle|loading|on|denied|unsupported (v20)
  const [notifCount, setNotifCount] = useState(0); // notifiche email non gestite
  // Tendine del menu: quali gruppi sono aperti (ricordato sul dispositivo)
  const [gruppiAperti, setGruppiAperti] = useState(() => {
    try { return JSON.parse(localStorage.getItem("vl_nav_gruppi")) || { Operativo: true, Documenti: false }; }
    catch { return { Operativo: true, Documenti: false }; }
  });
  const toggleGruppo = (g) => setGruppiAperti(s => {
    const n = { ...s, [g]: !s[g] };
    try { localStorage.setItem("vl_nav_gruppi", JSON.stringify(n)); } catch (_) {}
    return n;
  });

  const [sonoMaster, setSonoMaster] = useState(false);   // gestisce accessi
  const [vedoTutto, setVedoTutto] = useState(false);     // master o socio
  const [ruoloLetto, setRuoloLetto] = useState(false);   // ruolo già verificato sul database
  const [sonoAgente, setSonoAgente] = useState(false);   // agente esterno: vista ridotta
  const [inAttesa, setInAttesa] = useState(false);       // registrato ma non ancora approvato
  const [mioNome, setMioNome] = useState("");            // nome con cui firmo i documenti caricati
  const [gestori, setGestori] = useState(GESTORI);       // nomi dall'anagrafica collaboratori

  const [coloriGestori, setColoriGestori] = useState({});
  const [daApprovare, setDaApprovare] = useState(0);     // agenti registrati in attesa di via libera

  // Registrazioni agenti in sospeso: il titolare le vede subito nel menu, senza cercarle
  useEffect(() => {
    if (!sonoMaster) { setDaApprovare(0); return; }
    let vivo = true;
    const conta = () => sb.get("collaboratori", "?select=id&stato_approvazione=eq.in_attesa")
      .then(({ data }) => { if (vivo && Array.isArray(data)) setDaApprovare(data.length); })
      .catch(() => {});
    conta();
    const t = setInterval(conta, 120000); // ricontrolla ogni due minuti
    return () => { vivo = false; clearInterval(t); };
  }, [sonoMaster, view]);

  // Elenco assegnatari sempre allineato a chi è davvero nel team
  useEffect(() => {
    sb.get("collaboratori", "?select=nome,attivo,colore&order=nome.asc").then(({ data }) => {
      if (Array.isArray(data) && data.length) {
        const vivi = data.filter(c => c.attivo !== false);
        setGestori(vivi.map(c => c.nome));
        setColoriGestori(Object.fromEntries(vivi.map(c => [c.nome, c.colore || "#94A3B8"])));
      }
    }).catch(() => {});
  }, [utente]);

  const coloreGestore = useCallback((n) => coloriGestori[n] || "#94A3B8", [coloriGestori]);

  // Chi non vede tutto parte dai propri immobili: la dashboard non fa parte del suo menu
  useEffect(() => {
    if (!ruoloLetto) return;
    // L'agente ha due sole sezioni: i suoi immobili e il valutatore
    if (sonoAgente) { if (view !== "portale" && view !== "valutazione") setView("portale"); return; }
    if (!vedoTutto && ["home", "notifiche", "gestione", "lead", "lancio", "smistamento", "ricorrenti", "archivio", "team", "portale"].includes(view)) {
      setView("proprieta");
    }
  }, [vedoTutto, sonoAgente, ruoloLetto, view]);

  const load = useCallback(async () => {
    setLoading(true);
    const [rP, rO, rN] = await Promise.all([sb.get("proprieta", "?select=*&order=created_at.desc"), sb.get("proprietari", "?select=*&order=created_at.desc"), sb.get("email_notifiche", "?select=thread_id&gestita=is.false&limit=999")]);
    if (rP.data) setProprieta(rP.data);
    if (rO.data) setOwners(rO.data);
    if (Array.isArray(rN.data)) setNotifCount(rN.data.length);
    setLoading(false);
  }, []);

  // Assegna il property manager direttamente dall'elenco, senza aprire la scheda
  // (definita DOPO load, altrimenti la si userebbe prima che esista)
  const assegnaGestore = useCallback(async (p, nome) => {
    setProprieta(ps => ps.map(x => x.id === p.id ? { ...x, gestore_interno: nome || null } : x)); // risposta immediata
    const { ok } = await sb.patch("proprieta", p.id, { gestore_interno: nome || null });
    if (!ok) { alert("Assegnazione non riuscita."); load(); }
  }, [load]);

  // Livello di accesso dell'utente collegato: decide cosa può vedere
  useEffect(() => {
    if (!utente) return;
    sb.get("collaboratori", `?select=nome,ruolo_accesso,stato_approvazione&user_id=eq.${utente.id}`).then(({ data }) => {
      const c = Array.isArray(data) && data[0] ? data[0] : null;
      const r = c ? c.ruolo_accesso : null;
      setMioNome(c ? c.nome : "");
      const attesa = c && c.stato_approvazione === "in_attesa";
      setSonoMaster(r === "master" && !attesa);
      setVedoTutto((r === "master" || r === "socio") && !attesa);
      setSonoAgente(r === "agente");
      setInAttesa(!!attesa);
      setRuoloLetto(true);
    }).catch(() => { setSonoMaster(false); setVedoTutto(false); setRuoloLetto(true); });
  }, [utente]);

  useEffect(() => { load(); }, [load]);

  // PWA + push: prepara meta/manifest, registra il SW e rileva se gia iscritto (v20)
  useEffect(() => {
    setupPWA();
    try {
      if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) { setNotifStato("unsupported"); return; }
      if (Notification.permission === "denied") { setNotifStato("denied"); return; }
      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => { if (sub) setNotifStato("on"); })
        .catch(() => {});
    } catch { /* ignore */ }
  }, []);

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
    const clean = { ...f, provincia: f.provincia ? String(f.provincia).trim().toUpperCase() : null, citta: f.citta ? String(f.citta).trim() : null, commissione: f.commissione ? parseFloat(f.commissione) : null, posti_letto: f.posti_letto ? parseInt(f.posti_letto) : null, camere: f.camere ? parseInt(f.camere) : null, bagni: f.bagni ? parseInt(f.bagni) : null, mq: f.mq ? parseInt(f.mq) : null };
    const statoPrec = modalP === "new" ? null : modalP.stato;
    if (modalP === "new") await sb.post("proprieta", clean); else await sb.patch("proprieta", modalP.id, clean);
    if (clean.stato === "in lancio" && statoPrec !== "in lancio") inviaPush("Proprietà in lancio", (clean.nome || "Una proprietà") + " è passata a in lancio", "/");
    await load(); setSaving(false); setModalP(null);
  };
  const saveO = async (f) => { setSaving(true); if (modalO === "new") await sb.post("proprietari", f); else await sb.patch("proprietari", modalO.id, f); await load(); setSaving(false); setModalO(null); };
  const delP = async id => { if (!confirm("Eliminare?")) return; await sb.del("proprieta", id); await load(); setDetP(null); };
  const delO = async id => { if (!confirm("Eliminare?")) return; await sb.del("proprietari", id); await load(); setDetO(null); };

  // Attiva le notifiche push su questo dispositivo (v20)
  const attivaNotifiche = async () => {
    if (notifStato === "loading" || notifStato === "on") return;
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setNotifStato("unsupported");
      alert("Questo dispositivo non supporta ancora le notifiche.\n\nSu iPhone devi prima INSTALLARE l'app: tocca Condividi -> Aggiungi a Home, poi apri l'app dall'icona e riprova.");
      return;
    }
    setNotifStato("loading");
    try {
      const reg = await navigator.serviceWorker.ready;
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setNotifStato(perm === "denied" ? "denied" : "idle");
        if (perm === "denied") alert("Le notifiche sono bloccate. Puoi riattivarle dalle impostazioni del telefono/browser per questo sito.");
        return;
      }
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) });
      const res = await sb.post("push_subscriptions", { subscription: sub, endpoint: sub.endpoint });
      if (!res.ok) { setNotifStato("idle"); alert("Permesso dato, ma non sono riuscito a salvare l'iscrizione. Riprova tra poco."); return; }
      setNotifStato("on");
      alert("Notifiche attivate su questo dispositivo!");
    } catch (e) {
      setNotifStato("idle");
      alert("Non sono riuscito ad attivare le notifiche. " + (e && e.message ? e.message : ""));
    }
  };

  const filtP = proprieta.filter(p => {
    const q = search.toLowerCase();
    const o = owners.find(x => x.id === p.proprietario_id);
    return (!q || p.nome?.toLowerCase().includes(q) || p.citta?.toLowerCase().includes(q) || o?.cognome?.toLowerCase().includes(q) || p.cin?.toLowerCase().includes(q) || o?.nome?.toLowerCase().includes(q))
      && (!fStato || p.stato === fStato) && (!fContratto || p.tipo_contratto === fContratto) && (!fGestore || p.gestore_interno === fGestore);
  });
  const filtO = owners.filter(o => { const q = search.toLowerCase(); return !q || o.cognome?.toLowerCase().includes(q) || o.nome?.toLowerCase().includes(q) || o.codice_fiscale?.toLowerCase().includes(q); });
  const stats = { totale: proprieta.length, attivi: proprieta.filter(p => p.stato === "attivo").length, lancio: proprieta.filter(p => p.stato === "in lancio").length, onboarding: proprieta.filter(p => ["in lancio", "mandato firmato", "mandato + cin"].includes(p.stato)).length, senzaCin: proprieta.filter(p => !p.cin && p.stato === "attivo").length };

  const navItems = [
    { id: "home", label: "Home", icon: "🏛️", count: null },
    { id: "notifiche", label: "Notifiche", icon: "🔔", count: notifCount, alert: true },
    // Gestione accessi: subito in alto, visibile solo al titolare
    ...(sonoMaster ? [{ id: "team", label: "Team & Accessi", icon: "👥", count: daApprovare || null, alert: daApprovare > 0 }] : []),
    /* I property manager hanno una vista essenziale: solo i loro immobili,
       i proprietari collegati, i documenti e la compliance. */
    { id: "gestione", label: "Gestione & Contabilità", icon: "📊", count: null, group: "Operativo" },
    { id: "proprieta", label: "Proprietà", icon: "🏠", count: stats.totale, group: "Operativo" },
    { id: "proprietari", label: "Proprietari", icon: "👤", count: owners.length, group: "Operativo" },
    { id: "lancio", label: "Workflow Lancio", icon: "🚀", count: stats.onboarding, group: "Operativo" },
    { id: "lead", label: "Lead", icon: "🎯", count: null, group: "Operativo" },
    { id: "compliance", label: "Compliance", icon: "✅", count: stats.senzaCin > 0 ? stats.senzaCin : null, group: "Operativo" },
    { id: "schede", label: "Schede Immobili", icon: "🏠", count: null, group: "Operativo" },
    { id: "ecosistema", label: "Ecosistema", icon: "🌐", count: null, group: "Operativo" },
    { id: "smistamento", label: "Smistamento doc", icon: "📥", count: null, group: "Documenti" },
    { id: "archivio", label: "Archivio", icon: "🗂️", count: null, group: "Documenti" },
    { id: "ricorrenti", label: "Ricorrenti", icon: "📅", count: null, group: "Documenti" },
    { id: "guida", label: "Guida", icon: "📚", count: null, group: "Documenti" },
    // Solo il titolare gestisce accessi e permessi
    // L'agente esterno ha un'unica sezione: i suoi immobili con la checklist documenti
    ...(sonoAgente ? [{ id: "portale", label: "I miei immobili", icon: "🏠", count: proprieta.length || null }] : []),
    // Il valutatore serve a tutti: l'agente lo usa prima ancora di avere immobili in gestione
    { id: "valutazione", label: "Valuta immobile", icon: "📐", count: null, group: "Documenti" },
  ].filter(i => vedoTutto
    ? true
    : sonoAgente
      ? (i.id === "portale" || i.id === "valutazione")
      : (ruoloLetto && !mioNome)
        ? false // account senza scheda in Team: nessuna voce, c'è il messaggio a schermo
        : ["proprieta", "proprietari", "compliance", "guida", "valutazione"].includes(i.id)); // property manager

  return (
    <>
      <style>{CSS}</style>
      <div style={{ display: "flex", minHeight: "100vh" }}>
        {/* Mobile top bar */}
        <div className="topbar">
          <button onClick={() => setSidebarOpen(true)} aria-label="Apri menu" style={{ background: "none", border: "none", color: "#fff", fontSize: 24, lineHeight: 1, padding: 4, cursor: "pointer" }}>☰</button>
          <span style={{ fontFamily: "Inter", fontSize: 16, fontWeight: 700 }}>Valente <span style={{ color: "var(--gold)" }}>Living</span></span>
        </div>
        {sidebarOpen && <div className="backdrop" onClick={() => setSidebarOpen(false)} />}
        {/* Sidebar */}
        <aside className={"sidebar" + (sidebarOpen ? " open" : "")}>
          <div style={{ padding: "28px 20px 20px" }}>
            <span style={{ fontFamily: "Inter", fontSize: 13, fontWeight: 700, letterSpacing: ".15em", color: "var(--gold)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Valente</span>
            <span style={{ fontFamily: "Inter", fontSize: 22, fontWeight: 700, lineHeight: 1, display: "block" }}>Living</span>
            <span style={{ fontSize: 9, letterSpacing: ".15em", textTransform: "uppercase", color: "rgba(255,255,255,.4)" }}>Property Manager v3.0</span>
          </div>
          <div className="gl" style={{ margin: "0 20px 20px" }} />
          <div style={{ padding: "0 20px 20px" }}>
            <div style={{ background: "rgba(255,255,255,.05)", padding: "12px 14px" }}>
              <p style={{ fontSize: 9, letterSpacing: ".1em", textTransform: "uppercase", color: "rgba(255,255,255,.4)", marginBottom: 8 }}>Portfolio</p>
              <div style={{ fontSize: 28, fontFamily: "Inter", fontWeight: 700, color: "var(--gold)", lineHeight: 1 }}>{stats.totale}</div>
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
            {(() => {
              const voce = (item) => (
                <button key={item.id} className={view === item.id ? "nav-on" : ""} onClick={() => { setView(item.id); setSearch(""); setFStato(""); setFContratto(""); setFGestore(""); setSidebarOpen(false); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", background: view === item.id ? "rgba(99,102,241,.15)" : "transparent", border: view === item.id ? "1px solid rgba(99,102,241,.3)" : "1px solid transparent", color: view === item.id ? "var(--gold)" : "rgba(255,255,255,.6)", fontSize: 13, fontWeight: view === item.id ? 600 : 400, marginBottom: 4, transition: "all .2s", textAlign: "left" }}>
                  <span>{item.icon}</span><span style={{ flex: 1 }}>{item.label}</span>
                  {item.count !== null && <span style={{ fontSize: 10, background: item.alert && item.count > 0 ? "var(--red)" : "rgba(255,255,255,.1)", color: item.alert && item.count > 0 ? "#fff" : undefined, fontWeight: item.alert && item.count > 0 ? 700 : undefined, padding: "1px 6px", borderRadius: 10 }}>{item.count}</span>}
                </button>
              );
              const liberi = navItems.filter(i => !i.group);
              const gruppi = [...new Set(navItems.filter(i => i.group).map(i => i.group))];
              return (
                <>
                  {liberi.map(voce)}
                  {gruppi.map(g => {
                    const dentro = navItems.filter(i => i.group === g);
                    // tendina aperta anche se contiene la sezione attiva (così non "sparisce")
                    const aperto = !!gruppiAperti[g] || dentro.some(i => i.id === view);
                    const avvisi = dentro.reduce((s, i) => s + (i.alert && i.count > 0 ? i.count : 0), 0);
                    return (
                      <Fragment key={g}>
                        <button onClick={() => toggleGruppo(g)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 12px 6px", background: "transparent", border: "none", cursor: "pointer", color: "rgba(255,255,255,.45)", fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", textAlign: "left" }}>
                          <span style={{ display: "inline-block", transition: "transform .15s", transform: aperto ? "rotate(90deg)" : "none", fontSize: 9 }}>▶</span>
                          <span style={{ flex: 1 }}>{g}</span>
                          {!aperto && avvisi > 0 && <span style={{ fontSize: 9.5, background: "var(--red)", color: "#fff", fontWeight: 700, padding: "1px 6px", borderRadius: 10 }}>{avvisi}</span>}
                          {!aperto && <span style={{ fontSize: 9.5, color: "rgba(255,255,255,.3)" }}>{dentro.length}</span>}
                        </button>
                        {aperto && dentro.map(voce)}
                      </Fragment>
                    );
                  })}
                </>
              );
            })()}
          </nav>
          {notifStato !== "unsupported" && (
            <div style={{ padding: "0 20px 4px" }}>
              <button onClick={attivaNotifiche} disabled={notifStato === "loading" || notifStato === "on"}
                style={{ width: "100%", padding: "9px", background: notifStato === "on" ? "rgba(45,106,79,.18)" : "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.12)", color: notifStato === "on" ? "#7fd1a8" : "rgba(255,255,255,.75)", fontSize: 11, fontWeight: 600, letterSpacing: ".04em", cursor: (notifStato === "loading" || notifStato === "on") ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {notifStato === "on" ? "🔔 Notifiche attive" : notifStato === "loading" ? "Attivazione…" : notifStato === "denied" ? "🔕 Notifiche bloccate" : "🔔 Attiva notifiche"}
              </button>
            </div>
          )}
          <div style={{ padding: "12px 20px", borderTop: "1px solid rgba(255,255,255,.08)" }}>
            <button onClick={() => { setAiOpen(true); setSidebarOpen(false); }} style={{ width: "100%", padding: "10px", background: "linear-gradient(135deg, #6366F1, #818CF8)", border: "none", color: "#fff", fontSize: 12, fontWeight: 700, letterSpacing: ".02em", textTransform: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              ✦ Assistente AI
            </button>
          </div>
          {/* Utente collegato + uscita */}
          <div style={{ padding: "10px 20px 12px", borderTop: "1px solid rgba(255,255,255,.08)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(255,255,255,.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                {String((utente && utente.email) || "?")[0].toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,.75)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(utente && utente.email) || "—"}</div>
              </div>
              <button onClick={onLogout} title="Esci dal gestionale"
                style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)", color: "rgba(255,255,255,.7)", fontSize: 10.5, fontWeight: 600, padding: "5px 9px" }}>Esci</button>
            </div>
            <p style={{ fontSize: 9, color: "rgba(255,255,255,.3)", textAlign: "center", marginTop: 10 }}>v3.0 · Valente Living SRL</p>
          </div>
        </aside>

        {/* Messaggi AI Ospiti: sezione a sé, sempre a portata di mano in alto a destra */}
        {vedoTutto && view !== "messaggiai" && (
          <button className="msgai-top" onClick={() => { setView("messaggiai"); setSidebarOpen(false); }} title="Apri Messaggi AI Ospiti">
            🤖 Messaggi AI Ospiti
          </button>
        )}

        {/* Main */}
        <main className="main">
          {/* Account senza scheda in Team: senza un profilo collegato non vedrebbe nulla
              e ogni salvataggio verrebbe rifiutato. Meglio dirlo che lasciarlo a vuoto. */}
          {ruoloLetto && !mioNome && !vedoTutto && !inAttesa ? (
            <div className="fi" style={{ maxWidth: 520, margin: "60px auto", textAlign: "center", background: "var(--white)", border: "1px solid var(--gl)", borderRadius: 16, boxShadow: "var(--shadow)", padding: 40 }}>
              <div style={{ fontSize: 34, marginBottom: 12 }}>🔒</div>
              <h2 style={{ fontSize: 19, marginBottom: 8 }}>Accesso non collegato a nessuna scheda</h2>
              <p style={{ fontSize: 13, color: "var(--gray)", lineHeight: 1.6 }}>
                Questo account esiste ma non è associato a nessuna persona del team, quindi non può vedere né salvare dati.
                Chiedi al titolare di collegarlo da <strong>Team &amp; Accessi</strong>.
              </p>
              <p style={{ fontSize: 11.5, color: "var(--gray)", marginTop: 14 }}>{utente && utente.email}</p>
              <button className="bg" onClick={onLogout} style={{ marginTop: 16, fontSize: 12 }}>Esci</button>
            </div>
          ) :
          /* Il valutatore resta accessibile anche a chi aspetta l'approvazione:
              un agente può valutare un immobile prima ancora di averne in gestione. */
           inAttesa && view === "valutazione" ? <Valutazione nomeAgente={mioNome} /> :
           inAttesa ? (
            <div className="fi" style={{ maxWidth: 520, margin: "60px auto", textAlign: "center", background: "var(--white)", border: "1px solid var(--gl)", borderRadius: 16, boxShadow: "var(--shadow)", padding: 40 }}>
              <div style={{ fontSize: 34, marginBottom: 12 }}>⏳</div>
              <h2 style={{ fontSize: 19, marginBottom: 8 }}>Accesso in attesa di approvazione</h2>
              <p style={{ fontSize: 13, color: "var(--gray)", lineHeight: 1.6 }}>
                La tua registrazione è arrivata. Valente Living deve approvarla e collegarti agli immobili di tua competenza:
                appena fatto, entrando qui li troverai. Per sollecitare, scrivi al tuo referente.
              </p>
              <button className="bp" onClick={() => setView("valutazione")} style={{ marginTop: 18, fontSize: 12 }}>
                Intanto valuta un immobile →
              </button>
            </div>
          ) : loading ? <div style={{ textAlign: "center", padding: 60, color: "var(--gray)" }}>Caricamento...</div> :
            view === "home" ? <HomeView proprieta={proprieta} owners={owners} stats={stats} onVai={(v) => setView(v)} onApriProp={setDetP} /> :
            view === "gestione" ? <ContabilitaView proprieta={proprieta} owners={owners} /> :
            view === "notifiche" ? <NotificheView onDataChanged={load} /> :
            view === "lancio" ? <KanbanView proprieta={proprieta} owners={owners} onDataChanged={load} onEdit={setModalP} onApriScheda={setDetP} /> :
            view === "smistamento" ? <Smistamento proprieta={proprieta} owners={owners} onDataChanged={load} /> :
            view === "archivio" ? <Archivio proprieta={proprieta} owners={owners} /> :
            view === "guida" ? <Guida /> :
            view === "compliance" ? <Compliance proprieta={proprieta} owners={owners} onPatch={(id, patch) => sb.patch("proprieta", id, patch)} onDataChanged={load} /> :
            view === "schede" ? <Schede /> :
            view === "messaggiai" ? <MessaggiAI /> :
            view === "ecosistema" ? <Ecosistema /> :
            view === "ricorrenti" ? <Ricorrenti proprieta={proprieta} owners={owners} /> :
            view === "team" ? <Team proprieta={proprieta} sonoMaster={sonoMaster} onDataChanged={load} /> :
            view === "portale" ? <PortaleAgente proprieta={proprieta} nomeAgente={mioNome} sb={sb} onDataChanged={load} /> :
            view === "valutazione" ? <Valutazione nomeAgente={mioNome} /> :
            view === "lead" ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 8, gap: 12 }}>
                  <div><h1 style={{ fontSize: 26, fontWeight: 700 }}>Lead</h1><p style={{ fontSize: 12, color: "var(--gray)", marginTop: 4 }}>Contatti assegnati a te su HubSpot{leads.length ? ` · ${leads.length}` : ""}</p></div>
                  <button className="bg" onClick={loadLeads} disabled={leadsLoading}>{leadsLoading ? "Aggiorno…" : "↻ Aggiorna"}</button>
                </div>
                <div className="gl" style={{ marginBottom: 24 }} />
                {leadsError ? (
                  <div style={{ padding: 20, background: "var(--white)", border: "1px solid var(--gl)", borderRadius: 12, boxShadow: "var(--shadow)", fontSize: 13 }}>
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
                <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap", alignItems: "center" }}>
                  <input placeholder="Cerca per nome, CF..." value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 300, flex: 1 }} />
                  <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                    <button onClick={() => setOwnVista("elenco")} style={{ padding: "8px 14px", border: "1px solid var(--gl)", background: ownVista === "elenco" ? "var(--black)" : "var(--white)", color: ownVista === "elenco" ? "var(--white)" : "var(--gray)", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Elenco</button>
                    <button onClick={() => setOwnVista("griglia")} style={{ padding: "8px 14px", border: "1px solid var(--gl)", background: ownVista === "griglia" ? "var(--black)" : "var(--white)", color: ownVista === "griglia" ? "var(--white)" : "var(--gray)", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Griglia</button>
                  </div>
                </div>
                {ownVista === "elenco" ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {filtO.map(o => {
                      const suoi = proprieta.filter(p => p.proprietario_id === o.id);
                      return <OwnerRow key={o.id} o={o} pc={suoi.length} props={suoi} onClick={() => setDetO(o)} onApriProp={setDetP} />;
                    })}
                    {filtO.length === 0 && <div style={{ textAlign: "center", padding: 60, color: "var(--gray)" }}>Nessun proprietario trovato.</div>}
                  </div>
                ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
                  {filtO.map(o => {
                    const pc = proprieta.filter(p => p.proprietario_id === o.id).length;
                    return (
                      <div key={o.id} className="card fi" onClick={() => setDetO(o)}>
                        <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 12 }}>
                          <div style={{ width: 42, height: 42, background: "var(--black)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><span style={{ fontFamily: "Inter", fontSize: 14, fontWeight: 700, color: "var(--gold)" }}>{o.cognome?.[0]}{o.nome?.[0]}</span></div>
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
                )}
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
                  <select value={fGestore} onChange={e => setFGestore(e.target.value)} style={{ width: 130 }}><option value="">Tutti gestori</option>{gestori.map(g => <option key={g}>{g}</option>)}</select>
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
                    filtP.forEach(p => { const k = (propRaggr === "citta" ? (p.citta || "").trim() : (p.provincia || "").trim().toUpperCase()) || "—"; (map[k] = map[k] || []).push(p); });
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
                          {g.items.map(p => <PropRow key={p.id} p={p} o={owners.find(x => x.id === p.proprietario_id)} onClick={() => setDetP(p)}
                            gestori={gestori} coloreGestore={coloreGestore} onAssegna={assegnaGestore} />)}
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
          <div style={{ background: "var(--cream)", width: "100%", maxWidth: 480, height: "100%", overflow: "auto", padding: 32, borderRadius: "16px 0 0 16px", boxShadow: "-16px 0 50px rgba(0,0,0,.2)" }} className="fi">
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
            <Allegati proprietaId={detP.id} linkProprietarioId={detP.proprietario_id}
              etichette={{
                prop: Object.fromEntries(proprieta.map(p => [String(p.id), p.nome])),
                own: Object.fromEntries(owners.map(o => [String(o.id), `${o.cognome || ""} ${o.nome || ""}`.trim()])),
              }} />
            <GeneraMandato p={detP} o={owners.find(o => String(o.id) === String(detP.proprietario_id))} />
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
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
                <div style={{ width: 50, height: 50, background: "var(--black)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontFamily: "Inter", fontSize: 18, fontWeight: 700, color: "var(--gold)" }}>{detO.cognome?.[0]}{detO.nome?.[0]}</span></div>
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
              {(() => {
                const suoi = proprieta.filter(p => p.proprietario_id === detO.id);
                const senzaCin = suoi.filter(p => !String(p.cin || "").trim()).length;
                return (
                  <>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
                      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--gold)" }}>
                        Appartamenti ({suoi.length})
                      </p>
                      {senzaCin > 0 && <span style={{ fontSize: 10.5, color: "var(--red)", fontWeight: 600 }}>{senzaCin} senza CIN</span>}
                    </div>
                    {suoi.length === 0 && <p style={{ fontSize: 12, color: "var(--gray)" }}>Nessun appartamento associato a questo proprietario.</p>}
                    {suoi.map(p => (
                      <div key={p.id} onClick={() => { setDetO(null); setDetP(p); }} style={{ padding: "10px 12px", background: "var(--white)", border: "1px solid var(--gl)", borderRadius: 12, boxShadow: "var(--shadow)", marginBottom: 6, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = "var(--gold)"}
                        onMouseLeave={e => e.currentTarget.style.borderColor = "var(--gl)"}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <p style={{ fontSize: 13, fontWeight: 600 }}>{p.nome}</p>
                          <p style={{ fontSize: 11, color: "var(--gray)" }}>
                            {[p.citta, p.provincia && `(${p.provincia})`].filter(Boolean).join(" ")}
                            {p.gestore_interno ? ` · ${p.gestore_interno}` : ""}
                          </p>
                          <p style={{ fontSize: 10.5, marginTop: 3, fontFamily: "monospace", color: p.cin ? "var(--gray)" : "var(--red)" }}>
                            {p.cin ? `CIN ${p.cin}` : "CIN mancante"}{p.cir ? ` · CIR ${p.cir}` : ""}
                          </p>
                        </div>
                        <SB stato={p.stato} />
                      </div>
                    ))}
                  </>
                );
              })()}
            </div>
            <Allegati proprietarioId={detO.id} proprietaIds={proprieta.filter(p => p.proprietario_id === detO.id).map(p => p.id)}
              etichette={{
                prop: Object.fromEntries(proprieta.map(p => [String(p.id), p.nome])),
                own: Object.fromEntries(owners.map(o => [String(o.id), `${o.cognome || ""} ${o.nome || ""}`.trim()])),
              }} />
            <div style={{ display: "flex", gap: 10, marginTop: 28 }}>
              <button className="bp" style={{ flex: 1 }} onClick={() => { setModalO(detO); setDetO(null); }}>Modifica</button>
              <button className="bd" onClick={() => delO(detO.id)}>Elimina</button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {modalP && <Modal title={modalP === "new" ? "Nuova Proprietà" : `Modifica — ${modalP.nome}`} onClose={() => setModalP(null)}><PropForm init={modalP === "new" ? EP2 : modalP} owners={owners} gestori={gestori} onSave={saveP} onClose={() => setModalP(null)} loading={saving} /></Modal>}
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

// ── Accesso con account personale (Supabase Auth) ────────────────────────────
/* Schermata "scegli la tua password": è dove atterrano i link di invito
   e di recupero password che Supabase manda via email. */
function ImpostaPassword({ token, invito, onFatto }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const salva = async () => {
    if (pw.length < 8) { setErr("La password deve avere almeno 8 caratteri."); return; }
    if (pw !== pw2) { setErr("Le due password non coincidono."); return; }
    setBusy(true); setErr("");
    try {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: "PUT",
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.msg || d.message || "Non è stato possibile salvare la password.");
      onFatto();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F6F7F9", fontFamily: "'Inter', sans-serif", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 380, background: "#fff", border: "1px solid #E2E8F0", borderRadius: 16, boxShadow: "0 8px 30px rgba(15,23,42,.08)", padding: "36px 32px" }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg, #6366F1, #818CF8)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 20, fontWeight: 800, margin: "0 auto 16px" }}>V</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", textAlign: "center", marginBottom: 6, letterSpacing: "-.02em" }}>
          {invito ? "Benvenuto in Valente Living" : "Nuova password"}
        </h1>
        <p style={{ fontSize: 13, color: "#64748B", textAlign: "center", marginBottom: 24 }}>
          {invito ? "Scegli la password del tuo account" : "Scegli una nuova password per il tuo account"}
        </p>
        <input type="password" value={pw} autoFocus placeholder="Nuova password (min. 8 caratteri)" autoComplete="new-password"
          onChange={e => { setPw(e.target.value); setErr(""); }}
          style={{ width: "100%", padding: "12px 14px", border: "1px solid #E2E8F0", borderRadius: 10, fontSize: 15, marginBottom: 10, boxSizing: "border-box", outline: "none" }} />
        <input type="password" value={pw2} placeholder="Ripeti la password" autoComplete="new-password"
          onChange={e => { setPw2(e.target.value); setErr(""); }}
          onKeyDown={e => e.key === "Enter" && salva()}
          style={{ width: "100%", padding: "12px 14px", border: "1px solid #E2E8F0", borderRadius: 10, fontSize: 15, marginBottom: 12, boxSizing: "border-box", outline: "none" }} />
        {err && <p style={{ color: "#E11D48", fontSize: 12, marginBottom: 12, textAlign: "center" }}>{err}</p>}
        <button onClick={salva} disabled={busy}
          style={{ width: "100%", padding: "12px", background: busy ? "#A5B4FC" : "#6366F1", color: "#fff", border: "none", fontSize: 14, fontWeight: 600, cursor: busy ? "default" : "pointer", borderRadius: 10 }}>
          {busy ? "Salvo…" : "Salva password ed entra"}
        </button>
      </div>
    </div>
  );
}

// Legge il token che Supabase mette nell'indirizzo dopo un invito o un recupero password
function leggiTokenDaUrl() {
  try {
    const h = new URLSearchParams(String(window.location.hash || "").replace(/^#/, ""));
    const tipo = h.get("type");
    const token = h.get("access_token");
    if (token && (tipo === "recovery" || tipo === "invite" || tipo === "signup")) {
      return { token, invito: tipo !== "recovery", refresh: h.get("refresh_token") };
    }
  } catch { /* ignora */ }
  return null;
}

export default function Gate() {
  const [utente, setUtente] = useState(() => auth.utente());
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [recupero, setRecupero] = useState("");
  const [reset, setReset] = useState(() => leggiTokenDaUrl());
  const [registrazione, setRegistrazione] = useState(false);

  // All'avvio: se c'è una sessione salvata la rinnovo, così non serve rifare il login ogni volta
  useEffect(() => {
    const s = auth.leggi();
    if (s && s.scade && s.scade - Date.now() < 60000) {
      auth.rinnova().then(t => { if (!t) setUtente(null); });
    }
  }, []);

  // Link di invito o recupero password: mostra la schermata per scegliere la password
  if (reset) {
    return <ImpostaPassword token={reset.token} invito={reset.invito} onFatto={() => {
      auth.scrivi({ access_token: reset.token, refresh_token: reset.refresh, scade: Date.now() + 3600000, user: null });
      try { window.history.replaceState(null, "", window.location.pathname); } catch { /* ignora */ }
      setReset(null);
      setUtente(null);
      setRecupero("Password impostata. Ora entra con la tua email e la nuova password.");
      auth.scrivi(null);
    }} />;
  }

  if (utente) return <App utente={utente} onLogout={async () => { await auth.logout(); setUtente(null); }} />;

  if (registrazione) return <RegistrazioneAgente onIndietro={() => setRegistrazione(false)} />;

  const entra = async () => {
    if (!email.trim() || !pw) { setErr("Inserisci email e password."); return; }
    setBusy(true); setErr("");
    try { setUtente(await auth.login(email, pw)); }
    catch (e) {
      setErr(/invalid/i.test(e.message) ? "Email o password non corretti." : e.message);
    }
    setBusy(false);
  };

  const recuperaPassword = async () => {
    if (!email.trim()) { setErr("Scrivi la tua email qui sopra, poi riclicca."); return; }
    setBusy(true); setErr(""); setRecupero("");
    try {
      await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      setRecupero("Se l'indirizzo è registrato, ti arriva un'email per reimpostare la password.");
    } catch { setErr("Non sono riuscito a inviare l'email."); }
    setBusy(false);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F6F7F9", fontFamily: "'Inter', sans-serif", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 380, background: "#fff", border: "1px solid #E2E8F0", borderRadius: 16, boxShadow: "0 8px 30px rgba(15,23,42,.08)", padding: "36px 32px" }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg, #6366F1, #818CF8)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 20, fontWeight: 800, margin: "0 auto 16px" }}>V</div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#0F172A", textAlign: "center", marginBottom: 6, letterSpacing: "-.02em" }}>Valente Living</h1>
        <p style={{ fontSize: 13, color: "#64748B", textAlign: "center", marginBottom: 24 }}>Accedi con il tuo account</p>

        <input type="email" value={email} autoFocus placeholder="Email" autoComplete="username"
          onChange={e => { setEmail(e.target.value); setErr(""); }}
          onKeyDown={e => e.key === "Enter" && entra()}
          style={{ width: "100%", padding: "12px 14px", border: "1px solid #E2E8F0", borderRadius: 10, fontSize: 15, marginBottom: 10, boxSizing: "border-box", outline: "none" }} />
        <input type="password" value={pw} placeholder="Password" autoComplete="current-password"
          onChange={e => { setPw(e.target.value); setErr(""); }}
          onKeyDown={e => e.key === "Enter" && entra()}
          style={{ width: "100%", padding: "12px 14px", border: "1px solid #E2E8F0", borderRadius: 10, fontSize: 15, marginBottom: 12, boxSizing: "border-box", outline: "none" }} />

        {err && <p style={{ color: "#E11D48", fontSize: 12, marginBottom: 12, textAlign: "center" }}>{err}</p>}
        {recupero && <p style={{ color: "#2d6a4f", fontSize: 12, marginBottom: 12, textAlign: "center" }}>{recupero}</p>}

        <button onClick={entra} disabled={busy}
          style={{ width: "100%", padding: "12px", background: busy ? "#A5B4FC" : "#6366F1", color: "#fff", border: "none", fontSize: 14, fontWeight: 600, cursor: busy ? "default" : "pointer", borderRadius: 10 }}>
          {busy ? "Accesso…" : "Entra"}
        </button>
        <button onClick={recuperaPassword} disabled={busy}
          style={{ width: "100%", marginTop: 10, padding: "8px", background: "transparent", border: "none", color: "#64748B", fontSize: 12, cursor: "pointer" }}>
          Password dimenticata?
        </button>
        <div style={{ borderTop: "1px solid #E2E8F0", marginTop: 16, paddingTop: 14, textAlign: "center" }}>
          <span style={{ fontSize: 12, color: "#64748B" }}>Sei un agente? </span>
          <button onClick={() => setRegistrazione(true)}
            style={{ background: "transparent", border: "none", color: "#6366F1", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0 }}>
            Registrati qui
          </button>
        </div>
      </div>
    </div>
  );
}

/* Registrazione agenti: serve il codice aziendale, e l'accesso resta
   in attesa finché il titolare non lo approva. */
function RegistrazioneAgente({ onIndietro }) {
  const [f, setF] = useState({ nome: "", email: "", codice: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [fatto, setFatto] = useState(null); // { link, messaggio }
  const [copiato, setCopiato] = useState(false);

  const invia = async () => {
    if (!f.nome.trim() || !f.email.trim() || !f.codice.trim()) { setErr("Compila tutti i campi."); return; }
    setBusy(true); setErr("");
    try {
      const r = await fetch("/.netlify/functions/team", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "registra_agente", ...f }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error) throw new Error(d.error || "Registrazione non riuscita.");
      setFatto(d);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F6F7F9", fontFamily: "'Inter', sans-serif", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 420, background: "#fff", border: "1px solid #E2E8F0", borderRadius: 16, boxShadow: "0 8px 30px rgba(15,23,42,.08)", padding: "36px 32px" }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg, #6366F1, #818CF8)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 20, fontWeight: 800, margin: "0 auto 16px" }}>V</div>

        {fatto ? (
          <>
            <h1 style={{ fontSize: 21, fontWeight: 700, color: "#0F172A", textAlign: "center", marginBottom: 10 }}>Registrazione ricevuta</h1>
            <p style={{ fontSize: 12.5, color: "#64748B", lineHeight: 1.6, marginBottom: 14 }}>{fatto.messaggio}</p>
            {fatto.link && (
              <>
                <div style={{ background: "#F6F7F9", border: "1px solid #E2E8F0", borderRadius: 10, padding: 10, fontSize: 10.5, fontFamily: "monospace", wordBreak: "break-all", maxHeight: 100, overflowY: "auto" }}>{fatto.link}</div>
                <button onClick={async () => { try { await navigator.clipboard.writeText(fatto.link); setCopiato(true); } catch { /* ignora */ } }}
                  style={{ width: "100%", marginTop: 10, padding: "11px", background: "#6366F1", color: "#fff", border: "none", fontSize: 13.5, fontWeight: 600, borderRadius: 10, cursor: "pointer" }}>
                  {copiato ? "✓ Copiato" : "📋 Copia il link per la password"}
                </button>
                <a href={fatto.link} style={{ display: "block", textAlign: "center", marginTop: 10, fontSize: 12, color: "#6366F1" }}>Oppure aprilo adesso →</a>
              </>
            )}
            <button onClick={onIndietro} style={{ width: "100%", marginTop: 14, padding: "9px", background: "transparent", border: "1px solid #E2E8F0", borderRadius: 10, color: "#64748B", fontSize: 12.5, cursor: "pointer" }}>Torna all'accesso</button>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", textAlign: "center", marginBottom: 6, letterSpacing: "-.02em" }}>Registrazione agenti</h1>
            <p style={{ fontSize: 12.5, color: "#64748B", textAlign: "center", marginBottom: 20, lineHeight: 1.6 }}>
              Ti serve il codice fornito da Valente Living. L'accesso sarà attivo dopo l'approvazione.
            </p>
            <input value={f.nome} autoFocus placeholder="Nome e cognome"
              onChange={e => { setF(v => ({ ...v, nome: e.target.value })); setErr(""); }}
              style={{ width: "100%", padding: "12px 14px", border: "1px solid #E2E8F0", borderRadius: 10, fontSize: 15, marginBottom: 10, boxSizing: "border-box", outline: "none" }} />
            <input type="email" value={f.email} placeholder="Email"
              onChange={e => { setF(v => ({ ...v, email: e.target.value })); setErr(""); }}
              style={{ width: "100%", padding: "12px 14px", border: "1px solid #E2E8F0", borderRadius: 10, fontSize: 15, marginBottom: 10, boxSizing: "border-box", outline: "none" }} />
            <input value={f.codice} placeholder="Codice agenzia"
              onChange={e => { setF(v => ({ ...v, codice: e.target.value })); setErr(""); }}
              onKeyDown={e => e.key === "Enter" && invia()}
              style={{ width: "100%", padding: "12px 14px", border: "1px solid #E2E8F0", borderRadius: 10, fontSize: 15, marginBottom: 12, boxSizing: "border-box", outline: "none" }} />
            {err && <p style={{ color: "#E11D48", fontSize: 12, marginBottom: 12, textAlign: "center" }}>{err}</p>}
            <button onClick={invia} disabled={busy}
              style={{ width: "100%", padding: "12px", background: busy ? "#A5B4FC" : "#6366F1", color: "#fff", border: "none", fontSize: 14, fontWeight: 600, cursor: busy ? "default" : "pointer", borderRadius: 10 }}>
              {busy ? "Invio…" : "Richiedi l'accesso"}
            </button>
            <button onClick={onIndietro} style={{ width: "100%", marginTop: 10, padding: "8px", background: "transparent", border: "none", color: "#64748B", fontSize: 12, cursor: "pointer" }}>← Torna all'accesso</button>
          </>
        )}
      </div>
    </div>
  );
}
