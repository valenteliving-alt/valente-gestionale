// netlify/functions/kross-api.js
// Proxy in SOLA LETTURA verso le API Kross Booking v5.
//
// Perche esiste: le credenziali Kross non possono stare nel frontend, perche il
// bundle Vite e pubblico. Questa funzione le tiene lato server, riusa il token,
// fa da cache e impedisce di sfondare il rate limit di Kross.
//
// Variabili d'ambiente su Netlify:
//   KROSS_API_KEY, KROSS_API_HOTEL, KROSS_API_USER, KROSS_API_PASSWORD
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Uso dal frontend:
//   POST /.netlify/functions/kross-api
//   { "path": "/rooms/get-room-types", "payload": { ... }, "forza": false }

const K = require("./lib/kross");

const CACHE_SECONDI = 600;

// Passano SOLO gli endpoint di lettura: qualsiasi save-/delete-/sign-/book
// viene respinto qui, prima di uscire da Netlify. La sola lettura e imposta
// dal server, non dal frontend.
const CONSENTITI = new Set([
  "/rooms/get-room-types", "/rooms/get-rooms", "/rooms/get-groups",
  "/rooms/get-services", "/rooms/get-amenities", "/rooms/get-be-locations",
  "/rooms/get-room-types-categories",
  "/otas/get-listings",
  "/reservations/get-list", "/reservations/get-statuses", "/reservations/get-payouts",
  "/reservations/get-check-in-instructions", "/reservations/get-check-out-instructions",
  "/reservations/get-house-manual", "/reservations/get-contract",
  "/channel/get-channels", "/channel/get-mapping", "/channel/get-rates",
  "/channel/get-rate-plans", "/channel/get-prices-and-availability",
  "/calendar/get-availability", "/calendar/get-pms-rates",
  "/owners/get-list", "/owners/get-charges",
  "/documents/get-list",
  "/reviews/get-list",
  "/blocks/get-list",
  "/properties/get-list",
  "/users/get-users-list", "/users/get-guests-list",
  "/housekeeping/get-tasks",
  "/tasks/get-maintenance-list", "/tasks/get-maintenance-categories-list",
  "/tasks/get-maintenance-status-list",
  "/accounting/get-payments", "/accounting/get-ledger-accounts",
  "/logs/get-access-log", "/logs/get-messages-log", "/logs/get-reservations-log",
]);

async function cacheLeggi(chiave) {
  const r = await fetch(K.sbUrl("kross_cache", `?chiave=eq.${encodeURIComponent(chiave)}&select=risposta,scade`), { headers: K.sbHead() });
  const d = await r.json().catch(() => []);
  const c = Array.isArray(d) && d[0];
  return c ? { risposta: c.risposta, viva: new Date(c.scade) > new Date() } : null;
}

async function cacheScrivi(chiave, risposta) {
  await fetch(K.sbUrl("kross_cache"), {
    method: "POST",
    headers: K.sbHead({ Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify({ chiave, risposta, scade: new Date(Date.now() + CACHE_SECONDI * 1000).toISOString() }),
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return risp(405, { ok: false, errore: "Usare POST" });
  if (!K.SERVICE_KEY) return risp(500, { ok: false, errore: "SUPABASE_SERVICE_ROLE_KEY non configurata" });
  if (!process.env.KROSS_API_KEY || !process.env.KROSS_API_USER) {
    return risp(500, { ok: false, errore: "Credenziali API Kross non configurate su Netlify (KROSS_API_KEY, KROSS_API_USER, KROSS_API_PASSWORD)" });
  }

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return risp(400, { ok: false, errore: "Corpo non valido" }); }

  const path = String(body.path || "");
  if (!CONSENTITI.has(path)) {
    return risp(403, { ok: false, errore: `Endpoint non consentito: ${path || "(vuoto)"}. Questo proxy e in sola lettura.` });
  }

  const chiave = path + "|" + JSON.stringify(body.payload || {});

  if (!body.forza) {
    const c = await cacheLeggi(chiave);
    if (c && c.viva) return risp(200, { ok: true, daCache: true, ...c.risposta });
  }

  if (!(await K.prenotaChiamata())) {
    // Meglio restituire un dato vecchio che un errore: il limite e condiviso
    // con il sync e con chi sta lavorando dentro Kross.
    const c = await cacheLeggi(chiave);
    if (c) return risp(200, { ok: true, daCache: true, scaduta: true, ...c.risposta });
    return risp(429, { ok: false, errore: "Limite Kross raggiunto (8 chiamate al minuto). Riprova fra un minuto." });
  }

  try {
    const token = await K.prendiToken();
    const j = await K.chiamaKross(path, body.payload, token);
    const out = { dati: j.data, conteggio: j.count, totale: j.total_count, ruid: j.ruid };
    await cacheScrivi(chiave, out);
    return risp(200, { ok: true, daCache: false, ...out });
  } catch (e) {
    return risp(502, { ok: false, errore: String(e.message || e), ruid: e.ruid || null });
  }
};

const risp = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
