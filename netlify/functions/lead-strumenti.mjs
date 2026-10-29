// netlify/functions/lead-strumenti.mjs
// Strumenti della scheda lead: chat WhatsApp con il lead e invio della valutazione.
//
//   POST { token, azione: "chat", telefono }        -> messaggi del WhatsApp di lavoro con quel numero
//   POST { token, azione: "invia_wa", telefono, testo } -> mette in coda il messaggio dal WhatsApp di lavoro
//
// Solo master e soci. Il messaggio parte da OpenWA (tabella whatsapp_uscita):
// lo invia Tommaso premendo il pulsante, niente invii automatici.

import * as K from "./lib/kross.mjs";

const risp = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

async function chiSono(token) {
  if (!token) return null;
  const ru = await fetch(`${K.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: K.SERVICE_KEY, Authorization: "Bearer " + token } });
  if (!ru.ok) return null;
  const u = await ru.json().catch(() => null);
  if (!u || !u.id) return null;
  const rc = await fetch(K.sbUrl("collaboratori", `?select=nome,ruolo_accesso,attivo&user_id=eq.${encodeURIComponent(u.id)}`), { headers: K.sbHead() });
  const righe = await rc.json().catch(() => []);
  const c = Array.isArray(righe) && righe[0];
  if (!c || c.attivo === false) return null;
  return { nome: c.nome, ruolo: c.ruolo_accesso };
}

// "+39 327 445 8505" -> "393274458505". Numeri italiani senza prefisso: si aggiunge 39.
function numero(t) {
  let n = String(t || "").replace(/[^0-9+]/g, "");
  if (n.startsWith("+")) n = n.slice(1);
  else if (n.startsWith("00")) n = n.slice(2);
  else if (/^3\d{8,9}$/.test(n)) n = "39" + n;
  return n.length >= 9 ? n : "";
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") return risp(405, { ok: false, errore: "Usare POST" });
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return risp(400, { ok: false, errore: "Corpo non valido" }); }

  const io = await chiSono(body.token);
  if (!io || !["master", "socio"].includes(io.ruolo)) return risp(403, { ok: false, errore: "Accesso riservato ai titolari." });

  const num = numero(body.telefono);
  if (!num) return risp(400, { ok: false, errore: "Numero di telefono mancante o non valido" });

  try {
    if (body.azione === "chat") {
      // chat_id è tipo "393274458505@c.us": cerco le ultime 10 cifre per non perdere prefissi scritti diversi
      const coda = num.slice(-10);
      const q = `?select=id,da_me,tipo,testo,trascrizione,inviato_il,nome&gruppo=is.false&chat_id=like.*${coda}*&order=inviato_il.asc&limit=300`;
      const r = await fetch(K.sbUrl("whatsapp_lavoro", q), { headers: K.sbHead() });
      const righe = await r.json().catch(() => []);
      const messaggi = (Array.isArray(righe) ? righe : [])
        .filter((m) => m.testo || m.trascrizione || m.tipo)
        .map((m) => ({
          id: m.id,
          da_me: !!m.da_me,
          quando: m.inviato_il,
          testo: m.testo || (m.trascrizione ? "🎤 " + m.trascrizione : `[${m.tipo || "messaggio"}]`),
        }));
      return risp(200, { ok: true, messaggi });
    }

    if (body.azione === "invia_wa") {
      const testo = String(body.testo || "").trim();
      if (!testo) return risp(400, { ok: false, errore: "Testo vuoto" });
      const r = await fetch(K.sbUrl("whatsapp_uscita"), {
        method: "POST",
        headers: K.sbHead({ Prefer: "return=representation" }),
        body: JSON.stringify({ destinatario: num + "@c.us", testo, tipo: body.tipo === "lead_risposta" ? "lead_risposta" : "lead_valutazione" }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok) return risp(502, { ok: false, errore: "Non sono riuscito a mettere in coda il messaggio" });
      return risp(200, { ok: true, id: Array.isArray(d) && d[0] ? d[0].id : null, inviato_da: io.nome });
    }

    if (body.azione === "esito") {
      const id = parseInt(body.id);
      if (!id) return risp(400, { ok: false, errore: "id mancante" });
      const r = await fetch(K.sbUrl("whatsapp_uscita", `?id=eq.${id}&select=inviato_il,esito`), { headers: K.sbHead() });
      const d = await r.json().catch(() => []);
      return risp(200, { ok: true, ...(Array.isArray(d) && d[0] ? d[0] : {}) });
    }

    return risp(400, { ok: false, errore: "Azione sconosciuta" });
  } catch (e) {
    return risp(502, { ok: false, errore: String(e.message || e) });
  }
};
