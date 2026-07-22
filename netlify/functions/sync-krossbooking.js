// Sync Krossbooking → CRM
// Funzione notturna: fa login su Krossbooking (con verifica 2FA via Authenticator:
// calcola da solo il codice a 6 cifre), scarica l'export prenotazioni (lo STESSO
// file XLSX che si carica a mano dalla sezione Gestione) e lo scrive nella tabella
// "prenotazioni". Gira sui server Netlify a orario fisso: non serve nessuno davanti.
//
// Variabili d'ambiente su Netlify (Site settings → Environment variables):
//   KROSS_USER, KROSS_PASS, KROSS_HOTEL, KROSS_TOTP_SECRET, SUPABASE_SERVICE_ROLE_KEY
//   KROSS_TFA_ID (opzionale) → forza l'id del metodo 2FA
//
// La password NON è nel codice: sta solo tra le variabili Netlify, cifrate.

const XLSX = require("xlsx");
const crypto = require("crypto");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://heabtbdmwbjlgujsisor.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HOTEL = process.env.KROSS_HOTEL || "valenteitalianproperties";
const BASE = `https://${HOTEL}.krossbooking.com`;
const UA = "Mozilla/5.0 (compatible; ValenteCRM-sync)";
const SITE_URL = process.env.URL || "https://valentelivingcrm.netlify.app";

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
const intestaCookie = (jar) => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
function dig(o, names) {
  if (!o) return undefined;
  for (const n of names) { if (o[n] != null) return o[n]; if (o.data && o.data[n] != null) return o.data[n]; if (o.result && o.result[n] != null) return o.result[n]; }
  return undefined;
}

// ── Login con 2FA Authenticator ──
async function login(jar) {
  const r1 = await fetch(`${BASE}/login/v2`, { headers: { "User-Agent": UA }, redirect: "manual" });
  raccogliCookie(jar, r1);
  const b1 = new URLSearchParams({ redirect: "", username: process.env.KROSS_USER || "", password: process.env.KROSS_PASS || "" });
  const r2 = await fetch(`${BASE}/login/v2`, {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest", "Cookie": intestaCookie(jar), "Referer": `${BASE}/login/v2` },
    body: b1.toString(), redirect: "manual",
  });
  raccogliCookie(jar, r2);
  const t2 = await r2.text(); let j2 = null; try { j2 = JSON.parse(t2); } catch (_) {}

  let token = dig(j2, ["token", "tfa_token", "csrf", "_token", "hash"]);
  let id = dig(j2, ["id", "id_tfa", "tfa_id", "method_id", "id_method", "id_user"]);
  let methods = j2 && (j2.methods || j2.tfa_methods || (j2.data && (j2.data.methods || j2.data.tfa_methods)));
  if (Array.isArray(methods)) {
    const app = methods.find((m) => /auth|totp|app|google|otp/i.test(JSON.stringify(m)));
    if (app) id = app.id ?? app.id_tfa ?? app.method_id ?? id;
  }
  if (process.env.KROSS_TFA_ID) id = process.env.KROSS_TFA_ID;

  const code = totp(process.env.KROSS_TOTP_SECRET || "");
  const q = new URLSearchParams({ token: String(token ?? ""), id: String(id ?? ""), code, trust: "1" });
  const r3 = await fetch(`${BASE}/login/tfa-check?${q.toString()}`, {
    headers: { "User-Agent": UA, "X-Requested-With": "XMLHttpRequest", "Cookie": intestaCookie(jar), "Referer": `${BASE}/login/v2` },
    redirect: "manual",
  });
  raccogliCookie(jar, r3);
  return jar;
}

// ── Mapping colonne export → tabella (identico a quello del CRM lato browser) ──
const DG_num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v).replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? null : n;
};
const DG_date = (v) => {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};
const DG_ts = (v) => {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  const s = String(v).trim();
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}:\d{2}(:\d{2})?)/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}T${m[4]}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.replace(" ", "T");
  const d = DG_date(v);
  return d ? d + "T00:00:00" : null;
};
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

// ── Scarica l'export XLSX delle prenotazioni per un intervallo di date ──
async function scaricaExport(jar, periodo) {
  const q = `order=&statuses=&period=${encodeURIComponent(periodo)}&d=arr&id_rooms=&cod_channel=&pagato=&fatturato=`;
  // Prima carico l'elenco filtrato: imposta il periodo nella sessione
  await fetch(`${BASE}/admin/prenotazioni/?${q}`, { headers: { "User-Agent": UA, "Cookie": intestaCookie(jar) } });
  // Poi l'export vero e proprio
  const r = await fetch(`${BASE}/admin/prenotazioni/export/?${q}`, { headers: { "User-Agent": UA, "Cookie": intestaCookie(jar) } });
  if (!r.ok) throw new Error(`Export non riuscito (HTTP ${r.status}).`);
  const ct = r.headers.get("content-type") || "";
  if (ct.includes("text/html")) throw new Error("L'export ha restituito una pagina HTML invece del file: sessione probabilmente scaduta.");
  return Buffer.from(await r.arrayBuffer());
}

// ── Scrive/aggiorna in blocco nella tabella prenotazioni (dedup per id) ──
async function upsert(righe) {
  let ok = 0;
  for (let i = 0; i < righe.length; i += 400) {
    const batch = righe.slice(i, i + 400);
    const r = await fetch(`${SUPABASE_URL}/rest/v1/prenotazioni?on_conflict=id`, {
      method: "POST",
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(batch),
    });
    if (r.ok) ok += batch.length; else throw new Error(`Scrittura CRM fallita: ${(await r.text()).slice(0, 200)}`);
  }
  return ok;
}

async function notifica(title, body) {
  try {
    await fetch(`${SITE_URL}/.netlify/functions/invia-notifica`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, url: "/" }),
    });
  } catch (_) { /* la notifica è un di più */ }
}

exports.handler = async () => {
  if (!SERVICE_KEY) return { statusCode: 500, body: "Manca SUPABASE_SERVICE_ROLE_KEY." };
  if (!process.env.KROSS_USER || !process.env.KROSS_PASS) {
    return { statusCode: 500, body: "Mancano KROSS_USER / KROSS_PASS nelle variabili Netlify." };
  }
  try {
    // Finestra: anno scorso, corrente e prossimo — copre soggiorni passati e futuri
    const anno = new Date().getFullYear();
    const periodo = `01/01/${anno - 1} - 31/12/${anno + 1}`;

    const jar = {};
    await login(jar);
    const buf = await scaricaExport(jar, periodo);

    const wb = XLSX.read(buf, { cellDates: true });
    const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
    const righe = data.map(DG_map).filter((r) => Number.isInteger(r.id));

    const scritte = await upsert(righe);
    const msg = `Sincronizzate ${scritte} prenotazioni da Krossbooking (periodo ${periodo}).`;
    await notifica("Krossbooking sincronizzato", msg);
    return { statusCode: 200, body: JSON.stringify({ ok: true, sincronizzate: scritte, lette: righe.length }) };
  } catch (e) {
    await notifica("Sync Krossbooking non riuscito", String(e.message || e).slice(0, 180));
    return { statusCode: 500, body: JSON.stringify({ error: String(e.message || e) }) };
  }
};
