// Cervello dell'agente ospiti — v2 (24/10/2026)
// Gira sul CRM (ha la chiave Anthropic). Il robot sul server gli passa la
// conversazione Kross + scheda verificata + dati prenotazione; lui restituisce
//   { azione: "invia" | "approvazione" | "nessuna_risposta", motivo, risposta, ... }
//
// Cosa fa in più rispetto alla v1 (tecniche prese da Hospitable, Hostaway,
// Conduit, Enso, Hostify, Boom):
//  1. IMPARA DALLE TUE CHAT: cerca nelle conversazioni passate dei tuoi
//     appartamenti le domande simili e come hai risposto TU (esclusi i
//     messaggi scritti dal robot), e le usa come esempi di contenuto e stile.
//  2. FASE DELLA PRENOTAZIONE: richiesta / prima dell'arrivo / in soggiorno /
//     dopo la partenza, con regole diverse per ognuna.
//  3. LINGUA DELL'OSPITE, prima persona come Tommaso, testo corto, niente
//     grassetti/markdown (Airbnb e Booking non li mostrano).
//  4. CLASSIFICAZIONE: intento, urgenza, sentiment, confidenza 0-100.
//  5. BLOCCHI FISSI NEL CODICE (non solo nel prompt): argomenti delicati,
//     soglia di confidenza (più alta di notte), codici d'accesso solo con
//     check-in online fatto, nessun numero/link che non esista nelle fonti.
//  6. "Grazie"/"ok"/"perfetto" → nessuna risposta (niente messaggi inutili).
//  7. Registra le decisioni e le informazioni mancanti (se le tabelle esistono).
//
// Env: ANTHROPIC_API_KEY, INGEST_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//      CERVELLO_MODEL (opzionale)

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const SUPA = process.env.SUPABASE_URL || "https://heabtbdmwbjlgujsisor.supabase.co";
const SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";
const MODELLI = [process.env.CERVELLO_MODEL, "claude-haiku-5-5", "claude-haiku-4-5-20251001"].filter(Boolean);

const STATI_CHECKIN_OK = /check-?in online ok|check ?in effettuato|check-?out effettuato/i;

// Argomenti che NON partono mai da soli (blocklist Hospitable/Hostaway/Boom)
const DELICATI = [
  [/rimbors|refund|rembours|reembols|erstatt|money back|soldi indietro|restitu/i, "rimborso"],
  [/scont|discount|r[ée]duction|descuento|rabatt|prezzo|price|prix|precio|preis|quanto cost|how much|tariff/i, "prezzo/sconto"],
  [/cancell|annull|cancel|stornier/i, "cancellazione"],
  [/disponib|available|availability|disponible|libero (dal|il|per)|free (on|from)|verf[üu]gbar/i, "disponibilità/date"],
  [/early check|check-?in anticip|arriv\w* prima|late check|check-?out (tardi|posticip)|partire (dopo|più tardi)|later check|lasciare (i |le )?(bagagli|valigie)|luggage|bagages|maletas|gep[äa]ck/i, "orari fuori standard/bagagli"],
  [/animal|cane|cani|gatto|dog|chien|perro|hund|pet\b|pets/i, "animali"],
  [/ospite in pi|persona in pi|extra (guest|person)|una persona in più|additional guest|ajouter une personne/i, "persone in più"],
  [/danno|danni|rott[oaie]|broken|cass[ée]|roto|kaputt|damage|incidente|accident/i, "danni"],
  [/sporc|dirty|sale\b|sucio|schmutzig|insetti|scarafagg|cimic|bed ?bug|cockroach|muffa|mould|mold/i, "pulizia/igiene"],
  [/recension|review|avis|reseña|bewertung/i, "recensioni"],
  [/polizia|police|ambulanz|ambulance|emergenz|emergency|fuoco|fire|gas leak|fuga di gas|allag|flood|furto|stolen|rubat/i, "emergenza/sicurezza"],
  [/fattura|invoice|ricevuta|receipt|facture|factura|rechnung/i, "fatture"],
  [/pagament|pagare|payment|pay |iban|bonifico|carta di credito|credit card|tassa di soggiorno|city tax|tourist tax|taxe de s[ée]jour/i, "pagamenti/tassa"],
  [/parlare con (una persona|qualcuno|un umano)|talk to (a|someone|a human)|real person|persona vera|chiamami|call me|phone call|telefonar/i, "vuole una persona"],
  [/avvocat|lawyer|legal|denunc|airbnb support|supporto airbnb|segnal/i, "legale/reclamo formale"],
];

