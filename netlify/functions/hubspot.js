// netlify/functions/hubspot.js
const HUBSPOT_BASE = "https://api.hubapi.com";
const OWNER_ID = "1866527423";

/* Elenco di riserva: se non riesco a chiedere a HubSpot quali proprietà esistono,
   almeno questi campi li porto sempre a casa. */
const LEAD_PROPS = [
  "firstname","lastname","email","phone","mobilephone","company",
  "city","state","zip","country","address","website","jobtitle",
  "lifecyclestage","hs_lead_status","createdate","lastmodifieddate",
  "hs_analytics_source","hs_analytics_source_data_1","hs_analytics_source_data_2",
  "notes_last_contacted","notes_last_updated","num_notes","hubspot_owner_id",
  "hs_object_id","message","industry","numemployees"
];

/* Le proprietà VERE dell'account, chieste a HubSpot e tenute in cache per 10 minuti.
   Serve a portare nel CRM anche i campi personalizzati creati da voi, che nessun
   elenco scritto a mano potrebbe indovinare. */
let cacheProp = { quando: 0, lista: null };
async function tutteLeProprieta(token) {
  if (cacheProp.lista && Date.now() - cacheProp.quando < 600000) return cacheProp.lista;
  try {
    const r = await fetch(HUBSPOT_BASE + "/crm/v3/properties/contacts", {
      headers: { Authorization: "Bearer " + token },
    });
    if (!r.ok) return LEAD_PROPS;
    const d = await r.json();
    /* Chiedere tutte le 250 proprietà per 1.500 contatti produce una risposta da
       oltre 6 MB, che Netlify rifiuta: la sezione Lead resta bianca. Quindi si
       chiede solo quello che serve davvero — l'elenco di riserva più i campi
       PERSONALIZZATI vostri, che sono gli unici interessanti fra quelli in più
       (i campi di sistema di HubSpot iniziano tutti per "hs_" e sono contatori). */
    const personalizzati = (d.results || [])
      .filter(p => !p.hidden && !p.calculated)   // i calcolati non si possono chiedere in blocco
      .filter(p => !/^hs_/.test(p.name))
      .map(p => p.name);
    const lista = [...new Set([...LEAD_PROPS, ...personalizzati])].slice(0, 120);
    cacheProp = { quando: Date.now(), lista };
    return lista;
  } catch { return LEAD_PROPS; }
}

/* Etichette leggibili: HubSpot chiama i campi "hs_analytics_source", noi vogliamo
   vedere "Fonte originale". Anche queste vengono dall'account, non inventate. */
let cacheEtichette = { quando: 0, mappa: null };
async function etichetteProprieta(token) {
  if (cacheEtichette.mappa && Date.now() - cacheEtichette.quando < 600000) return cacheEtichette.mappa;
  try {
    const r = await fetch(HUBSPOT_BASE + "/crm/v3/properties/contacts", {
      headers: { Authorization: "Bearer " + token },
    });
    if (!r.ok) return {};
    const d = await r.json();
    const mappa = {};
    (d.results || []).forEach(p => { mappa[p.name] = { label: p.label || p.name, gruppo: p.groupName || "altro", tipo: p.type }; });
    cacheEtichette = { quando: Date.now(), mappa };
    return mappa;
  } catch { return {}; }
}

exports.handler = async (event) => {
  const token = process.env.HUBSPOT_TOKEN;
  if (!token) {
    return resp(500, { ok: false, error: "HUBSPOT_TOKEN non configurato su Netlify" });
  }
  let body = {};
  try { body = event.body ? JSON.parse(event.body) : {}; } catch { body = {}; }

  const action = String(body.action || body.type || "leads").toLowerCase();
  const query = body.query || body.search || "";

  try {
    /* Le conversazioni di uno o più contatti: email ricevute e inviate, note.
       È qui che sta il contenuto vero dei lead — nei campi del contatto non c'è. */
    if (action === "attivita" || action === "conversazioni") {
      const ids = (Array.isArray(body.ids) ? body.ids : [body.id]).filter(Boolean).map(String).slice(0, 100);
      if (!ids.length) return resp(200, { ok: true, conversazioni: {} });
      const problemi = [];
      const conv = await conversazioniDi(token, ids, problemi);
      return resp(200, { ok: true, conversazioni: conv, problemi });
    }

    const props = await tutteLeProprieta(token);
    const etichette = await etichetteProprieta(token);
    let raw;
    if (action === "search" || query) {
      raw = await searchContacts(token, query, props);
    } else {
      raw = await leadsAssignedToMe(token, props);
    }
    const list = raw.map(c => simplify(c, etichette));
    return resp(200, { ok: true, count: list.length, results: list, leads: list, contacts: list, etichette });
  } catch (err) {
    return resp(502, { ok: false, error: String(err.message || err) });
  }
};

