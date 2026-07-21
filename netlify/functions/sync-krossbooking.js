// Sync Krossbooking → CRM
// Funzione notturna: fa login su Krossbooking, scarica l'export prenotazioni (lo
// STESSO file XLSX che si carica a mano dalla sezione Gestione) e lo scrive nella
// tabella "prenotazioni". Gira sui server Netlify a orario fisso: non serve nessuno
// davanti, non serve Claude, non serve il computer dell'utente acceso.
//
// Variabili d'ambiente da impostare su Netlify (Site settings → Environment variables):
//   KROSS_USER   → nome utente di un account Krossbooking DEDICATO (non quello personale)
//   KROSS_PASS   → la sua password
//   KROSS_HOTEL  → sottodominio (default: valenteitalianproperties)
//   SUPABASE_SERVICE_ROLE_KEY → già presente per le altre funzioni
//
// La password NON è nel codice: sta solo tra le variabili Netlify, cifrate.

const XLSX = require("xlsx");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://heabtbdmwbjlgujsisor.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HOTEL = process.env.KROSS_HOTEL || "valenteitalianproperties";
const BASE = `https://${HOTEL}.krossbooking.com`;
const SITE_URL = process.env.URL || "https://valentelivingcrm.netlify.app";

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

// ── Gestione cookie di sessione (Node fetch non li tiene da solo) ──
function raccogliCookie(jar, res) {
  // Node 18: getSetCookie() restituisce l'array dei Set-Cookie
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  raw.forEach((c) => {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    if (i > 0) jar[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  });
}
const intestaCookie = (jar) => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");

// ── Login: GET iniziale per i cookie, poi POST con utente/password ──
async function login(jar) {
  const UA = "Mozilla/5.0 (compatible; ValenteCRM-sync)";
  const r1 = await fetch(`${BASE}/login/v2`, { headers: { "User-Agent": UA }, redirect: "manual" });
  raccogliCookie(jar, r1);

  const body = new URLSearchParams({ username: process.env.KROSS_USER || "", password: process.env.KROSS_PASS || "" });
  const r2 = await fetch(`${BASE}/login/v2`, {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", "Cookie": intestaCookie(jar), "Referer": `${BASE}/login/v2` },
    body: body.toString(),
    redirect: "manual",
  });
  raccogliCookie(jar, r2);
  // Un login riuscito risponde con un redirect (302) verso l'area riservata
  if (r2.status >= 400) throw new Error(`Login non riuscito (HTTP ${r2.status}). Controlla KROSS_USER / KROSS_PASS.`);
  return jar;
}

// ── Scarica l'export XLSX delle prenotazioni per un intervallo di date ──
async function scaricaExport(jar, periodo) {
  const UA = "Mozilla/5.0 (compatible; ValenteCRM-sync)";
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
