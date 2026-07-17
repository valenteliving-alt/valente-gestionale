// Guida operativa: tabella imposta di soggiorno per comune + assistente AI
const SUPABASE_URL = "https://heabtbdmwbjlgujsisor.supabase.co";
const TABLE = "guida_comuni";

const CAMPI = ["comune", "provincia", "regione", "imposta_attiva", "tariffa", "tetto_notti", "esenzioni", "frequenza", "portale_tassa", "portale_istat", "regolamento_url", "note", "confidenza", "fonte_url", "aggiornato_il", "alias", "tariffa_eur", "tariffa_bassa_eur", "mesi_bassa", "tetto_notti_n", "eta_esenzione_anni", "cadenza_tipo"];

const norm = (s) => String(s || "").toLowerCase().trim();
const STATI_ESCLUSI = ["cancellata", "cancellata con penale", "attesa di conferma"];

// Trova la regola comunale per una città (matcha nome comune o alias/frazioni)
function regolaPerCitta(regole, citta) {
  const c = norm(citta);
  if (!c) return null;
  return regole.find(r => {
    if (norm(r.comune) === c) return true;
    const aliases = String(r.alias || "").split(",").map(norm).filter(Boolean);
    return aliases.includes(c);
  }) || null;
}

// Prossima scadenza di dichiarazione/versamento per una cadenza, rispetto a una data
function prossimaScadenza(cadenza, da) {
  const d = new Date(da);
  const mk = (y, m, g) => new Date(Date.UTC(y, m, g)); // m 0-based
  const y = d.getUTCFullYear();
  let cands = [];
  if (cadenza === "mensile") {
    cands = [mk(y, d.getUTCMonth(), 15), mk(y, d.getUTCMonth() + 1, 15)];
  } else if (cadenza === "trimestrale") {
    cands = [mk(y, 0, 15), mk(y, 3, 15), mk(y, 6, 15), mk(y, 9, 15), mk(y + 1, 0, 15)];
  } else if (cadenza === "quadrimestrale") {
    cands = [mk(y, 0, 15), mk(y, 4, 15), mk(y, 8, 15), mk(y + 1, 0, 15)];
  } else return null;
  const next = cands.find(x => x >= d);
  return next ? next.toISOString().slice(0, 10) : null;
}

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

    // Calcolo imposta di soggiorno: prenotazioni × regole comunali, per periodo
    if (action === "calcola_imposta") {
      const anno = parseInt(body.anno) || new Date().getFullYear();
      const trimestre = Math.min(4, Math.max(1, parseInt(body.trimestre) || 1));
      const start = `${anno}-${String((trimestre - 1) * 3 + 1).padStart(2, "0")}-01`;
      const endY = trimestre === 4 ? anno + 1 : anno;
      const endM = trimestre === 4 ? 1 : trimestre * 3 + 1;
      const end = `${endY}-${String(endM).padStart(2, "0")}-01`;

      const [rRegole, rProp, rPren] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?select=*`, { headers: sb }),
        fetch(`${SUPABASE_URL}/rest/v1/proprieta?select=id,nome,citta,nome_kross,stato`, { headers: sb }),
        fetch(`${SUPABASE_URL}/rest/v1/prenotazioni?select=id,camere,check_in,notti,ospiti,stato,tassa_soggiorno&check_in=gte.${start}&check_in=lt.${end}&limit=5000`, { headers: sb }),
      ]);
      const regole = await rRegole.json();
      const props = await rProp.json();
      const prens = await rPren.json();
      if (!Array.isArray(regole) || !Array.isArray(props) || !Array.isArray(prens)) {
        return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "Lettura dati fallita." }) };
      }

      // Indice proprietà per nome Krossbooking e per nome CRM
      const idxProp = {};
      props.forEach(p => {
        if (p.nome_kross) idxProp[norm(p.nome_kross)] = p;
        if (p.nome && !idxProp[norm(p.nome)]) idxProp[norm(p.nome)] = p;
      });

      const perComune = {}; // comune -> aggregato
      const anomalie = [];
      let escluse = 0;

      for (const pr of prens) {
        if (STATI_ESCLUSI.includes(norm(pr.stato))) { escluse++; continue; }
        const prop = idxProp[norm(pr.camere)];
        if (!prop) { anomalie.push(`Unità "${pr.camere}" non abbinata a nessuna proprietà (${pr.check_in})`); continue; }
        const regola = regolaPerCitta(regole, prop.citta);
        if (!regola) { anomalie.push(`Comune "${prop.citta}" (${prop.nome}) senza scheda in guida`); continue; }
        const key = regola.comune;
        if (!perComune[key]) perComune[key] = { comune: key, regola, n_pren: 0, notti_tassabili: 0, ospiti_notti: 0, importo: 0, kross: 0, calcolabile: regola.imposta_attiva !== false && regola.tariffa_eur != null };
        const agg = perComune[key];
        agg.n_pren++;
        agg.kross += Number(pr.tassa_soggiorno) || 0;
        if (regola.imposta_attiva === false) continue; // isole: niente imposta
        const notti = Math.min(Number(pr.notti) || 0, regola.tetto_notti_n || Number(pr.notti) || 0);
        const ospiti = Number(pr.ospiti) || 0;
        agg.notti_tassabili += notti;
        agg.ospiti_notti += notti * ospiti;
        if (regola.tariffa_eur != null) {
          let tariffa = Number(regola.tariffa_eur);
          if (regola.tariffa_bassa_eur != null && regola.mesi_bassa) {
            const mese = parseInt(String(pr.check_in).slice(5, 7), 10);
            const bassi = String(regola.mesi_bassa).split(",").map(x => parseInt(x, 10));
            if (bassi.includes(mese)) tariffa = Number(regola.tariffa_bassa_eur);
          }
          agg.importo += tariffa * notti * ospiti;
        }
      }

      const righe = Object.values(perComune).map(a => ({
        comune: a.comune,
        n_pren: a.n_pren,
        notti_tassabili: a.notti_tassabili,
        ospiti_notti: a.ospiti_notti,
        importo_calcolato: a.calcolabile ? Math.round(a.importo * 100) / 100 : null,
        importo_kross: Math.round(a.kross * 100) / 100,
        imposta_attiva: a.regola.imposta_attiva !== false,
        cadenza: a.regola.cadenza_tipo || null,
        scadenza: prossimaScadenza(a.regola.cadenza_tipo, end),
        confidenza: a.regola.confidenza || null,
        nota_regola: a.regola.tariffa_eur == null && a.regola.imposta_attiva !== false ? "Tariffa non impostata: calcolo manuale (vedi scheda comune)" : null,
      })).sort((x, y) => (y.importo_calcolato || 0) - (x.importo_calcolato || 0));

      return {
        statusCode: 200, headers: CORS, body: JSON.stringify({
          periodo: { anno, trimestre, dal: start, al: end }, righe, anomalie: anomalie.slice(0, 20), escluse,
          avvertenze: [
            "Gli ospiti sono considerati tutti paganti: le esenzioni per età vanno applicate a mano (l'età non è nei dati Krossbooking).",
            "Le prenotazioni sono attribuite al periodo per data di check-in.",
            "Importi indicativi: prima di dichiarare, verifica tariffe e regole sul portale del comune.",
          ],
        })
      };
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