/* ---------------------------------------------------------------------------
   LE CONVERSAZIONI

   Su HubSpot il messaggio di un lead quasi mai è una proprietà del contatto:
   è un'attività associata — una email in arrivo, una nota. La scheda contatto
   mostra solo date e contatori, ed è per questo che nel CRM non si leggeva nulla.

   Qui si prendono le associazioni in blocco (v4), poi i corpi in blocco (v3):
   due chiamate per tipo, non una per contatto.

   Se il token non ha il permesso di leggere le email il blocco fallisce da solo
   e si va avanti con le note: meglio metà contenuto che una schermata di errore.
--------------------------------------------------------------------------- */

const TIPI_ATTIVITA = [
  { tipo: "emails", props: ["hs_email_subject", "hs_email_text", "hs_email_html", "hs_email_direction", "hs_email_from_email", "hs_timestamp", "hs_createdate", "hs_attachment_ids"] },
  { tipo: "notes",  props: ["hs_note_body", "hs_timestamp", "hs_createdate", "hs_attachment_ids"] },
  { tipo: "calls",  props: ["hs_call_body", "hs_call_title", "hs_timestamp", "hs_createdate"] },
];

/* L'HTML di una email va ripulito, altrimenti finisce a schermo pieno di tag. */
function testoDaHtml(h) {
  return String(h || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function conversazioniDi(token, ids, problemi = []) {
  const perContatto = {};
  ids.forEach((i) => { perContatto[i] = []; });

  for (const { tipo, props } of TIPI_ATTIVITA) {
    try {
      const ass = await hsPost(`/crm/v4/associations/contacts/${tipo}/batch/read`, token,
        { inputs: ids.map((id) => ({ id })) });

      const diChi = new Map();                     // id attività -> id contatto
      (ass.results || []).forEach((r) => {
        const contatto = String((r.from && r.from.id) || r.id || "");
        (r.to || []).forEach((t) => { if (!diChi.has(String(t.toObjectId))) diChi.set(String(t.toObjectId), contatto); });
      });
      const attIds = [...diChi.keys()].slice(0, 400);
      if (!attIds.length) continue;

      for (let i = 0; i < attIds.length; i += 100) {
        const lotto = attIds.slice(i, i + 100);
        const d = await hsPost(`/crm/v3/objects/${tipo}/batch/read`, token,
          { properties: props, inputs: lotto.map((id) => ({ id })) });

        (d.results || []).forEach((a) => {
          const p = a.properties || {};
          const contatto = diChi.get(String(a.id));
          if (!contatto || !perContatto[contatto]) return;

          const testo =
            tipo === "emails" ? (String(p.hs_email_text || "").trim() || testoDaHtml(p.hs_email_html)) :
            tipo === "notes"  ? testoDaHtml(p.hs_note_body) :
                                testoDaHtml(p.hs_call_body);
          if (!testo) return;

          perContatto[contatto].push({
            id: a.id,
            genere: tipo === "emails" ? "email" : tipo === "notes" ? "nota" : "chiamata",
            oggetto: p.hs_email_subject || p.hs_call_title || "",
            da: p.hs_email_from_email || "",
            /* INCOMING = l'ha scritta il lead. È quella che conta. */
            inArrivo: tipo === "emails" ? String(p.hs_email_direction || "").toUpperCase().includes("INCOMING") : true,
            quando: p.hs_timestamp || p.hs_createdate || "",
            testo: testo.slice(0, 6000),
            allegati: String(p.hs_attachment_ids || "").split(/[;,]/).filter(Boolean),
          });
        });
      }
    } catch (e) {
      /* Permesso mancante o tipo non disponibile: si prosegue con gli altri,
         ma si dice quale e perché — altrimenti il contenuto sparisce in silenzio
         e non si capisce se è HubSpot a non averlo o noi a non poterlo leggere. */
      const msg = String(e.message || e);
      problemi.push({
        tipo,
        errore: msg.slice(0, 300),
        permessoMancante: /403|MISSING_SCOPES|scope/i.test(msg),
      });
      continue;
    }
  }

  Object.keys(perContatto).forEach((k) => {
    perContatto[k].sort((a, b) => String(a.quando).localeCompare(String(b.quando)));
  });
  return perContatto;
}

async function hsPost(path, token, payload) {
  const r = await fetch(HUBSPOT_BASE + path, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) { throw new Error("HubSpot " + r.status + ": " + (await r.text())); }
  return r.json();
}

/* I contatti che vale la pena guardare.

   Fermarsi a "assegnati a Tommaso" lasciava fuori i lead arrivati senza
   assegnazione, che su HubSpot sono la maggioranza. Qui il bacino è più largo:
   ogni gruppo di filtri è un motivo diverso per cui un contatto merita di essere
   visto. HubSpot mette i gruppi in OR fra loro e in AND al loro interno, quindi
   basta un motivo solo perché il contatto entri.

   Il rumore non è un problema: la classificazione lo mette da parte da sola. */
const GRUPPI = [
  // 1. assegnati a te: restano la priorità
  [{ propertyName: "hubspot_owner_id", operator: "EQ", value: OWNER_ID }],
  // 2. chi ha scritto qualcosa: se ha lasciato un messaggio, ha una richiesta
  [{ propertyName: "descrizione", operator: "HAS_PROPERTY" }],
  [{ propertyName: "message", operator: "HAS_PROPERTY" }],
  // 3. chi è stato marcato come lead nel ciclo di vita
  [{ propertyName: "lifecyclestage", operator: "IN",
     values: ["lead", "marketingqualifiedlead", "salesqualifiedlead", "opportunity", "subscriber"] }],
  // 4. chi ha uno stato di lavorazione aperto
  [{ propertyName: "hs_lead_status", operator: "IN",
     values: ["NEW", "OPEN", "IN_PROGRESS", "OPEN_DEAL", "ATTEMPTED_TO_CONTACT", "CONNECTED"] }],
  // 5. chi è arrivato da un modulo del sito
  [{ propertyName: "hs_analytics_source", operator: "IN",
     values: ["ORGANIC_SEARCH", "PAID_SEARCH", "PAID_SOCIAL", "SOCIAL_MEDIA", "REFERRALS", "DIRECT_TRAFFIC", "OFFLINE", "EMAIL_MARKETING"] },
   { propertyName: "lifecyclestage", operator: "HAS_PROPERTY" }],
  // 6. chi ha lasciato un telefono: raramente lo fa chi non vuole essere richiamato
  [{ propertyName: "phone", operator: "HAS_PROPERTY" }],
  [{ propertyName: "mobilephone", operator: "HAS_PROPERTY" }],
];

/* Due limiti, e servono entrambi. Il TETTO tiene la risposta sotto i 6 MB che
   Netlify accetta; il TEMPO evita che la funzione venga tagliata a 10 secondi
   lasciando la sezione bianca. Meglio meno lead ma sempre visibili. */
const TETTO = 500;
const TEMPO = 7000;

async function leadsAssignedToMe(token, props) {
  const inizio = Date.now();
  const visti = new Map();          // per id: i gruppi si sovrappongono, i doppioni no
  for (const filters of GRUPPI) {
    if (Date.now() - inizio > TEMPO) break;
    let after;
    try {
      do {
        const payload = {
          filterGroups: [{ filters }],
          properties: props,
          sorts: [{ propertyName: "createdate", direction: "DESCENDING" }],
          limit: 100,
        };
        if (after) payload.after = after;
        const data = await hsPost("/crm/v3/objects/contacts/search", token, payload);
        (data.results || []).forEach((c) => { if (!visti.has(c.id)) visti.set(c.id, c); });
        after = data.paging && data.paging.next ? data.paging.next.after : undefined;
      } while (after && visti.size < TETTO && Date.now() - inizio < TEMPO);
    } catch (e) {
      /* Una proprietà che non esiste su questo account fa fallire il suo gruppo:
         non deve far cadere tutto il resto. */
      continue;
    }
    if (visti.size >= TETTO) break;
  }
  const out = [...visti.values()];
  out.sort((a, b) => String((b.properties || {}).createdate || "").localeCompare(String((a.properties || {}).createdate || "")));
  return out;
}

async function searchContacts(token, query, props) {
  const payload = { query: query, properties: props, limit: 20 };
  const data = await hsPost("/crm/v3/objects/contacts/search", token, payload);
  return data.results || [];
}

function simplify(c, etichette = {}) {
  const p = c.properties || {};
  return {
    id: c.id,
    mio: String(p.hubspot_owner_id || "") === OWNER_ID,   // assegnato a te, o pescato dal bacino largo
    firstname: p.firstname || "",
    lastname: p.lastname || "",
    nome: [p.firstname, p.lastname].filter(Boolean).join(" "),
    email: p.email || "",
    phone: p.phone || "",
    telefono: p.phone || "",
    company: p.company || "",
    azienda: p.company || "",
    city: p.city || "",
    citta: p.city || "",
    lifecyclestage: p.lifecyclestage || "",
    hs_lead_status: p.hs_lead_status || "",
    stato: p.hs_lead_status || "",
    createdate: p.createdate || "",
    lastmodifieddate: p.lastmodifieddate || "",
    /* Solo i campi che il CRM legge per nome. L'oggetto `properties` intero
       moltiplicato per centinaia di contatti sfondava il limite di Netlify. */
    properties: {
      descrizione: p.descrizione || "", message: p.message || "",
      messaggio: p.messaggio || "", richiesta: p.richiesta || "",
      hubspot_owner_id: p.hubspot_owner_id || "", createdate: p.createdate || "",
    },
    /* I campi con un valore, con nome leggibile e raggruppati: è questo che
       permette di lavorare dal CRM senza aprire HubSpot. I contatori e le
       metriche di navigazione si scartano qui, non a video: non servono a
       nessuno e pesano su ogni singolo contatto. */
    campi: Object.entries(p)
      .filter(([k, v]) => v !== null && v !== "" && v !== undefined && !k.startsWith("hs_object"))
      .filter(([k, v]) => !RUMORE.test(k) && String(v) !== "0" && String(v) !== "0.0")
      .map(([k, v]) => ({
        chiave: k,
        etichetta: (etichette[k] && etichette[k].label) || k,
        gruppo: (etichette[k] && etichette[k].gruppo) || "altro",
        valore: String(v).slice(0, 500),
      }))
      .sort((a, b) => a.etichetta.localeCompare(b.etichetta, "it"))
      .slice(0, 60),
  };
}

/* Gli stessi criteri che il CRM usava a video, applicati però qui: ogni campo
   scartato alla fonte è peso in meno moltiplicato per il numero di contatti. */
const RUMORE = /analytics|pageview|page_view|session|clicks|social|^ip_|_ip$|timezone|traffic|referring|first_page|last_page|event_|notification|revenue|^num_|calculated|hs_email_(optout|bad|quarantine|hard|sends|opens|clicks|delivered|bounce)|hs_sales|owner_assigned|unworked|object_id|_timestamp$|latest_source|time_(first|last)|_score|hs_v2|membership|marketable|hs_predictive|hs_prospecting|hs_pipeline|currently_enrolled|hs_count|hs_is_|hs_lifecycle|hs_date_entered|hs_date_exited|hs_time_in|hs_latest|hs_first|hs_last_sales|hs_merged|hs_user_ids|hs_calculated|hs_full_name|hs_searchable|webinar|_history$/i;

function resp(statusCode, obj) {
  return {
    statusCode: statusCode,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(obj),
  };
}
