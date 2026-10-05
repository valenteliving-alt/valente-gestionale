/* Riepilogo lead su Telegram.

   PERCHÉ ESISTE
   I lead arrivano da HubSpot e dal sito, e quelli che valgono (proprietari che
   vogliono affidare un immobile) restano sepolti fra chi cerca casa, agenzie e
   spam. Tommaso Ratti li deve chiamare: serve una lista pulita, ogni mattina,
   sul telefono.

   COSA FA
   1. prende i lead nuovi (HubSpot assegnati a Tommaso + richieste dal sito)
      e le valutazioni "da acquisire" dell'app agenti
   2. classifica con l'AI quelli non ancora classificati (stessa logica di
      netlify/functions/classifica-lead.js, tabella lead_classificato)
   3. manda sul bot Telegram un riepilogo: proprietari da chiamare in cima,
      il resto solo contato
   4. segna in lead_riepilogati cosa ha mandato, così domani non lo ripete

   COSA NON FA
   Non scrive ai proprietari, non tocca HubSpot, non cambia lo stato dei lead.

   Chiamata: POST con header x-riepilogo-key = riepilogo_lead_config.cron_key
   Body opzionale: { giorni: 3, prova: true, rimanda: true }
   (prova = non manda e non segna; rimanda = include anche i lead già inviati)
   Schedulata da pg_cron (job "riepilogo-lead-telegram"). */

const TG_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const AKEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP = "https://valentelivingcrm.netlify.app";
const HUBSPOT_PORTAL = "25704633";
const SOGLIA_MARGINE = 10000;

/* Campi HubSpot che non dicono niente a chi deve telefonare */
const TECNICI = new Set(["createdate", "lastmodifieddate", "lifecyclestage", "hubspot_owner_id", "firstname", "lastname",
  "email", "phone", "mobilephone", "descrizione", "message", "messaggio", "richiesta", "city", "address", "hs_lead_status",
  "notes_last_updated", "notes_last_contacted", "iso", "tipo_di_esigenza"]);
const ETICHETTE: Record<string, string> = {
  tipo_immobile: "Tipo immobile", superficie: "Superficie (mq)", n__locali: "Locali",
  zona: "Zona", budget_prezzo_richiesto: "Prezzo richiesto", fonte: "Fonte", company: "Azienda", jobtitle: "Ruolo",
  state: "Regione", zip: "CAP", country: "Paese", website: "Sito",
};

/* Stessa regola di esigenzaLead() in src/App.jsx: il campo HubSpot "Tipo di
   esigenza" dice se il proprietario vuole gestione o vendita. L'AI da sola non
   lo distingue: "villa 140 mq" sembra sempre gestione. */
function esigenzaDa(v: string) {
  const x = String(v || "").toLowerCase();
  if (!x) return "Non indicata";
  if (/gestione|affitto/.test(x)) return "Gestione";
  if (/vendita/.test(x)) return "Vendita";
  if (/acquisto/.test(x)) return "Acquisto";
  if (/investimento/.test(x)) return "Investimento";
  if (/recruiting|hr/.test(x)) return "Recruiting / HR";
  if (/stand by/.test(x)) return "Stand by";
  return "Altro";
}

const sbH = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" };

async function sb(method: string, path: string, body?: unknown, prefer?: string) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method, headers: { ...sbH, Prefer: prefer || "return=representation" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`Supabase ${path.split("?")[0]} ${r.status}: ${(await r.text()).slice(0, 150)}`);
  return r.status === 204 ? null : r.json().catch(() => null);
}

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const euro = (n: unknown) => "€" + Math.round(Number(n) || 0).toLocaleString("it-IT");

function impronta(t: string) {
  let h = 0;
  for (let i = 0; i < t.length; i++) h = ((h << 5) - h + t.charCodeAt(i)) | 0;
  return String(h) + ":" + t.length;
}

/* Stesso prompt di classifica-lead.js: i due devono dare lo stesso risultato. */
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

