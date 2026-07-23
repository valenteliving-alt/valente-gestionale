// Cervello dell'agente ospiti — gira sul CRM (ha la chiave Anthropic).
// Riceve la conversazione + la scheda verificata + lo storico, e restituisce:
//   { azione: "invia" | "approvazione", motivo, risposta }
// Così il robot sul server NON ha bisogno della chiave Anthropic.
//
// Env: ANTHROPIC_API_KEY, INGEST_KEY (per autenticare le chiamate del robot)

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST, OPTIONS" };

exports.handler = async (event) => {
  if (event && event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  const AKEY = process.env.ANTHROPIC_API_KEY;
  if (!AKEY) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "Manca ANTHROPIC_API_KEY" }) };

  let b = {}; try { b = JSON.parse(event.body || "{}"); } catch (_) {}
  if (!process.env.INGEST_KEY || b.chiave !== process.env.INGEST_KEY) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: "chiave non valida" }) };

  const conversazione = String(b.conversazione || "").slice(-4000);
  const kb = String(b.kb || "").slice(0, 6000);
  const scheda = b.scheda && typeof b.scheda === "object"
    ? Object.entries(b.scheda).filter(([k, v]) => v && !["appartamento", "aggiornata_il", "verificata"].includes(k)).map(([k, v]) => `${k}: ${v}`).join("\n")
    : "(scheda non ancora compilata)";

  const sys = `Sei l'assistente di Valente Living (property management). Scrivi una risposta cortese, concreta e pronta da inviare all'ospite, nella STESSA lingua del suo ultimo messaggio, firmata "Valente Living".
Usa SOLO informazioni dalla SCHEDA VERIFICATA e dallo storico; non inventare dati (indirizzi, codici, orari, distanze). Se un dato non c'è, dillo con garbo o rimanda.
DECISIONE (regola ferrea): imposta "azione":"approvazione" — cioè NON inviare, avvisa l'operatore — se il messaggio riguarda PREZZI, SCONTI, DISPONIBILITÀ/date da confermare, TRATTATIVE, LAMENTELE, rimborsi, danni, o qualsiasi cosa delicata o su cui NON sei sicuro. In tutti gli altri casi (info di routine: check-in, wifi, parcheggio, regole, orari, distanze note) imposta "azione":"invia".
Rispondi SOLO con JSON valido: {"azione":"invia"|"approvazione","motivo":"breve","risposta":"testo"}`;
  const usr = `SCHEDA VERIFICATA:\n${scheda}\n\nStorico (come abbiamo risposto in passato):\n${kb || "(nessuno)"}\n\nCONVERSAZIONE (ultimo msg = domanda dell'ospite):\n${conversazione}`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "x-api-key": AKEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-5", max_tokens: 900, system: sys, messages: [{ role: "user", content: usr }] }),
    });
    const j = await r.json();
    const testo = j && j.content && j.content[0] && j.content[0].text ? j.content[0].text : "";
    let out; try { const m = testo.match(/\{[\s\S]*\}/); out = JSON.parse(m ? m[0] : testo); }
    catch { out = { azione: "approvazione", motivo: "output non interpretabile", risposta: testo }; }
    return { statusCode: 200, headers: { ...CORS, "Content-Type": "application/json" }, body: JSON.stringify(out) };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: String(e.message || e) }) };
  }
};
