const handler = async (event) => {
  const CORS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: CORS, body: "" };

  const KEY = process.env.ANTHROPIC_API_KEY;
  if (!KEY) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "Manca ANTHROPIC_API_KEY su Netlify." }) };

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch {}
  const { mediaType, data, proprieta = [], proprietari = [] } = body;
  if (!data) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Documento mancante." }) };

  const listaProprieta = proprieta.map(p => `- id:${p.id} | "${p.nome || ""}" | ${p.indirizzo || ""} ${p.citta || ""} | CIN:${p.cin || "-"}`).join("\n") || "(nessuna)";
  const listaProprietari = proprietari.map(o => `- id:${o.id} | ${o.cognome || ""} ${o.nome || ""} | CF:${o.codice_fiscale || "-"}`).join("\n") || "(nessuno)";
  const categorie = ["Documento d'identità", "Mandato / Contratto", "Visura catastale", "Certificato CIN / CIR", "Modulo Alloggiati Web", "Bolletta / Utenza", "Planimetria", "Certificazione conformità", "Altro"];

  const istruzioni = `Sei un assistente che smista documenti per un'agenzia di affitti brevi.
Analizza il documento allegato e rispondi SOLO con un oggetto JSON valido: nessun markdown, nessun backtick, nessun testo prima o dopo.

Categorie possibili (scegline esattamente una): ${categorie.join(", ")}.

Proprietà esistenti:
${listaProprieta}

Proprietari esistenti:
${listaProprietari}

Decidi dove andrebbe archiviato il documento:
- Se riguarda chiaramente una proprietà esistente (per indirizzo, nome o CIN), usa tipo_destinazione "proprieta" e metti il suo id in id_destinazione.
- Se riguarda chiaramente un proprietario/persona gia in elenco (per nome o codice fiscale), usa "proprietario" e il suo id.
- Se e il documento di una persona (es. carta d'identita, contratto) che NON e tra i proprietari esistenti, usa "nuovo_proprietario" e compila proprietario_nuovo con i dati leggibili.
- Se non riesci a capire, usa "sconosciuto".

Formato esatto della risposta:
{
  "categoria": "una delle categorie",
  "tipo_destinazione": "proprieta" | "proprietario" | "nuovo_proprietario" | "sconosciuto",
  "id_destinazione": "id se applicabile, altrimenti null",
  "nome_destinazione": "nome leggibile della destinazione o null",
  "proprietario_nuovo": { "nome": "", "cognome": "", "codice_fiscale": "", "email": "", "telefono": "", "pec": "", "indirizzo": "", "citta": "" } oppure null,
  "confidenza": "alta" | "media" | "bassa",
  "motivo": "breve spiegazione in italiano"
}`;

  const isPdf = (mediaType || "").includes("pdf");
  const docBlock = isPdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
    : { type: "image", source: { type: "base64", media_type: mediaType || "image/jpeg", data } };

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [{ role: "user", content: [docBlock, { type: "text", text: istruzioni }] }],
      }),
    });
    const j = await resp.json();
    if (!resp.ok) return { statusCode: resp.status, headers: CORS, body: JSON.stringify({ error: (j.error && j.error.message) || "Errore durante l'analisi." }) };

    let text = "";
    if (Array.isArray(j.content)) text = j.content.filter(b => b.type === "text").map(b => b.text).join("\n");
    text = (text || "").trim().replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();

    let parsed;
    try { parsed = JSON.parse(text); }
    catch { return { statusCode: 200, headers: CORS, body: JSON.stringify({ tipo_destinazione: "sconosciuto", categoria: "Altro", confidenza: "bassa", motivo: "L'AI non ha restituito un risultato leggibile, scegli la destinazione a mano." }) }; }

    return { statusCode: 200, headers: CORS, body: JSON.stringify(parsed) };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};

exports.handler = handler;
