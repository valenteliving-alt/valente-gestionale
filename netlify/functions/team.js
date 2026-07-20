// Team: anagrafica collaboratori e task assegnabili
const SUPABASE_URL = "https://heabtbdmwbjlgujsisor.supabase.co";

const CAMPI_COLL = ["nome", "ruolo", "email", "telefono", "colore", "attivo", "note"];
const CAMPI_TASK = ["titolo", "dettaglio", "assegnato_a", "proprieta_id", "stato", "priorita", "scadenza", "completato_il"];

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

  const pulisci = (src, campi) => {
    const out = {};
    campi.forEach(c => { if (src[c] !== undefined) out[c] = src[c] === "" ? null : src[c]; });
    return out;
  };

  const salva = async (tabella, campi) => {
    const patch = pulisci(body, campi);
    const { id } = body;
    let r;
    if (id) {
      r = await fetch(`${SUPABASE_URL}/rest/v1/${tabella}?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { ...sb, "Content-Type": "application/json", "Prefer": "return=representation" },
        body: JSON.stringify(patch),
      });
    } else {
      r = await fetch(`${SUPABASE_URL}/rest/v1/${tabella}`, {
        method: "POST",
        headers: { ...sb, "Content-Type": "application/json", "Prefer": "return=representation" },
        body: JSON.stringify(patch),
      });
    }
    const rec = await r.json();
    if (!r.ok) throw new Error(rec.message || "Salvataggio fallito.");
    return Array.isArray(rec) ? rec[0] : rec;
  };

  const elimina = async (tabella) => {
    const { id } = body;
    if (!id) throw new Error("Manca id.");
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabella}?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: sb });
    if (!r.ok) throw new Error((await r.text()).slice(0, 200));
    return true;
  };

  try {
    // ── Collaboratori ──
    if (action === "list_collaboratori") {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/collaboratori?select=*&order=nome.asc`, { headers: sb });
      const data = await r.json();
      if (!r.ok) return { statusCode: r.status, headers: CORS, body: JSON.stringify({ error: data.message || "Errore lettura." }) };
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ collaboratori: data }) };
    }
    if (action === "save_collaboratore") {
      if (!body.nome || !String(body.nome).trim()) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Il nome è obbligatorio." }) };
      const rec = await salva("collaboratori", CAMPI_COLL);
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ collaboratore: rec }) };
    }
    if (action === "delete_collaboratore") {
      await elimina("collaboratori");
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
    }

    /* Invita una persona: manda l'email di invito e collega l'account al collaboratore.
       La password la sceglie SOLO l'invitato dal link ricevuto: non passa mai da qui. */
    if (action === "invita") {
      const { id, email } = body;
      const mail = String(email || "").trim().toLowerCase();
      if (!id || !mail) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Servono la persona e la sua email." }) };

      // Se l'utente esiste già lo collego soltanto, senza rimandare l'invito
      const cerca = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=200`, { headers: sb });
      const elenco = await cerca.json().catch(() => ({}));
      const esistente = (elenco.users || []).find(u => String(u.email || "").toLowerCase() === mail);

      let utente = esistente;
      let invitato = false;

      if (!utente) {
        const r = await fetch(`${SUPABASE_URL}/auth/v1/invite`, {
          method: "POST",
          headers: { ...sb, "Content-Type": "application/json" },
          body: JSON.stringify({ email: mail }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) return { statusCode: r.status, headers: CORS, body: JSON.stringify({ error: d.msg || d.message || "Invio dell'invito non riuscito." }) };
        utente = d;
        invitato = true;
      }

      const patch = await fetch(`${SUPABASE_URL}/rest/v1/collaboratori?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { ...sb, "Content-Type": "application/json", "Prefer": "return=representation" },
        body: JSON.stringify({ user_id: utente.id, email_accesso: mail, email: mail }),
      });
      const rec = await patch.json().catch(() => null);
      if (!patch.ok) return { statusCode: patch.status, headers: CORS, body: JSON.stringify({ error: "Account creato ma collegamento fallito." }) };

      return {
        statusCode: 200, headers: CORS,
        body: JSON.stringify({
          collaboratore: Array.isArray(rec) ? rec[0] : rec,
          invitato,
          messaggio: invitato
            ? `Invito inviato a ${mail}. Riceverà un'email per scegliere la sua password.`
            : `L'account ${mail} esisteva già: l'ho collegato a questa persona.`,
        })
      };
    }

    // Rimanda l'invito a chi non ha ancora completato la registrazione
    if (action === "reinvita") {
      const mail = String(body.email || "").trim().toLowerCase();
      if (!mail) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Manca l'email." }) };
      const r = await fetch(`${SUPABASE_URL}/auth/v1/invite`, {
        method: "POST", headers: { ...sb, "Content-Type": "application/json" },
        body: JSON.stringify({ email: mail }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return { statusCode: r.status, headers: CORS, body: JSON.stringify({ error: d.msg || d.message || "Invio non riuscito." }) };
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ messaggio: `Nuovo invito inviato a ${mail}.` }) };
    }

    // Revoca l'accesso: scollega l'account, la persona resta in anagrafica
    if (action === "revoca") {
      const { id } = body;
      if (!id) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Manca id." }) };
      const r = await fetch(`${SUPABASE_URL}/rest/v1/collaboratori?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { ...sb, "Content-Type": "application/json", "Prefer": "return=representation" },
        body: JSON.stringify({ user_id: null, email_accesso: null }),
      });
      const rec = await r.json().catch(() => null);
      if (!r.ok) return { statusCode: r.status, headers: CORS, body: JSON.stringify({ error: "Revoca non riuscita." }) };
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ collaboratore: Array.isArray(rec) ? rec[0] : rec }) };
    }

    // ── Task ──
    if (action === "list_task") {
      let q = "select=*&order=created_at.desc&limit=1000";
      if (body.proprieta_id) q += `&proprieta_id=eq.${encodeURIComponent(body.proprieta_id)}`;
      if (body.assegnato_a) q += `&assegnato_a=eq.${encodeURIComponent(body.assegnato_a)}`;
      const r = await fetch(`${SUPABASE_URL}/rest/v1/task?${q}`, { headers: sb });
      const data = await r.json();
      if (!r.ok) return { statusCode: r.status, headers: CORS, body: JSON.stringify({ error: data.message || "Errore lettura." }) };
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ task: data }) };
    }
    if (action === "save_task") {
      if (!body.id && (!body.titolo || !String(body.titolo).trim())) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Il titolo è obbligatorio." }) };
      }
      // Se si segna come fatto, registra la data; se si riapre, la azzera
      if (body.stato === "fatto" && body.completato_il === undefined) body.completato_il = new Date().toISOString();
      if (body.stato && body.stato !== "fatto") body.completato_il = null;
      const rec = await salva("task", CAMPI_TASK);
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ task: rec }) };
    }
    if (action === "delete_task") {
      await elimina("task");
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Azione non riconosciuta." }) };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};

exports.handler = handler;
