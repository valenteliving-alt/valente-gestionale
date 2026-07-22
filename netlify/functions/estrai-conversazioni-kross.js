// Estrazione conversazioni ospiti da Krossbooking uCRM → base di conoscenza
//
// Gira sul server (Netlify). Fa login su Krossbooking con verifica 2FA via EMAIL:
// Kross manda un codice a 6 cifre alla casella dedicata, il server lo LEGGE da
// quella casella (IMAP, senza librerie esterne) e completa l'accesso. Poi scorre
// le conversazioni uCRM delle quattro sublocazioni, RIPULISCE i dati personali
// (telefoni, email, link) e salva il testo pulito + una scheda per appartamento.
//
// Variabili d'ambiente su Netlify:
//   KROSS_USER, KROSS_PASS, KROSS_HOTEL, SUPABASE_SERVICE_ROLE_KEY
//   KROSS_OTP_USER  → casella che riceve il codice (es. ...@gmail.com)
//   KROSS_OTP_PASS  → "password per app" di Google (16 lettere, senza spazi)
//   KROSS_OTP_HOST  → server IMAP (default imap.gmail.com)
//   KROSS_EMAIL_ID  → (opzionale) id del metodo 2FA email (default: rilevato / 10)
//
// Diagnostica: ?imaptest=1 prova solo la lettura casella; ?debug=1 fa il login e
// restituisce i passaggi senza scrivere nulla.

const tls = require("tls");
// build: email-otp v2

const SUPABASE_URL = process.env.SUPABASE_URL || "https://heabtbdmwbjlgujsisor.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HOTEL = process.env.KROSS_HOTEL || "valenteitalianproperties";
const BASE = `https://${HOTEL}.krossbooking.com`;
const UA = "Mozilla/5.0 (compatible; ValenteCRM-kb)";
const IMAP_HOST = process.env.KROSS_OTP_HOST || "imap.gmail.com";

// ── Cookie di sessione ──
function raccogliCookie(jar, res) {
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  raw.forEach((c) => { const [p] = c.split(";"); const i = p.indexOf("="); if (i > 0) jar[p.slice(0, i).trim()] = p.slice(i + 1).trim(); });
}
const cookieHeader = (jar) => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");

