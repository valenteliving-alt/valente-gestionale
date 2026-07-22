// Sync Krossbooking → CRM (prenotazioni)
// Funzione notturna: fa login su Krossbooking con verifica 2FA via EMAIL (Kross
// manda il codice a una casella dedicata, il server lo LEGGE via IMAP e completa
// l'accesso), scarica l'export prenotazioni (lo STESSO XLSX della sezione Gestione)
// e lo scrive nella tabella "prenotazioni". Gira sui server Netlify: niente
// computer acceso, niente intervento umano.
//
// Variabili d'ambiente su Netlify:
//   KROSS_USER, KROSS_PASS, KROSS_HOTEL, SUPABASE_SERVICE_ROLE_KEY
//   KROSS_OTP_USER, KROSS_OTP_PASS (app-password Gmail), KROSS_OTP_HOST (def. imap.gmail.com)
//   KROSS_EMAIL_ID (opzionale, def. rilevato / 10)

const XLSX = require("xlsx");
const tls = require("tls");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://heabtbdmwbjlgujsisor.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HOTEL = process.env.KROSS_HOTEL || "valenteitalianproperties";
const BASE = `https://${HOTEL}.krossbooking.com`;
const UA = "Mozilla/5.0 (compatible; ValenteCRM-sync)";
const SITE_URL = process.env.URL || "https://valentelivingcrm.netlify.app";
const IMAP_HOST = process.env.KROSS_OTP_HOST || "imap.gmail.com";

// ── Cookie di sessione ──
function raccogliCookie(jar, res) {
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  raw.forEach((c) => { const [p] = c.split(";"); const i = p.indexOf("="); if (i > 0) jar[p.slice(0, i).trim()] = p.slice(i + 1).trim(); });
}
const intestaCookie = (jar) => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");

// ── IMAP minimale su TLS (nessuna dipendenza) per leggere il codice OTP ──
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
  const pulito = text.replace(/=\r?\n/g, "");
  const blocchi = pulito.split(/\*\s+\d+\s+FETCH/i).reverse();
  for (const b of blocchi) {
    if (/kross|codice|verifica|verification|\bcode\b|OTP|autenticazione|two|2fa/i.test(b)) {
      const m = b.match(/\b(\d{6})\b/);
      if (m) return m[1];
    }
  }
  const m2 = pulito.match(/\b(\d{6})\b/);
  return m2 ? m2[1] : null;
}
async function imapAttendiCodice({ attesaMax, inviaEmail }) {
  const c = await imapConnect();
  const li = await c.cmd(`LOGIN "${qImap(process.env.KROSS_OTP_USER)}" "${qImap(process.env.KROSS_OTP_PASS)}"`);
  if (li.status !== "OK") { c.close(); throw new Error("IMAP login rifiutato: app-password non valida."); }
  try {
    const baseline = contaExists((await c.cmd("SELECT INBOX")).text);
    await inviaEmail();
    const inizio = Date.now(); let tentativi = 0;
    while (Date.now() - inizio < attesaMax) {
      await new Promise((r) => setTimeout(r, 2500));
      tentativi++;
      const cur = contaExists((await c.cmd("SELECT INBOX")).text);
      if (cur > baseline) {
        const codice = estraiCodice((await c.cmd(`FETCH ${baseline + 1}:${cur} BODY[]`)).text);
        if (codice) return { codice, tentativi };
      }
    }
    return { codice: null, tentativi };
  } finally { try { await c.cmd("LOGOUT"); } catch (_) {} c.close(); }
}

