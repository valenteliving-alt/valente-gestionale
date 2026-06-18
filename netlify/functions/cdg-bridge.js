// v2 — scope runtime
// Ponte sicuro CRM <-> Apps Script del foglio "Controllo di gestione".
// URL e token stanno nelle variabili d'ambiente Netlify (non nel browser, non nel repo).
const SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const TOKEN = process.env.APPS_SCRIPT_TOKEN;
const H = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: H, body: "" };
  if (!SCRIPT_URL || !TOKEN) return { statusCode: 500, headers: H, body: JSON.stringify({ ok: false, error: "config mancante" }) };
  try {
    if (event.httpMethod === "GET") {
      const p = event.queryStringParameters || {};
      const u = new URL(SCRIPT_URL);
      u.searchParams.set("token", TOKEN);
      ["action", "sheet", "col"].forEach((k) => { if (p[k]) u.searchParams.set(k, p[k]); });
      const r = await fetch(u.toString(), { redirect: "follow" });
      return { statusCode: 200, headers: H, body: await r.text() };
    }
    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      body.token = TOKEN;
      const r = await fetch(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        redirect: "follow",
      });
      return { statusCode: 200, headers: H, body: await r.text() };
    }
    return { statusCode: 405, headers: H, body: JSON.stringify({ ok: false, error: "method" }) };
  } catch (e) {
    return { statusCode: 500, headers: H, body: JSON.stringify({ ok: false, error: String(e) }) };
  }
};
