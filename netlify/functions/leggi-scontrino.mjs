// Legge una foto di scontrino/fattura e restituisce i dati per la spesa.
// Usata dall'app Spese (/spese). Accetta solo utenti loggati al CRM.

const SUPABASE_URL = process.env.SUPABASE_URL || "https://heabtbdmwbjlgujsisor.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhlYWJ0YmRtd2JqbGd1anNpc29yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMjA4NDgsImV4cCI6MjA5NTg5Njg0OH0.FRk1tARhQHylLjfhACorn6O_E7ommm47tBTfJHOVxAU";

const H = { "Content-Type": "application/json" };
const risp = (code, obj) => ({ statusCode: code, headers: H, body: JSON.stringify(obj) });

const CATEGORIE = ["manutenzione", "pulizie", "biancheria", "forniture", "arredo", "utenze", "riparazioni", "carburante", "trasporti", "commissioni", "altro"];

export const handler = async (event) => {
  if (event.httpMethod !== "POST") return risp(405, { error: "Metodo non ammesso" });

  // Solo utenti con sessione valida
  const auth = (event.headers.authorization || event.headers.Authorization || "").replace(/^Bearer\s+/i, "");
  if (!auth) return risp(401, { error: "Accesso richiesto" });
  const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON, Authorization: `Bearer ${auth}` } });
  if (!u.ok) return risp(401, { error: "Sessione scaduta, rientra" });

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return risp(400, { error: "Body non valido" }); }
  const { data, mediaType } = body;
  if (!data || !mediaType) return risp(400, { error: "Foto mancante" });

  const block = mediaType === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
    : { type: "image", source: { type: "base64", media_type: mediaType, data } };

  const istruzioni =
    "Estrai i dati da questo scontrino, ricevuta o fattura italiana. Rispondi SOLO con un oggetto JSON, senza testo prima o dopo, con questi campi: " +
    '{"data":"YYYY-MM-DD","importo":numero totale pagato IVA inclusa,"fornitore":"ragione sociale o nome negozio","piva_fornitore":"solo cifre o stringa vuota",' +
    '"numero_documento":"numero scontrino/fattura o stringa vuota","iva_pct":numero aliquota prevalente (22, 10, 4, 0) o null,' +
    '"descrizione":"cosa e stato comprato, breve, max 80 caratteri","categoria":"una tra ' + CATEGORIE.join(", ") + '"}. ' +
    "Se un dato non si legge usa stringa vuota (o null per i numeri). Non inventare.";

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        messages: [{ role: "user", content: [block, { type: "text", text: istruzioni }] }],
      }),
    });
    const j = await r.json();
    if (!r.ok) return risp(502, { error: j.error?.message || "Errore AI" });
    const testo = (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    const m = testo.match(/\{[\s\S]*\}/);
    if (!m) return risp(200, { dati: {} });
    let dati = {};
    try { dati = JSON.parse(m[0]); } catch { dati = {}; }
    if (dati.categoria && !CATEGORIE.includes(dati.categoria)) dati.categoria = "altro";
    if (typeof dati.importo === "string") dati.importo = parseFloat(dati.importo.replace(/\./g, "").replace(",", ".")) || null;
    return risp(200, { dati });
  } catch (e) {
    return risp(500, { error: e.message });
  }
};