// ── IMAP minimale su TLS (nessuna dipendenza) ──
function imapConnect() {
  return new Promise((resolve, reject) => {
    const sock = tls.connect({ host: IMAP_HOST, port: 993, servername: IMAP_HOST });
    sock.setEncoding("utf8");
    let greet = "";
    const to = setTimeout(() => { try { sock.destroy(); } catch (_) {} reject(new Error("IMAP: connessione lenta")); }, 8000);
    sock.once("error", (e) => { clearTimeout(to); reject(e); });
    const onGreet = (d) => {
      greet += d;
      if (/\* OK/i.test(greet)) {
        clearTimeout(to);
        sock.removeListener("data", onGreet);
        let n = 0;
        const cmd = (line, wait = 12000) => new Promise((res, rej) => {
          n++; const tag = "Q" + n; let acc = "";
          const re = new RegExp("^" + tag + " (OK|NO|BAD)[^\\r\\n]*", "m");
          const t = setTimeout(() => { sock.removeListener("data", h); rej(new Error("IMAP timeout: " + line.split(" ")[0])); }, wait);
          const h = (dd) => { acc += dd; const m = acc.match(re); if (m) { clearTimeout(t); sock.removeListener("data", h); res({ status: m[1], text: acc }); } };
          sock.on("data", h);
          sock.write(tag + " " + line + "\r\n");
        });
        resolve({ cmd, close: () => { try { sock.end(); } catch (_) {} } });
      }
    };
    sock.on("data", onGreet);
  });
}
const qImap = (s) => String(s || "").replace(/(["\\])/g, "\\$1");
const contaExists = (text) => { const m = text.match(/\*\s+(\d+)\s+EXISTS/i); return m ? parseInt(m[1]) : 0; };
function estraiCodice(text) {
  const pulito = text.replace(/=\r?\n/g, ""); // toglie i soft-break quoted-printable
  const blocchi = pulito.split(/\*\s+\d+\s+FETCH/i).reverse(); // dal messaggio più recente
  for (const b of blocchi) {
    if (/kross|codice|verifica|verification|\bcode\b|OTP|autenticazione|two|2fa/i.test(b)) {
      const m = b.match(/\b(\d{6})\b/);
      if (m) return m[1];
    }
  }
  const m2 = pulito.match(/\b(\d{6})\b/);
  return m2 ? m2[1] : null;
}
async function imapLoginSelect() {
  const c = await imapConnect();
  const li = await c.cmd(`LOGIN "${qImap(process.env.KROSS_OTP_USER)}" "${qImap(process.env.KROSS_OTP_PASS)}"`);
  if (li.status !== "OK") {
    c.close();
    const msg = String(li.text || "").replace(/\s+/g, " ").slice(-220);
    throw new Error("IMAP login rifiutato → " + msg + " (utente=" + (process.env.KROSS_OTP_USER || "?") + ", lunghezza pass=" + String(process.env.KROSS_OTP_PASS || "").length + ")");
  }
  return c;
}
async function imapUltimoMessaggio() {
  const c = await imapLoginSelect();
  try {
    const n = contaExists((await c.cmd("SELECT INBOX")).text);
    if (n < 1) return { messaggi: 0 };
    const fr = await c.cmd(`FETCH ${n} BODY[HEADER.FIELDS (FROM SUBJECT)]`);
    const from = (fr.text.match(/^From:\s*(.+)$/im) || [])[1] || "";
    const subj = (fr.text.match(/^Subject:\s*(.+)$/im) || [])[1] || "";
    return { messaggi: n, from: from.replace(/<[^>]*>/g, "").trim().slice(0, 50), subjectKross: /kross|codice|verifica/i.test(subj) };
  } finally { try { await c.cmd("LOGOUT"); } catch (_) {} c.close(); }
}
async function imapAttendiCodice({ attesaMax, inviaEmail }) {
  const c = await imapLoginSelect();
  try {
    const baseline = contaExists((await c.cmd("SELECT INBOX")).text);
    await inviaEmail(); // ora Kross manda l'email col codice
    const inizio = Date.now(); let tentativi = 0;
    while (Date.now() - inizio < attesaMax) {
      await new Promise((r) => setTimeout(r, 2500));
      tentativi++;
      const cur = contaExists((await c.cmd("SELECT INBOX")).text);
      if (cur > baseline) {
        const fr = await c.cmd(`FETCH ${baseline + 1}:${cur} BODY[]`);
        const codice = estraiCodice(fr.text);
        if (codice) return { codice, tentativi };
      }
    }
    return { codice: null, tentativi };
  } finally { try { await c.cmd("LOGOUT"); } catch (_) {} c.close(); }
}

// ── Login Krossbooking con 2FA via EMAIL. Ritorna { okAuth, debug } (jar mutato) ──
async function login(jar, opts = {}) {
  const dbg = []; const rec = (o) => { if (opts.debug || opts.imaptest) dbg.push(o); };

  if (opts.imaptest) {
    try { rec({ step: "imaptest", ok: true, ...(await imapUltimoMessaggio()) }); }
    catch (e) { rec({ step: "imaptest", ok: false, errore: String(e.message || e) }); }
    return { okAuth: false, debug: dbg };
  }

  // 1) cookie iniziali
  const r1 = await fetch(`${BASE}/login/v2`, { headers: { "User-Agent": UA }, redirect: "manual" });
  raccogliCookie(jar, r1);
  // 2) primo fattore
  const r2 = await fetch(`${BASE}/login/v2`, {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest", "Cookie": cookieHeader(jar), "Referer": `${BASE}/login/v2` },
    body: new URLSearchParams({ redirect: "", username: process.env.KROSS_USER || "", password: process.env.KROSS_PASS || "" }).toString(),
    redirect: "manual",
  });
  raccogliCookie(jar, r2);
  const t2 = await r2.text(); let j2 = null; try { j2 = JSON.parse(t2); } catch (_) {}
  rec({ step: "login-post", status: r2.status, keys: j2 ? Object.keys(j2) : [], sample: (j2 ? JSON.stringify(j2) : t2).slice(0, 200) });

  // 3) dispositivo EMAIL
  const devices = (j2 && (j2.devices || (j2.data && j2.data.devices))) || [];
  const emailDev = Array.isArray(devices) ? devices.find((d) => /email/i.test(d.method || d.type || d.name || "")) : null;
  const id = process.env.KROSS_EMAIL_ID || (emailDev && emailDev.id) || "10";
  rec({ step: "devices", idEmail: String(id), list: Array.isArray(devices) ? devices.map((d) => ({ id: d.id, method: d.method })) : [] });

  // 4) IMAP: baseline → invia email → leggi il nuovo codice
  const attesaMax = Number(opts.attesa || 12000);
  let codice = null, imapErr = null, tentativi = 0, sendStatus = null;
  try {
    const r = await imapAttendiCodice({
      attesaMax,
      inviaEmail: async () => {
        const rs = await fetch(`${BASE}/login/tfa-send-notif`, {
          method: "POST",
          headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest", "Cookie": cookieHeader(jar), "Referer": `${BASE}/login/v2` },
          body: new URLSearchParams({ id: String(id), username: process.env.KROSS_USER || "" }).toString(),
        });
        raccogliCookie(jar, rs); sendStatus = rs.status;
      },
    });
    codice = r.codice; tentativi = r.tentativi;
  } catch (e) { imapErr = String(e.message || e); }
  rec({ step: "email-otp", sendStatus, codiceTrovato: !!codice, tentativi, imapErr });

  // 5) verifica del codice (prova GET/POST, token "0"/"")
  let authOk = false, checkSample = "";
  if (codice) {
    outer:
    for (const method of ["GET", "POST"]) {
      for (const tv of ["0", ""]) {
        const params = { token: tv, id: String(id), code: String(codice), trust: "1" };
        let rr;
        if (method === "GET") rr = await fetch(`${BASE}/login/tfa-check?${new URLSearchParams(params).toString()}`, { headers: { "User-Agent": UA, "X-Requested-With": "XMLHttpRequest", "Cookie": cookieHeader(jar), "Referer": `${BASE}/login/v2` }, redirect: "manual" });
        else rr = await fetch(`${BASE}/login/tfa-check`, { method: "POST", headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest", "Cookie": cookieHeader(jar), "Referer": `${BASE}/login/v2` }, body: new URLSearchParams(params).toString(), redirect: "manual" });
        raccogliCookie(jar, rr);
        const tt = await rr.text(); checkSample = tt.slice(0, 80);
        if (/"auth"\s*:\s*1/.test(tt) || /"success"\s*:\s*true/.test(tt) || /"logged"\s*:\s*true/.test(tt)) { authOk = true; break outer; }
      }
    }
  }
  rec({ step: "tfa-check", authOk, checkSample });

  // 6) verifica finale su endpoint riservato
  const rv = await fetch(`${BASE}/v2/ucrm/get-threads`, {
    method: "POST",
    headers: { "User-Agent": UA, "Cookie": cookieHeader(jar), "X-Requested-With": "XMLHttpRequest", "Content-Type": "application/x-www-form-urlencoded" },
    body: "start=0&length=1",
  });
  const tvv = await rv.text(); let ok = false;
  try { JSON.parse(tvv); ok = rv.status === 200 && !/<!--\s*LOGIN|<html/i.test(tvv); } catch (_) {}
  rec({ step: "verify", status: rv.status, okAuth: ok });

  if (!ok && !opts.debug) throw new Error("Login Krossbooking non riuscito: codice email non verificato.");
  return { okAuth: ok, debug: dbg };
}

// ── Unità di cui costruire la KB ──
const UNITA = [
  { nome: "Micco", match: /\bmicco\b/i },
  { nome: "San Jacopo", match: /san\s*jacopo/i },
  { nome: "Leoncino", match: /leoncino/i },
  { nome: "Giostra", match: /giostra/i },
];

function sanifica(t) {
  return String(t || "")
    .replace(/\+?\d[\d\s().\-\/]{7,}\d/g, "[telefono]")
    .replace(/[\w.+-]+@[\w.-]+\.\w+/g, "[email]")
    .replace(/https?:\/\/\S+/g, "[link]")
    .replace(/\s+/g, " ")
    .trim();
}
const soloTesto = (html) => String(html || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ");

async function elencoThread(jar) {
  const tutte = [];
  for (let start = 0; start < 5000; start += 200) {
    const r = await fetch(`${BASE}/v2/ucrm/get-threads`, {
      method: "POST",
      headers: { "User-Agent": UA, "Cookie": cookieHeader(jar), "X-Requested-With": "XMLHttpRequest", "Content-Type": "application/x-www-form-urlencoded" },
      body: `start=${start}&length=200`,
    });
    if (!r.ok) throw new Error(`get-threads HTTP ${r.status}`);
    const j = await r.json();
    const blocchi = String(j.html || "").split(/(?=<div[^>]*data-id=)/);
    let trovati = 0;
    for (const b of blocchi) {
      const id = (b.match(/data-id="(\d+)"/) || [])[1];
      const idr = (b.match(/data-idr="(\d+)"/) || [])[1];
      if (!id) continue;
      trovati++;
      const testo = soloTesto(b);
      const unita = UNITA.find((u) => u.match.test(testo));
      if (unita) tutte.push({ id, idr: idr || "", appartamento: unita.nome });
    }
    if (trovati < 1) break;
    if ((j.count || 0) <= start + 200) break;
  }
  return tutte;
}

async function leggiThread(jar, id, idr) {
  const r = await fetch(`${BASE}/v2/ucrm/get-messages-details?id=${encodeURIComponent(id)}&idr=${encodeURIComponent(idr)}&ido=&ide=&sp_ajax=1`, {
    headers: { "User-Agent": UA, "Cookie": cookieHeader(jar), "X-Requested-With": "XMLHttpRequest" },
  });
  if (!r.ok) return "";
  let html = await r.text();
  try { const j = JSON.parse(html); html = j.html || j.messages || html; } catch (_) { /* già html */ }
  return sanifica(soloTesto(html));
}

async function scrivi(tabella, righe, onConflict) {
  if (!righe.length) return 0;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabella}?on_conflict=${onConflict}`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(righe),
  });
  if (!r.ok) throw new Error(`Scrittura ${tabella} fallita: ${(await r.text()).slice(0, 150)}`);
  return righe.length;
}

exports.handler = async (event) => {
  if (!SERVICE_KEY) return { statusCode: 500, body: "Manca SUPABASE_SERVICE_ROLE_KEY." };
  if (!process.env.KROSS_USER || !process.env.KROSS_PASS) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, motivo: "Credenziali Krossbooking non impostate." }) };
  }
  const qs = (event && event.queryStringParameters) || {};
  const imaptest = !!qs.imaptest;
  const debug = !!qs.debug;
  try {
    const jar = {};
    if (imaptest) {
      const res = await login(jar, { imaptest: true });
      return { statusCode: 200, body: JSON.stringify(res.debug, null, 1) };
    }
    const res = await login(jar, { debug, attesa: qs.attesa ? Number(qs.attesa) : undefined });
    if (debug) return { statusCode: 200, body: JSON.stringify({ okAuth: res.okAuth, debug: res.debug }, null, 1) };

    const thread = await elencoThread(jar);
    const perApp = {};
    const messaggi = [];
    for (const t of thread) {
      const testo = await leggiThread(jar, t.id, t.idr);
      if (!testo) continue;
      messaggi.push({ id: `t${t.id}`, thread_id: t.id, prenotazione_idr: t.idr || null, appartamento: t.appartamento, testo, mittente: "conversazione" });
      (perApp[t.appartamento] = perApp[t.appartamento] || []).push(testo);
    }
    await scrivi("ucrm_messaggi", messaggi, "id");

    const kb = Object.entries(perApp).map(([app, conv]) => ({
      appartamento: app,
      contenuto: conv.join("\n---\n").slice(0, 20000),
      n_conversazioni: conv.length,
      aggiornata_il: new Date().toISOString(),
    }));
    await scrivi("kb_appartamenti", kb, "appartamento");

    return { statusCode: 200, body: JSON.stringify({ ok: true, thread_letti: thread.length, appartamenti: Object.keys(perApp) }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: String(e.message || e) }) };
  }
};
