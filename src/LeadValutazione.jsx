import { useState, useEffect, useRef, useCallback } from "react";

/* La valutazione in PDF di un lead e le sue chat WhatsApp.

   • CartellaValutazione: l'icona 📁 a destra della riga del lead.
     Dorata = c'è la valutazione, un click e si apre. Grigia = non c'è ancora,
     un click e scegli il PDF da caricare.
   • SezioneValutazione: dentro la scheda aperta. Apri, sostituisci, invia
     (WhatsApp di lavoro o email già scritta) e la chat WhatsApp con il lead.

   I PDF stanno nel bucket "documenti" (cartella valutazioni-lead/) e sono
   registrati nella tabella documenti con categoria "valutazione_lead".
   Il lead si riconosce dai tag: id, ultime 10 cifre del telefono, email. */

const SUPABASE_URL = "https://heabtbdmwbjlgujsisor.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhlYWJ0YmRtd2JqbGd1anNpc29yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMjA4NDgsImV4cCI6MjA5NTg5Njg0OH0.FRk1tARhQHylLjfhACorn6O_E7ommm47tBTfJHOVxAU";
const BUCKET = "documenti";
const CATEGORIA = "valutazione_lead";
const LINK_GIORNI = 60; // per quanti giorni funziona il link mandato al proprietario

function token() {
  try { return (JSON.parse(localStorage.getItem("vl_sessione") || "null") || {}).access_token || ""; }
  catch { return ""; }
}
const intest = (extra = {}) => ({ apikey: SUPABASE_KEY, Authorization: `Bearer ${token() || SUPABASE_KEY}`, ...extra });
const percorso = (p) => p.split("/").map(encodeURIComponent).join("/");

const cifre = (t) => String(t || "").replace(/\D/g, "").slice(-10);
const chiavi = (l) => [
  l.id ? `lead:${l.id}` : null,
  cifre(l.telefono).length >= 9 ? `tel:${cifre(l.telefono)}` : null,
  l.email ? `mail:${String(l.email).toLowerCase().trim()}` : null,
].filter(Boolean);

/* ---------- elenco valutazioni: una sola lettura per tutta la pagina ---------- */
let cache = null;          // Promise<array>
const ascoltatori = new Set();
function caricaTutte(forza) {
  if (!cache || forza) {
    cache = fetch(`${SUPABASE_URL}/rest/v1/documenti?select=id,nome_file,path,tags,created_at,caricato_da&categoria=eq.${CATEGORIA}&order=created_at.desc`, { headers: intest() })
      .then((r) => r.json()).then((d) => (Array.isArray(d) ? d : [])).catch(() => []);
    if (forza) cache.then(() => ascoltatori.forEach((f) => f()));
  }
  return cache;
}
function trovaPer(lista, l) {
  const k = chiavi(l);
  return lista.find((d) => {
    const t = String(d.tags || "").split("|");
    return k.some((x) => t.includes(x));
  }) || null;
}
function useValutazione(l) {
  const [doc, setDoc] = useState(undefined); // undefined = sto guardando
  const aggiorna = useCallback(() => { caricaTutte().then((lista) => setDoc(trovaPer(lista, l))); }, [l.id, l.telefono, l.email]); // eslint-disable-line
  useEffect(() => {
    aggiorna();
    ascoltatori.add(aggiorna);
    return () => ascoltatori.delete(aggiorna);
  }, [aggiorna]);
  return doc;
}

