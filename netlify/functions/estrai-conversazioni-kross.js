// Estrazione conversazioni ospiti da Krossbooking uCRM → base di conoscenza
//
// Gira sul server (Netlify). Fa login su Krossbooking (con verifica 2FA via
// Authenticator: calcola da solo il codice a 6 cifre), scorre le conversazioni
// dell'uCRM per le quattro sublocazioni, legge ogni thread, RIPULISCE i dati
// personali (telefoni, email, link) e salva il testo pulito. Da quel materiale
// costruisce una scheda-conoscenza per appartamento.
//
// Variabili d'ambiente su Netlify:
//   KROSS_USER, KROSS_PASS, KROSS_HOTEL, KROSS_TOTP_SECRET, SUPABASE_SERVICE_ROLE_KEY
//   KROSS_TFA_ID (opzionale) → forza l'id del metodo 2FA
//
// Diagnostica: invocando con ?debug=1 esegue solo il login e restituisce i passaggi.

const crypto = require("crypto");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://heabtbdmwbjlgujsisor.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HOTEL = process.env.KROSS_HOTEL || "valenteitalianproperties";
const BASE = `https://${HOTEL}.krossbooking.com`;
const UA = "Mozilla/5.0 (compatible; ValenteCRM-kb)";

// ── TOTP (RFC 6238): stesso codice di Google Authenticator ──
function base32decode(s) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  s = String(s || "").replace(/=+$/, "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, val = 0; const out = [];
  for (const c of s) { val = (val << 5) | A.indexOf(c); bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 0xff); bits -= 8; } }
  return Buffer.from(out);
}
function totp(secret, forTime) {
  const key = base32decode(secret);
  const ctr = Math.floor((forTime !== undefined ? forTime : Date.now() / 1000) / 30);
  const buf = Buffer.alloc(8); buf.writeBigInt64BE(BigInt(ctr));
  const h = crypto.createHmac("sha1", key).update(buf).digest();
  const o = h[h.length - 1] & 0x0f;
  const code = ((h[o] & 0x7f) << 24 | (h[o + 1] & 0xff) << 16 | (h[o + 2] & 0xff) << 8 | (h[o + 3] & 0xff)) % 1000000;
  return String(code).padStart(6, "0");
}

// ── Cookie di sessione ──
function raccogliCookie(jar, res) {
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  raw.forEach((c) => { const [p] = c.split(";"); const i = p.indexOf("="); if (i > 0) jar[p.slice(0, i).trim()] = p.slice(i + 1).trim(); });
}
const cookieHeader = (jar) => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
function dig(o, names) {
  if (!o) return undefined;
  for (const n of names) { if (o[n] != null) return o[n]; if (o.data && o.data[n] != null) return o.data[n]; if (o.result && o.result[n] != null) return o.result[n]; }
  return undefined;
}

