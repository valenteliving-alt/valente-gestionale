import { useRef, useEffect, useState } from "react";
import { AGENTI, GRUPPI } from "./AgentiAI";

/* Ecosistema — mappa interattiva e animata di come è fatto il sistema Valente Living
   e come si muovono le informazioni. Stile "Obsidian" futuristico: nodi che fluttuano,
   collegamenti che pulsano, particelle che scorrono lungo le connessioni nella direzione
   in cui viaggiano i dati. Clicca un nodo per la spiegazione in parole semplici. */

const NODI = {
  ospiti:   { label: "Ospiti",            icona: "🧳", col: "#f59e0b", x: 0.34, y: 0.10, desc: "Gli ospiti scrivono da Airbnb / Booking. I loro messaggi arrivano su Krossbooking." },
  tu:       { label: "Tu / Operatore",    icona: "🧑‍💼", col: "#e879f9", x: 0.50, y: 0.15, desc: "Comandi tutto dal CRM: accendi o spegni l'AI, e approvi le risposte prima che partano. Il controllo è sempre tuo." },
  github:   { label: "GitHub",            icona: "🐙", col: "#94a3b8", x: 0.84, y: 0.26, desc: "Il magazzino del codice del CRM. Ogni modifica al gestionale si carica qui." },
  netlify:  { label: "Netlify",           icona: "🌐", col: "#2dd4bf", x: 0.90, y: 0.55, desc: "Pubblica il CRM online e ospita le piccole funzioni server (incluso il cervello AI). Prende il codice da GitHub e lo mette in rete." },
  supabase: { label: "Supabase (DB)",     icona: "🗄️", col: "#4ade80", x: 0.76, y: 0.85, desc: "Il database: prenotazioni, storico messaggi, schede immobili, interruttori dell'AI e la coda delle bozze da approvare." },
  cervello: { label: "Cervello AI",       icona: "🧠", col: "#a78bfa", x: 0.44, y: 0.90, desc: "La funzione che decide COSA rispondere: prende la scheda dell'appartamento e lo storico, li impacchetta e li manda a Claude. È qui che stanno le regole — niente prezzi, niente codici a chi non ha fatto il check-in. Il testo però non lo scrive lei: lo scrive Claude." },
  anthropic:{ label: "Claude (motore)",   icona: "✳️", col: "#d97757", x: 0.62, y: 0.93, desc: "Il modello che scrive materialmente le frasi. Riceve solo quello che la funzione gli manda in quel momento: non ha accesso al database, non ricorda le conversazioni precedenti, non decide niente da solo. Si paga a consumo, a frazioni di centesimo per risposta. Usa Haiku, il modello economico." },
  robot:    { label: "Robot 24/7",        icona: "🤖", col: "#38bdf8", x: 0.16, y: 0.80, desc: "Un mini-computer sempre acceso (server in Germania): entra in Kross da solo, legge i messaggi, chiede la risposta al cervello e la mette in coda. Lavora anche a Mac spento." },
  gmail:    { label: "Gmail 2FA",         icona: "✉️", col: "#f87171", x: 0.08, y: 0.50, desc: "La casella email che riceve il codice di sicurezza (2FA) per far entrare il robot in Kross in automatico." },
  kross:    { label: "Krossbooking",      icona: "🏨", col: "#fb923c", x: 0.16, y: 0.24, desc: "Il gestionale dove arrivano prenotazioni e messaggi degli ospiti dai vari canali (Airbnb, Booking...)." },
  cowork:   { label: "Agenti Cowork",     icona: "🕹️", col: "#f472b6", x: 0.30, y: 0.62, desc: "Claude che lavora al posto tuo usando il browser: check-in in Questura, recupero fatture dai portali, pubblicazione dei siti. Non vive nel gestionale, ma agisce sugli stessi sistemi." },
  numero:   { label: "Numero 351 → Zadarma", icona: "📞", col: "#facc15", x: 0.64, y: 0.07, desc: "Il numero di lavoro +39 351 419 9498 (SIM Iliad) inoltra tutte le chiamate al numero virtuale Zadarma 055 093 9753 (6 € al mese), che le passa via internet al bot telefonico. Se si toglie l'inoltro (##21#) il 351 torna a squillare normale." },
  telefono: { label: "Bot telefonico", icona: "🎙️", col: "#fb7185", x: 0.68, y: 0.30, desc: "L'assistente vocale (ElevenLabs, voce femminile) che risponde per primo a tutte le chiamate. Riconosce l'ospite dal numero, dice prezzi veri letti dal sito, manda link e info su WhatsApp, guida i guasti e passa la chiamata a te o a Francesco solo per le cose importanti. Dopo ogni chiamata ti arriva il riassunto, il lunedì il report." },
  whatsapp: { label: "WhatsApp lavoro", icona: "💬", col: "#22c55e", x: 0.95, y: 0.76, desc: "Il WhatsApp collegato (OpenWA) che spedisce i messaggi messi in coda nel database: link di prenotazione e info agli ospiti, riassunti delle chiamate, avvisi urgenti e report a te." },
  ecco:     { label: "Ecco AI", icona: "🪄", col: "#c084fc", x: 0.04, y: 0.33, desc: "Servizio esterno (tryecco.com) che risponde ai messaggi degli ospiti. Ha accesso a Kross. Le sue schede appartamento (wifi, ingresso, parcheggio, guasti...) vengono copiate nel database e sono la fonte da cui legge anche il bot telefonico: se aggiorni una scheda su Ecco, il bot usa il dato nuovo." },
  crm:      { label: "CRM Valente",       icona: "💠", col: "#818cf8", x: 0.50, y: 0.50, desc: "Il cuore: il tuo gestionale (valentelivingcrm). Prenotazioni, immobili, contabilità e il pannello Messaggi AI Ospiti." },
};

