// Netlify Function: invia una notifica push a tutti i dispositivi iscritti.
// Posizione finale nel progetto:  netlify/functions/invia-notifica.js
// Dipendenza: aggiungi "web-push" alle dependencies del progetto (npm i web-push).
// Variabili d'ambiente da impostare su Netlify (Site settings -> Environment variables):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, SUPABASE_SERVICE_ROLE_KEY  (e SUPABASE_URL se non gia presente)
const webpush = require('web-push');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://heabtbdmwbjlgujsisor.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_KEY;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Use POST' };

  let input = {};
  try { input = JSON.parse(event.body || '{}'); } catch (_) {}
  const { title, body, url } = input;

  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Chiavi VAPID mancanti nelle variabili Netlify.' }) };
  }
  webpush.setVapidDetails('mailto:valenteliving@gmail.com', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

  // Leggi le subscription da Supabase (service role: bypassa RLS)
  const r = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?select=id,subscription,endpoint`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
  });
  const rows = await r.json();
  if (!Array.isArray(rows)) return { statusCode: 500, body: JSON.stringify({ error: 'Lettura subscription fallita', dettaglio: rows }) };

  // Dedup per endpoint
  const seen = new Set();
  const subs = [];
  for (const row of rows) {
    const sub = row.subscription;
    const ep = row.endpoint || (sub && sub.endpoint);
    if (!sub || !ep || seen.has(ep)) continue;
    seen.add(ep); subs.push({ id: row.id, sub });
  }

  const payload = JSON.stringify({ title: title || 'Valente Living', body: body || '', url: url || '/' });
  const morte = [];
  await Promise.allSettled(subs.map(async ({ id, sub }) => {
    try { await webpush.sendNotification(sub, payload); }
    catch (err) { if (err && (err.statusCode === 404 || err.statusCode === 410)) morte.push(id); }
  }));

  // Rimuovi le iscrizioni scadute
  if (morte.length) {
    await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?id=in.(${morte.join(',')})`, {
      method: 'DELETE', headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
    });
  }

  return { statusCode: 200, body: JSON.stringify({ inviate: subs.length - morte.length, rimosse: morte.length }) };
};
