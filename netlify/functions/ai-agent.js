const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers: {"Content-Type":"application/json","Access-Control-Allow-Origin":"*"}, body: JSON.stringify({ error: "API key mancante" }) };
  }
  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode: 400, body: "{}" }; }
  const { messages, context } = body;
  const systemPrompt = "Sei l'assistente AI di Valente Living SRL. Rispondi sempre in italiano. Hai accesso al database:\n" + (context || "");
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 1500, system: systemPrompt, messages }),
    });
    const data = await response.json();
    if (!response.ok) return { statusCode: response.status, headers: {"Content-Type":"application/json","Access-Control-Allow-Origin":"*"}, body: JSON.stringify({ error: data.error?.message || "Errore" }) };
    return { statusCode: 200, headers: {"Content-Type":"application/json","Access-Control-Allow-Origin":"*"}, body: JSON.stringify({ content: data.content[0].text }) };
  } catch (err) {
    return { statusCode: 500, headers: {"Content-Type":"application/json","Access-Control-Allow-Origin":"*"}, body: JSON.stringify({ error: err.message }) };
  }
};
exports.handler = handler;