const ARCHI = [
  ["github", "netlify", "deploy"],
  ["netlify", "crm", "ospita il sito"],
  ["crm", "supabase", "dati"],
  ["tu", "crm", "usi e approvi"],
  ["ospiti", "kross", "scrivono"],
  ["kross", "robot", "messaggi"],
  ["gmail", "robot", "codice 2FA"],
  ["robot", "cervello", "chiede"],
  ["cervello", "robot", "bozza"],
  ["robot", "supabase", "salva bozze"],
  ["supabase", "robot", "interruttori"],
  ["robot", "kross", "invia se approvi"],
  ["netlify", "cervello", ""],
  ["cervello", "anthropic", "chiede a Claude"],
  ["anthropic", "cervello", "scrive il testo"],
  ["netlify", "anthropic", "anche gli altri agenti AI"],
  ["tu", "cowork", "gli dici cosa fare"],
  ["cowork", "kross", "check-in e schedine"],
  ["cowork", "crm", "ti consegna i file"],
  ["cowork", "github", "pubblica le modifiche"],
  ["ospiti", "numero", "chiamano il 351"],
  ["numero", "telefono", "inoltro chiamate"],
  ["telefono", "supabase", "prenotazioni, schede, prezzi"],
  ["telefono", "tu", "passa solo le urgenze"],
  ["telefono", "whatsapp", "link, info, riassunti"],
  ["supabase", "whatsapp", "coda messaggi"],
  ["whatsapp", "ospiti", "link e info scritte"],
  ["ospiti", "ecco", "chat"],
  ["ecco", "kross", "legge prenotazioni"],
  ["ecco", "supabase", "schede copiate"],
];


/* Come lavorano gli agenti: lo stesso schema per tutti, con il gate umano al centro. */
const PASSI = [
  { i: "⚡", t: "Un evento", d: "un messaggio dell'ospite, un file che carichi, un orario che scatta" },
  { i: "🧠", t: "L'agente legge", d: "prende SOLO i dati verificati che gli servono: schede, database, documenti" },
  { i: "📝", t: "Propone", d: "scrive una bozza o una destinazione — non la esegue" },
  { i: "✅", t: "Tu approvi", d: "il passaggio umano: confermi, correggi o rifiuti" },
  { i: "🚀", t: "Parte", d: "solo adesso la risposta viene inviata o il dato viene salvato" },
];

