// Estrae il testo integrale di un documento (PDF o immagine) con Claude — usato dall'indicizzazione allegati
const handler = async (event) => {
  const CORS = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: CORS, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: CORS, body: "{}" };
  const KEY = process.env.ANTHROPIC_API_KEY;
  if (!KEY) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "Manca ANTHROPIC_API_KEY" }) };
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch {}
  const { mediaType, data } = body;
  if (!data) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Documento mancante" }) };
  const isPdf = (mediaType || "").includes("pdf");
  const blocco = isPdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
    : { type: "image", source: { type: "base64", media_type: mediaType || "image/jpeg", data } };
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001", max_tokens: 8000,
        messages: [{ role: "user", content: [blocco, { type: "text", text: "Trascrivi integralmente tutto il testo leggibile di questo documento, in ordine, senza commenti né formattazione markdown. Mantieni i codici (CF, CIN, catasto) esattamente come scritti. Se è un'immagine senza testo, descrivi in una riga cosa mostra." }] }],
      }),
    });
    const j = await r.json();
    if (!r.ok) return { statusCode: r.status, headers: CORS, body: JSON.stringify({ error: (j.error && j.error.message) || "Errore estrazione" }) };
    const testo = Array.isArray(j.content) ? j.content.filter(b => b.type === "text").map(b => b.text).join("\n") : "";
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ testo }) };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
exports.handler = handler;
