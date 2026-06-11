const SUPABASE_URL = "https://heabtbdmwbjlgujsisor.supabase.co";
const H = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

async function claude(apiKey, payload) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(payload),
  });
  const j = await r.json();
  return { ok: r.ok, status: r.status, j };
}

// Cerca negli archivi (documenti_pdf full-text + knowledge_base) gli estratti utili alla domanda
async function cercaDocumenti(apiKey, domanda) {
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!sbKey || !domanda) return null;
  let termini = "";
  try {
    const { ok, j } = await claude(apiKey, {
      model: "claude-haiku-4-5-20251001", max_tokens: 60,
      messages: [{ role: "user", content: `Domanda di un utente di un gestionale di affitti brevi: "${String(domanda).slice(0, 500)}"\nSe la risposta potrebbe trovarsi dentro documenti archiviati (contratti, mandati, visure, certificati, planimetrie, procedure, regolamenti), rispondi SOLO con 2-4 parole chiave italiane per la ricerca full-text, separate da spazio (includi nomi propri se presenti). Altrimenti rispondi SOLO: NO` }],
    });
    if (ok) termini = (j.content && j.content[0] && j.content[0].text || "").trim();
  } catch { return null; }
  if (!termini || /^no\b/i.test(termini) || termini.length > 80) return null;
  const sb = { apikey: sbKey, Authorization: `Bearer ${sbKey}` };
  const parole = termini.split(/\s+/).filter(Boolean).slice(0, 4);
  const q = encodeURIComponent(parole.join(" or "));
  const estratti = [];
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/documenti_pdf?select=immobile,tipo,nome_file,riassunto,testo&fts=wfts(italian).${q}&limit=4`, { headers: sb });
    if (r.ok) (await r.json()).forEach(d => estratti.push(`[Documento: ${d.nome_file || "?"} · immobile: ${d.immobile || "—"} · tipo: ${d.tipo || "—"}]\n${String(d.riassunto || d.testo || "").slice(0, 1500)}`));
  } catch { /* ignora */ }
  try {
    const t0 = encodeURIComponent("*" + parole[0] + "*");
    const r = await fetch(`${SUPABASE_URL}/rest/v1/knowledge_base?select=titolo,categoria,contenuto&attivo=is.true&or=(titolo.ilike.${t0},contenuto.ilike.${t0})&limit=3`, { headers: sb });
    if (r.ok) (await r.json()).forEach(k => estratti.push(`[Knowledge base: ${k.titolo || "?"}${k.categoria ? " · " + k.categoria : ""}]\n${String(k.contenuto || "").slice(0, 1200)}`));
  } catch { /* ignora */ }
  return estratti.length ? estratti.join("\n\n---\n\n").slice(0, 9000) : null;
}

const handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { statusCode: 500, headers: H, body: JSON.stringify({ error: "API key mancante" }) };
  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode: 400, body: "{}" }; }
  const { messages, context } = body;

  // RAG: recupera estratti dei documenti pertinenti all'ultima domanda
  let docs = null;
  try {
    const ultima = [...(messages || [])].reverse().find(m => m.role === "user");
    if (ultima && typeof ultima.content === "string") docs = await cercaDocumenti(apiKey, ultima.content);
  } catch { /* senza documenti si risponde comunque */ }

  let systemPrompt = "Sei l'assistente AI di Valente Living SRL. Rispondi sempre in italiano. Hai accesso al database:\n" + (context || "");
  if (docs) systemPrompt += "\n\nESTRATTI DAI DOCUMENTI ARCHIVIATI (recuperati con ricerca full-text — usali solo se pertinenti e cita sempre il nome del documento da cui prendi l'informazione; se non bastano dillo):\n" + docs;

  try {
    const { ok, status, j } = await claude(apiKey, { model: "claude-haiku-4-5-20251001", max_tokens: 1500, system: systemPrompt, messages });
    if (!ok) return { statusCode: status, headers: H, body: JSON.stringify({ error: (j.error && j.error.message) || "Errore" }) };
    return { statusCode: 200, headers: H, body: JSON.stringify({ content: j.content[0].text }) };
  } catch (err) {
    return { statusCode: 500, headers: H, body: JSON.stringify({ error: err.message }) };
  }
};
exports.handler = handler;
