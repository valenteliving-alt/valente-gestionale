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
    const nomi = (d.results || [])
      .filter(p => !p.hidden && !p.calculated)   // i calcolati non si possono chiedere in blocco
      .map(p => p.name);
    // HubSpot accetta un numero limitato di proprietà per chiamata: tengo le prime 250
    const lista = [...new Set([...LEAD_PROPS, ...nomi])].slice(0, 250);
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

async function hsPost(path, token, payload) {
  const r = await fetch(HUBSPOT_BASE + path, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) { throw new Error("HubSpot " + r.status + ": " + (await r.text())); }
  return r.json();
}

async function leadsAssignedToMe(token, props) {
  const out = [];
  let after;
  do {
    const payload = {
      filterGroups: [{ filters: [{ propertyName: "hubspot_owner_id", operator: "EQ", value: OWNER_ID }] }],
      properties: props,
      sorts: [{ propertyName: "createdate", direction: "DESCENDING" }],
      limit: 100,
    };
    if (after) payload.after = after;
    const data = await hsPost("/crm/v3/objects/contacts/search", token, payload);
    out.push(...(data.results || []));
    after = data.paging && data.paging.next ? data.paging.next.after : undefined;
  } while (after);
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
    properties: p,
    /* Tutti i campi che hanno davvero un valore, con nome leggibile e raggruppati.
       È questo che permette di lavorare dal CRM senza aprire HubSpot. */
    campi: Object.entries(p)
      .filter(([k, v]) => v !== null && v !== "" && v !== undefined && !k.startsWith("hs_object"))
      .map(([k, v]) => ({
        chiave: k,
        etichetta: (etichette[k] && etichette[k].label) || k,
        gruppo: (etichette[k] && etichette[k].gruppo) || "altro",
        valore: String(v),
      }))
      .sort((a, b) => a.etichetta.localeCompare(b.etichetta, "it")),
  };
}

function resp(statusCode, obj) {
  return {
    statusCode: statusCode,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(obj),
  };
}
