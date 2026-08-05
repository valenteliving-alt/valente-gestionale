import { useEffect, useMemo, useState } from "react";

/* Agenti AI — mappa di CHI FA COSA nel sistema Valente Living.
   Ogni scheda è un agente reale, con: cosa fa, cosa lo fa partire, che modello usa,
   che dati tocca e dove vive il codice. In alto lo stato letto dal database.
   Se aggiungi o togli un agente, aggiorna l'array AGENTI qui sotto: è l'unica fonte. */

const SUPABASE_URL = "https://heabtbdmwbjlgujsisor.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhlYWJ0YmRtd2JqbGd1anNpc29yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMjA4NDgsImV4cCI6MjA5NTg5Njg0OH0.FRk1tARhQHylLjfhACorn6O_E7ommm47tBTfJHOVxAU";

function tokenSessione() {
  try { return (JSON.parse(localStorage.getItem("vl_sessione") || "null") || {}).access_token || SUPABASE_KEY; }
  catch { return SUPABASE_KEY; }
}
async function leggi(table, query) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query || ""}`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${tokenSessione()}` },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

/* ── I GRUPPI ──────────────────────────────────────────────────────────────── */
export const GRUPPI = {
  ospiti:     { label: "Risposte agli ospiti", col: "#a78bfa", desc: "Leggono i messaggi degli ospiti su Kross e propongono la risposta. Nessuna risposta parte senza la regola di approvazione." },
  documenti:  { label: "Documenti e dati",     col: "#38bdf8", desc: "Leggono PDF e immagini per classificarli, descriverli o riempire schede. Propongono, non salvano da soli." },
  assistenti: { label: "Assistenti a domanda", col: "#34d399", desc: "Rispondono a te, non ai clienti. Partono solo quando li interroghi." },
  notturni:   { label: "Automazioni a orario", col: "#fbbf24", desc: "Girano da sole su Netlify a orari fissi. Non usano AI: sono regole deterministiche e sincronizzazioni." },
  cowork:     { label: "Agenti Cowork (fuori dal CRM)", col: "#f472b6", desc: "Girano su Claude, non dentro il gestionale. Usano il tuo browser e le tue sessioni già aperte." },
};

/* ── GLI AGENTI ───────────────────────────────────────────────────────────────
   Campi: id, gruppo, nome, icona, cosaFa, trigger, modello, scrive, legge, file, note, stato
   `stato` è la chiave usata per agganciare il dato live (vedi useEffect). */
