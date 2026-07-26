/* ─────────────────────────────────────────────────────────────
   COMPILA LE SCHEDE DEGLI APPARTAMENTI LEGGENDO LO STORICO CHAT.
   Serve a rispondere agli ospiti SENZA chiamare l'AI: una volta che
   la scheda è piena (wifi, orari, accesso, parcheggio), il robot
   risponde da solo, all'istante e a costo zero.

   Lavoro una tantum: viene chiamato dal robot, un appartamento per giro,
   finché tutte le schede non sono compilate. Poi non serve più.

   Env: ANTHROPIC_API_KEY, INGEST_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
   ───────────────────────────────────────────────────────────── */

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST, OPTIONS" };

const SUPA = process.env.SUPABASE_URL || "https://heabtbdmwbjlgujsisor.supabase.co";
const SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function sb(method, path, body, prefer) {
  const r = await fetch(`${SUPA}/rest/v1/${path}`, {
    method,
    headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}`, "Content-Type": "application/json", Prefer: prefer || "return=representation" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.ok ? r.json().catch(() => null) : null;
}

/* Tiene solo le righe NOSTRE che parlano di informazioni pratiche:
   è lì che stanno orari, indirizzi, codici e wifi. */
function righeUtili(testo) {
  const CHIAVI = /(wi[- ]?fi|password|rete|check[- ]?in|check[- ]?out|accedere|accesso|chiav|codice|portone|citofono|si trova|indirizzo|parcheggi|posto auto|garage|animali|fumare|ore \d|dalle ore)/i;
  return String(testo || "")
    .split("\n")
    .filter((r) => /^NOI:/i.test(r) && CHIAVI.test(r))
    .map((r) => r.replace(/^NOI:\s*/i, "").trim())
    .filter((r) => r.length > 25);
}

exports.handler = async (event) => {
  if (event && event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  const AKEY = process.env.ANTHROPIC_API_KEY;
  if (!AKEY) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "Manca ANTHROPIC_API_KEY" }) };
  if (!SKEY) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "Manca SUPABASE_SERVICE_ROLE_KEY" }) };

  let b = {}; try { b = JSON.parse(event.body || "{}"); } catch (_) {}
  if (!process.env.INGEST_KEY || b.chiave !== process.env.INGEST_KEY)
    return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: "chiave non valida" }) };

  const quanti = Math.min(parseInt(b.quanti || "1", 10) || 1, 5);

  // appartamenti da fare: quelli senza nessun dato pratico nella scheda
  const daFare = await sb("GET", "schede_immobili?select=appartamento&or=(wifi.is.null,wifi.eq.)&checkin=is.null&limit=" + quanti);
  if (!daFare || !daFare.length) return { statusCode: 200, headers: CORS, body: JSON.stringify({ fatti: 0, finito: true }) };

  const esiti = [];
  for (const riga of daFare) {
    const app = riga.appartamento;
    try {
      const msgs = await sb("GET", `ucrm_messaggi?appartamento=eq.${encodeURIComponent(app)}&select=testo&limit=40`);
      const righe = [];
      (msgs || []).forEach((m) => righeUtili(m.testo).forEach((r) => righe.push(r)));
      if (!righe.length) {
        // niente storico utile: segno la scheda come "vista" per non riprovarci all'infinito
        await sb("POST", "schede_immobili?on_conflict=appartamento",
          [{ appartamento: app, note: "[nessuna informazione trovata nello storico]", aggiornata_il: new Date().toISOString() }],
          "resolution=merge-duplicates,return=minimal");
        esiti.push({ app, esito: "storico vuoto" });
        continue;
      }
      // togli i doppioni (i messaggi di check-in sono quasi identici) e limita il testo
      const uniche = [...new Set(righe.map((r) => r.slice(0, 700)))].slice(0, 12).join("\n---\n").slice(0, 6000);

      const sys = `Estrai le informazioni pratiche di un appartamento in affitto breve, leggendo messaggi che l'host ha inviato agli ospiti in passato.
Rispondi SOLO con JSON valido con queste chiavi (stringa vuota "" se l'informazione non c'è):
{"checkin":"","checkout":"","accesso":"","wifi":"","parcheggio":"","regole":""}
Regole:
- checkin/checkout: solo gli orari, formato breve (es. "dalle 15:00", "entro le 10:00").
- accesso: come si entra (indirizzo, piano, portone, keybox e codice se indicato). Massimo 2 frasi.
- wifi: nome rete e/o password SOLO se scritti esplicitamente. Se non ci sono, lascia "".
- parcheggio: dove si parcheggia, 1 frase.
- regole: divieti o regole della casa (animali, fumo, feste), 1 frase.
NON inventare nulla: se un dato non è scritto, lascia la stringa vuota.`;

      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": AKEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: process.env.CERVELLO_MODEL || "claude-haiku-4-5-20251001",
          max_tokens: 700, system: sys,
          messages: [{ role: "user", content: `APPARTAMENTO: ${app}\n\nMESSAGGI PASSATI DELL'HOST:\n${uniche}` }],
        }),
      });
      const j = await r.json().catch(() => null);
      const testo = (j && j.content && j.content[0] && j.content[0].text) || "";
      let d = null; try { const m = testo.match(/\{[\s\S]*\}/); d = JSON.parse(m ? m[0] : testo); } catch (_) {}
      if (!d) { esiti.push({ app, esito: "risposta AI non leggibile" }); continue; }

      const pulisci = (v) => String(v || "").trim().slice(0, 400);
      const scheda = {
        appartamento: app,
        checkin: pulisci(d.checkin), checkout: pulisci(d.checkout),
        accesso: pulisci(d.accesso), wifi: pulisci(d.wifi),
        parcheggio: pulisci(d.parcheggio), regole: pulisci(d.regole),
        verificata: false,               // da rileggere con i propri occhi prima di fidarsi
        aggiornata_il: new Date().toISOString(),
      };
      await sb("POST", "schede_immobili?on_conflict=appartamento", [scheda], "resolution=merge-duplicates,return=minimal");
      const pieni = ["checkin", "checkout", "accesso", "wifi", "parcheggio", "regole"].filter((k) => scheda[k]);
      esiti.push({ app, esito: "compilata", campi: pieni });
    } catch (e) {
      esiti.push({ app, esito: "errore: " + String(e.message || e).slice(0, 90) });
    }
  }
  return { statusCode: 200, headers: { ...CORS, "Content-Type": "application/json" }, body: JSON.stringify({ fatti: esiti.length, esiti }) };
};
