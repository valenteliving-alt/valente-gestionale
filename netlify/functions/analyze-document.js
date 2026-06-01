const handler = async (event) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  const CORS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Body non valido" }) };
  }

  const { filename, mediaType, data, context } = body;

  if (!data || !mediaType) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Documento mancante" }) };
  }

  let block;
  if (mediaType === "application/pdf") {
    block = { type: "document", source: { type: "base64", media_type: "application/pdf", data } };
  } else if (mediaType.indexOf("image/") === 0) {
    block = { type: "image", source: { type: "base64", media_type: mediaType, data } };
  } else {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Formato non supportato. Carica un PDF o un'immagine (png, jpg, webp)." }) };
  }

  const systemPrompt =
    "Sei l'assistente AI di Valente Living SRL, societa di gestione affitti brevi. " +
    "Analizza il documento allegato (di solito: contratti, mandati di gestione, moduli Alloggiati Web, visure catastali, documenti d'identita, bollette, planimetrie). " +
    "Rispondi sempre in italiano, in modo chiaro e ordinato: indica di che tipo di documento si tratta ed estrai i dati chiave (nomi, codici fiscali, indirizzi, CIN, CIR, dati catastali, importi, date), elencandoli. " +
    "Se mancano informazioni importanti, segnalalo. " +
    "IMPORTANTE: se il documento contiene i dati anagrafici di un PROPRIETARIO persona fisica (es. carta d'identita, contratto, mandato, visura coi suoi dati), DOPO l'analisi aggiungi un blocco dati ESATTAMENTE in questo formato, su righe separate: una riga con [[PROPRIETARIO]], poi una riga con un oggetto JSON con SOLO questi campi: nome, cognome, codice_fiscale, email, telefono, pec, indirizzo, citta (usa stringa vuota per i dati non presenti), poi una riga con [[/PROPRIETARIO]]. Non scrivere altro dopo [[/PROPRIETARIO]]. Se il documento NON riguarda un proprietario persona fisica, NON aggiungere questo blocco. " +
    "Hai accesso al database:\n" + (context || "");

  const messages = [
    {
      role: "user",
      content: [
        block,
        { type: "text", text: "Analizza questo documento" + (filename ? " (" + filename + ")" : "") + " ed estrai le informazioni utili per la gestione della proprieta." },
      ],
    },
  ];

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 2000, system: systemPrompt, messages }),
    });
    const result = await response.json();
    if (!response.ok) {
      return { statusCode: response.status, headers: CORS, body: JSON.stringify({ error: result.error?.message || "Errore API" }) };
    }
    const text = (result.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ content: text || "Documento ricevuto ma non e stato estratto testo." }) };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};

exports.handler = handler;