const STOP = new Set("il lo la i gli le un una uno di da in con su per tra fra e ed o a al allo alla ai agli alle del dello della dei degli delle che chi cui non si sono è ho hai ha abbiamo avete hanno mi ti ci vi ne come dove quando se ma anche più molto ciao grazie salve buongiorno buonasera the a an and or of to in on at for with is are be we you i it this that there have has do does can could would will my your our hi hello thanks thank please le la les un une des de du et est pour avec dans sur nous vous je il elle el la los las y en con por para es hola gracias der die das und ist ich sie wir mit für danke hallo".split(" "));

const parole = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9àèéìòù\s]/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w));

async function sb(path) {
  if (!SKEY) return null;
  try {
    const r = await fetch(`${SUPA}/rest/v1/${path}`, { headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` } });
    return r.ok ? r.json() : null;
  } catch { return null; }
}
async function sbInsert(tabella, righe) {
  if (!SKEY) return;
  try {
    await fetch(`${SUPA}/rest/v1/${tabella}`, { method: "POST", headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}`, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(righe) });
  } catch { /* registro facoltativo */ }
}

// Ultimo blocco di messaggi consecutivi dell'ospite
function ultimeDomande(conv) {
  const righe = String(conv || "").split("\n"); const out = [];
  for (let i = righe.length - 1; i >= 0; i--) {
    if (righe[i].startsWith("OSPITE:")) out.unshift(righe[i].slice(7).trim());
    else if (righe[i].startsWith("NOI:")) break;
  }
  return out.join("\n");
}

