// Team: anagrafica collaboratori e task assegnabili
const SUPABASE_URL = "https://heabtbdmwbjlgujsisor.supabase.co";

const CAMPI_COLL = ["nome", "ruolo", "email", "telefono", "colore", "attivo", "note", "ruolo_accesso", "stato_approvazione"];
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
    /* Registrazione agente: chiunque abbia il codice aziendale può chiedere l'accesso,
       ma resta IN ATTESA finché il titolare non lo approva. Fino ad allora non vede nulla. */
    if (action === "registra_agente") {
      const nome = String(body.nome || "").trim();
      const mail = String(body.email || "").trim().toLowerCase();
      const codice = String(body.codice || "").trim();
      if (!nome || !mail || !codice) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Servono nome, email e codice." }) };

      // Verifica il codice aziendale (lato server: non è modificabile dal browser)
      const imp = await fetch(`${SUPABASE_URL}/rest/v1/impostazioni?select=valore&chiave=eq.codice_agenti`, { headers: sb });
      const righe = await imp.json().catch(() => []);
      const atteso = Array.isArray(righe) && righe[0] ? String(righe[0].valore || "") : "";
      if (!atteso || codice.toLowerCase() !== atteso.toLowerCase()) {
        return { statusCode: 403, headers: CORS, body: JSON.stringify({ error: "Codice non valido. Chiedilo al tuo referente Valente Living." }) };
      }

      // Già registrato con questa email?
      const esiste = await fetch(`${SUPABASE_URL}/rest/v1/collaboratori?select=id,stato_approvazione&email_accesso=eq.${encodeURIComponent(mail)}`, { headers: sb });
      const trovati = await esiste.json().catch(() => []);
      if (Array.isArray(trovati) && trovati.length) {
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ messaggio: "Risulti già registrato. Se non riesci ad accedere, contatta il tuo referente." }) };
      }

      // Crea l'account e genera il link per scegliere la password
      const cerca = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=200`, { headers: sb });
      const elenco = await cerca.json().catch(() => ({}));
      const gia = (elenco.users || []).find(u => String(u.email || "").toLowerCase() === mail);

      const gl = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
        method: "POST", headers: { ...sb, "Content-Type": "application/json" },
        body: JSON.stringify({ type: gia ? "recovery" : "invite", email: mail }),
      });
      const dl = await gl.json().catch(() => ({}));
      if (!gl.ok) return { statusCode: gl.status, headers: CORS, body: JSON.stringify({ error: dl.msg || dl.message || "Registrazione non riuscita." }) };
      const utente = gia || dl.user || dl;
      const link = dl.action_link || (dl.properties && dl.properties.action_link);

      await fetch(`${SUPABASE_URL}/rest/v1/collaboratori`, {
        method: "POST", headers: { ...sb, "Content-Type": "application/json" },
        body: JSON.stringify({
          nome, email: mail, email_accesso: mail,
          user_id: utente && utente.id ? utente.id : null,
          ruolo: "Agente", ruolo_accesso: "agente",
          stato_approvazione: "in_attesa", attivo: true, colore: "#0891b2",
        }),
      });

      // Avvisa subito: una registrazione che resta ferma in attesa non serve a nessuno.
      // Se la notifica non parte, la registrazione resta comunque valida.
      try {
        const base = process.env.URL || process.env.DEPLOY_PRIME_URL || "";
        if (base) {
          await fetch(`${base}/.netlify/functions/invia-notifica`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: "Nuovo agente da approvare",
              body: `${nome} (${mail}) si è registrato e aspetta il tuo via libera.`,
              url: "/",
            }),
          });
        }
      } catch (_) { /* la notifica è un di più: non deve far fallire la registrazione */ }

      return {
        statusCode: 200, headers: CORS,
        body: JSON.stringify({
          link,
          messaggio: "Registrazione ricevuta. Imposta la password col link qui sotto: potrai entrare appena Valente Living approva il tuo accesso.",
        })
      };
    }

    // Approva (o sospende) un agente in attesa
    if (action === "approva") {
      const { id, approva } = body;
      if (!id) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Manca id." }) };
      const r = await fetch(`${SUPABASE_URL}/rest/v1/collaboratori?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { ...sb, "Content-Type": "application/json", "Prefer": "return=representation" },
        body: JSON.stringify({ stato_approvazione: approva === false ? "in_attesa" : "approvato" }),
      });
      const rec = await r.json().catch(() => null);
      if (!r.ok) return { statusCode: r.status, headers: CORS, body: JSON.stringify({ error: "Operazione non riuscita." }) };
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ collaboratore: Array.isArray(rec) ? rec[0] : rec }) };
    }

    // Assegna gli immobili "di competenza" di un agente
    if (action === "assegna_immobili_agente") {
      const { nome, immobili } = body;
      if (!nome) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Manca il nome." }) };
      const scelti = Array.isArray(immobili) ? immobili : [];
      const attuali = await fetch(`${SUPABASE_URL}/rest/v1/proprieta?select=id&agente=eq.${encodeURIComponent(nome)}`, { headers: sb });
      const avevano = await attuali.json().catch(() => []);
      const daLiberare = (Array.isArray(avevano) ? avevano : []).map(p => p.id).filter(id => !scelti.includes(id));
      for (const id of daLiberare) {
        await fetch(`${SUPABASE_URL}/rest/v1/proprieta?id=eq.${encodeURIComponent(id)}`, {
          method: "PATCH", headers: { ...sb, "Content-Type": "application/json" }, body: JSON.stringify({ agente: null }),
        });
      }
      for (const id of scelti) {
        await fetch(`${SUPABASE_URL}/rest/v1/proprieta?id=eq.${encodeURIComponent(id)}`, {
          method: "PATCH", headers: { ...sb, "Content-Type": "application/json" }, body: JSON.stringify({ agente: nome }),
        });
      }
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ assegnati: scelti.length, liberati: daLiberare.length }) };
    }

    // Codice di registrazione agenti: lettura e modifica (solo dal pannello Team)
    if (action === "codice_agenti") {
      if (body.nuovo !== undefined) {
        await fetch(`${SUPABASE_URL}/rest/v1/impostazioni?chiave=eq.codice_agenti`, {
          method: "PATCH", headers: { ...sb, "Content-Type": "application/json" },
          body: JSON.stringify({ valore: String(body.nuovo).trim(), aggiornato_il: new Date().toISOString() }),
        });
      }
      const r = await fetch(`${SUPABASE_URL}/rest/v1/impostazioni?select=valore&chiave=eq.codice_agenti`, { headers: sb });
      const d = await r.json().catch(() => []);
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ codice: Array.isArray(d) && d[0] ? d[0].valore : "" }) };
    }

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

    /* Genera un link d'invito da copiare e mandare a mano (WhatsApp, Slack…).
       Non manda email: aggira del tutto i limiti del servizio email di Supabase. */
    if (action === "genera_link") {
      const { id, email } = body;
      const mail = String(email || "").trim().toLowerCase();
      if (!mail) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Serve l'email della persona." }) };

      // L'utente esiste già? Allora serve un link di reimpostazione, non di invito
      const cerca = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=200`, { headers: sb });
      const elenco = await cerca.json().catch(() => ({}));
      const esistente = (elenco.users || []).find(u => String(u.email || "").toLowerCase() === mail);

      const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
        method: "POST",
        headers: { ...sb, "Content-Type": "application/json" },
        body: JSON.stringify({ type: esistente ? "recovery" : "invite", email: mail }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return { statusCode: r.status, headers: CORS, body: JSON.stringify({ error: d.msg || d.message || "Generazione del link non riuscita." }) };

      const link = d.action_link || (d.properties && d.properties.action_link);
      if (!link) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "Link non restituito da Supabase." }) };

      // Collega l'account al collaboratore
      const utente = esistente || d.user || d;
      if (id && utente && utente.id) {
        await fetch(`${SUPABASE_URL}/rest/v1/collaboratori?id=eq.${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { ...sb, "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: utente.id, email_accesso: mail, email: mail }),
        });
      }

      return {
        statusCode: 200, headers: CORS,
        body: JSON.stringify({
          link,
          esistente: !!esistente,
          messaggio: esistente
            ? "Link per reimpostare la password: mandaglielo tu."
            : "Link d'invito: mandaglielo tu (WhatsApp, Slack, di persona).",
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

    /* Assegna a una persona esattamente gli immobili scelti:
       mette il suo nome su quelli selezionati e lo toglie dagli altri suoi. */
    if (action === "assegna_immobili") {
      const { nome, immobili } = body;
      if (!nome) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Manca il nome della persona." }) };
      const scelti = Array.isArray(immobili) ? immobili : [];

      // 1) Libera gli immobili che aveva ma che non sono più selezionati
      const attuali = await fetch(`${SUPABASE_URL}/rest/v1/proprieta?select=id&gestore_interno=eq.${encodeURIComponent(nome)}`, { headers: sb });
      const avevano = await attuali.json().catch(() => []);
      const daLiberare = (Array.isArray(avevano) ? avevano : []).map(p => p.id).filter(id => !scelti.includes(id));
      for (const id of daLiberare) {
        await fetch(`${SUPABASE_URL}/rest/v1/proprieta?id=eq.${encodeURIComponent(id)}`, {
          method: "PATCH", headers: { ...sb, "Content-Type": "application/json" },
          body: JSON.stringify({ gestore_interno: null }),
        });
      }

      // 2) Assegna quelli scelti
      for (const id of scelti) {
        await fetch(`${SUPABASE_URL}/rest/v1/proprieta?id=eq.${encodeURIComponent(id)}`, {
          method: "PATCH", headers: { ...sb, "Content-Type": "application/json" },
          body: JSON.stringify({ gestore_interno: nome }),
        });
      }

      return { statusCode: 200, headers: CORS, body: JSON.stringify({ assegnati: scelti.length, liberati: daLiberare.length }) };
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