function AgentiDelNodo({ nodo }) {
  const lista = AGENTI.filter((a) => a.nodo === nodo);
  const [ap, setAp] = useState(null);
  const agente = lista.find((a) => a.id === ap) || null;

  if (!lista.length) {
    return (
      <div style={{ marginTop: 10, fontSize: 12.5, color: "#64748b", lineHeight: 1.5 }}>
        Su questo nodo non gira nessun agente: è un pezzo di infrastruttura o una fonte di dati.
        Prova <b>Bot telefonico</b>, <b>Cervello AI</b>, <b>Robot 24/7</b>, <b>CRM Valente</b>, <b>Netlify</b>, <b>Supabase</b> o <b>Agenti Cowork</b>.
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 2 }}>
        Agenti che girano qui ({lista.length})
      </div>
      <div style={{ fontSize: 12.5, color: "#6b7280", marginBottom: 8 }}>
        Clicca un agente per vedere cosa fa, cosa lo fa partire e cosa può o non può toccare.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(238px, 1fr))", gap: 8 }}>
        {lista.map((a) => {
          const g = GRUPPI[a.gruppo], attivo = ap === a.id;
          return (
            <button key={a.id} onClick={() => setAp(attivo ? null : a.id)}
              style={{ textAlign: "left", cursor: "pointer", font: "inherit", width: "100%",
                background: attivo ? "#0b1220" : "#fff", color: attivo ? "#e2e8f0" : "#111827",
                border: `1px solid ${attivo ? g.col : a.orfano ? "#fca5a5" : "#e5e7eb"}`,
                borderLeft: `4px solid ${a.orfano ? "#ef4444" : g.col}`,
                borderRadius: 10, padding: "9px 12px", transition: "all .15s",
                boxShadow: attivo ? `0 6px 18px ${g.col}33` : "0 1px 2px rgba(0,0,0,.04)" }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 15 }}>{a.icona}</span>{a.nome}
                {a.orfano && <span style={{ background: "#fee2e2", color: "#b91c1c", borderRadius: 999, padding: "1px 8px", fontSize: 10.5, fontWeight: 700 }}>non collegato</span>}
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.4, color: attivo ? "#cbd5e1" : "#6b7280", marginTop: 3 }}>
                {a.trigger}
              </div>
            </button>
          );
        })}
      </div>

      {agente && (
        <div style={{ marginTop: 10, background: "#0b1220", border: `1px solid ${GRUPPI[agente.gruppo].col}`, borderRadius: 12, padding: "13px 16px", color: "#e2e8f0" }}>
          <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "#cbd5e1" }}>{agente.cosaFa}</div>
          {agente.regola && (
            <div style={{ marginTop: 10, background: "#0f2b22", borderLeft: "3px solid #34d399", borderRadius: 8, padding: "8px 11px", fontSize: 12.5, lineHeight: 1.5, color: "#a7f3d0" }}>
              <b>Come si protegge dagli errori.</b> {agente.regola}
            </div>
          )}
          <div style={{ marginTop: 10 }}>
            {[["Modello", agente.modello], ["Cosa legge", agente.legge], ["Cosa scrive", agente.scrive], ["Dove vive", agente.file]].map(([k, v]) => (
              <div key={k} style={{ display: "flex", gap: 10, padding: "6px 0", borderTop: "1px solid #1e293b", fontSize: 12.5, lineHeight: 1.5 }}>
                <span style={{ minWidth: 96, color: "#94a3b8", fontWeight: 600, flexShrink: 0 }}>{k}</span>
                <span style={k === "Dove vive" ? { fontFamily: "ui-monospace, monospace", color: "#a5b4fc" } : undefined}>{v}</span>
              </div>
            ))}
          </div>
          {agente.note && (
            <div style={{ marginTop: 10, background: "#1e293b", borderLeft: "3px solid #fbbf24", borderRadius: 8, padding: "8px 11px", fontSize: 12.5, lineHeight: 1.5, color: "#fde68a" }}>
              <b>Da sapere.</b> {agente.note}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ComeAgiscono() {
  return (
    <div style={{ marginTop: 22, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: "16px 18px" }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 3 }}>Come agiscono — vale per tutti allo stesso modo</div>
      <p style={{ margin: "0 0 14px", fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
        Nessun agente decide da solo. Tutti seguono questa catena, e il quarto passaggio sei tu.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "stretch" }}>
        {PASSI.map((p, i) => {
          const gate = p.t === "Tu approvi";
          return (
            <div key={p.t} style={{ display: "flex", alignItems: "stretch", gap: 8, flex: "1 1 175px" }}>
              <div style={{ flex: 1, background: gate ? "#0b1220" : "#f8fafc",
                border: `1px solid ${gate ? "#e879f9" : "#e5e7eb"}`, borderRadius: 11, padding: "11px 12px",
                color: gate ? "#e2e8f0" : "#111827" }}>
                <div style={{ fontSize: 19, marginBottom: 3 }}>{p.i}</div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3 }}>{p.t}</div>
                <div style={{ fontSize: 11.8, lineHeight: 1.42, color: gate ? "#cbd5e1" : "#6b7280" }}>{p.d}</div>
              </div>
              {i < PASSI.length - 1 && (
                <div style={{ alignSelf: "center", color: "#cbd5e1", fontSize: 17, flexShrink: 0 }}>→</div>
              )}
            </div>
          );
        })}
      </div>
      <p style={{ margin: "13px 0 0", fontSize: 12.5, color: "#64748b", lineHeight: 1.55 }}>
        Le uniche cose che saltano il tuo passaggio sono <b>le notifiche</b> (ti avvisano e basta) e
        <b> la sincronizzazione notturna delle prenotazioni</b> (copia dati da Kross, non decide niente).
        Tutto il resto — una risposta a un ospite, un documento archiviato, un dato scritto in scheda —
        aspetta che sia tu a dire di sì.
      </p>
    </div>
  );
}

