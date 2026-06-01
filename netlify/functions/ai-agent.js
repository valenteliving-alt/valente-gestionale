export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "API key non configurata" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  const body = await req.json();
  const { messages, context } = body;

  const systemPrompt = `Sei l'assistente AI di Valente Living SRL, un'agenzia di property management italiana.
Rispondi SEMPRE in italiano, in modo professionale ma diretto e conciso.
Hai accesso al database del gestionale con tutte le proprietà e i proprietari.

CONTESTO ATTUALE DEL DATABASE:
${context || "Nessun dato disponibile"}

COSA PUOI FARE:
- Rispondere a domande su proprietà specifiche (CIN, CIR, catasto, commissioni, stato)
- Aiutare a scrivere email/PEC ai proprietari
- Spiegare procedure burocratiche (SCIA, CIN, CIR, GEIS, Alloggiati Web)
- Calcolare commissioni e ricavi stimati
- Suggerire prossimi passi per proprietà in lancio
- Aiutare con la compliance (imposta di soggiorno, obblighi di legge)
- Redigere comunicazioni formali

ISTRUZIONI:
- Quando parli di una proprietà, cita sempre nome e città
- Quando menzioni dati come CIN/CIR, usali dal database
- Se non sai qualcosa, dillo chiaramente
- Per email/PEC, fornisci sempre il testo completo pronto da inviare
- Mantieni un tono professionale da property manager esperto

Valente Living SRL - P.IVA 02123860476 - PEC: valenteliving@legalmail.it`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        system: systemPrompt,
        messages: messages,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return new Response(JSON.stringify({ error: data.error?.message || "Errore API" }), {
        status: response.status,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    return new Response(JSON.stringify({ content: data.content[0].text }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
};

export const config = { path: "/api/ai-agent" };
