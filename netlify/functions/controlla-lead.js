// netlify/functions/controlla-lead.js
// Funzione SCHEDULATA: controlla i nuovi lead su HubSpot e invia una notifica push.
// Lo schedule è definito in netlify.toml ([functions."controlla-lead"] schedule = "...").
// Alla PRIMA esecuzione registra i lead già esistenti SENZA notificare (evita il diluvio),
// poi avvisa solo sui lead nuovi.
const SUPABASE_URL = "https://heabtbdmwbjlgujsisor.supabase.co";
const HUBSPOT_BASE = "https://api.hubapi.com";
const OWNER_ID = "1866527423";
const LEAD_PROPS = ["firstname", "lastname", "email", "phone", "company", "city", "lifecyclestage", "hs_lead_status", "createdate"];

exports.handler = async () => {
  const token = process.env.HUBSPOT_TOKEN;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const SITE_URL = process.env.URL || "https://valentelivingcrm.netlify.app";
  if (!token || !KEY) return { statusCode: 500, body: "Config mancante (HUBSPOT_TOKEN / SUPABASE_SERVICE_ROLE_KEY)" };
  const sb = { apikey: KEY, Authorization: "Bearer " + KEY };

  try {
    // 1) lead attuali da HubSpot
    const leads = await leadsAssignedToMe(token);

    // 2) id già notificati (dal database)
    const r = await fetch(`${SUPABASE_URL}/rest/v1/notified_leads?select=lead_id`, { headers: sb });
    const rows = r.ok ? await r.json() : [];
    const visti = new Set((rows || []).map((x) => String(x.lead_id)));
    const primaVolta = visti.size === 0;

    const nuovi = leads.filter((l) => !visti.has(String(l.id)));

    // 3) registra i nuovi id (così non li rinotifico)
    if (nuovi.length) {
      await fetch(`${SUPABASE_URL}/rest/v1/notified_leads`, {
        method: "POST",
        headers: { ...sb, "Content-Type": "application/json", Prefer: "return=minimal,resolution=ignore-duplicates" },
        body: JSON.stringify(nuovi.map((l) => ({ lead_id: String(l.id) }))),
      });
    }

    // 4) alla prima esecuzione NON notifico i lead già esistenti
    if (primaVolta) return { statusCode: 200, body: JSON.stringify({ inizializzati: leads.length, notificati: 0 }) };

    // 5) notifica i nuovi lead
    for (const l of nuovi) {
      const p = l.properties || {};
      const nome = [p.firstname, p.lastname].filter(Boolean).join(" ") || p.email || "Nuovo contatto";
      await notificaPush(SITE_URL, "Nuovo lead", nome + (p.email ? " · " + p.email : ""));
    }
    return { statusCode: 200, body: JSON.stringify({ notificati: nuovi.length }) };
  } catch (err) {
    return { statusCode: 500, body: String(err.message || err) };
  }
};

async function notificaPush(SITE_URL, title, body) {
  try {
    await fetch(`${SITE_URL}/.netlify/functions/invia-notifica`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, url: "/" }),
    });
  } catch (_) { /* ignora */ }
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
    const r = await fetch(HUBSPOT_BASE + "/crm/v3/objects/contacts/search", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error("HubSpot " + r.status);
    const data = await r.json();
    out.push(...(data.results || []));
    after = data.paging && data.paging.next ? data.paging.next.after : undefined;
  } while (after);
  return out;
}
