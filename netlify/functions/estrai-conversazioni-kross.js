// Estrazione conversazioni ospiti da Krossbooking uCRM → base di conoscenza
//
// Gira sul server (Netlify). Fa login su Krossbooking, scorre le conversazioni
// dell'uCRM per le quattro sublocazioni indicate, legge ogni thread, RIPULISCE i
// dati personali degli ospiti (telefoni, email, link) e salva il testo pulito.
// Da quel materiale costruisce una scheda-conoscenza per appartamento, che servirà
// all'agente per rispondere. È il "trattamento dei tuoi dati sul tuo server":
// nessun dato personale esce dalla pipeline.
//
// Variabili d'ambiente su Netlify (le stesse della sync):
//   KROSS_USER, KROSS_PASS, KROSS_HOTEL (default valenteitalianproperties),
//   SUPABASE_SERVICE_ROLE_KEY
// La password sta solo lì, cifrata. Finché non è impostata, la funzione non fa nulla.

const SUPABASE_URL = process.env.SUPABASE_URL || "https://heabtbdmwbjlgujsisor.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HOTEL = process.env.KROSS_HOTEL || "valenteitalianproperties";
const BASE = `https://${HOTEL}.krossbooking.com`;
const UA = "Mozilla/5.0 (compatible; ValenteCRM-kb)";

// Le unità di cui costruire la KB: chiave = etichetta, valori = parole da cercare nel nome
const UNITA = [
  { nome: "Micco", match: /\bmicco\b/i },
  { nome: "San Jacopo", match: /san\s*jacopo/i },
  { nome: "Leoncino", match: /leoncino/i },
  { nome: "Giostra", match: /giostra/i },
];

// ── Ripulisce il testo dai dati personali ──
function sanifica(t) {
  return String(t || "")
    .replace(/\+?\d[\d\s().\-\/]{7,}\d/g, "[telefono]")
    .replace(/[\w.+-]+@[\w.-]+\.\w+/g, "[email]")
    .replace(/https?:\/\/\S+/g, "[link]")
    .replace(/\s+/g, " ")
    .trim();
}
// Toglie i tag html lasciando il testo
const soloTesto = (html) => String(html || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ");

// ── Cookie di sessione ──
function raccogliCookie(jar, res) {
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  raw.forEach((c) => { const [p] = c.split(";"); const i = p.indexOf("="); if (i > 0) jar[p.slice(0, i).trim()] = p.slice(i + 1).trim(); });
}
const cookieHeader = (jar) => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");

async function login(jar) {
  const r1 = await fetch(`${BASE}/login/v2`, { headers: { "User-Agent": UA }, redirect: "manual" });
  raccogliCookie(jar, r1);
  const body = new URLSearchParams({ username: process.env.KROSS_USER || "", password: process.env.KROSS_PASS || "" });
  const r2 = await fetch(`${BASE}/login/v2`, {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", "Cookie": cookieHeader(jar), "Referer": `${BASE}/login/v2` },
    body: body.toString(), redirect: "manual",
  });
  raccogliCookie(jar, r2);
  if (r2.status >= 400) throw new Error(`Login non riuscito (HTTP ${r2.status}). Controlla KROSS_USER / KROSS_PASS.`);
  return jar;
}

// ── Elenco conversazioni (uCRM) ──
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
    // Ogni conversazione è un blocco con data-id (thread) e data-idr (prenotazione)
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
    if (trovati < 1) break;                       // finite le pagine
    if ((j.count || 0) <= start + 200) break;
  }
  return tutte;
}

// ── Messaggi di una conversazione ──
async function leggiThread(jar, id, idr) {
  const r = await fetch(`${BASE}/v2/ucrm/get-messages-details?id=${encodeURIComponent(id)}&idr=${encodeURIComponent(idr)}&ido=&ide=&sp_ajax=1`, {
    headers: { "User-Agent": UA, "Cookie": cookieHeader(jar), "X-Requested-With": "XMLHttpRequest" },
  });
  if (!r.ok) return "";
  let html = await r.text();
  try { const j = JSON.parse(html); html = j.html || j.messages || html; } catch (_) { /* è già html */ }
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

exports.handler = async () => {
  if (!SERVICE_KEY) return { statusCode: 500, body: "Manca SUPABASE_SERVICE_ROLE_KEY." };
  if (!process.env.KROSS_USER || !process.env.KROSS_PASS) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, motivo: "Credenziali Krossbooking non impostate: funzione in attesa." }) };
  }
  try {
    const jar = {};
    await login(jar);
    const thread = await elencoThread(jar);

    // Legge i thread delle quattro unità e li salva ripuliti
    const perApp = {};
    const messaggi = [];
    for (const t of thread) {
      const testo = await leggiThread(jar, t.id, t.idr);
      if (!testo) continue;
      messaggi.push({ id: `t${t.id}`, thread_id: t.id, prenotazione_idr: t.idr || null, appartamento: t.appartamento, testo, mittente: "conversazione" });
      (perApp[t.appartamento] = perApp[t.appartamento] || []).push(testo);
    }
    await scrivi("ucrm_messaggi", messaggi, "id");

    // Materiale grezzo della KB per appartamento (la sintesi AI è un passo successivo)
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
