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

  const analizza = async (extra) => {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [{ role: "user", content: [docBlock, { type: "text", text: istruzioni + extra }] }],
      }),
    });
    const j = await resp.json();
    if (!resp.ok) throw new Error((j.error && j.error.message) || "Errore durante l'analisi.");
    let text = "";
    if (Array.isArray(j.content)) text = j.content.filter(b => b.type === "text").map(b => b.text).join("\n");
    text = (text || "").trim().replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
    try { return JSON.parse(text); } catch { return null; }
  };

  try {
    // Doppia estrazione indipendente: la seconda con istruzione di verifica carattere per carattere
    const [p1, p2] = await Promise.all([
      analizza(""),
      analizza("\n\nIMPORTANTE: questa è una verifica indipendente. Rileggi il documento con la massima attenzione e controlla i codici (codice fiscale, CIN, indirizzi) carattere per carattere prima di rispondere."),
    ]);
    let out = p1 || p2;
    if (!out) return { statusCode: 200, headers: CORS, body: JSON.stringify({ tipo_destinazione: "sconosciuto", categoria: "Altro", confidenza: "bassa", motivo: "L'AI non ha restituito un risultato leggibile, scegli la destinazione a mano." }) };

    const verifiche = [];
    if (p1 && p2) {
      const stessa = p1.tipo_destinazione === p2.tipo_destinazione && String(p1.id_destinazione || "") === String(p2.id_destinazione || "");
      if (stessa) verifiche.push("doppia lettura concorde");
      else { out = { ...p1, confidenza: "bassa" }; verifiche.push("le due letture NON concordano (" + (p1.nome_destinazione || p1.tipo_destinazione) + " vs " + (p2.nome_destinazione || p2.tipo_destinazione) + "): controlla a mano"); }
    } else {
      verifiche.push("una delle due letture non è andata a buon fine");
      if (out.confidenza === "alta") out.confidenza = "media";
    }

    // Cross-check col database: CF del nuovo proprietario già in archivio?
    if (out.tipo_destinazione === "nuovo_proprietario" && out.proprietario_nuovo && out.proprietario_nuovo.codice_fiscale) {
      const cf = String(out.proprietario_nuovo.codice_fiscale).trim().toUpperCase();
      const ex = proprietari.find(o => String(o.codice_fiscale || "").trim().toUpperCase() === cf);
      if (ex) {
        out.tipo_destinazione = "proprietario"; out.id_destinazione = String(ex.id);
        out.nome_destinazione = ((ex.cognome || "") + " " + (ex.nome || "")).trim();
        if (out.confidenza !== "bassa") out.confidenza = "alta";
        verifiche.push("CF " + cf + " già in archivio: smistato sul proprietario esistente");
      } else verifiche.push("CF non presente in archivio: ok creare nuovo proprietario");
    }
    // Gli id proposti devono esistere davvero
    if (out.tipo_destinazione === "proprieta" && out.id_destinazione && !proprieta.find(pp => String(pp.id) === String(out.id_destinazione))) {
      out.tipo_destinazione = "sconosciuto"; out.id_destinazione = null; out.confidenza = "bassa";
      verifiche.push("l'id proprietà proposto non esiste nel database");
    }
    if (out.tipo_destinazione === "proprietario" && out.id_destinazione && !proprietari.find(oo => String(oo.id) === String(out.id_destinazione))) {
      out.tipo_destinazione = "sconosciuto"; out.id_destinazione = null; out.confidenza = "bassa";
      verifiche.push("l'id proprietario proposto non esiste nel database");
    }

    if (verifiche.length) out.motivo = ((out.motivo || "").trim() + " · Verifiche: " + verifiche.join("; ")).trim();
    return { statusCode: 200, headers: CORS, body: JSON.stringify(out) };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};

exports.handler = handler;
