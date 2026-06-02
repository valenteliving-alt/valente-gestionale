// netlify/functions/hubspot.js
const HUBSPOT_BASE = "https://api.hubapi.com";
const OWNER_ID = "1866527423";

const LEAD_PROPS = [
  "firstname","lastname","email","phone","company",
  "city","lifecyclestage","hs_lead_status","createdate"
];

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
    let raw;
    if (action === "search" || query) {
      raw = await searchContacts(token, query);
    } else {
      raw = await leadsAssignedToMe(token);
    }
    const list = raw.map(simplify);
    return resp(200, { ok: true, count: list.length, results: list, leads: list, contacts: list });
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

async function leadsAssignedToMe(token) {
  const out = [];
  let after;
  do {
    const payload = {
      filterGroups: [{ filters: [{ propertyName: "hubspot_owner_id", operator: "EQ", value: OWNER_ID }] }],
      properties: LEAD_PROPS,
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

async function searchContacts(token, query) {
  const payload = { query: query, properties: LEAD_PROPS, limit: 20 };
  const data = await hsPost("/crm/v3/objects/contacts/search", token, payload);
  return data.results || [];
}

function simplify(c) {
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
    properties: p,
  };
}

function resp(statusCode, obj) {
  return {
    statusCode: statusCode,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(obj),
  };
}