// ── Login Krossbooking con 2FA via EMAIL ──
async function login(jar, opts = {}) {
  const r1 = await fetch(`${BASE}/login/v2`, { headers: { "User-Agent": UA }, redirect: "manual" });
  raccogliCookie(jar, r1);
  const r2 = await fetch(`${BASE}/login/v2`, {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest", "Cookie": intestaCookie(jar), "Referer": `${BASE}/login/v2` },
    body: new URLSearchParams({ redirect: "", username: process.env.KROSS_USER || "", password: process.env.KROSS_PASS || "" }).toString(),
    redirect: "manual",
  });
  raccogliCookie(jar, r2);
  const t2 = await r2.text(); let j2 = null; try { j2 = JSON.parse(t2); } catch (_) {}

  const devices = (j2 && (j2.devices || (j2.data && j2.data.devices))) || [];
  const emailDev = Array.isArray(devices) ? devices.find((d) => /email/i.test(d.method || d.type || d.name || "")) : null;
  const id = process.env.KROSS_EMAIL_ID || (emailDev && emailDev.id) || "10";

  const { codice } = await imapAttendiCodice({
    attesaMax: Number(opts.attesa || 16000),
    inviaEmail: async () => {
      const rs = await fetch(`${BASE}/login/tfa-send-notif`, {
        method: "POST",
        headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest", "Cookie": intestaCookie(jar), "Referer": `${BASE}/login/v2` },
        body: new URLSearchParams({ id: String(id), username: process.env.KROSS_USER || "" }).toString(),
      });
      raccogliCookie(jar, rs);
    },
  });
  if (!codice) throw new Error("Codice email non ricevuto in tempo.");

  let ok = false;
  outer:
  for (const method of ["GET", "POST"]) {
    for (const tv of ["0", ""]) {
      const params = { token: tv, id: String(id), code: String(codice), trust: "1" };
      let rr;
      if (method === "GET") rr = await fetch(`${BASE}/login/tfa-check?${new URLSearchParams(params).toString()}`, { headers: { "User-Agent": UA, "X-Requested-With": "XMLHttpRequest", "Cookie": intestaCookie(jar), "Referer": `${BASE}/login/v2` }, redirect: "manual" });
      else rr = await fetch(`${BASE}/login/tfa-check`, { method: "POST", headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest", "Cookie": intestaCookie(jar), "Referer": `${BASE}/login/v2` }, body: new URLSearchParams(params).toString(), redirect: "manual" });
      raccogliCookie(jar, rr);
      const tt = await rr.text();
      if (/"auth"\s*:\s*1/.test(tt) || /"success"\s*:\s*true/.test(tt) || /"logged"\s*:\s*true/.test(tt)) { ok = true; break outer; }
    }
  }
  if (!ok) throw new Error("Verifica 2FA (email) non riuscita.");
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

async function scaricaExport(jar, periodo) {
  const q = `order=&statuses=&period=${encodeURIComponent(periodo)}&d=arr&id_rooms=&cod_channel=&pagato=&fatturato=`;
  await fetch(`${BASE}/admin/prenotazioni/?${q}`, { headers: { "User-Agent": UA, "Cookie": intestaCookie(jar) } });
  const r = await fetch(`${BASE}/admin/prenotazioni/export/?${q}`, { headers: { "User-Agent": UA, "Cookie": intestaCookie(jar) } });
  if (!r.ok) throw new Error(`Export non riuscito (HTTP ${r.status}).`);
  const ct = r.headers.get("content-type") || "";
  if (ct.includes("text/html")) throw new Error("L'export ha restituito una pagina HTML: sessione probabilmente scaduta.");
  return Buffer.from(await r.arrayBuffer());
}

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

exports.handler = async (event) => {
  if (!SERVICE_KEY) return { statusCode: 500, body: "Manca SUPABASE_SERVICE_ROLE_KEY." };
  if (!process.env.KROSS_USER || !process.env.KROSS_PASS) {
    return { statusCode: 500, body: "Mancano KROSS_USER / KROSS_PASS nelle variabili Netlify." };
  }
  const qs = (event && event.queryStringParameters) || {};
  try {
    const anno = new Date().getFullYear();
    const periodo = `01/01/${anno - 1} - 31/12/${anno + 1}`;

    const jar = {};
    await login(jar, { attesa: qs.attesa ? Number(qs.attesa) : undefined });
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
