// netlify/functions/lib/kross.js
// Pezzi condivisi fra kross-api.js (proxy per il frontend) e
// kross-sync-background.js (sincronizzazione su Supabase).
//
// NB: sta in una sottocartella "lib" apposta — Netlify non la registra come
// funzione perche il file non si chiama lib.js.

const BASE = "https://api.krossbooking.com/v5";
const SUPABASE_URL = process.env.SUPABASE_URL || "https://heabtbdmwbjlgujsisor.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Kross concede 10 chiamate al minuto per TUTTO l'account (non per utente):
// ne usiamo al massimo 8, il resto e margine.
const MAX_AL_MINUTO = 8;

const sbUrl = (t, q = "") => `${SUPABASE_URL}/rest/v1/${t}${q}`;
const sbHead = (extra = {}) => ({
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
  ...extra,
});

async function statoLeggi() {
  const r = await fetch(sbUrl("kross_stato", "?id=eq.1&select=*"), { headers: sbHead() });
  const d = await r.json().catch(() => []);
  return Array.isArray(d) && d[0] ? d[0] : {};
}

async function statoScrivi(patch) {
  await fetch(sbUrl("kross_stato", "?id=eq.1"), {
    method: "PATCH", headers: sbHead({ Prefer: "return=minimal" }),
    body: JSON.stringify(patch),
  });
}

// Il token dura 7 giorni e si rinnova a ogni uso; se ne possono avere massimo
// 50 attivi, quindi va riusato e non richiesto a ogni chiamata.
async function prendiToken(forza = false) {
  const s = await statoLeggi();
  if (!forza && s.auth_token && s.token_scade && new Date(s.token_scade) - Date.now() > 3600e3) {
    return s.auth_token;
  }
  const r = await fetch(`${BASE}/auth/get-token`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: process.env.KROSS_API_KEY,
      hotel_id: process.env.KROSS_API_HOTEL || "valenteitalianproperties",
      username: process.env.KROSS_API_USER,
      password: process.env.KROSS_API_PASSWORD,
    }),
  });
  const j = await r.json().catch(() => ({}));
  // Il token sta alla RADICE come auth_token, non in data.token:
  // la documentazione ufficiale su questo punto e sbagliata.
  if (!j.auth_token) {
    throw new Error(`Autenticazione Kross fallita: ${j.error_message || r.status} — RUID ${j.ruid || "n/d"}`);
  }
  await statoScrivi({
    auth_token: j.auth_token,
    token_scade: j.auth_token_expire || new Date(Date.now() + 6 * 864e5).toISOString(),
  });
  return j.auth_token;
}

// Contatore condiviso: impedisce che frontend e sync insieme sfondino il limite.
async function prenotaChiamata() {
  const s = await statoLeggi();
  const ora = Date.now();
  const inizio = s.finestra_inizio ? new Date(s.finestra_inizio).getTime() : 0;
  if (ora - inizio > 60000) {
    await statoScrivi({ finestra_inizio: new Date(ora).toISOString(), conteggio: 1 });
    return true;
  }
  if ((s.conteggio || 0) >= MAX_AL_MINUTO) return false;
  await statoScrivi({ conteggio: (s.conteggio || 0) + 1 });
  return true;
}

async function chiamaKross(path, payload, token, riprova = true) {
  const r = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload || {}),
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && riprova) return chiamaKross(path, payload, await prendiToken(true), false);
  if (j && j.error_code) {
    const e = new Error(`Kross ${j.error_code}: ${j.error_message}`);
    e.ruid = j.ruid;
    e.codice = j.error_code;
    throw e;
  }
  return j;
}

const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

// Chiamata "educata": aspetta se il contatore e pieno invece di prendere 429.
async function chiamaConAttesa(path, payload) {
  const token = await prendiToken();
  for (let tentativo = 0; tentativo < 12; tentativo++) {
    if (await prenotaChiamata()) return chiamaKross(path, payload, token);
    await attendi(8000);
  }
  throw new Error("Limite di chiamate Kross sempre pieno dopo 12 tentativi.");
}

async function upsert(tabella, righe, conflitto) {
  for (let i = 0; i < righe.length; i += 400) {
    const lotto = righe.slice(i, i + 400);
    const r = await fetch(sbUrl(tabella, `?on_conflict=${conflitto}`), {
      method: "POST",
      headers: sbHead({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify(lotto),
    });
    if (!r.ok) throw new Error(`Scrittura ${tabella} fallita: ${(await r.text()).slice(0, 250)}`);
  }
  return righe.length;
}

module.exports = {
  BASE, SUPABASE_URL, SERVICE_KEY, MAX_AL_MINUTO,
  sbUrl, sbHead, statoLeggi, statoScrivi,
  prendiToken, prenotaChiamata, chiamaKross, chiamaConAttesa, attendi, upsert,
};
