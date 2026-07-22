// Risposte Ospiti — genera BOZZE di risposta per le chat in attesa su Krossbooking.
//
// Fa login su Kross (2FA via email, come le altre funzioni), prende le conversazioni
// dell'uCRM ancora da leggere, per ognuna ricava l'ultimo messaggio dell'ospite e
// l'appartamento, pesca la scheda-conoscenza di quell'immobile (kb_appartamenti) e
// chiede a Claude una risposta cortese e coerente con come abbiamo risposto in passato.
// Restituisce l'elenco {appartamento, domanda, bozza, id_thread} pronto per la pagina.
//
// Variabili d'ambiente: KROSS_USER, KROSS_PASS, KROSS_HOTEL, KROSS_OTP_USER,
//   KROSS_OTP_PASS, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY

const tls = require("tls");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://heabtbdmwbjlgujsisor.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HOTEL = process.env.KROSS_HOTEL || "valenteitalianproperties";
const BASE = `https://${HOTEL}.krossbooking.com`;
const UA = "Mozilla/5.0 (compatible; ValenteCRM-bozze)";
const IMAP_HOST = process.env.KROSS_OTP_HOST || "imap.gmail.com";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };

// ── Cookie + IMAP + login (2FA email) — identici alle altre funzioni ──
function raccogliCookie(jar, res) { const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : []; raw.forEach((c) => { const [p] = c.split(";"); const i = p.indexOf("="); if (i > 0) jar[p.slice(0, i).trim()] = p.slice(i + 1).trim(); }); }
const cookieHeader = (jar) => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
function imapConnect() {
  return new Promise((resolve, reject) => {
    const sock = tls.connect({ host: IMAP_HOST, port: 993, servername: IMAP_HOST }); sock.setEncoding("utf8");
    let greet = ""; const to = setTimeout(() => { try { sock.destroy(); } catch (_) {} reject(new Error("IMAP lento")); }, 8000);
    sock.once("error", (e) => { clearTimeout(to); reject(e); });
    const onGreet = (d) => { greet += d; if (/\* OK/i.test(greet)) { clearTimeout(to); sock.removeListener("data", onGreet); let n = 0;
      const cmd = (line, wait = 12000) => new Promise((res, rej) => { n++; const tag = "Q" + n; let acc = ""; const re = new RegExp("^" + tag + " (OK|NO|BAD)[^\\r\\n]*", "m"); const t = setTimeout(() => { sock.removeListener("data", h); rej(new Error("IMAP timeout")); }, wait); const h = (dd) => { acc += dd; const m = acc.match(re); if (m) { clearTimeout(t); sock.removeListener("data", h); res({ status: m[1], text: acc }); } }; sock.on("data", h); sock.write(tag + " " + line + "\r\n"); });
      resolve({ cmd, close: () => { try { sock.end(); } catch (_) {} } }); } };
    sock.on("data", onGreet);
  });
}
const qImap = (s) => String(s || "").replace(/(["\\])/g, "\\$1");
const contaExists = (t) => { const m = t.match(/\*\s+(\d+)\s+EXISTS/i); return m ? parseInt(m[1]) : 0; };
const estraiCodice = (t) => { const p = t.replace(/=\r?\n/g, ""); for (const b of p.split(/\*\s+\d+\s+FETCH/i).reverse()) { if (/kross|codice|verifica|verification|\bcode\b|OTP|autenticazione|2fa/i.test(b)) { const m = b.match(/\b(\d{6})\b/); if (m) return m[1]; } } const m2 = p.match(/\b(\d{6})\b/); return m2 ? m2[1] : null; };
async function imapAttendiCodice({ attesaMax, inviaEmail }) {
  const c = await imapConnect();
  const li = await c.cmd(`LOGIN "${qImap(process.env.KROSS_OTP_USER)}" "${qImap(process.env.KROSS_OTP_PASS)}"`);
  if (li.status !== "OK") { c.close(); throw new Error("IMAP login rifiutato."); }
  try {
    const baseline = contaExists((await c.cmd("SELECT INBOX")).text);
    await inviaEmail();
    const inizio = Date.now();
    while (Date.now() - inizio < attesaMax) { await new Promise((r) => setTimeout(r, 2500)); const cur = contaExists((await c.cmd("SELECT INBOX")).text); if (cur > baseline) { const code = estraiCodice((await c.cmd(`FETCH ${baseline + 1}:${cur} BODY[]`)).text); if (code) return code; } }
    return null;
  } finally { try { await c.cmd("LOGOUT"); } catch (_) {} c.close(); }
}
async function login(jar) {
  raccogliCookie(jar, await fetch(`${BASE}/login/v2`, { headers: { "User-Agent": UA }, redirect: "manual" }));
  const r2 = await fetch(`${BASE}/login/v2`, { method: "POST", headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest", "Cookie": cookieHeader(jar), "Referer": `${BASE}/login/v2` }, body: new URLSearchParams({ redirect: "", username: process.env.KROSS_USER || "", password: process.env.KROSS_PASS || "" }).toString(), redirect: "manual" });
  raccogliCookie(jar, r2);
  const j2 = await r2.json().catch(() => null);
  const devices = (j2 && (j2.devices || (j2.data && j2.data.devices))) || [];
  const emailDev = Array.isArray(devices) ? devices.find((d) => /email/i.test(d.method || d.type || d.name || "")) : null;
  const id = process.env.KROSS_EMAIL_ID || (emailDev && emailDev.id) || "10";
  const code = await imapAttendiCodice({ attesaMax: 20000, inviaEmail: async () => { const rs = await fetch(`${BASE}/login/tfa-send-notif`, { method: "POST", headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest", "Cookie": cookieHeader(jar), "Referer": `${BASE}/login/v2` }, body: new URLSearchParams({ id: String(id), username: process.env.KROSS_USER || "" }).toString() }); raccogliCookie(jar, rs); } });
  if (!code) throw new Error("Codice email non ricevuto.");
  for (const method of ["GET", "POST"]) for (const tv of ["0", ""]) {
    const params = { token: tv, id: String(id), code: String(code), trust: "1" }; let rr;
    if (method === "GET") rr = await fetch(`${BASE}/login/tfa-check?${new URLSearchParams(params)}`, { headers: { "User-Agent": UA, "X-Requested-With": "XMLHttpRequest", "Cookie": cookieHeader(jar), "Referer": `${BASE}/login/v2` }, redirect: "manual" });
    else rr = await fetch(`${BASE}/login/tfa-check`, { method: "POST", headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest", "Cookie": cookieHeader(jar), "Referer": `${BASE}/login/v2` }, body: new URLSearchParams(params).toString(), redirect: "manual" });
    raccogliCookie(jar, rr); const tt = await rr.text();
    if (/"auth"\s*:\s*1/.test(tt)) return jar;
  }
  throw new Error("Verifica 2FA non riuscita.");
}

// ── Chat in attesa (uCRM) ──
const soloTesto = (h) => String(h || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const sanifica = (t) => String(t || "").replace(/\+?\d[\d\s().\-\/]{7,}\d/g, "[tel]").replace(/[\w.+-]+@[\w.-]+\.\w+/g, "[email]").replace(/https?:\/\/\S+/g, "[link]").replace(/\s+/g, " ").trim();

async function chatInAttesa(jar) {
  const r = await fetch(`${BASE}/v2/ucrm/get-threads`, { method: "POST", headers: { "User-Agent": UA, "Cookie": cookieHeader(jar), "X-Requested-With": "XMLHttpRequest", "Content-Type": "application/x-www-form-urlencoded" }, body: "start=0&length=30" });
  const j = await r.json();
  const out = [];
  for (const b of String(j.html || "").split(/(?=<div[^>]*data-id=)/)) {
    const id = (b.match(/data-id="(\d+)"/) || [])[1]; if (!id) continue;
    const idr = (b.match(/data-idr="(\d+)"/) || [])[1] || "";
    const toread = /toread|non\s*let|unread/i.test(b);
    out.push({ id, idr, toread, preview: soloTesto(b) });
  }
  return out;
}
async function leggiConversazione(jar, id, idr) {
  const r = await fetch(`${BASE}/v2/ucrm/get-messages-details?id=${encodeURIComponent(id)}&idr=${encodeURIComponent(idr)}&ido=&ide=&sp_ajax=1`, { headers: { "User-Agent": UA, "Cookie": cookieHeader(jar), "X-Requested-With": "XMLHttpRequest" } });
  if (!r.ok) return "";
  let html = await r.text(); try { const j = JSON.parse(html); html = j.html || j.messages || html; } catch (_) {}
  return sanifica(soloTesto(html));
}

// ── KB: trova la scheda dell'appartamento più coerente col testo ──
async function schedeKB() {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/kb_appartamenti?select=appartamento,contenuto`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
  return r.ok ? r.json() : [];
}
function miglioreKB(testo, schede) {
  const t = (testo || "").toLowerCase();
  let best = null, bestScore = 0;
  for (const s of schede) {
    const nome = (s.appartamento || "").toLowerCase();
    // punteggio: quante parole significative del nome compaiono nella conversazione
    const parole = nome.split(/[^a-z0-9àèéìòù]+/).filter((w) => w.length > 3);
    let score = 0; for (const w of parole) if (t.includes(w)) score++;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return bestScore >= 1 ? best : null;
}

// ── Claude: scrive la bozza ──
async function scriviBozza(conversazione, kb) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return "(Manca ANTHROPIC_API_KEY: impossibile generare la bozza.)";
  const sys = "Sei l'assistente di Valente Living, una società di property management. Scrivi una risposta cortese, concreta e pronta da inviare all'ospite, coerente con come abbiamo risposto in passato per questo appartamento. Rispondi nella STESSA lingua dell'ultimo messaggio dell'ospite. Non inventare dati che non conosci (indirizzi, codici, orari): se un'informazione non c'è, invita gentilmente a fornirla o di' che la manderemo a breve. Firma come 'Valente Living'. Rispondi SOLO col testo della risposta, senza premesse.";
  const usr = `Conversazione con l'ospite (dati personali oscurati):\n${conversazione.slice(0, 6000)}\n\n---\nCome abbiamo risposto in passato per questo appartamento (esempi):\n${(kb || "(nessuno storico specifico)").slice(0, 8000)}\n\n---\nScrivi la risposta da inviare ora all'ospite.`;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model: "claude-sonnet-5", max_tokens: 700, system: sys, messages: [{ role: "user", content: usr }] }) });
    const j = await r.json();
    if (j && j.content && j.content[0] && j.content[0].text) return j.content[0].text.trim();
    return "(Bozza non disponibile: " + (j && j.error ? j.error.message : "errore AI") + ")";
  } catch (e) { return "(Errore AI: " + String(e.message || e) + ")"; }
}

exports.handler = async (event) => {
  if (event && event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (!SERVICE_KEY) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "Manca SUPABASE_SERVICE_ROLE_KEY." }) };
  try {
    const jar = {};
    await login(jar);
    const chat = await chatInAttesa(jar);
    const daRispondere = chat.filter((c) => c.toread).slice(0, 12);
    const lista = daRispondere.length ? daRispondere : chat.slice(0, 8); // se nessuna "non letta", mostra le più recenti
    const schede = await schedeKB();
    const bozze = [];
    for (const c of lista) {
      const conv = await leggiConversazione(jar, c.id, c.idr);
      if (!conv) continue;
      const kb = miglioreKB(conv + " " + c.preview, schede);
      const bozza = await scriviBozza(conv, kb ? kb.contenuto : "");
      bozze.push({ id_thread: c.id, appartamento: kb ? kb.appartamento : "(non identificato)", conversazione: conv.slice(-1200), bozza });
    }
    return { statusCode: 200, headers: { ...CORS, "Content-Type": "application/json" }, body: JSON.stringify({ ok: true, generato_il: new Date().toISOString(), bozze }) };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: String(e.message || e) }) };
  }
};