async function classifica(nome: string, testo: string) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": AKEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001", max_tokens: 220, system: SYS,
      messages: [{ role: "user", content: `Contatto: ${nome || "(senza nome)"}\n\nCosa ha scritto:\n${testo.slice(0, 1800)}` }],
    }),
  });
  const j = await r.json().catch(() => null);
  const t = j?.content?.[0]?.text || "";
  try {
    const m = t.match(/\{[\s\S]*\}/);
    const d = JSON.parse(m ? m[0] : t);
    if (["gestione", "ospite", "assistenza", "partnership", "altro"].includes(d.tipo)) return d;
  } catch { /* sotto */ }
  return null;
}

async function hubspot(body: unknown) {
  const r = await fetch(`${APP}/.netlify/functions/hubspot`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("HubSpot via CRM " + r.status);
  return r.json();
}

async function tgSend(chatId: number, text: string) {
  const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
  });
  if (!r.ok) throw new Error("Telegram " + r.status + ": " + (await r.text()).slice(0, 150));
}

/* Telegram taglia a 4096 caratteri: si spezza fra un blocco e l'altro, mai a metà lead. */
function aPezzi(blocchi: string[], max = 3800) {
  const out: string[] = [];
  let cur = "";
  for (const b of blocchi) {
    if (cur && (cur + "\n\n" + b).length > max) { out.push(cur); cur = b; }
    else cur = cur ? cur + "\n\n" + b : b;
  }
  if (cur) out.push(cur);
  return out;
}

type Lead = {
  id: string; fonte: "hubspot" | "sito"; nome: string; telefono: string; email: string;
  citta: string; creato: string; testo: string; link: string;
  dati: [string, string][];
  esigenza: string;
  tipo?: string; motivo?: string; urgente?: boolean; cittaAI?: string;
};

