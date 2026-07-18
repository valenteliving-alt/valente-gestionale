const SUPABASE_URL = "https://heabtbdmwbjlgujsisor.supabase.co";
const BUCKET = "documenti";
const SITE_URL = process.env.URL || "https://valentelivingcrm.netlify.app";

// Invio notifica push (fire-and-forget: non blocca mai l'upload)
async function notificaPush(title, body) {
  try {
    await fetch(`${SITE_URL}/.netlify/functions/invia-notifica`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, url: "/" }),
    });
  } catch (_) { /* ignora */ }
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

  // Aggiorna una riga del documento e restituisce il record aggiornato
  const patchDoc = async (id, patch) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/documenti?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { ...sb, "Content-Type": "application/json", "Prefer": "return=representation" },
      body: JSON.stringify(patch),
    });
    const rec = await r.json().catch(() => null);
    return Array.isArray(rec) ? rec[0] : rec;
  };

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch {}
  const action = body.action;

  try {
    if (action === "list") {
      const { proprieta_id, proprietario_id } = body;
      let q;
      if (proprieta_id) q = "proprieta_id=eq." + encodeURIComponent(proprieta_id);
      else if (proprietario_id) q = "proprietario_id=eq." + encodeURIComponent(proprietario_id);
      else return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Manca id." }) };
      const r = await fetch(`${SUPABASE_URL}/rest/v1/documenti?select=*&${q}&order=created_at.desc`, { headers: sb });
      const data = await r.json();
      if (!r.ok) return { statusCode: r.status, headers: CORS, body: JSON.stringify({ error: data.message || "Errore lettura." }) };
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ files: data }) };
    }

    // Archivio generale: tutti i documenti del CRM, i più recenti prima
    if (action === "list_all") {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/documenti?select=*&order=created_at.desc&limit=2000`, { headers: sb });
      const data = await r.json();
      if (!r.ok) return { statusCode: r.status, headers: CORS, body: JSON.stringify({ error: data.message || "Errore lettura." }) };
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ files: data }) };
    }

    // Archivio generale: modifica categoria / tag / nota / ricorrenza
    if (action === "update") {
      const { id, categoria, tags, note, ric_tipo, ric_anno, ric_periodo, ric_ambito } = body;
      if (!id) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Manca id." }) };
      const patch = {};
      if (categoria !== undefined) patch.categoria = categoria;
      if (tags !== undefined) patch.tags = tags;
      if (note !== undefined) patch.note = note;
      if (ric_tipo !== undefined) patch.ric_tipo = ric_tipo || null;
      if (ric_anno !== undefined) patch.ric_anno = ric_anno ? parseInt(ric_anno) : null;
      if (ric_periodo !== undefined) patch.ric_periodo = ric_periodo || null;
      if (ric_ambito !== undefined) patch.ric_ambito = ric_ambito || null;
      const r = await fetch(`${SUPABASE_URL}/rest/v1/documenti?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { ...sb, "Content-Type": "application/json", "Prefer": "return=representation" },
        body: JSON.stringify(patch),
      });
      const rec = await r.json();
      if (!r.ok) return { statusCode: r.status, headers: CORS, body: JSON.stringify({ error: rec.message || "Aggiornamento fallito." }) };
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ file: Array.isArray(rec) ? rec[0] : rec }) };
    }

    if (action === "upload") {
      const { proprieta_id, proprietario_id, nome_file, tipo, data, categoria, tags, note, ric_tipo, ric_anno, ric_periodo, ric_ambito } = body;
      if (!data || !nome_file) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "File mancante." }) };
      const safeName = nome_file.replace(/[^a-zA-Z0-9._-]/g, "_");
      const catFolder = String(categoria || "Generale").replace(/[^a-zA-Z0-9._-]/g, "_");
      const folder = proprieta_id
        ? ("proprieta/" + proprieta_id)
        : proprietario_id
          ? ("proprietario/" + proprietario_id)
          : ("archivio/" + catFolder);
      const path = folder + "/" + Date.now() + "-" + safeName;
      const buffer = Buffer.from(data, "base64");

      const up = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
        method: "POST",
        headers: { ...sb, "Content-Type": tipo || "application/octet-stream" },
        body: buffer,
      });
      if (!up.ok) {
        const e = await up.text();
        return { statusCode: up.status, headers: CORS, body: JSON.stringify({ error: "Upload fallito: " + e.slice(0, 200) }) };
      }

      const ins = await fetch(`${SUPABASE_URL}/rest/v1/documenti`, {
        method: "POST",
        headers: { ...sb, "Content-Type": "application/json", "Prefer": "return=representation" },
        body: JSON.stringify({
          proprieta_id: proprieta_id || null,
          proprietario_id: proprietario_id || null,
          nome_file, path, tipo: tipo || "",
          categoria: categoria || (proprieta_id || proprietario_id ? null : "Generale"),
          tags: tags || null,
          note: note || null,
          ric_tipo: ric_tipo || null,
          ric_anno: ric_anno ? parseInt(ric_anno) : null,
          ric_periodo: ric_periodo || null,
          ric_ambito: ric_ambito || null,
        }),
      });
      const rec = await ins.json();
      if (!ins.ok) return { statusCode: ins.status, headers: CORS, body: JSON.stringify({ error: rec.message || "Salvataggio fallito." }) };
      await notificaPush("Nuovo documento caricato", nome_file);
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ file: Array.isArray(rec) ? rec[0] : rec }) };
    }

    if (action === "sign") {
      const { path } = body;
      if (!path) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Manca path." }) };
      const r = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${path}`, {
        method: "POST",
        headers: { ...sb, "Content-Type": "application/json" },
        body: JSON.stringify({ expiresIn: 3600 }),
      });
      const data = await r.json();
      if (!r.ok) return { statusCode: r.status, headers: CORS, body: JSON.stringify({ error: data.message || "Errore firma URL." }) };
      const signed = data.signedURL || data.signedUrl || "";
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ url: SUPABASE_URL + "/storage/v1" + signed }) };
    }

    if (action === "delete") {
      const { id, path } = body;
      if (!id || !path) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Mancano id/path." }) };
      await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}`, {
        method: "DELETE",
        headers: { ...sb, "Content-Type": "application/json" },
        body: JSON.stringify({ prefixes: [path] }),
      });
      const r = await fetch(`${SUPABASE_URL}/rest/v1/documenti?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: sb });
      if (!r.ok) { const e = await r.text(); return { statusCode: r.status, headers: CORS, body: JSON.stringify({ error: e.slice(0, 200) }) }; }
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
    }

    // Descrizione automatica: l'AI legge il documento e genera una frase + parole chiave
    if (action === "describe") {
      const { id, path, tipo, nome_file } = body;
      let data = body.data;
      if (!id) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Manca id." }) };

      const nome = String(nome_file || path || "").toLowerCase();
      const isPdf = String(tipo || "").includes("pdf") || nome.endsWith(".pdf");
      const isImg = String(tipo || "").startsWith("image/") || /\.(jpe?g|png|webp|gif|heic)$/.test(nome);

      // Formati che l'AI non può leggere direttamente (Word, Excel, zip, p7m…): li segniamo come "saltati"
      if (!isPdf && !isImg) {
        const file = await patchDoc(id, { ai_stato: "skip" });
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ file, skipped: true }) };
      }

      const KEY_AI = process.env.ANTHROPIC_API_KEY;
      if (!KEY_AI) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "Manca ANTHROPIC_API_KEY su Netlify." }) };

      // Se il client non ha passato i dati del file (es. backfill), lo scarichiamo dallo storage
      if (!data) {
        if (!path) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Manca path." }) };
        const dl = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURI(path)}`, { headers: sb });
        if (!dl.ok) {
          await patchDoc(id, { ai_stato: "errore" });
          return { statusCode: 200, headers: CORS, body: JSON.stringify({ file: await patchDoc(id, {}), error: "Download del file non riuscito." }) };
        }
        const ab = await dl.arrayBuffer();
        data = Buffer.from(ab).toString("base64");
      }

      const mediaType = isPdf ? "application/pdf" : (String(tipo || "").startsWith("image/") ? tipo : "image/jpeg");
      const blocco = isPdf
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
        : { type: "image", source: { type: "base64", media_type: mediaType, data } };
      const prompt = 'Guarda il documento allegato. Rispondi SOLO con un JSON valido, senza markdown e senza altro testo: {"d":"descrizione brevissima in italiano, massimo 12 parole, di che documento si tratta e a cosa o a chi si riferisce","k":["da 3 a 6 parole chiave in minuscolo"]}. Copia eventuali nomi, importi o codici in modo utile per ritrovare il documento.';

      try {
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": KEY_AI, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 300, messages: [{ role: "user", content: [blocco, { type: "text", text: prompt }] }] }),
        });
        const j = await r.json();
        if (!r.ok) {
          await patchDoc(id, { ai_stato: "errore" });
          return { statusCode: r.status, headers: CORS, body: JSON.stringify({ error: (j.error && j.error.message) || "Errore AI." }) };
        }
        let txt = (j.content || []).filter(b => b.type === "text").map(b => b.text).join("\n").trim();
        txt = txt.replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
        let obj = null; try { obj = JSON.parse(txt); } catch {}
        let descr = "";
        if (obj && obj.d) {
          const kw = Array.isArray(obj.k) ? obj.k.map(x => String(x || "").trim()).filter(Boolean).slice(0, 6) : [];
          descr = String(obj.d).trim();
          if (kw.length) descr += "  " + kw.map(k => "#" + k.replace(/\s+/g, "-")).join(" ");
        } else {
          descr = txt.slice(0, 240);
        }
        const file = await patchDoc(id, { ai_descrizione: descr, ai_stato: "ok" });
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ file }) };
      } catch (e) {
        await patchDoc(id, { ai_stato: "errore" });
        return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
      }
    }

    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Azione non riconosciuta." }) };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};

exports.handler = handler;
