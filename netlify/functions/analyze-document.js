exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "API key mancante" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Body non valido" }) };
  }

  const { fileBase64, fileType, fileName, proprieta, proprietari } = body;

  const systemPrompt = `Sei un assistente specializzato nell'analisi di documenti immobiliari italiani per Valente Living SRL.
Il tuo compito è analizzare documenti (mandati, CIN, planimetrie, contratti, visure catastali) ed estrarre i dati rilevanti.

DEVI rispondere SOLO con un JSON valido nel seguente formato, senza testo aggiuntivo:
{
  "tipo_documento": "mandato|cin|visura_catastale|contratto|planimetria|altro",
  "sommario": "breve descrizione del documento in italiano",
  "dati_estratti": {
    "nome_proprietario": null,
    "cognome_proprietario": null,
    "codice_fiscale": null,
    "indirizzo": null,
    "citta": null,
    "provincia": null,
    "cap": null,
    "catasto_foglio": null,
    "catasto_mappale": null,
    "catasto_sub": null,
    "categoria_catastale": null,
    "cin": null,
    "cir": null,
    "commissione": null,
    "commissione_iva_inclusa": null,
    "posti_letto": null,
    "camere": null,
    "bagni": null,
    "mq": null,
    "data_inizio": null,
    "email": null,
    "telefono": null,
    "pec": null,
    "note": null
  },
  "proprieta_match": null,
  "proprietario_match": null,
  "confidenza": "alta|media|bassa",
  "azioni_suggerite": ["lista di azioni da fare"]
}

Estrai tutti i dati che riesci a trovare. Per i campi non trovati metti null.
Per proprieta_match e proprietario_match metti il nome della proprietà/proprietario se riesci ad abbinarlo con quelli esistenti.`;

  const userMessage = `Analizza questo documento: ${fileName}

PROPRIETÀ ESISTENTI NEL DATABASE:
${proprieta?.map(p => `- ${p.nome} (${p.citta}) - ID: ${p.id}`).join('\n') || 'Nessuna'}

PROPRIETARI ESISTENTI:
${proprietari?.map(o => `- ${o.cognome} ${o.nome} CF: ${o.codice_fiscale || 'N/A'} - ID: ${o.id}`).join('\n') || 'Nessuno'}

Estrai tutti i dati rilevanti dal documento.`;

  try {
    const messageContent = fileType === 'application/pdf' 
      ? [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: fileBase64 } },
          { type: "text", text: userMessage }
        ]
      : [
          { type: "image", source: { type: "base64", media_type: fileType, data: fileBase64 } },
          { type: "text", text: userMessage }
        ];

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "pdfs-2024-09-25"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: "user", content: messageContent }]
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return { statusCode: response.status, headers, body: JSON.stringify({ error: data.error?.message || "Errore API" }) };
    }

    let result;
    try {
      const text = data.content[0].text.replace(/```json|```/g, '').trim();
      result = JSON.parse(text);
    } catch {
      result = { sommario: data.content[0].text, dati_estratti: {}, tipo_documento: "altro", confidenza: "bassa" };
    }

    return { statusCode: 200, headers, body: JSON.stringify(result) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
