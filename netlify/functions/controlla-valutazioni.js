/* Avvisa Tommaso quando un agente valuta un immobile che vale la pena prendere.

   PERCHÉ ESISTE
   I lead che contano per Valente Living non sono su HubSpot — là c'è la
   compravendita dell'agenzia, mutui e acquirenti. I proprietari da acquisire
   passano dall'app di valutazione: un agente inserisce l'immobile e l'app
   calcola fatturato, margine e verdetto. Il 10/09/2026 è stata valutata una
   villa in Toscana da €49.957 di margine annuo e nessuno se n'è accorto.

   COSA FA
   Gira sul server ogni 15 minuti (schedule in netlify.toml), guarda le
   valutazioni nuove e manda una notifica solo per quelle che superano la
   soglia. Le altre restano nel CRM senza disturbare: una notifica che suona
   per tutto è una notifica che si disattiva dopo tre giorni.

   COSA NON FA
   Non decide niente. Non scrive al proprietario, non cambia lo stato della
   valutazione, non tocca l'immobile. Segnala e basta: la trattativa è tua.

   Env: SUPABASE_SERVICE_ROLE_KEY, URL */

const SUPABASE_URL = process.env.SUPABASE_URL || "https://heabtbdmwbjlgujsisor.supabase.co";

/* La soglia. Sotto questa cifra di margine annuo l'immobile resta nel CRM ma
   non suona: sugli ultimi quattro mesi sarebbero ~4-5 avvisi al mese, che è
   la frequenza giusta perché uno li guardi ancora. Se Tommaso la vuole più
   bassa si cambia qui, o con la variabile SOGLIA_MARGINE su Netlify. */
const SOGLIA = Number(process.env.SOGLIA_MARGINE || 10000);

const euro = (n) => "€" + Math.round(Number(n) || 0).toLocaleString("it-IT");

exports.handler = async () => {
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_KEY;
  const SITE_URL = process.env.URL || "https://valentelivingcrm.netlify.app";
  if (!KEY) return { statusCode: 500, body: "Manca SUPABASE_SERVICE_ROLE_KEY" };
  const sb = { apikey: KEY, Authorization: "Bearer " + KEY };

  try {
    /* 1) le valutazioni degne di nota, dalle più recenti.
          Il verdetto e il punteggio li calcola già l'app: non li rifaccio qui. */
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/valutazioni` +
      `?select=id,created_at,agente,comune,zona,tipologia,mq,posti_letto,modello,` +
      `fatturato_annuo,canone_annuo,margine_valente,punteggio,verdetto,veti_attivi` +
      `&verdetto=eq.acquisire&margine_valente=gte.${SOGLIA}` +
      `&order=created_at.desc&limit=40`, { headers: sb });
    if (!r.ok) return { statusCode: 502, body: "Valutazioni non leggibili: " + (await r.text()).slice(0, 200) };
    const righe = await r.json();
    if (!Array.isArray(righe) || !righe.length) return ok({ notificate: 0, nota: "nessuna valutazione sopra soglia" });

    /* 2) quelle già segnalate. Se non riesco a leggerle mi fermo: proseguendo
          le segnerei come viste senza avvisare, e non tornerebbero mai più. */
    const g = await fetch(`${SUPABASE_URL}/rest/v1/valutazioni_notificate?select=chiave`, { headers: sb });
    if (!g.ok) return { statusCode: 503, body: "Elenco già notificate non leggibile: riprovo al prossimo giro." };
    const viste = new Set(((await g.json()) || []).map((x) => String(x.chiave)));
    const primaVolta = viste.size === 0;

    /* 3) i doppioni. Desideria ha rivalutato lo stesso immobile tre volte lo
          stesso giorno: tre messaggi identici e uno spegne le notifiche. La
          chiave è l'immobile, non la riga. */
    const chiaveDi = (v) => [
      String(v.agente || "").trim().toLowerCase(),
      String(v.comune || "").trim().toLowerCase(),
      String(v.tipologia || "").trim().toLowerCase(),
      v.mq || "", v.posti_letto || "", v.modello || "",
      Math.round(Number(v.fatturato_annuo) || 0),
    ].join("|");

    const nuove = [];
    const chiaviViste = new Set(viste);
    for (const v of righe) {
      const k = chiaveDi(v);
      if (chiaviViste.has(k)) continue;
      chiaviViste.add(k);
      nuove.push({ ...v, chiave: k });
    }
    if (!nuove.length) return ok({ notificate: 0 });

    /* 4) si registrano PRIMA di avvisare: se la notifica fallisce si perde un
          avviso, ma se registrassi dopo un errore qui produrrebbe lo stesso
          messaggio a ripetizione ogni quarto d'ora. */
    await fetch(`${SUPABASE_URL}/rest/v1/valutazioni_notificate`, {
      method: "POST",
      headers: { ...sb, "Content-Type": "application/json", Prefer: "return=minimal,resolution=ignore-duplicates" },
      body: JSON.stringify(nuove.map((v) => ({ chiave: v.chiave, valutazione_id: v.id }))),
    });

    /* 5) al primo giro non si riversa addosso tutto lo storico: sarebbero
          decine di messaggi su valutazioni di mesi fa. Ma l'ultima settimana
          sì — lì dentro c'è roba ancora calda su cui si può ancora chiamare. */
    let daAvvisare = nuove;
    if (primaVolta) {
      const settimana = Date.now() - 7 * 24 * 3600 * 1000;
      daAvvisare = nuove.filter((v) => new Date(v.created_at).getTime() >= settimana);
    }
    if (!daAvvisare.length) return ok({ inizializzate: nuove.length, notificate: 0 });

    for (const v of daAvvisare) {
      const dove = [v.comune, v.zona].filter(Boolean).join(" · ") || "località non indicata";
      const che = [v.tipologia, v.posti_letto ? v.posti_letto + " posti letto" : null, v.mq ? v.mq + " mq" : null]
        .filter(Boolean).join(", ");
      const soldi = v.modello === "sublocazione"
        ? `${euro(v.fatturato_annuo)} di fatturato, canone ${euro(v.canone_annuo)}`
        : `${euro(v.fatturato_annuo)} di fatturato`;
      const veti = Array.isArray(v.veti_attivi) && v.veti_attivi.length ? ` · ${v.veti_attivi.length} veto` : "";

      await notifica(SITE_URL,
        `${euro(v.margine_valente)} di margine — ${dove}`,
        `${che} · ${v.modello} · ${soldi} · punteggio ${v.punteggio}/100${veti}` +
        (v.agente ? ` · valutata da ${v.agente}` : ""),
        "/?view=valutazione");
    }

    return ok({ notificate: nuove.length, soglia: SOGLIA });
  } catch (err) {
    return { statusCode: 500, body: String(err.message || err) };
  }
};

async function notifica(SITE_URL, title, body, url) {
  try {
    await fetch(`${SITE_URL}/.netlify/functions/invia-notifica`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, url: url || "/" }),
    });
  } catch (_) { /* una notifica persa non deve far fallire il giro */ }
}

function ok(obj) {
  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) };
}