export const AGENTI = [
  // ── Risposte agli ospiti ───────────────────────────────────────────────────
  {
    id: "cervello", nodo: "cervello", gruppo: "ospiti", nome: "Cervello AI risposte", icona: "🧠",
    cosaFa: "Scrive la bozza di risposta all'ospite usando la scheda verificata dell'appartamento e lo storico della conversazione. Decide anche se la risposta può partire da sola o deve passare da te.",
    regola: "Regola ferrea: tutto ciò che riguarda prezzi, sconti, disponibilità, trattative, lamentele, rimborsi o danni finisce SEMPRE in approvazione. Se il modello sbaglia formato due volte, va in approvazione comunque.",
    trigger: "Chiamato dal Robot 24/7 (protetto da INGEST_KEY)", modello: "Claude Haiku 4.5 (o CERVELLO_MODEL)",
    legge: "schede_immobili, storico conversazione", scrive: "niente: restituisce la bozza al robot",
    file: "netlify/functions/cervello.js", statoKey: "aiGlobale",
  },
  {
    id: "robot", nodo: "robot", gruppo: "ospiti", nome: "Robot 24/7", icona: "🤖",
    cosaFa: "Un mini-computer sempre acceso in Germania. Entra da solo su Kross, legge i messaggi nuovi, chiede la bozza al Cervello e la mette in coda nel database. Lavora anche a Mac spento.",
    trigger: "In continuo, per conto suo", modello: "nessuno (orchestratore)",
    legge: "Kross, ai_config, ai_appartamenti", scrive: "invii_pendenti",
    file: "fuori da questo repository — server esterno", statoKey: "pendenti",
    note: "È l'unico pezzo del sistema che non vive né su Netlify né sul tuo Mac. Se si ferma, le risposte agli ospiti si fermano e nessuno te lo dice.",
  },
  {
    id: "schede", nodo: "cervello", gruppo: "ospiti", nome: "Compila schede immobili", icona: "🗂️",
    cosaFa: "Ricostruisce check-in, check-out, accesso, wifi, parcheggio e regole leggendo quello che l'host ha già risposto agli ospiti in passato. Se un dato non c'è, lascia vuoto invece di inventarlo.",
    trigger: "Chiamato dal robot (INGEST_KEY)", modello: "Claude Haiku 4.5",
    legge: "ucrm_messaggi", scrive: "schede_immobili", file: "netlify/functions/estrai-schede.js",
  },
  {
    id: "bozze", nodo: "cervello", gruppo: "ospiti", nome: "Bozze risposte Kross", icona: "✍️",
    cosaFa: "Entra su Kross, prende le chat non lette e genera una risposta pronta da inviare, nella stessa lingua dell'ospite.",
    trigger: "NESSUNO: la funzione esiste ma non è collegata a niente", modello: "Claude Sonnet 5 (l'unico non-Haiku)",
    legge: "kb_appartamenti", scrive: "niente", file: "netlify/functions/bozze-risposte.js",
    orfano: true, note: "Codice completo e mai richiamato: né dalla UI né da un orario. O si collega, o si toglie — oggi è solo costo di manutenzione.",
  },
  {
    id: "conversazioni", nodo: "robot", gruppo: "ospiti", nome: "Estrai conversazioni Kross", icona: "💬",
    cosaFa: "Scarica tutte le conversazioni dal uCRM di Kross e le ripulisce dai dati personali (telefoni, email, link) prima di salvarle. È la materia prima su cui lavorano gli altri agenti.",
    trigger: "Manuale, o dal robot con INGEST_KEY", modello: "nessuno",
    legge: "Kross uCRM", scrive: "ucrm_messaggi, kb_appartamenti", file: "netlify/functions/estrai-conversazioni-kross.js",
    note: "Riconosce solo 4 appartamenti scritti a mano nel codice (Micco, San Jacopo, Leoncino, Giostra): tutti gli altri finiscono in «Non identificato».",
  },

  // ── Documenti e dati ───────────────────────────────────────────────────────
  {
    id: "smistamento", nodo: "crm", gruppo: "documenti", nome: "Smistamento documenti", icona: "📥",
    cosaFa: "Guarda un PDF o una foto, capisce che tipo di documento è (fra 9 categorie) e a quale immobile o proprietario appartiene. Propone la destinazione, non archivia da solo.",
    regola: "Legge il documento DUE volte in parallelo, in modo indipendente. Se le due letture non coincidono, la confidenza scende a «bassa» e tocca a te decidere. Verifica anche che il codice fiscale e gli id proposti esistano davvero.",
    trigger: "Sezione «Smistamento doc», trascinando un file", modello: "Claude Haiku 4.5 ×2",
    legge: "proprieta, proprietari", scrive: "niente: scrive il frontend dopo la tua conferma",
    file: "netlify/functions/smista-documento.js + src/App.jsx (componente Smistamento)",
  },
  {
    id: "estraidati", nodo: "crm", gruppo: "documenti", nome: "Compila con AI dai documenti", icona: "✨",
    cosaFa: "Dalla scheda di un immobile, apre i suoi allegati (mandato, visura, CIN, contratto — i primi 3 per priorità) ed estrae 15 campi: indirizzo, catasto, CIN, CIR, posti letto, commissione e così via.",
    regola: "Riempie solo i campi ancora vuoti e non salva: il Salva lo premi tu. I codici vengono copiati carattere per carattere, e se un dato manca resta null invece di essere indovinato.",
    trigger: "Bottone «✨ Compila con AI dai documenti» nella scheda immobile", modello: "Claude Haiku 4.5",
    legge: "documenti (storage)", scrive: "niente: propone al form", file: "netlify/functions/estrai-dati.js",
  },
  {
    id: "analizza", nodo: "crm", gruppo: "documenti", nome: "Analisi documento", icona: "🔎",
    cosaFa: "Legge un documento caricato nella chat e ne estrae i dati chiave: codice fiscale, CIN, CIR, dati catastali, importi, date. Se riconosce un proprietario persona fisica, prepara la sua scheda pronta da creare con un click.",
    trigger: "Upload di un file nel pannello Assistente AI", modello: "Claude Haiku 4.5",
    legge: "il file caricato", scrive: "niente: propone la creazione del proprietario", file: "netlify/functions/analyze-document.js",
  },
  {
    id: "descrivi", nodo: "crm", gruppo: "documenti", nome: "Descrizione allegati", icona: "🏷️",
    cosaFa: "Dà a ogni documento archiviato una descrizione di massimo 12 parole e 3-6 parole chiave, per poterlo ritrovare cercando.",
    trigger: "Automatico a ogni caricamento, più un recupero dei mancanti quando apri l'Archivio", modello: "Claude Haiku 4.5",
    legge: "documenti", scrive: "documenti.ai_descrizione, documenti.ai_stato", file: "netlify/functions/allegati.js (azione describe)",
    statoKey: "docSenzaDescrizione",
  },
  {
    id: "estraitesto", nodo: "netlify", gruppo: "documenti", nome: "Trascrizione integrale", icona: "📄",
    cosaFa: "Trascrive per intero il testo di un PDF o di un'immagine, mantenendo esatti i codici fiscali e catastali.",
    trigger: "NESSUNO: funzione pronta ma non collegata", modello: "Claude Haiku 4.5",
    legge: "il file passato", scrive: "niente", file: "netlify/functions/estrai-testo.js",
    orfano: true, note: "Servirebbe per indicizzare gli allegati e renderli cercabili dall'Assistente. È il pezzo mancante fra l'Archivio e la ricerca AI.",
  },

  // ── Assistenti a domanda ───────────────────────────────────────────────────
  {
    id: "assistente", nodo: "crm", gruppo: "assistenti", nome: "Assistente AI del CRM", icona: "✦",
    cosaFa: "La chat laterale. Risponde sulle tue proprietà e sui tuoi proprietari, e cerca dentro i documenti indicizzati citando da quale documento ha preso l'informazione.",
    trigger: "Bottone «✦ Assistente AI» in barra laterale", modello: "Claude Haiku 4.5 (2 passaggi: prima estrae le parole chiave, poi risponde)",
    legge: "proprieta, proprietari (dal browser) + documenti_pdf, knowledge_base (ricerca sul server)", scrive: "niente",
    file: "netlify/functions/ai-agent.js + src/App.jsx (AiPanel)",
    statoKey: "kb",
    note: "Le tabelle documenti_pdf e knowledge_base oggi vengono solo lette: nessuna parte del gestionale le riempie. Finché restano vuote, l'assistente risponde solo su proprietà e proprietari.",
  },
  {
    id: "guida", nodo: "crm", gruppo: "assistenti", nome: "Assistente Guida comuni", icona: "📘",
    cosaFa: "Risponde su imposta di soggiorno, scadenze e regole comunali.",
    regola: "Risponde SOLO usando le righe della tabella guida_comuni. Se il dato non c'è lo dice, invece di inventare una tariffa o una scadenza.",
    trigger: "Riquadro domanda nella sezione Guida", modello: "Claude Haiku 4.5",
    legge: "guida_comuni", scrive: "niente", file: "netlify/functions/guida.js (azione ask)",
  },

  // ── Automazioni a orario ───────────────────────────────────────────────────
  {
    id: "briefing", nodo: "netlify", gruppo: "notturni", nome: "Briefing mattutino", icona: "🌅",
    cosaFa: "Ogni mattina controlla le scadenze dell'imposta di soggiorno entro 10 giorni, gli immobili attivi senza CIN e le fatture ricevute non ancora registrate. Se trova qualcosa, ti manda una notifica.",
    trigger: "Ogni giorno alle 05:00 UTC (07:00 in Italia)", modello: "nessuno: sono regole, non AI",
    legge: "guida_comuni, prenotazioni, proprieta, fatture_ricevute", scrive: "notifica push",
    file: "netlify/functions/agente-notturno.js → briefing.js",
  },
  {
    id: "syncKross", nodo: "netlify", gruppo: "notturni", nome: "Sync Krossbooking", icona: "🔄",
    cosaFa: "Di notte entra su Kross, supera la verifica a due fattori leggendo il codice dalla casella Gmail, scarica l'export delle prenotazioni e aggiorna il database.",
    trigger: "Ogni giorno alle 03:00 UTC", modello: "nessuno",
    legge: "Kross (export XLSX), Gmail via IMAP", scrive: "prenotazioni",
    file: "netlify/functions/sync-krossbooking.js", statoKey: "ultimaSync",
    note: "È il punto più fragile della catena: se Kross cambia il login o la 2FA non arriva, le prenotazioni smettono di aggiornarsi.",
  },
  {
    id: "lead", nodo: "netlify", gruppo: "notturni", nome: "Controllo lead HubSpot", icona: "📣",
    cosaFa: "Ogni 15 minuti guarda se sono arrivati contatti nuovi assegnati e ti manda una notifica.",
    trigger: "Ogni 15 minuti", modello: "nessuno",
    legge: "HubSpot", scrive: "notified_leads, notifica push", file: "netlify/functions/controlla-lead.js",
  },

  // ── Agenti Cowork ──────────────────────────────────────────────────────────
  {
    id: "checkin", nodo: "cowork", gruppo: "cowork", nome: "Check-in Questura", icona: "🛂",
    cosaFa: "Trova su Kross le prenotazioni con i documenti già compilati dall'ospite ed esegue il check-in, che è l'azione che fa partire i dati verso Alloggiati Web. Elenca i casi che restano bloccati per dati mancanti.",
    trigger: "Quando glielo chiedi («fai i check-in di oggi»)", modello: "Claude, dentro Cowork",
    legge: "Kross (browser)", scrive: "Kross: stato check-in", file: "skill Cowork «check-in-questura-kross»",
    note: "Guarda gli arrivi di oggi e di ieri, perché la comunicazione ha tempo fino al giorno dopo l'arrivo.",
  },
  {
    id: "fattureOta", nodo: "cowork", gruppo: "cowork", nome: "Fatture OTA → autofatture", icona: "🧾",
    cosaFa: "Scarica da Airbnb e Booking le fatture delle commissioni, separa quelle intestate a Valente Living da quelle di altre società, e prepara la base per le autofatture TD17. Segnala le fatture da far riemettere e l'IVA addebitata per errore.",
    trigger: "A richiesta, e in automatico il 1° e il 16 di ogni mese", modello: "Claude, dentro Cowork",
    legge: "Airbnb, Booking (browser)", scrive: "archivio PDF + riepilogo Excel sul Mac",
    file: "skill Cowork «fatture-ota-autofatture»",
    note: "Airbnb conserva le fatture solo 6 mesi: se questo agente non gira, i documenti più vecchi diventano irrecuperabili in blocco.",
  },
  {
    id: "deploy", nodo: "cowork", gruppo: "cowork", nome: "Pubblicazione su Netlify", icona: "🚀",
    cosaFa: "Aggiorna e pubblica siti e app, partendo sempre dalla versione remota più aggiornata e verificando la build prima di mandare online.",
    trigger: "Quando glielo chiedi («pubblica», «fai il deploy»)", modello: "Claude, dentro Cowork",
    legge: "GitHub, Netlify", scrive: "il sito pubblicato", file: "skill Cowork «pubblica-su-netlify»",
  },
];