async function linkFirmato(path, secondi) {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${percorso(path)}`, {
    method: "POST", headers: intest({ "Content-Type": "application/json" }), body: JSON.stringify({ expiresIn: secondi }),
  });
  const d = await r.json().catch(() => null);
  return r.ok && d && d.signedURL ? `${SUPABASE_URL}/storage/v1${d.signedURL}` : null;
}
async function apri(doc) {
  const w = window.open("", "_blank"); // aperta subito, se no Safari la blocca
  const u = await linkFirmato(doc.path, 600);
  if (u && w) w.location.href = u; else { if (w) w.close(); alert("Non riesco ad aprire il PDF."); }
}
async function carica(l, file, vecchio) {
  if (!file) return false;
  if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) { alert("Serve un file PDF."); return false; }
  const sicuro = String(l.id || cifre(l.telefono) || "lead").replace(/[^a-zA-Z0-9_-]/g, "");
  const nome = file.name.replace(/[^a-zA-Z0-9._ -]/g, "_");
  const path = `valutazioni-lead/${sicuro}/${Date.now()}-${nome}`;
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${percorso(path)}`, {
    method: "POST", body: file, headers: intest({ "Content-Type": "application/pdf", "x-upsert": "true" }),
  });
  if (!r.ok) { alert("Caricamento non riuscito."); return false; }
  const riga = {
    nome_file: file.name, path, tipo: "pdf", categoria: CATEGORIA,
    tags: chiavi(l).join("|"),
    note: `Valutazione per il lead ${l.nome || ""}`.trim(),
  };
  const rr = vecchio
    ? await fetch(`${SUPABASE_URL}/rest/v1/documenti?id=eq.${vecchio.id}`, { method: "PATCH", headers: intest({ "Content-Type": "application/json" }), body: JSON.stringify(riga) })
    : await fetch(`${SUPABASE_URL}/rest/v1/documenti`, { method: "POST", headers: intest({ "Content-Type": "application/json", Prefer: "return=minimal" }), body: JSON.stringify(riga) });
  if (!rr.ok) { alert("Il PDF è caricato ma non sono riuscito a registrarlo."); return false; }
  // Sostituzione: il file vecchio si cancella, così i link già mandati non aprono più la versione superata.
  if (vecchio && vecchio.path && vecchio.path !== path) {
    await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}`, {
      method: "DELETE", headers: intest({ "Content-Type": "application/json" }), body: JSON.stringify({ prefixes: [vecchio.path] }),
    }).catch(() => {});
  }
  await caricaTutte(true);
  return true;
}
async function strumenti(azione, extra) {
  const r = await fetch("/.netlify/functions/lead-strumenti", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: token(), azione, ...extra }),
  });
  const j = await r.json().catch(() => ({ ok: false, errore: "Risposta non valida" }));
  if (!j.ok) throw new Error(j.errore || "Errore");
  return j;
}

/* ---------- l'icona a destra della riga ---------- */
export function CartellaValutazione({ lead }) {
  const doc = useValutazione(lead);
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const c = doc ? "var(--gold)" : "var(--gray)";
  return (
    <>
      <button
        title={doc ? "Apri la valutazione" : doc === null ? "Nessuna valutazione: clicca per caricare il PDF" : "…"}
        onClick={async (e) => {
          e.stopPropagation();
          if (doc) apri(doc); else if (doc === null) input.current && input.current.click();
        }}
        style={{ background: "none", border: 0, padding: "2px 4px", cursor: "pointer", fontSize: 16, color: c, opacity: doc ? 1 : .45, filter: doc ? "none" : "grayscale(1)" }}>
        {busy ? "⏳" : "📁"}
      </button>
      <input ref={input} type="file" accept="application/pdf,.pdf" style={{ display: "none" }}
        onClick={(e) => e.stopPropagation()}
        onChange={async (e) => { const f = e.target.files[0]; e.target.value = ""; setBusy(true); await carica(lead, f, null); setBusy(false); }} />
    </>
  );
}

/* ---------- dentro la scheda ---------- */
export function SezioneValutazione({ lead, puoGestire }) {
  const l = lead;
  const doc = useValutazione(l);
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [invio, setInvio] = useState(null);   // { testo, link } quando il riquadro di invio è aperto
  const [esito, setEsito] = useState("");
  const [chat, setChat] = useState(null);      // null = non letta, [] = vuota
  const [errChat, setErrChat] = useState("");

  const haTel = cifre(l.telefono).length >= 9;

  const leggiChat = useCallback(async () => {
    if (!haTel || !puoGestire) return;
    try { setErrChat(""); const j = await strumenti("chat", { telefono: l.telefono }); setChat(j.messaggi || []); }
    catch (e) { setErrChat(e.message); setChat([]); }
  }, [l.telefono, haTel, puoGestire]);
  useEffect(() => { leggiChat(); }, [leggiChat]);

  const preparaInvio = async () => {
    setEsito("");
    const link = await linkFirmato(doc.path, LINK_GIORNI * 86400);
    if (!link) { alert("Non riesco a creare il link del PDF."); return; }
    const nome = String(l.nome || "").trim().split(/\s+/)[0];
    const testo = [
      `Ciao${nome ? " " + nome : ""}, sono Tommaso di Valente Living.`,
      `Ti mando la valutazione del tuo appartamento:`,
      link,
      `Dentro trovi quanto può incassare, i prezzi della zona e come lavoreremmo noi.`,
      `Se ti va ci sentiamo per parlarne.`,
      ``,
      `Saluti, Tommaso`,
    ].join("\n");
    setInvio({ testo, link });
  };

  /* Risposta libera al lead, con o senza valutazione: stesso riquadro, testo
     da scrivere. Il lead lascia mail o telefono: si manda da li. */
  const preparaRisposta = () => {
    setEsito("");
    const nome = String(l.nome || "").trim().split(/\s+/)[0];
    setInvio({ testo: [`Ciao${nome ? " " + nome : ""}, sono Tommaso di Valente Living.`, ``, ``, ``, `Saluti, Tommaso`].join("\n"), link: null });
  };

  const mandaWa = async () => {
    setEsito("Metto in coda…");
    try {
      const j = await strumenti("invia_wa", { telefono: l.telefono, testo: invio.testo, tipo: invio.link ? "lead_valutazione" : "lead_risposta" });
      setEsito("In invio dal WhatsApp di lavoro…");
      // OpenWA preleva la coda in pochi secondi: ricontrollo l'esito
      let fatto = false;
      for (let i = 0; i < 6 && !fatto; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const e = await strumenti("esito", { telefono: l.telefono, id: j.id }).catch(() => ({}));
        if (e.inviato_il) { setEsito("✓ Inviato su WhatsApp"); fatto = true; }
        else if (e.esito && !/^\{/.test(e.esito)) { setEsito("Non partito: " + e.esito); fatto = true; }
      }
      if (!fatto) setEsito("In coda: partirà appena il WhatsApp di lavoro è collegato.");
      setInvio(null);
      setTimeout(leggiChat, 2000);
    } catch (e) { setEsito("Errore: " + e.message); }
  };

  const mail = invio && l.email
    ? "https://mail.google.com/mail/?authuser=info@valenteliving.it&view=cm&fs=1" +
      "&to=" + encodeURIComponent(l.email) +
      "&su=" + encodeURIComponent(invio.link ? "Valutazione del tuo appartamento - Valente Living" : "La tua richiesta a Valente Living") +
      "&body=" + encodeURIComponent(invio.testo)
    : null;

  return (
    <>
      <Box titolo="Rispondi e valutazione">
        {doc === undefined && <div style={{ fontSize: 12, color: "var(--gray)" }}>Guardo se c'è…</div>}
        {doc === null && (
          <div style={{ fontSize: 12.5, color: "var(--gray)", marginBottom: 8 }}>Non c'è ancora una valutazione per questo lead.</div>
        )}
        {doc && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, padding: "10px 12px", border: "1px solid var(--cd)", borderRadius: 8, background: "var(--white)" }}>
            <span style={{ fontSize: 22 }}>📁</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.nome_file}</div>
              <div style={{ fontSize: 11, color: "var(--gray)" }}>caricata il {new Date(doc.created_at).toLocaleDateString("it-IT")}</div>
            </div>
            <button className="bg" style={{ fontSize: 12, padding: "6px 13px" }} onClick={() => apri(doc)}>Apri</button>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {puoGestire && (haTel || l.email) && (
            <button className={doc ? "bg" : "bp"} style={{ fontSize: 12, padding: "6px 14px" }} onClick={preparaRisposta}>✉ Rispondi</button>
          )}
          {doc && puoGestire && (
            <button className="bp" style={{ fontSize: 12, padding: "6px 14px" }} onClick={preparaInvio}>Invia la valutazione</button>
          )}
          <button className="bg" style={{ fontSize: 12, padding: "6px 13px" }} disabled={busy}
            onClick={() => input.current && input.current.click()}>
            {busy ? "Carico…" : doc ? "Sostituisci PDF" : "Carica PDF"}
          </button>
          <input ref={input} type="file" accept="application/pdf,.pdf" style={{ display: "none" }}
            onChange={async (e) => { const f = e.target.files[0]; e.target.value = ""; setBusy(true); await carica(l, f, doc || null); setBusy(false); }} />
        </div>

        {invio && (
          <div style={{ marginTop: 12, padding: 12, border: "1px solid var(--gold)", borderRadius: 8, background: "rgba(192,148,86,.06)" }}>
            <div style={{ fontSize: 11.5, color: "var(--gray)", marginBottom: 6 }}>Ecco il messaggio, puoi modificarlo. Parte solo quando premi.</div>
            <textarea value={invio.testo} onChange={(e) => setInvio({ ...invio, testo: e.target.value })}
              rows={8} style={{ width: "100%", fontSize: 13, lineHeight: 1.5, padding: 9, borderRadius: 7, border: "1px solid var(--cd)", fontFamily: "inherit", boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              {haTel && <button className="bp" style={{ fontSize: 12, padding: "6px 14px" }} onClick={mandaWa}>Invia su WhatsApp</button>}
              {mail && <a className="bp" href={mail} target="_blank" rel="noreferrer" style={{ fontSize: 12, padding: "6px 14px", textDecoration: "none" }}>Invia per email</a>}
              <button className="bg" style={{ fontSize: 12, padding: "6px 13px" }} onClick={() => setInvio(null)}>Annulla</button>
            </div>
            {!haTel && <div style={{ fontSize: 11, color: "var(--gray)", marginTop: 6 }}>Il lead non ha un telefono: si può mandare solo per mail.</div>}
          </div>
        )}
        {esito && <div style={{ fontSize: 12, marginTop: 8, color: /✓/.test(esito) ? "#2e7d4f" : /Errore|Non partito/.test(esito) ? "var(--red)" : "var(--gray)" }}>{esito}</div>}
      </Box>

      {puoGestire && haTel && (
        <Box titolo={`Chat WhatsApp${chat && chat.length ? ` (${chat.length})` : ""}`}>
          {chat === null && <div style={{ fontSize: 12, color: "var(--gray)" }}>Leggo le chat…</div>}
          {errChat && <div style={{ fontSize: 12, color: "var(--red)" }}>{errChat}</div>}
          {chat && !errChat && chat.length === 0 && (
            <div style={{ fontSize: 11.5, color: "var(--gray)", padding: "9px 11px", background: "rgba(0,0,0,.03)", borderRadius: 7 }}>
              Nessun messaggio con questo numero sul WhatsApp di lavoro.
            </div>
          )}
          {chat && chat.length > 0 && (
            <div style={{ maxHeight: 360, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, padding: "4px 2px" }}>
              {chat.map((m) => (
                <div key={m.id} style={{
                  alignSelf: m.da_me ? "flex-end" : "flex-start", maxWidth: "80%",
                  background: m.da_me ? "#dcf8c6" : "var(--white)", border: "1px solid var(--cd)",
                  borderRadius: 9, padding: "7px 10px", fontSize: 12.5, lineHeight: 1.45, whiteSpace: "pre-wrap", wordBreak: "break-word",
                }}>
                  {m.testo}
                  <div style={{ fontSize: 10, color: "var(--gray)", textAlign: "right", marginTop: 3 }}>
                    {m.quando ? new Date(m.quando).toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Box>
      )}
    </>
  );
}

function Box({ titolo, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--gray)", marginBottom: 7 }}>{titolo}</div>
      {children}
    </div>
  );
}