// ── Login con 2FA Authenticator. Ritorna { okAuth, debug } (jar mutato) ──
async function login(jar, opts = {}) {
  const dbg = []; const rec = (o) => { if (opts.debug) dbg.push(o); };
  const r1 = await fetch(`${BASE}/login/v2`, { headers: { "User-Agent": UA }, redirect: "manual" });
  raccogliCookie(jar, r1);
  const b1 = new URLSearchParams({ redirect: "", username: process.env.KROSS_USER || "", password: process.env.KROSS_PASS || "" });
  const r2 = await fetch(`${BASE}/login/v2`, {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest", "Cookie": cookieHeader(jar), "Referer": `${BASE}/login/v2` },
    body: b1.toString(), redirect: "manual",
  });
  raccogliCookie(jar, r2);
  const t2 = await r2.text(); let j2 = null; try { j2 = JSON.parse(t2); } catch (_) {}
  rec({ step: "login-post", status: r2.status, isJson: !!j2, keys: j2 ? Object.keys(j2) : [], sample: (j2 ? JSON.stringify(j2) : t2).slice(0, 600) });

  let token = dig(j2, ["token", "tfa_token", "csrf", "_token", "hash", "challenge"]);
  let id = dig(j2, ["id", "id_tfa", "tfa_id", "method_id", "id_method", "id_user"]);
  let methods = j2 && (j2.devices || j2.methods || j2.tfa_methods || (j2.data && (j2.data.devices || j2.data.methods)));
  if (Array.isArray(methods)) {
    rec({ step: "devices", list: methods.map((m) => ({ id: m.id ?? m.id_tfa ?? m.method_id, method: m.method ?? m.type ?? m.name ?? m.channel })) });
    const app = methods.find((m) => /google|authenticator|totp/i.test(JSON.stringify(m)))
      || methods.find((m) => /auth|app|otp/i.test(JSON.stringify(m)));
    if (app) id = app.id ?? app.id_tfa ?? app.method_id ?? id;
  }
  if (process.env.KROSS_TFA_ID) id = process.env.KROSS_TFA_ID;

  // Cerca un token/CSRF nella pagina di login (alcuni flussi lo richiedono in tfa-check)
  let htmlTok = null, htmlSrc = null;
  try {
    const hb = await (await fetch(`${BASE}/login/v2`, { headers: { "User-Agent": UA, "Cookie": cookieHeader(jar) } })).text();
    const pats = [
      [/name=["']_?token["']\s+value=["']([^"']+)["']/i, "input_token"],
      [/name=["']csrf[_-]?token["']\s+value=["']([^"']+)["']/i, "input_csrf"],
      [/csrf[_-]?token["']?\s*[:=]\s*["']([A-Za-z0-9._-]{12,})["']/i, "js_csrf"],
      [/["']token["']\s*:\s*["']([A-Za-z0-9._-]{12,})["']/i, "js_token"],
      [/<meta[^>]+csrf[^>]+content=["']([^"']+)["']/i, "meta_csrf"],
    ];
    for (const [re, name] of pats) { const m = hb.match(re); if (m) { htmlTok = m[1]; htmlSrc = name; break; } }
  } catch (_) {}

  // Init challenge: per email manda il codice, per authenticator può restituire il token
  let sendTok = null, sendStatus = null, sendSample = null;
  try {
    const rs = await fetch(`${BASE}/login/tfa-send-notif`, {
      method: "POST",
      headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest", "Cookie": cookieHeader(jar), "Referer": `${BASE}/login/v2` },
      body: new URLSearchParams({ id: String(id ?? ""), username: process.env.KROSS_USER || "" }).toString(),
    });
    raccogliCookie(jar, rs);
    sendStatus = rs.status;
    const st = await rs.text(); let sj = null; try { sj = JSON.parse(st); } catch (_) {}
    sendSample = (sj ? JSON.stringify(sj) : st).slice(0, 200);
    sendTok = dig(sj, ["token", "tfa_token", "hash", "challenge", "csrf"]);
  } catch (_) {}

  const finalToken = token || sendTok || htmlTok || jar["csrf_token"] || jar["XSRF-TOKEN"] || "";
  rec({ step: "token", fromBody: !!token, fromSend: !!sendTok, htmlSrc, htmlLen: htmlTok ? htmlTok.length : 0, sendStatus, sendSample, jarKeys: Object.keys(jar) });

  const code = totp(process.env.KROSS_TOTP_SECRET || "");
  const q = new URLSearchParams({ token: String(finalToken), id: String(id ?? ""), code, trust: "1" });
  const r3 = await fetch(`${BASE}/login/tfa-check?${q.toString()}`, {
    headers: { "User-Agent": UA, "X-Requested-With": "XMLHttpRequest", "Cookie": cookieHeader(jar), "Referer": `${BASE}/login/v2` },
    redirect: "manual",
  });
  raccogliCookie(jar, r3);
  const t3 = await r3.text(); let j3 = null; try { j3 = JSON.parse(t3); } catch (_) {}
  rec({ step: "tfa-check", status: r3.status, usedId: String(id ?? ""), tokenLen: String(finalToken).length, sample: (j3 ? JSON.stringify(j3) : t3).slice(0, 300) });

  const rv = await fetch(`${BASE}/v2/ucrm/get-threads`, {
    method: "POST",
    headers: { "User-Agent": UA, "Cookie": cookieHeader(jar), "X-Requested-With": "XMLHttpRequest", "Content-Type": "application/x-www-form-urlencoded" },
    body: "start=0&length=1",
  });
  const tv = await rv.text(); let okAuth = false;
  try { JSON.parse(tv); okAuth = rv.status === 200 && !/<!--\s*LOGIN|<html/i.test(tv); } catch (_) { okAuth = false; }
  rec({ step: "verify", status: rv.status, okAuth, sample: tv.slice(0, 120) });

  if (!okAuth && !opts.debug) throw new Error("Login Krossbooking non riuscito (2FA). Controlla KROSS_TOTP_SECRET / KROSS_TFA_ID.");
  return { okAuth, debug: dbg };
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
  const debug = !!(event && event.queryStringParameters && event.queryStringParameters.debug);
  try {
    const jar = {};
    const res = await login(jar, { debug });
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
