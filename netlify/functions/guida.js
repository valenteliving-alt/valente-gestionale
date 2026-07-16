// Guida operativa: tabella imposta di soggiorno per comune + assistente AI
const SUPABASE_URL = "https://heabtbdmwbjlgujsisor.supabase.co";
const TABLE = "guida_comuni";

const CAMPI = ["comune", "provincia", "regione", "imposta_attiva", "tariffa", "tetto_notti", "esenzioni", "frequenza", "portale_tassa", "portale_istat", "regolamento_url", "note", "confidenza", "fonte_url", "aggiornato_il"];

const handler = async (event) => {
  const CORS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: CORS, body: "" };

  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!KEY) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "Manca SUPABASE_SERVICE_ROLE_KEY su Netlify." }) };
  const sb = { "apikey": KEY, "Authorization": "Bearer " + KEY };

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch {}
  const action = body.action;

  // Prende solo i campi ammessi dal payload
  const pulisci = (src) => {
    const out = {};
    CAMPI.forEach(c => { if (src[c] !== undefined) out[c] = src[c] === "" ? null : src[c]; });
    if (src.imposta_attiva !== undefined) out.imposta_attiva = !!src.imposta_attiva;
    return out;
  };

  try {
    if (action === "list") {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?select=*&order=comune.asc`, { headers: sb });
      const data = await r.json();
      if (!r.ok) return { statusCode: r.status, headers: CORS, body: JSON.stringify({ error: data.message || "Errore lettura." }) };
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ righe: data }) };
    }

    if (action === "save") {
      const { id } = body;
      const patch = pulisci(body);
      if (!patch.comune) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Il comune è obbligatorio." }) };
      let r;
      if (id) {
        r = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { ...sb, "Content-Type": "application/json", "Prefer": "return=representation" },
          body: JSON.stringify(patch),
        });
      } else {
        r = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
          method: "POST",
          headers: { ...sb, "Content-Type": "application/json", "Prefer": "return=representation" },
          body: JSON.stringify(patch),
        });
      }
      const rec = await r.json();
      if (!r.ok) return { statusCode: r.status, headers: CORS, body: JSON.stringify({ error: rec.message || "Salvataggio fallito." }) };
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ riga: Array.isArray(rec) ? rec[0] : rec }) };
    }

    if (action === "delete") {
      const { id } = body;
      if (!id) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Manca id." }) };
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: sb });
      if (!r.ok) { const e = await r.text(); return { statusCode: r.status, headers: CORS, body: JSON.stringify({ error: e.slice(0, 200) }) }; }
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
    }

    // Assistente AI: risponde a una domanda usando SOLO i dati della guida come contesto
    if (action === "ask") {
      const domanda = String(body.domanda || "").trim();
      if (!domanda) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Scrivi una domanda." }) };
      const KEY_AI = process.env.ANTHROPIC_API_KEY;
      if (!KEY_AI) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "Manca ANTHROPIC_API_KEY su Netlify." }) };

      // Contesto: le righe della guida
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?select=*&order=comune.asc`, { headers: sb });
      const righe = await r.json().catch(() => []);
      const contesto = (Array.isArray(righe) ? righe : []).map(x =>
        `COMUNE: ${x.comune} (${x.provincia || ""}, ${x.regione || ""})\n` +
        `Imposta di soggiorno attiva: ${x.imposta_attiva ? "sì" : "no"}\n` +
        `Tariffa: ${x.tariffa || "-"}\n` +
        `Tetto notti: ${x.tetto_notti || "-"}\n` +
        `Esenzioni: ${x.esenzioni || "-"}\n` +
        `Frequenza/scadenze: ${x.frequenza || "-"}\n` +
        `Portale versamento: ${x.portale_tassa || "-"}\n` +
        `Portale ISTAT/flussi: ${x.portale_istat || "-"}\n` +
        `Note: ${x.note || "-"}\n` +
        `Affidabilità dato: ${x.confidenza || "-"} · Aggiornato: ${x.aggiornato_il || "-"}`
      ).join("\n\n---\n\n");

      const system = "Sei l'assistente operativo di Valente Living SRL (gestione affitti brevi). Rispondi in italiano, in modo pratico e sintetico, SOLO in base ai dati della guida forniti qui sotto. " +
        "Se il dato richiesto non è nella guida, dillo chiaramente e invita a verificare sul portale del comune. " +
        "Ricorda sempre che i dati sono indicativi e vanno verificati sulla fonte ufficiale prima di adempimenti fiscali. Non inventare tariffe o scadenze.\n\n" +
        "=== DATI DELLA GUIDA ===\n" + contesto;

      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": KEY_AI, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 700, system, messages: [{ role: "user", content: domanda }] }),
      });
      const j = await resp.json();
      if (!resp.ok) return { statusCode: resp.status, headers: CORS, body: JSON.stringify({ error: (j.error && j.error.message) || "Errore AI." }) };
      const testo = (j.content || []).filter(b => b.type === "text").map(b => b.text).join("\n").trim();
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ risposta: testo || "Nessuna risposta." }) };
    }

    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Azione non riconosciuta." }) };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};

exports.handler = handler;
