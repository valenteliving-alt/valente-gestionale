exports.handler = async (event) => {
  const headers = {"Content-Type":"application/json","Access-Control-Allow-Origin":"*"};
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: "{}" };
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { statusCode: 500, headers, body: JSON.stringify({ error: "API key mancante" }) };
  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode: 400, headers, body: "{}" }; }
  const { fileBase64, fileType, fileName, proprieta, proprietari } = body;
  const system = "Sei un assistente che analizza documenti immobiliari italiani. Rispondi SOLO con JSON valido in questo formato: {\"tipo_documento\":\"mandato|cin|visura_catastale|contratto|altro\",\"sommario\":\"descrizione\",\"dati_estratti\":{\"nome_proprietario\":null,\"cognome_proprietario\":null,\"codice_fiscale\":null,\"indirizzo\":null,\"citta\":null,\"provincia\":null,\"catasto_foglio\":null,\"catasto_mappale\":null,\"catasto_sub\":null,\"categoria_catastale\":null,\"cin\":null,\"cir\":null,\"commissione\":null,\"email\":null,\"telefono\":null,\"pec\":null},\"proprieta_match\":null,\"proprietario_match\":null,\"confidenza\":\"alta|media|bassa\"}. Proprietà esistenti: " + (proprieta||[]).map(p=>p.nome+"("+p.citta+")").join(", ") + ". Proprietari: " + (proprietari||[]).map(o=>o.cognome+" "+o.nome).join(", ");
  try {
    const content = fileType === "application/pdf"
      ? [{ type:"document", source:{ type:"base64", media_type:"application/pdf", data:fileBase64 }},{ type:"text", text:"Analizza questo documento: "+fileName }]
      : [{ type:"image", source:{ type:"base64", media_type:fileType, data:fileBase64 }},{ type:"text", text:"Analizza questo documento: "+fileName }];
    const r = await fetch("https://api.anthropic.com/v1/messages",{ method:"POST", headers:{"Content-Type":"application/json","x-api-key":apiKey,"anthropic-version":"2023-06-01","anthropic-beta":"pdfs-2024-09-25"}, body:JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:2000, system, messages:[{ role:"user", content }] })});
    const d = await r.json();
    if (!r.ok) return { statusCode:r.status, headers, body:JSON.stringify({ error:d.error?.message||"Errore" }) };
    let result;
    try { result = JSON.parse(d.content[0].text.replace(/```json|```/g,"").trim()); }
    catch { result = { sommario:d.content[0].text, dati_estratti:{}, tipo_documento:"altro", confidenza:"bassa" }; }
    return { statusCode:200, headers, body:JSON.stringify(result) };
  } catch(err) { return { statusCode:500, headers, body:JSON.stringify({ error:err.message }) }; }
};
