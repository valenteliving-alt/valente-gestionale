/* Classifica i lead di HubSpot leggendo cosa hanno scritto.
   Serve a separare i PROPRIETARI che offrono un immobile — gli unici che valgono
   per l'acquisizione — da chi cerca casa, da chi ha già prenotato e ha bisogno di
   assistenza, e dalle proposte commerciali.

   Le parole chiave non bastano: "rent" lo scrive sia chi cerca casa sia chi la
   vuole affidare in gestione. Serve capire chi parla e di che immobile.

   Ogni lead si classifica UNA VOLTA sola: il risultato resta in `lead_classificato`
   e si rifà solo se il testo cambia (confronto per impronta). Su 27 messaggi costa
   pochi centesimi in tutto.

   Env: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY */

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const SUPA = process.env.SUPABASE_URL || "https://heabtbdmwbjlgujsisor.supabase.co";
const SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TIPI = ["gestione", "ospite", "assistenza", "partnership", "altro"];

async function sb(method, path, body, prefer) {
  const r = await fetch(`${SUPA}/rest/v1/${path}`, {
    method,
    headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}`, "Content-Type": "application/json", Prefer: prefer || "return=representation" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.ok ? r.json().catch(() => null) : null;
}

/* Impronta corta del testo: se il messaggio non cambia, non si riclassifica. */
function impronta(t) {
  let h = 0;
  const s = String(t || "");
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
  return String(h) + ":" + s.length;
}

const SYS = `Classifichi i contatti in arrivo di Valente Living, società italiana di property management per affitti brevi.

Rispondi SOLO con JSON valido:
{"tipo":"...","motivo":"...","urgente":true|false,"citta":"..."}

TIPI, in ordine di importanza per l'azienda:
- "gestione": chi POSSIEDE o rappresenta un immobile e vuole affidarlo in gestione, o chiede come funziona il servizio, o vuole una valutazione del proprio immobile. È il contatto più prezioso. Vale anche se scrive per conto di un parente ("my uncle owns...").
- "ospite": chi CERCA un alloggio da affittare per sé, per una vacanza o un soggiorno lungo. Non è un proprietario.
- "assistenza": chi ha GIÀ una prenotazione e ha un problema o una domanda — cancellazioni, modifiche, informazioni pratiche sul soggiorno.
- "partnership": agenzie, agenti immobiliari, tour operator, fornitori, collaborazioni commerciali.
- "altro": non si capisce, oppure è spam.

ATTENZIONE alla parola "rent"/"affittare": la usano sia i proprietari ("I want to rent out my apartment") sia gli ospiti ("I want to rent an apartment"). Guarda CHI possiede l'immobile di cui si parla.

"urgente": true solo se c'è qualcosa che si deteriora aspettando — una cancellazione, un soggiorno imminente, un problema in corso.
"motivo": una riga in italiano, concreta. Non ripetere il tipo, spiega il perché.
"citta": la località dell'immobile o del soggiorno se citata, altrimenti "".`;

exports.handler = async (event) => {
  if (event && event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  const AKEY = process.env.ANTHROPIC_API_KEY;
  if (!AKEY) return resp(500, { error: "Manca ANTHROPIC_API_KEY" });
  if (!SKEY) return resp(500, { error: "Manca SUPABASE_SERVICE_ROLE_KEY" });

  let b = {}; try { b = JSON.parse(event.body || "{}"); } catch (_) {}
  const lead = Array.isArray(b.lead) ? b.lead : [];
  if (!lead.length) return resp(200, { ok: true, classificati: 0, nota: "nessun lead da classificare" });

  // già fatti: li salto se il testo non è cambiato
  const ids = lead.map((l) => String(l.id)).slice(0, 300);
  const gia = (await sb("GET", `lead_classificato?select=id,impronta&id=in.(${ids.map((i) => `"${i}"`).join(",")})`)) || [];
  const mappa = new Map(gia.map((g) => [String(g.id), g.impronta]));

  const daFare = lead.filter((l) => {
    const t = String(l.testo || "").trim();
    if (t.length < 15) return false;                     // senza messaggio non c'è niente da capire
    return mappa.get(String(l.id)) !== impronta(t);
  }).slice(0, Number(b.max) || 40);                      // a scaglioni, per non fare chiamate infinite

  const esiti = [];
  for (const l of daFare) {
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": AKEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: process.env.CERVELLO_MODEL || "claude-haiku-4-5-20251001",
          max_tokens: 220, system: SYS,
          messages: [{ role: "user", content: `Contatto: ${l.nome || "(senza nome)"}\n\nCosa ha scritto:\n${String(l.testo).slice(0, 1800)}` }],
        }),
      });
      const j = await r.json().catch(() => null);
      const testo = (j && j.content && j.content[0] && j.content[0].text) || "";
      let d = null; try { const m = testo.match(/\{[\s\S]*\}/); d = JSON.parse(m ? m[0] : testo); } catch (_) {}
      if (!d || !TIPI.includes(d.tipo)) { esiti.push({ id: l.id, esito: "non classificabile" }); continue; }

      await sb("POST", "lead_classificato?on_conflict=id", [{
        id: String(l.id), tipo: d.tipo,
        motivo: String(d.motivo || "").slice(0, 300),
        urgente: !!d.urgente, citta: String(d.citta || "").slice(0, 80),
        impronta: impronta(l.testo), classificato_il: new Date().toISOString(),
      }], "resolution=merge-duplicates,return=minimal");
      esiti.push({ id: l.id, tipo: d.tipo, urgente: !!d.urgente });
    } catch (e) {
      esiti.push({ id: l.id, esito: "errore: " + String(e.message || e).slice(0, 80) });
    }
  }

  return resp(200, { ok: true, classificati: esiti.filter((e) => e.tipo).length, saltati: lead.length - daFare.length, esiti });
};

function resp(statusCode, obj) {
  return { statusCode, headers: { ...CORS, "Content-Type": "application/json" }, body: JSON.stringify(obj) };
}