Deno.serve(async (req) => {
  try {
    /* 1) autorizzazione: solo chi conosce la chiave (pg_cron) */
    const cfg = await sb("GET", "riepilogo_lead_config?select=chiave,valore") as { chiave: string; valore: string }[];
    const key = cfg.find((c) => c.chiave === "cron_key")?.valore;
    if (!key || req.headers.get("x-riepilogo-key") !== key) return new Response("unauthorized", { status: 401 });

    let opz: { giorni?: number; prova?: boolean; rimanda?: boolean } = {};
    try { opz = await req.json(); } catch { /* niente body */ }
    const giorni = Math.min(Math.max(Number(opz.giorni) || 3, 1), 30);
    const prova = !!opz.prova;
    const da = Date.now() - giorni * 86400000;

    const [giaInviati, nascosti] = await Promise.all([
      sb("GET", "lead_riepilogati?select=lead_id") as Promise<{ lead_id: string }[]>,
      sb("GET", "lead_nascosti?select=id") as Promise<{ id: string }[]>,
    ]);
    /* rimanda: rimanda anche quelli già inviati (es. per rifare il messaggio del giorno) */
    const visti = new Set(opz.rimanda ? [] : giaInviati.map((x) => String(x.lead_id)));
    const fuori = new Set(nascosti.map((x) => String(x.id)));

    /* 2) i lead nuovi */
    const leads: Lead[] = [];
    const problemi: string[] = [];

    try {
      const hs = await hubspot({ action: "leads" });
      for (const l of hs.leads || []) {
        const id = String(l.id);
        const t = Date.parse(l.createdate || l.properties?.createdate || "");
        if (!t || t < da || visti.has(id) || fuori.has(id)) continue;
        const p = l.properties || {};
        const campi: { chiave: string; etichetta: string; valore: string }[] = l.campi || [];
        const val = (k: string) => campi.find((c) => c.chiave === k)?.valore || "";
        const testo = [p.descrizione, p.message, p.messaggio, p.richiesta]
          .map((x: unknown) => String(x || "").trim())
          .find((x: string) => x.length > 2 && !/^\d{4}-\d{2}-\d{2}T/.test(x)) || "";
        const telefoni = [...new Set([l.telefono, val("mobilephone"), val("phone")].map((x) => String(x || "").trim()).filter(Boolean))];
        const dati: [string, string][] = campi
          .filter((c) => !TECNICI.has(c.chiave) && !/^\d{4}-\d{2}-\d{2}T/.test(c.valore))
          .map((c) => [ETICHETTE[c.chiave] || c.etichetta, c.valore]);
        leads.push({
          id, fonte: "hubspot", nome: l.nome || l.email || "Senza nome", telefono: telefoni.join(" / "),
          email: l.email || "", citta: [val("address"), l.citta].filter(Boolean).join(", "), creato: l.createdate, testo,
          link: `https://app.hubspot.com/contacts/${HUBSPOT_PORTAL}/record/0-1/${id}`, dati,
          esigenza: esigenzaDa(val("tipo_di_esigenza")),
        });
      }
      /* il messaggio vero di solito è una email associata al contatto */
      const senza = leads.filter((l) => l.fonte === "hubspot" && !l.testo).map((l) => l.id);
      for (let i = 0; i < senza.length; i += 100) {
        try {
          const c = await hubspot({ action: "attivita", ids: senza.slice(i, i + 100) });
          const conv = c.conversazioni || {};
          for (const l of leads) {
            const cc = conv[l.id];
            if (!cc?.length) continue;
            l.testo = cc.filter((x: any) => x.inArrivo).map((x: any) => [x.oggetto, x.testo].filter(Boolean).join(" — ")).join("\n")
              || [cc[0].oggetto, cc[0].testo].filter(Boolean).join(" — ");
          }
        } catch (e) { problemi.push("conversazioni HubSpot: " + (e as Error).message); }
      }
    } catch (e) { problemi.push("HubSpot non raggiungibile: " + (e as Error).message); }

    const sito = await sb("GET", `lead_sito?select=*&created_at=gte.${new Date(da).toISOString()}&order=created_at.desc`) as any[];
    for (const l of sito || []) {
      const id = "sito-" + l.id;
      if (visti.has(id) || l.stato === "archiviato") continue;
      const dettaglio = [l.tipo, l.situazione, l.formula, l.camere ? l.camere + " camere" : null, l.mq ? l.mq + " m²" : null, l.stato_immobile, l.motivo]
        .filter(Boolean).join(" · ");
      leads.push({
        id, fonte: "sito", nome: l.nome || l.email || "Richiesta dal sito", telefono: l.telefono || "",
        email: l.email || "", citta: [l.indirizzo, l.citta].filter(Boolean).join(", "), creato: l.created_at,
        testo: [l.messaggio, l.note].filter(Boolean).join("\n"), link: `${APP}/?view=lead`,
        dati: ([["Tipo", l.tipo], ["Situazione", l.situazione], ["Formula", l.formula], ["Camere", l.camere], ["Mq", l.mq],
          ["Stato immobile", l.stato_immobile], ["Caratteristiche", l.caratteristiche], ["Budget allestimento", l.budget_allestimento],
          ["Motivo", l.motivo], ["Foto allegate", l.foto_n ? String(l.foto_n) : ""]] as [string, string][])
          .filter(([, v]) => v && String(v).trim()).map(([k, v]) => [k, String(v)]),
        esigenza: "Gestione",
        /* dal sito arriva solo chi propone un immobile: è un proprietario per costruzione */
        tipo: "gestione", motivo: dettaglio || "Richiesta di gestione dal sito",
      });
    }

    /* 3) classificazione: quella già fatta dal CRM, il resto la faccio qui */
    const daHs = leads.filter((l) => l.fonte === "hubspot");
    if (daHs.length) {
      const ids = daHs.map((l) => `"${l.id}"`).join(",");
      const cls = await sb("GET", `lead_classificato?select=id,tipo,motivo,urgente,citta,impronta&id=in.(${ids})`) as any[];
      const mappa = new Map(cls.map((c) => [String(c.id), c]));
      for (const l of daHs) {
        const c = mappa.get(l.id);
        if (c) Object.assign(l, { tipo: c.tipo, motivo: c.motivo, urgente: c.urgente, cittaAI: c.citta });
        else {
          const perAI = [l.testo, l.dati.map(([k, v]) => `${k}: ${v}`).join("; ")].filter(Boolean).join("\n");
          if (perAI.trim().length < 15) { l.tipo = "senza_richiesta"; continue; }
          const d = await classifica(l.nome, perAI);
          if (!d) continue; // resta senza tipo: si riprova al prossimo giro
          Object.assign(l, { tipo: d.tipo, motivo: String(d.motivo || ""), urgente: !!d.urgente, cittaAI: String(d.citta || "") });
          await sb("POST", "lead_classificato?on_conflict=id", [{
            id: l.id, tipo: d.tipo, motivo: String(d.motivo || "").slice(0, 300), urgente: !!d.urgente,
            citta: String(d.citta || "").slice(0, 80), impronta: impronta(perAI), classificato_il: new Date().toISOString(),
          }], "resolution=merge-duplicates,return=minimal");
        }
      }
    }

    /* 4) valutazioni dell'app agenti da acquisire */
    const val = await sb("GET",
      `valutazioni?select=id,created_at,agente,comune,zona,tipologia,mq,posti_letto,modello,fatturato_annuo,canone_annuo,margine_valente,punteggio` +
      `&verdetto=eq.acquisire&margine_valente=gte.${SOGLIA_MARGINE}&created_at=gte.${new Date(da).toISOString()}&order=margine_valente.desc`) as any[];
    const valNuove = (val || []).filter((v) => !visti.has("val-" + v.id));

    /* 5) il messaggio */
    const ordina = (a: Lead, b: Lead) => Number(!!b.urgente) - Number(!!a.urgente) || Date.parse(b.creato) - Date.parse(a.creato);
    const nonProprietario = (l: Lead) => ["ospite", "assistenza", "partnership"].includes(l.tipo || "");
    /* GESTIONE: chi su HubSpot ha esigenza Gestione, oppure nessuna esigenza ma
       l'AI ha letto che vuole affidare l'immobile. VENDITA: chi vuole vendere.
       Chi cerca casa da comprare, recruiting ecc. resta fuori. */
    const proprietari = leads.filter((l) => !nonProprietario(l) &&
      (l.esigenza === "Gestione" || (l.esigenza === "Non indicata" && l.tipo === "gestione"))).sort(ordina);
    const venditori = leads.filter((l) => !nonProprietario(l) && l.esigenza === "Vendita").sort(ordina);
    const inLista = new Set([...proprietari, ...venditori].map((l) => l.id));
    const agenzie = leads.filter((l) => l.tipo === "partnership");
    const conta = (t: string) => leads.filter((l) => !inLista.has(l.id) && l.tipo !== "partnership" && l.tipo === t).length;
    const contaEs = (e: string) => leads.filter((l) => !inLista.has(l.id) && l.tipo !== "partnership" && !["ospite", "assistenza"].includes(l.tipo || "") && l.esigenza === e).length;
    const giornoOra = (s: string) => new Date(s).toLocaleString("it-IT", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
    const giorno = (s: string) => new Date(s).toLocaleDateString("it-IT", { day: "numeric", month: "short", timeZone: "Europe/Rome" });

    const blocchi: string[] = [];
    const oggi = new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Rome" });
    blocchi.push(`📋 <b>Lead del ${esc(oggi)}</b>\n` +
      (proprietari.length || venditori.length || valNuove.length
        ? [`🏠 Gestione: ${proprietari.length}`, `🏷️ Vendita: ${venditori.length}`,
           valNuove.length ? `📊 Valutazioni da acquisire: ${valNuove.length}` : ""].filter(Boolean).join("\n")
        : "Nessun proprietario nuovo da chiamare."));

    /* Una scheda per proprietario, in un messaggio a sé: si copia o si inoltra
       a chi deve chiamare senza bisogno di aprire HubSpot. */
    const scheda = (l: Lead, i: number, tot: number, cosa: string, icona: string) => {
      const dove = l.cittaAI || l.citta;
      const righe = [
        `${l.urgente ? "🔴 URGENTE — " : icona + " "}<b>${cosa} ${i + 1} di ${tot}</b>`,
        `<b>Nome:</b> ${esc(l.nome)}`,
        `<b>Esigenza:</b> ${esc(l.esigenza === "Non indicata" ? "non indicata su HubSpot (dal messaggio sembra gestione)" : l.esigenza)}`,
        `<b>Telefono:</b> ${esc(l.telefono || "non indicato")}`,
        `<b>Email:</b> ${esc(l.email || "non indicata")}`,
        dove ? `<b>Zona:</b> ${esc(dove)}` : "",
        l.citta && l.cittaAI && l.citta !== l.cittaAI ? `<b>Indirizzo/città:</b> ${esc(l.citta)}` : "",
        ...l.dati.map(([k, v]) => `<b>${esc(k)}:</b> ${esc(v)}`),
        `<b>Arrivato:</b> ${esc(giornoOra(l.creato))} (${l.fonte === "sito" ? "sito Valente Living" : "HubSpot"})`,
        `<b>In sintesi:</b> ${esc(l.motivo || "")}`,
        l.testo.trim() ? `\n<b>Cosa ha scritto:</b>\n${esc(l.testo.trim().slice(0, 2800))}${l.testo.trim().length > 2800 ? "…" : ""}` : "",
      ];
      return righe.filter(Boolean).join("\n");
    };
    const schede: string[] = [
      ...proprietari.map((l, i) => scheda(l, i, proprietari.length, "GESTIONE", "🏠")),
      ...venditori.map((l, i) => scheda(l, i, venditori.length, "VENDITA", "🏷️")),
    ];

    if (valNuove.length) {
      blocchi.push("📊 <b>Valutazioni da acquisire</b>\n" + valNuove.map((v) =>
        `• <b>${euro(v.margine_valente)}</b> margine — ${esc([v.comune, v.zona].filter(Boolean).join(" · "))}, ` +
        `${esc([v.tipologia, v.posti_letto ? v.posti_letto + " p.l." : null].filter(Boolean).join(", "))} · ${esc(v.modello)}` +
        (v.agente ? ` · ${esc(v.agente)}` : "")).join("\n"));
    }

    if (agenzie.length) {
      blocchi.push("🤝 <b>Agenzie / collaborazioni</b>\n" + agenzie.map((l) =>
        `• <b>${esc(l.nome)}</b>${l.telefono ? " · " + esc(l.telefono) : ""}${l.email ? " · " + esc(l.email) : ""}\n  ${esc(l.motivo || "")}`).join("\n"));
    }

    const resto = [
      ["cercano casa da comprare", contaEs("Acquisto")], ["recruiting/HR", contaEs("Recruiting / HR")],
      ["ospiti", conta("ospite")], ["assistenza", conta("assistenza")],
      ["senza messaggio", leads.filter((l) => !inLista.has(l.id) && l.tipo === "senza_richiesta" && !["Acquisto", "Recruiting / HR"].includes(l.esigenza)).length],
      ["altro/spam", leads.filter((l) => !inLista.has(l.id) && l.tipo === "altro" && !["Acquisto", "Recruiting / HR"].includes(l.esigenza)).length],
    ].filter(([, n]) => Number(n) > 0).map(([t, n]) => `${n} ${t}`);
    if (resto.length) blocchi.push(`Scartati: ${resto.join(" · ")}`);
    if (problemi.length) blocchi.push("⚠️ " + esc(problemi.join(" | ")));

    /* 6) invio */
    const dest = (await sb("GET", "bot_utenti?select=chat_id&riceve_riepilogo_lead=eq.true") as { chat_id: number }[]);
    const intestazione = blocchi[0];
    const coda = aPezzi(blocchi.slice(1));
    const pezzi = [intestazione, ...schede.flatMap((t) => aPezzi([t], 4000)), ...coda];
    if (!prova) {
      for (const d of dest) for (const p of pezzi) await tgSend(d.chat_id, p);

      /* si segna solo ciò che ha un tipo: chi non è stato classificato torna domani */
      const righe = [
        ...leads.filter((l) => l.tipo).map((l) => ({ lead_id: l.id, fonte: l.fonte, tipo: l.tipo })),
        ...valNuove.map((v) => ({ lead_id: "val-" + v.id, fonte: "valutazione", tipo: "acquisire" })),
      ];
      if (righe.length) await sb("POST", "lead_riepilogati?on_conflict=lead_id", righe, "resolution=ignore-duplicates,return=minimal");
    }

    return new Response(JSON.stringify({
      ok: true, prova, giorni, destinatari: dest.length, messaggi: pezzi.length,
      proprietari: proprietari.length, venditori: venditori.length, valutazioni: valNuove.length, agenzie: agenzie.length,
      totale_lead: leads.length, problemi, anteprima: prova ? pezzi : undefined,
    }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message || e) }), { status: 500 });
  }
});
