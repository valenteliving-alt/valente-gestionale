// netlify/functions/kross-chat.mjs
// Chat ospiti di Kross via API v5 (al posto del robot che entrava nel sito col browser).
//
//   POST { token, azione: "lista" }                       -> chat aggiornate negli ultimi giorni
//   POST { token, azione: "thread", id_thread }           -> messaggi di una chat (dal più vecchio)
//   POST { token, azione: "invia", id_thread, testo }     -> invia la risposta all'ospite
//
// Solo master e soci (chi "vede tutto" nel CRM). Le credenziali Kross restano qui.
// Il limite di Kross (10 chiamate/minuto per tutto l'account) è condiviso con la
// sincronizzazione: si passa sempre da prenotaChiamata, e lista/thread hanno una
// cache breve così più schermi aperti non consumano chiamate.

import * as K from "./lib/kross.mjs";

const URL_SB = K.SUPABASE_URL;
const ANON = K.SERVICE_KEY; // come team.js: apikey di servizio + token dell'utente per sapere chi è

const risp = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

// Chi è l'utente: 2 chiamate a Supabase. Si ricorda per 10 minuti finché la funzione resta calda.
const CHI = new Map();
async function chiSono(token) {
  if (!token) return null;
  const c = CHI.get(token);
  if (c && c.scade > Date.now()) return c.io;
  const io = await chiSonoDavvero(token);
  if (io) CHI.set(token, { io, scade: Date.now() + 600e3 });
  return io;
}
async function chiSonoDavvero(token) {
  const ru = await fetch(`${URL_SB}/auth/v1/user`, { headers: { apikey: ANON, Authorization: "Bearer " + token } });
  if (!ru.ok) return null;
  const u = await ru.json().catch(() => null);
  if (!u || !u.id) return null;
  const rc = await fetch(K.sbUrl("collaboratori", `?select=nome,ruolo_accesso,attivo&user_id=eq.${encodeURIComponent(u.id)}`), { headers: K.sbHead() });
  const righe = await rc.json().catch(() => []);
  const c = Array.isArray(righe) && righe[0];
  if (!c || c.attivo === false) return null;
  return { nome: c.nome, ruolo: c.ruolo_accesso };
}

async function leggiCache(chiave) {
  const r = await fetch(K.sbUrl("kross_cache", `?chiave=eq.${encodeURIComponent(chiave)}&select=risposta,scade`), { headers: K.sbHead() });
  const d = await r.json().catch(() => []);
  return Array.isArray(d) && d[0] ? d[0] : null;
}

// Prima legge la cache (in parallelo con il controllo utente), poi solo se serve chiama Kross.
async function cache(chiave, secondi, produci, giaLetta) {
  const c = giaLetta !== undefined ? giaLetta : await leggiCache(chiave);
  if (c && new Date(c.scade) > new Date()) return c.risposta;
  if (!(await K.prenotaChiamata())) {
    if (c) return c.risposta; // meglio un dato di un minuto fa che un errore
    throw new Error("Kross è occupato (limite di chiamate al minuto). Riprova fra qualche secondo.");
  }
  const risposta = await produci();
  await fetch(K.sbUrl("kross_cache"), {
    method: "POST",
    headers: K.sbHead({ Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify({ chiave, risposta, scade: new Date(Date.now() + secondi * 1000).toISOString() }),
  });
  return risposta;
}

const giorniFa = (n) => {
  const d = new Date(Date.now() - n * 864e5);
  return d.toISOString().slice(0, 10) + " 00:00:00";
};

export const handler = async (event) => {
  if (event.httpMethod !== "POST") return risp(405, { ok: false, errore: "Usare POST" });
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return risp(400, { ok: false, errore: "Corpo non valido" }); }

  // controllo utente, token Kross e cache partono insieme: sono tutte letture
  const idT = parseInt(body.id_thread);
  const giorni = Math.min(Math.max(parseInt(body.giorni) || 10, 1), 60);
  const chiave = body.azione === "lista" ? `chat|lista|${giorni}` : body.azione === "thread" && idT ? `chat|thread|${idT}` : null;
  const [io, tokenOErr, cacheRiga] = await Promise.all([
    chiSono(body.token),
    K.prendiToken().catch((e) => e),
    chiave && !body.forza ? leggiCache(chiave).catch(() => null) : Promise.resolve(null),
  ]);
  if (!io || !["master", "socio"].includes(io.ruolo)) return risp(403, { ok: false, errore: "Accesso riservato ai titolari." });

  try {
    if (tokenOErr instanceof Error) throw tokenOErr;
    const token = tokenOErr;

    if (body.azione === "lista") {
      const dati = await cache(chiave, 25, async () => {
        const j = await K.chiamaKross("/messaging/get-threads", { last_update: giorniFa(giorni) }, token);
        return (j.data || []).map((t) => ({
          id_thread: String(t.id_thread),
          canale: t.cod_channel,
          ospite: t.from_first_name || "",
          ultimo_da: t.last_message_from_name || "",
          ultimo_testo: (t.last_message || "").slice(0, 220),
          ultimo_ts: t.last_message_created_at,
          da_leggere: !!t.to_read,
          annuncio: t.listing_name || "",
          tipologia: t.name_room_type || "",
          arrivo: t.checkin_date,
          partenza: t.checkout_date,
          id_reservation: t.id_reservation,
          stato: t.status,
          tipo: t.type,
          provenienza: t.from_location || "",
        }));
      }, cacheRiga);
      return risp(200, { ok: true, chat: dati });
    }

    if (body.azione === "thread") {
      const id = parseInt(body.id_thread);
      if (!id) return risp(400, { ok: false, errore: "id_thread mancante" });
      const dati = await cache(chiave, body.forza ? 1 : 10, async () => {
        const j = await K.chiamaKross("/messaging/get-thread", { id_thread: id }, token);
        return (j.data || [])
          .filter((m) => m.message || (m.attachment_images && m.attachment_images.length))
          .map((m) => ({
            id: m.id_message,
            ts: m.created_at,
            testo: m.message || "",
            traduzione: m.translated_message || "",
            nome: m.from_first_name || "",
            ruolo: m.user_role, // guest | owner | cohost
            immagini: m.attachment_images || null,
            ai: !!m.ai_generated,
          }))
          .reverse(); // l'API li dà dal più nuovo
      }, cacheRiga);
      return risp(200, { ok: true, messaggi: dati });
    }

    if (body.azione === "invia") {
      const id = parseInt(body.id_thread);
      const testo = String(body.testo || "").trim();
      if (!id || !testo) return risp(400, { ok: false, errore: "Manca la chat o il testo" });
      if (!(await K.prenotaChiamata())) return risp(429, { ok: false, errore: "Kross è occupato, riprova fra qualche secondo. Il messaggio NON è stato inviato." });
      await K.chiamaKross("/messaging/send-message", { id_thread: id, message: testo }, token);
      // la chat va riletta subito, non dalla cache
      await fetch(K.sbUrl("kross_cache", `?chiave=eq.${encodeURIComponent(`chat|thread|${id}`)}`), { method: "DELETE", headers: K.sbHead() });
      await fetch(K.sbUrl("kross_cache", `?chiave=like.${encodeURIComponent("chat|lista|*")}`), { method: "DELETE", headers: K.sbHead() });
      return risp(200, { ok: true, inviato_da: io.nome });
    }

    return risp(400, { ok: false, errore: "Azione sconosciuta" });
  } catch (e) {
    return risp(502, { ok: false, errore: String(e.message || e) });
  }
};