export default function Ecosistema() {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const [sel, setSel] = useState("crm");
  const stato = useRef({ nodi: {}, t0: performance.now(), part: [] });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let raf;
    // inizializza particelle: alcune per ogni arco, con offset casuale
    stato.current.part = [];
    ARCHI.forEach((a, i) => {
      const n = a[2] ? 3 : 2;
      for (let k = 0; k < n; k++) stato.current.part.push({ arco: i, p: (k / n) + Math.random() * 0.1 });
    });

    function resize() {
      const w = wrapRef.current.clientWidth;
      const h = Math.max(460, Math.min(680, w * 0.62));
      const dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = w + "px"; canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      canvas._w = w; canvas._h = h;
    }
    resize();
    window.addEventListener("resize", resize);

    function pos(id, t) {
      const n = NODI[id];
      const w = canvas._w, h = canvas._h;
      // fluttuazione dolce (bobbing) con fase per nodo
      const ph = id.charCodeAt(0) + id.charCodeAt(id.length - 1);
      const fx = Math.sin(t * 0.0006 + ph) * (w * 0.010);
      const fy = Math.cos(t * 0.0007 + ph * 1.7) * (h * 0.014);
      return { x: n.x * w + fx, y: n.y * h + fy };
    }

    function draw() {
      const t = performance.now() - stato.current.t0;
      const w = canvas._w, h = canvas._h;
      // sfondo
      const g = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
      g.addColorStop(0, "#0f172a"); g.addColorStop(1, "#020617");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      // griglia leggera
      ctx.strokeStyle = "rgba(56,189,248,0.05)"; ctx.lineWidth = 1;
      for (let gx = 0; gx < w; gx += 42) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke(); }
      for (let gy = 0; gy < h; gy += 42) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke(); }

      const P = {}; Object.keys(NODI).forEach((id) => (P[id] = pos(id, t)));

      // archi
      ARCHI.forEach((a) => {
        const A = P[a[0]], B = P[a[1]];
        const attiva = sel === a[0] || sel === a[1];
        ctx.strokeStyle = attiva ? "rgba(129,140,248,0.85)" : "rgba(148,163,184,0.22)";
        ctx.lineWidth = attiva ? 2 : 1;
        ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
        if (attiva && a[2]) {
          ctx.fillStyle = "rgba(199,210,254,0.9)"; ctx.font = "11px system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(a[2], (A.x + B.x) / 2, (A.y + B.y) / 2 - 5);
        }
      });

      // particelle (informazioni che scorrono)
      stato.current.part.forEach((pt) => {
        pt.p += 0.004 + (pt.arco % 3) * 0.001;
        if (pt.p > 1) pt.p -= 1;
        const a = ARCHI[pt.arco]; const A = P[a[0]], B = P[a[1]];
        const x = A.x + (B.x - A.x) * pt.p, y = A.y + (B.y - A.y) * pt.p;
        const attiva = sel === a[0] || sel === a[1];
        const col = NODI[a[0]].col;
        ctx.beginPath(); ctx.arc(x, y, attiva ? 3.2 : 2, 0, Math.PI * 2);
        ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = attiva ? 14 : 7;
        ctx.fill(); ctx.shadowBlur = 0;
      });

      // nodi
      Object.keys(NODI).forEach((id) => {
        const n = NODI[id], p = P[id];
        const isSel = sel === id;
        const pulse = 1 + Math.sin(t * 0.002 + id.length) * 0.06;
        const r = (id === "crm" ? 30 : 22) * pulse * (isSel ? 1.18 : 1);
        // alone
        ctx.beginPath(); ctx.arc(p.x, p.y, r + (isSel ? 14 : 8), 0, Math.PI * 2);
        ctx.fillStyle = n.col + "22"; ctx.fill();
        // cerchio
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = "#0b1220"; ctx.fill();
        ctx.lineWidth = isSel ? 3 : 2; ctx.strokeStyle = n.col;
        ctx.shadowColor = n.col; ctx.shadowBlur = isSel ? 22 : 12; ctx.stroke(); ctx.shadowBlur = 0;
        // icona
        ctx.font = (id === "crm" ? 26 : 20) + "px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(n.icona, p.x, p.y + 1);
        // etichetta
        ctx.font = "600 12px system-ui, sans-serif"; ctx.fillStyle = "#e2e8f0"; ctx.textBaseline = "top";
        ctx.fillText(n.label, p.x, p.y + r + 5);
        n._sx = p.x; n._sy = p.y; n._r = r;
      });

      raf = requestAnimationFrame(draw);
    }
    draw();

    function click(e) {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      let hit = null;
      Object.keys(NODI).forEach((id) => {
        const n = NODI[id];
        if (n._sx != null && Math.hypot(mx - n._sx, my - n._sy) < n._r + 8) hit = id;
      });
      if (hit) setSel(hit);
    }
    canvas.addEventListener("click", click);

    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); canvas.removeEventListener("click", click); };
  }, [sel]);

  const n = NODI[sel];
  return (
    <div style={{ maxWidth: 1080 }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 22 }}>🌐 Ecosistema Valente Living</h2>
      <p style={{ margin: "0 0 14px", color: "#6b7280", fontSize: 14 }}>
        Come è fatto il tuo sistema, come si muovono le informazioni e <b>quali agenti girano su ogni pezzo</b>. Le lucine che scorrono sono i dati che viaggiano. <b>Clicca un nodo</b>: sotto compaiono la spiegazione e gli agenti che ci lavorano.
      </p>
      <div ref={wrapRef} style={{ position: "relative", borderRadius: 16, overflow: "hidden", border: "1px solid #1e293b", boxShadow: "0 10px 40px rgba(2,6,23,.5)" }}>
        <canvas ref={canvasRef} style={{ display: "block", cursor: "pointer" }} />
      </div>
      <div style={{ marginTop: 12, background: "#0b1220", border: `1px solid ${n.col}`, borderRadius: 12, padding: "12px 16px", color: "#e2e8f0" }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{n.icona} {n.label}</div>
        <div style={{ fontSize: 13.5, lineHeight: 1.5, color: "#cbd5e1" }}>{n.desc}</div>
      </div>
      <AgentiDelNodo nodo={sel} />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
        {Object.keys(NODI).map((id) => (
          <button key={id} onClick={() => setSel(id)}
            style={{ background: sel === id ? NODI[id].col : "#1e293b", color: sel === id ? "#0b1220" : "#cbd5e1", border: "none", borderRadius: 999, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            {NODI[id].icona} {NODI[id].label}
          </button>
        ))}
      </div>

      <ComeAgiscono />
    </div>
  );
}