/* ── STILI ─────────────────────────────────────────────────────────────────── */
const S = {
  wrap: { maxWidth: 1180 },
  h2: { margin: "0 0 4px", fontSize: 22 },
  sub: { margin: "0 0 16px", color: "#6b7280", fontSize: 14, lineHeight: 1.5 },
  statoRiga: { display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 18 },
  statoBox: (col) => ({ flex: "1 1 170px", background: "#0b1220", border: `1px solid ${col}55`, borderRadius: 12, padding: "10px 14px", color: "#e2e8f0" }),
  statoLab: { fontSize: 11, textTransform: "uppercase", letterSpacing: .6, color: "#94a3b8", marginBottom: 3 },
  statoVal: { fontSize: 19, fontWeight: 700 },
  laneTit: (col) => ({ display: "flex", alignItems: "center", gap: 8, margin: "22px 0 4px", fontSize: 15, fontWeight: 700, color: col }),
  laneDesc: { margin: "0 0 12px", fontSize: 13, color: "#6b7280", lineHeight: 1.45 },
  griglia: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(258px, 1fr))", gap: 10 },
  card: (col, sel, orfano) => ({
    textAlign: "left", cursor: "pointer", background: sel ? "#0b1220" : "#fff",
    color: sel ? "#e2e8f0" : "#111827",
    border: `1px solid ${sel ? col : orfano ? "#fca5a5" : "#e5e7eb"}`,
    borderLeft: `4px solid ${orfano ? "#ef4444" : col}`,
    borderRadius: 12, padding: "12px 14px", boxShadow: sel ? `0 6px 22px ${col}33` : "0 1px 2px rgba(0,0,0,.04)",
    transition: "all .15s", width: "100%", font: "inherit",
  }),
  cardTit: { fontSize: 14, fontWeight: 700, marginBottom: 4, display: "flex", alignItems: "center", gap: 7 },
  cardSub: (sel) => ({ fontSize: 12.5, lineHeight: 1.45, color: sel ? "#cbd5e1" : "#6b7280" }),
  tag: (bg, fg) => ({ background: bg, color: fg, borderRadius: 999, padding: "2px 9px", fontSize: 11, fontWeight: 600, display: "inline-block" }),
  dettaglio: (col) => ({ marginTop: 16, background: "#0b1220", border: `1px solid ${col}`, borderRadius: 14, padding: "16px 18px", color: "#e2e8f0" }),
  riga: { display: "flex", gap: 10, padding: "7px 0", borderTop: "1px solid #1e293b", fontSize: 13, lineHeight: 1.5 },
  et: { minWidth: 118, color: "#94a3b8", fontWeight: 600, flexShrink: 0 },
  nota: { marginTop: 12, background: "#1e293b", borderLeft: "3px solid #fbbf24", borderRadius: 8, padding: "9px 12px", fontSize: 12.5, lineHeight: 1.5, color: "#fde68a" },
  regola: { marginTop: 12, background: "#0f2b22", borderLeft: "3px solid #34d399", borderRadius: 8, padding: "9px 12px", fontSize: 12.5, lineHeight: 1.5, color: "#a7f3d0" },
};