/* ── 1. Esempi dalle chat passate: coppie domanda dell'ospite → risposta di Tommaso ── */
async function esempiSimili({ appartamento, domanda, idThread }) {
  const miei = ((await sb("ai_appartamenti?auto_invio=eq.true&select=appartamento")) || []).map((r) => r.appartamento);
  const lista = Array.from(new Set([appartamento, ...miei].filter(Boolean)));
  if (!lista.length) return [];
  const filtro = lista.map((a) => `"${a.replace(/"/g, '\\"')}"`).join(",");
  const [chat, robot] = await Promise.all([
    sb(`chat_recenti?appartamento=in.(${encodeURIComponent(filtro)})&select=id_thread,appartamento,conversazione&order=ultimo_ts.desc&limit=250`),
    sb("ai_inviati?select=testo&order=id.desc&limit=300"),
  ]);
  // le frasi scritte dal robot NON sono esempi di Tommaso
  const firmeRobot = ((robot || []).map((r) => String(r.testo || "").replace(/\s+/g, " ").trim().slice(0, 50).toLowerCase())).filter((s) => s.length > 15);
  const eRobot = (t) => { const s = t.replace(/\s+/g, " ").toLowerCase(); return firmeRobot.some((f) => s.includes(f)) || /valente living\s*$/i.test(t) || /vikey team/i.test(t); };

  const q = new Set(parole(domanda));
  if (!q.size) return [];
  const coppie = [];
  for (const c of chat || []) {
    if (String(c.id_thread) === String(idThread)) continue;
    const righe = String(c.conversazione || "").split("\n");
    let domandaBlocco = [], rispostaBlocco = [];
    const chiudi = () => {
      if (domandaBlocco.length && rispostaBlocco.length) {
        const d = domandaBlocco.join(" ").trim(), r = rispostaBlocco.join("\n").trim();
        if (d.length > 8 && r.length > 2 && r.length < 1200) coppie.push({ appartamento: c.appartamento, d, r });
      }
      domandaBlocco = []; rispostaBlocco = [];
    };
    for (const riga of righe) {
      if (riga.startsWith("OSPITE:")) {
        if (rispostaBlocco.length) chiudi();
        const t = riga.slice(7).trim(); if (!/^\[foto/.test(t)) domandaBlocco.push(t);
      } else if (riga.startsWith("NOI:")) {
        const t = riga.slice(4).trim();
        if (!domandaBlocco.length || /^\[foto/.test(t) || eRobot(t)) continue;
        rispostaBlocco.push(t);
      }
    }
    chiudi();
  }
  const punteggio = (p) => {
    const w = parole(p.d); if (!w.length) return 0;
    let comuni = 0; for (const x of new Set(w)) if (q.has(x)) comuni++;
    return comuni / Math.sqrt(new Set(w).size + 1) + (p.appartamento === appartamento && comuni ? 0.6 : 0);
  };
  return coppie.map((p) => ({ ...p, s: punteggio(p) })).filter((p) => p.s > 0.45)
    .sort((a, b) => b.s - a.s).slice(0, 6);
}

/* ── 2. Fase della prenotazione ── */
function fase({ stato, arrivo, partenza, oggi }) {
  const s = String(stato || "");
  if (!s || /richiesta|inquiry|pre-?approv|in attesa/i.test(s)) return "richiesta (non ancora prenotato)";
  if (/cancell|annull/i.test(s)) return "prenotazione cancellata";
  if (partenza && oggi > partenza) return "dopo la partenza";
  if (arrivo && oggi >= arrivo && (!partenza || oggi <= partenza)) return "in soggiorno";
  if (/check ?in effettuato/i.test(s)) return "in soggiorno";
  return "prima dell'arrivo";
}

const tag = (j) => (j && typeof j === "object" ? j : {});

exports.handler = async (event) => {
  if (event && event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  const AKEY = process.env.ANTHROPIC_API_KEY;
  if (!AKEY) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "Manca ANTHROPIC_API_KEY" }) };
  let b = {}; try { b = JSON.parse(event.body || "{}"); } catch (_) {}
  if (!process.env.INGEST_KEY || b.chiave !== process.env.INGEST_KEY) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: "chiave non valida" }) };
  const t0 = Date.now();

  const conversazioneTutta = String(b.conversazione || "");
  const conversazione = conversazioneTutta.slice(-6000);
  const domanda = ultimeDomande(conversazioneTutta);
  const notte = !!b.notte;
  const oggi = String(b.oggi || new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" }));
  const stato = String(b.stato || "");
  const appartamento = String(b.appartamento || (b.scheda && b.scheda.appartamento) || "");
  const fasePren = fase({ stato, arrivo: b.arrivo, partenza: b.partenza, oggi });
  const checkinFatto = STATI_CHECKIN_OK.test(stato);

  const schedaObj = tag(b.scheda);
  const scheda = Object.keys(schedaObj).length
    ? Object.entries(schedaObj).filter(([k, v]) => v && !["appartamento", "aggiornata_il", "verificata", "fonte"].includes(k)).map(([k, v]) => `${k}: ${v}`).join("\n")
    : "(scheda non compilata)";
  // lo storico vecchio è in parte corrotto ("[object Object]"): si scarta
  const kbGrezza = String(b.kb || "");
  const kb = kbGrezza.replace(/REGOLE DI STILE[\s\S]*$/i, "").includes("[object Object]") ? "" : kbGrezza.replace(/REGOLE DI STILE[\s\S]*$/i, "").slice(0, 4000);

  let esempi = [];
  try { esempi = await esempiSimili({ appartamento, domanda, idThread: b.id_thread }); } catch { esempi = []; }
  const testoEsempi = esempi.length
    ? esempi.map((e, i) => `Esempio ${i + 1} (${e.appartamento === appartamento ? "stesso appartamento" : "altro appartamento: i suoi codici e indirizzi NON valgono qui"})\nOSPITE: ${e.d.slice(0, 400)}\nTOMMASO: ${e.r.slice(0, 600).replace(/(tag|reservations)[=/][\w-]+/gi, "$1=[link di un'altra prenotazione]")}`).join("\n\n")
    : "(nessun caso simile trovato)";

  const delicati = DELICATI.filter(([re]) => re.test(domanda)).map(([, nome]) => nome);

  const sys = `Sei Tommaso, l'host. Rispondi agli ospiti dei tuoi appartamenti in affitto breve. Scrivi in PRIMA PERSONA SINGOLARE come Tommaso: mai "il nostro team", mai "Valente Living", mai "siamo felicissimi", mai parlare di Tommaso in terza persona.

STILE (copia lo stile degli ESEMPI, che sono risposte vere di Tommaso):
- diretto, cordiale, informale, frasi corte. Di solito 1-3 frasi; più lungo solo per istruzioni pratiche.
- niente markdown: niente asterischi, grassetti, titoli, elenchi con trattini (Airbnb e Booking li mostrano come simboli). Se servono passaggi, usa righe semplici.
- al massimo un'emoji, spesso nessuna. Niente formule tipo "Resto a disposizione per qualsiasi necessità".
- firma "Tommaso" solo se il messaggio è lungo più di 3 righe.
- LINGUA: rispondi nella lingua in cui scrive l'ospite nel suo ultimo messaggio (italiano, inglese, francese, spagnolo, tedesco...). In inglese usa un inglese semplice, non troppo formale.

FONTI: usa SOLO la SCHEDA VERIFICATA, gli ESEMPI di come ha risposto Tommaso e la conversazione. Non inventare MAI codici, password, numeri di telefono, indirizzi, orari, prezzi, link, distanze o dotazioni. Se l'informazione non c'è: non scrivere "ti faccio sapere" o "ti contatterò domani"; imposta azione "approvazione" e scrivi in "lacuna" cosa manca.

FASE DELLA PRENOTAZIONE: ${fasePren}. Regole:
- richiesta (non ancora prenotato): mai codici, indirizzo preciso, wifi. Disponibilità, prezzi, sconti → approvazione.
- prima dell'arrivo: codici scatolina/porta/portone, wifi e istruzioni di ingresso SOLO se il check-in online è fatto (adesso: ${checkinFatto ? "SÌ, fatto" : "NO, non ancora fatto"}). Se non è fatto, ricorda gentilmente di completare il check-in online (obbligatorio per legge) senza inventare link.
- in soggiorno: aiuta a risolvere usando la scheda e gli esempi (es. come ripartire l'acqua calda). Se è un guasto o un problema vero, anche se sai la soluzione, metti "avvisa": true.
- dopo la partenza: ringraziamenti brevi; oggetti dimenticati, danni, reclami, rimborsi → approvazione.

DECISIONE:
- "invia" = domanda di routine con risposta certa nelle fonti (orari standard check-in/out, wifi, parcheggio, come entrare, dotazioni presenti in scheda, rifiuti, consigli già dati da Tommaso).
- "approvazione" = prezzi, sconti, rimborsi, disponibilità e date, check-in anticipato/check-out tardivo, bagagli, animali, persone in più, danni, reclami, lamentele, sicurezza, pagamenti e tassa, fatture, l'ospite vuole parlare con una persona, oppure non sei sicuro. Scrivi comunque una bozza che Tommaso possa mandare.
- "nessuna_risposta" = l'ultimo messaggio dell'ospite è solo un ok/grazie/perfetto/emoji/saluto finale e non chiede niente.
${notte ? "- È NOTTE (23-8): invia da solo solo le cose semplicissime e certe. Nel dubbio approvazione: Tommaso guarda la mattina." : ""}

Rispondi SOLO con JSON valido:
{"azione":"invia"|"approvazione"|"nessuna_risposta","intento":"checkin|accesso|wifi|parcheggio|dotazioni|guasto|pulizia|reclamo|rimborso|prezzo|date|orari_extra|bagagli|animali|pagamento|consigli|ringraziamento|altro","urgenza":"bassa|media|alta","sentiment":"positivo|neutro|negativo","lingua":"it|en|fr|es|de|altro","confidenza":0-100,"avvisa":true|false,"lacuna":"cosa manca nelle fonti, oppure null","motivo":"breve, in italiano","risposta":"testo per l'ospite (vuoto se nessuna_risposta)"}`;

  const usr = `OGGI: ${oggi}
APPARTAMENTO: ${appartamento || "?"}
OSPITE: ${b.ospite || "?"} · canale ${b.canale || "?"} · arrivo ${b.arrivo || "?"} · partenza ${b.partenza || "?"} · stato Kross: ${stato || "nessuno (richiesta)"}

SCHEDA VERIFICATA:
${scheda}
${kb ? `\nALTRE NOTE:\n${kb}\n` : ""}
ESEMPI (risposte vere di Tommaso a domande simili):
${testoEsempi}

CONVERSAZIONE (OSPITE = l'ospite, NOI = noi; l'ultimo blocco OSPITE è a cui rispondere):
${conversazione}`;

  // ── chiamata al modello (con ripiego su un modello più vecchio se serve) ──
  let out = null, modello = "", errore = "";
  for (const m of MODELLI) {
    if (out || Date.now() - t0 > 7500) break;
    try {
      const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), Math.max(2500, 8800 - (Date.now() - t0)));
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", signal: ctrl.signal,
        headers: { "x-api-key": AKEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: m, max_tokens: 800, system: sys, messages: [{ role: "user", content: usr }] }),
      });
      clearTimeout(timer);
      const j = await r.json().catch(() => null);
      if (!j || j.error) { errore = j && j.error ? String(j.error.message || j.error.type) : "risposta non leggibile"; continue; }
      const testo = (j.content || []).map((p) => p.text || "").join("");
      try { const mm = testo.match(/\{[\s\S]*\}/); out = JSON.parse(mm ? mm[0] : testo); modello = m; }
      catch { out = { azione: "approvazione", motivo: "formato inatteso", risposta: testo.slice(0, 1200), confidenza: 0 }; modello = m; }
    } catch (e) { errore = String(e.name === "AbortError" ? "tempo scaduto" : (e.message || e)); }
  }
  if (!out) {
    return { statusCode: 200, headers: { ...CORS, "Content-Type": "application/json" }, body: JSON.stringify({ azione: "approvazione", motivo: "AI momentaneamente non disponibile: " + errore, risposta: "" }) };
  }

  // ── 5. Controlli fissi nel codice (il "verificatore") ──
  out.azione = ["invia", "approvazione", "nessuna_risposta"].includes(out.azione) ? out.azione : "approvazione";
  out.confidenza = Math.max(0, Math.min(100, Number(out.confidenza) || 0));
  let risposta = String(out.risposta || "")
    .replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1").replace(/^#{1,6}\s*/gm, "").replace(/^\s*[-•]\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/(\s*(cordiali saluti|un caro saluto|saluti)[,!.]?)?\s*\n?\s*(il team di |lo staff di )?valente living[.!]?\s*$/i, "\n\nTommaso")
    .trim();
  out.risposta = risposta;
  const blocchi = [];
  const ok = (cond, motivo) => { if (cond) blocchi.push(motivo); };

  ok(delicati.length > 0 && out.azione === "invia", `argomento delicato (${delicati.join(", ")})`);
  const soglia = notte ? 90 : 80;
  ok(out.azione === "invia" && out.confidenza < soglia, `confidenza ${out.confidenza} sotto ${soglia}`);
  ok(out.azione === "invia" && out.sentiment === "negativo", "ospite scontento");
  ok(out.azione === "invia" && out.urgenza === "alta", "urgenza alta");
  ok(out.azione === "invia" && !!out.lacuna && String(out.lacuna) !== "null", "manca un'informazione");
  ok(out.azione === "invia" && fasePren.startsWith("richiesta") && /\d{4}/.test(risposta), "dati a chi non ha prenotato");

  // numeri, link e telefoni: devono esistere nella scheda o in QUESTA conversazione
  // (non negli esempi: lì ci sono codici di altri appartamenti e link di altre prenotazioni)
  const fonti = (scheda + "\n" + kb + "\n" + conversazioneTutta).replace(/\s+/g, "").toLowerCase();
  const numeri = (risposta.match(/\d[\d\s.\-/#]{2,}\d/g) || []).map((n) => n.replace(/[\s.\-/]/g, "")).filter((n) => n.replace(/\D/g, "").length >= 4);
  const link = risposta.match(/https?:\/\/\S+/g) || [];
  const inventati = numeri.filter((n) => !fonti.includes(n.toLowerCase())).concat(link.filter((l) => !fonti.includes(l.replace(/[).,!]+$/, "").replace(/\s+/g, "").toLowerCase())));
  ok(out.azione === "invia" && inventati.length > 0, `dato non presente nelle fonti (${inventati.slice(0, 2).join(", ")})`);

  // codici d'accesso solo con check-in online fatto
  const codiciScheda = new Set(((schedaObj.accesso || "") + " " + (schedaObj.wifi || "") + " " + (schedaObj.note || "")).match(/\b[0-9A-Za-z#]{4,}\b/g)?.filter((c) => /\d/.test(c)) || []);
  const daCodici = [...codiciScheda].some((c) => risposta.includes(c));
  ok(out.azione === "invia" && daCodici && !checkinFatto, "codici a un ospite senza check-in online");

  // "nessuna risposta" solo se davvero è un ok/grazie
  if (out.azione === "nessuna_risposta" && (domanda.length > 140 || /\?/.test(domanda) || delicati.length)) {
    blocchi.push("sembrava un semplice ringraziamento ma potrebbe essere una domanda");
    out.azione = "approvazione";
  }
  if (out.azione === "invia" && !risposta) blocchi.push("risposta vuota");

  if (blocchi.length && out.azione === "invia") { out.azione = "approvazione"; }
  out.motivo = [out.motivo, ...blocchi].filter(Boolean).join(" · ").slice(0, 300);
  if (out.sentiment === "negativo" || out.urgenza === "alta" || delicati.includes("emergenza/sicurezza")) out.avvisa = true;
  out.fase = fasePren; out.delicati = delicati; out.esempi_usati = esempi.length; out.modello = modello; out.ms = Date.now() - t0;

  // ── 7. Registro (facoltativo: se le tabelle non ci sono, non succede niente) ──
  await Promise.all([
    sbInsert("ai_decisioni", [{ id_thread: b.id_thread ? String(b.id_thread) : null, appartamento, fase: fasePren, intento: out.intento || null, urgenza: out.urgenza || null, sentiment: out.sentiment || null, lingua: out.lingua || null, confidenza: out.confidenza, azione_ai: out.azione, motivo: out.motivo, bozza: risposta.slice(0, 2000), esempi_usati: esempi.length, modello, ms: out.ms }]),
    out.lacuna && String(out.lacuna) !== "null"
      ? sbInsert("ai_lacune", [{ appartamento, domanda: domanda.slice(0, 500), cosa_manca: String(out.lacuna).slice(0, 300), id_thread: b.id_thread ? String(b.id_thread) : null }])
      : Promise.resolve(),
  ]);

  return { statusCode: 200, headers: { ...CORS, "Content-Type": "application/json" }, body: JSON.stringify(out) };
};
