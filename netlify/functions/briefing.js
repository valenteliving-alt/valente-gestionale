// Briefing operativo: controlla scadenze imposta, CIN mancanti e fatture da registrare.
// Chiamata dall'agente notturno (push mattutina) o manualmente dalla sezione Guida.
const SUPABASE_URL = "https://heabtbdmwbjlgujsisor.supabase.co";
const SITE_URL = process.env.URL || "https://valentelivingcrm.netlify.app";

const norm = (s) => String(s || "").toLowerCase().trim();

function regolaPerCitta(regole, citta) {
  const c = norm(citta);
  if (!c) return null;
  return regole.find(r => {
    if (norm(r.comune) === c) return true;
    const aliases = String(r.alias || "").split(",").map(norm).filter(Boolean);
    return aliases.includes(c);
  }) || null;
}

function prossimaScadenza(cadenza, da) {
  const d = new Date(da);
  const mk = (y, m, g) => new Date(Date.UTC(y, m, g));
  const y = d.getUTCFullYear();
  let cands = [];
  if (cadenza === "mensile") cands = [mk(y, d.getUTCMonth(), 15), mk(y, d.getUTCMonth() + 1, 15)];
  else if (cadenza === "trimestrale") cands = [mk(y, 0, 15), mk(y, 3, 15), mk(y, 6, 15), mk(y, 9, 15), mk(y + 1, 0, 15)];
  else if (cadenza === "quadrimestrale") cands = [mk(y, 0, 15), mk(y, 4, 15), mk(y, 8, 15), mk(y + 1, 0, 15)];
  else return null;
  return cands.find(x => x >= d) || null;
}

const fmtIT = (d) => d ? new Date(d).toLocaleDateString("it-IT", { day: "numeric", month: "long" }) : "";

exports.handler = async (event) => {
  const CORS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: CORS, body: "" };

  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!KEY) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "Manca SUPABASE_SERVICE_ROLE_KEY." }) };
  const sb = { "apikey": KEY, "Authorization": "Bearer " + KEY };

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch {}
  const inviaPush = body.push !== false; // di default invia la notifica

  try {
    const oggi = new Date();
    const [rRegole, rProp, rFat] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/guida_comuni?select=*`, { headers: sb }),
      fetch(`${SUPABASE_URL}/rest/v1/proprieta?select=id,nome,citta,stato,cin`, { headers: sb }),
      fetch(`${SUPABASE_URL}/rest/v1/fatture_ricevute?select=fornitore,importo_totale,valuta,scadenza,spesa_id,stato&spesa_id=is.null`, { headers: sb }),
    ]);
    const regole = await rRegole.json();
    const props = await rProp.json();
    const fatture = await rFat.json();

    const attive = (Array.isArray(props) ? props : []).filter(p => norm(p.stato).startsWith("attiv"));
    const sezioni = [];

    // 1) Scadenze imposta di soggiorno nei prossimi 10 giorni (solo comuni dove ci sono immobili attivi)
    const comuniAttivi = new Map(); // comune -> regola
    attive.forEach(p => {
      const reg = regolaPerCitta(Array.isArray(regole) ? regole : [], p.citta);
      if (reg && reg.imposta_attiva !== false && reg.cadenza_tipo) comuniAttivi.set(reg.comune, reg);
    });
    const scadenzeVicine = [];
    comuniAttivi.forEach((reg, comune) => {
      const s = prossimaScadenza(reg.cadenza_tipo, oggi);
      if (!s) return;
      const giorni = Math.round((s - oggi) / 86400000);
      if (giorni <= 10) scadenzeVicine.push({ comune, data: s, giorni });
    });
    scadenzeVicine.sort((a, b) => a.data - b.data);
    if (scadenzeVicine.length) {
      sezioni.push("📅 IMPOSTA DI SOGGIORNO\n" + scadenzeVicine.map(s =>
        `• ${s.comune}: dichiarazione/versamento entro il ${fmtIT(s.data)}${s.giorni <= 3 ? " ⚠️ URGENTE" : ` (tra ${s.giorni} giorni)`}`
      ).join("\n"));
    }

    // 2) Proprietà attive senza CIN
    const senzaCin = attive.filter(p => !String(p.cin || "").trim());
    if (senzaCin.length) {
      const nomi = senzaCin.slice(0, 3).map(p => p.nome).join(", ");
      sezioni.push(`🔢 CIN MANCANTI\n• ${senzaCin.length} proprietà attive senza CIN${senzaCin.length <= 3 ? `: ${nomi}` : ` (tra cui ${nomi}…)`}`);
    }

    // 3) Fatture ricevute non ancora registrate in Spese
    const daReg = (Array.isArray(fatture) ? fatture : []);
    if (daReg.length) {
      const tot = daReg.reduce((s, f) => s + (Number(f.importo_totale) || 0), 0);
      const urgenti = daReg.filter(f => f.scadenza && (new Date(f.scadenza) - oggi) / 86400000 <= 7);
      let riga = `• ${daReg.length} fattur${daReg.length === 1 ? "a" : "e"} da registrare (≈ ${tot.toFixed(2)} €)`;
      if (urgenti.length) riga += `\n• ⚠️ ${urgenti.length} in scadenza entro 7 giorni: ${urgenti.slice(0, 3).map(f => `${f.fornitore || "?"} (${fmtIT(f.scadenza)})`).join(", ")}`;
      sezioni.push("🧾 FATTURE\n" + riga);
    }

    const testo = sezioni.length
      ? `Briefing del ${oggi.toLocaleDateString("it-IT", { day: "numeric", month: "long" })}\n\n${sezioni.join("\n\n")}`
      : `Briefing del ${oggi.toLocaleDateString("it-IT", { day: "numeric", month: "long" })}\n\nTutto in ordine: nessuna scadenza imminente, nessuna fattura in sospeso. ✅`;

    // Push (solo se c'è qualcosa da dire, o sempre se richiesto esplicitamente)
    if (inviaPush && sezioni.length) {
      const corpo = sezioni.map(s => s.split("\n").slice(1).join(" ")).join(" · ").slice(0, 220);
      try {
        await fetch(`${SITE_URL}/.netlify/functions/invia-notifica`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "🌅 Briefing Valente Living", body: corpo, url: "/" }),
        });
      } catch (_) { /* la push non deve mai bloccare il briefing */ }
    }

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ testo, voci: sezioni.length }) };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
