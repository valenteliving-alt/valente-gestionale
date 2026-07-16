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

    // Archivio generale: modifica categoria / tag / nota
    if (action === "update") {
      const { id, categoria, tags, note } = body;
      if (!id) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Manca id." }) };
      const patch = {};
      if (categoria !== undefined) patch.categoria = categoria;
      if (tags !== undefined) patch.tags = tags;
      if (note !== undefined) patch.note = note;
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
      const { proprieta_id, proprietario_id, nome_file, tipo, data, categoria, tags, note } = body;
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

    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Azione non riconosciuta." }) };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};

exports.handler = handler;
