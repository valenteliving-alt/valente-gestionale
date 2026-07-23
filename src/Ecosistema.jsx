import { useRef, useEffect, useState } from "react";

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
  cervello: { label: "Cervello AI",       icona: "🧠", col: "#a78bfa", x: 0.44, y: 0.90, desc: "La funzione che scrive materialmente la bozza di risposta all'ospite, usando le schede e lo storico. Gira su Netlify e usa Claude." },
  robot:    { label: "Robot 24/7",        icona: "🤖", col: "#38bdf8", x: 0.16, y: 0.80, desc: "Un mini-computer sempre acceso (server in Germania): entra in Kross da solo, legge i messaggi, chiede la risposta al cervello e la mette in coda. Lavora anche a Mac spento." },
  gmail:    { label: "Gmail 2FA",         icona: "✉️", col: "#f87171", x: 0.08, y: 0.50, desc: "La casella email che riceve il codice di sicurezza (2FA) per far entrare il robot in Kross in automatico." },
  kross:    { label: "Krossbooking",      icona: "🏨", col: "#fb923c", x: 0.16, y: 0.24, desc: "Il gestionale dove arrivano prenotazioni e messaggi degli ospiti dai vari canali (Airbnb, Booking...)." },
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
];

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
    <div style={{ maxWidth: 1000 }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 22 }}>🌐 Ecosistema Valente Living</h2>
      <p style={{ margin: "0 0 14px", color: "#6b7280", fontSize: 14 }}>
        Come è fatto il tuo sistema e come si muovono le informazioni. Le lucine che scorrono sono i dati che viaggiano. <b>Clicca un nodo</b> per la spiegazione.
      </p>
      <div ref={wrapRef} style={{ position: "relative", borderRadius: 16, overflow: "hidden", border: "1px solid #1e293b", boxShadow: "0 10px 40px rgba(2,6,23,.5)" }}>
        <canvas ref={canvasRef} style={{ display: "block", cursor: "pointer" }} />
      </div>
      <div style={{ marginTop: 12, background: "#0b1220", border: `1px solid ${n.col}`, borderRadius: 12, padding: "12px 16px", color: "#e2e8f0" }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{n.icona} {n.label}</div>
        <div style={{ fontSize: 13.5, lineHeight: 1.5, color: "#cbd5e1" }}>{n.desc}</div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
        {Object.keys(NODI).map((id) => (
          <button key={id} onClick={() => setSel(id)}
            style={{ background: sel === id ? NODI[id].col : "#1e293b", color: sel === id ? "#0b1220" : "#cbd5e1", border: "none", borderRadius: 999, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            {NODI[id].icona} {NODI[id].label}
          </button>
        ))}
      </div>
    </div>
  );
}