export default function AgentiAI() {
  const [sel, setSel] = useState("cervello");
  const [stato, setStato] = useState({ caricato: false });

  useEffect(() => {
    let vivo = true;
    (async () => {
      const [cfg, app, pend, pren, docs, kb] = await Promise.all([
        leggi("ai_config", "?select=*&limit=1"),
        leggi("ai_appartamenti", "?select=attiva,auto_invio"),
        leggi("invii_pendenti", "?select=id&stato=eq.in_attesa"),
        leggi("prenotazioni", "?select=updated_at&order=updated_at.desc&limit=1"),
        leggi("documenti", "?select=id&or=(ai_stato.is.null,ai_stato.eq.)"),
        leggi("knowledge_base", "?select=id&attivo=is.true&limit=1"),
      ]);
      if (!vivo) return;
      const c = Array.isArray(cfg) ? cfg[0] : null;
      setStato({
        caricato: true,
        aiGlobale: c ? (c.ai_globale_attiva ? (c.modalita || "attiva") : "spenta") : "n/d",
        appAttivi: Array.isArray(app) ? app.filter((a) => a.attiva).length : null,
        appTotali: Array.isArray(app) ? app.length : null,
        pendenti: Array.isArray(pend) ? pend.length : null,
        ultimaSync: Array.isArray(pren) && pren[0]?.updated_at ? pren[0].updated_at.slice(0, 10) : null,
        docSenzaDescrizione: Array.isArray(docs) ? docs.length : null,
        kb: Array.isArray(kb) ? kb.length : null,
      });
    })();
    return () => { vivo = false; };
  }, []);

  const agente = useMemo(() => AGENTI.find((a) => a.id === sel) || AGENTI[0], [sel]);
  const col = GRUPPI[agente.gruppo].col;
  const orfani = AGENTI.filter((a) => a.orfano).length;
  const conAI = AGENTI.filter((a) => a.modello && a.modello !== "nessuno" && !a.modello.startsWith("nessuno")).length;

  const val = (v, suffisso = "") => (v === null || v === undefined ? "—" : v + suffisso);

  return (
    <div style={S.wrap}>
      <h2 style={S.h2}>🕹️ Agenti AI — chi fa cosa</h2>
      <p style={S.sub}>
        Ogni riquadro è un agente che gira davvero. Clicca per vedere <b>cosa fa</b>, <b>cosa lo fa partire</b>,
        <b> che dati tocca</b> e <b>dove vive il codice</b>. In rosso quelli scritti ma non collegati a nulla.
      </p>

      <div style={S.statoRiga}>
        <div style={S.statoBox("#a78bfa")}>
          <div style={S.statoLab}>AI risposte ospiti</div>
          <div style={S.statoVal}>{stato.caricato ? val(stato.aiGlobale) : "…"}</div>
          <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 2 }}>
            {stato.appAttivi !== null && stato.appAttivi !== undefined ? `${stato.appAttivi}/${stato.appTotali} appartamenti attivi` : " "}
          </div>
        </div>
        <div style={S.statoBox("#f59e0b")}>
          <div style={S.statoLab}>Bozze da approvare</div>
          <div style={S.statoVal}>{stato.caricato ? val(stato.pendenti) : "…"}</div>
          <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 2 }}>in coda, in attesa di te</div>
        </div>
        <div style={S.statoBox("#38bdf8")}>
          <div style={S.statoLab}>Ultimo sync Kross</div>
          <div style={S.statoVal}>{stato.caricato ? val(stato.ultimaSync) : "…"}</div>
          <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 2 }}>prenotazione aggiornata più di recente</div>
        </div>
        <div style={S.statoBox("#34d399")}>
          <div style={S.statoLab}>Documenti da descrivere</div>
          <div style={S.statoVal}>{stato.caricato ? val(stato.docSenzaDescrizione) : "…"}</div>
          <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 2 }}>senza descrizione AI</div>
        </div>
        <div style={S.statoBox("#94a3b8")}>
          <div style={S.statoLab}>Agenti censiti</div>
          <div style={S.statoVal}>{AGENTI.length}</div>
          <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 2 }}>{conAI} usano un modello · {orfani} non collegati</div>
        </div>
      </div>

      {Object.entries(GRUPPI).map(([gid, g]) => {
        const lista = AGENTI.filter((a) => a.gruppo === gid);
        if (!lista.length) return null;
        return (
          <div key={gid}>
            <div style={S.laneTit(g.col)}>
              <span style={{ width: 9, height: 9, borderRadius: 999, background: g.col, display: "inline-block" }} />
              {g.label}
              <span style={{ ...S.tag("#f1f5f9", "#64748b"), marginLeft: 2 }}>{lista.length}</span>
            </div>
            <p style={S.laneDesc}>{g.desc}</p>
            <div style={S.griglia}>
              {lista.map((a) => (
                <button key={a.id} onClick={() => setSel(a.id)} style={S.card(g.col, sel === a.id, a.orfano)}>
                  <div style={S.cardTit}>
                    <span style={{ fontSize: 17 }}>{a.icona}</span>{a.nome}
                    {a.orfano && <span style={S.tag("#fee2e2", "#b91c1c")}>non collegato</span>}
                  </div>
                  <div style={S.cardSub(sel === a.id)}>{a.cosaFa.slice(0, 105)}{a.cosaFa.length > 105 ? "…" : ""}</div>
                </button>
              ))}
            </div>
          </div>
        );
      })}

      <div style={S.dettaglio(col)}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8, display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
          <span style={{ fontSize: 22 }}>{agente.icona}</span>{agente.nome}
          <span style={S.tag(col + "33", col)}>{GRUPPI[agente.gruppo].label}</span>
          {agente.orfano && <span style={S.tag("#7f1d1d", "#fecaca")}>scritto ma non collegato</span>}
        </div>
        <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "#cbd5e1", marginBottom: 10 }}>{agente.cosaFa}</div>

        {agente.regola && <div style={S.regola}><b>Come si protegge dagli errori.</b> {agente.regola}</div>}

        <div style={{ marginTop: 12 }}>
          <div style={S.riga}><span style={S.et}>Cosa lo attiva</span><span>{agente.trigger}</span></div>
          <div style={S.riga}><span style={S.et}>Modello</span><span>{agente.modello}</span></div>
          <div style={S.riga}><span style={S.et}>Cosa legge</span><span>{agente.legge}</span></div>
          <div style={S.riga}><span style={S.et}>Cosa scrive</span><span>{agente.scrive}</span></div>
          <div style={S.riga}><span style={S.et}>Dove vive</span><span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5, color: "#a5b4fc" }}>{agente.file}</span></div>
        </div>

        {agente.note && <div style={S.nota}><b>Da sapere.</b> {agente.note}</div>}
      </div>

      <p style={{ marginTop: 14, fontSize: 12.5, color: "#94a3b8", lineHeight: 1.55 }}>
        Nessun agente invia messaggi a un ospite, salva un documento o scrive in contabilità senza un passaggio umano:
        propongono, tu confermi. Le uniche cose che partono da sole sono le notifiche e la sincronizzazione delle prenotazioni.
      </p>
    </div>
  );
}
