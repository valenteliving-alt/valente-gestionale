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
   Body opzionale: { giorni: 3, prova: true }  (prova = non segna come inviati)
   Schedulata da pg_cron (job "riepilogo-lead-telegram"). */

const TG_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const AKEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP = "https://valentelivingcrm.netlify.app";
const HUBSPOT_PORTAL = "25704633";
const SOGLIA_MARGINE = 10000;

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
  tipo?: string; motivo?: string; urgente?: boolean; cittaAI?: string;
};

Deno.serve(async (req) => {
  try {
    /* 1) autorizzazione: solo chi conosce la chiave (pg_cron) */
    const cfg = await sb("GET", "riepilogo_lead_config?select=chiave,valore") as { chiave: string; valore: string }[];
    const key = cfg.find((c) => c.chiave === "cron_key")?.valore;
    if (!key || req.headers.get("x-riepilogo-key") !== key) return new Response("unauthorized", { status: 401 });

    let opz: { giorni?: number; prova?: boolean } = {};
    try { opz = await req.json(); } catch { /* niente body */ }
    const giorni = Math.min(Math.max(Number(opz.giorni) || 3, 1), 30);
    const prova = !!opz.prova;
    const da = Date.now() - giorni * 86400000;

    const [giaInviati, nascosti] = await Promise.all([
      sb("GET", "lead_riepilogati?select=lead_id") as Promise<{ lead_id: string }[]>,
      sb("GET", "lead_nascosti?select=id") as Promise<{ id: string }[]>,
    ]);
    const visti = new Set(giaInviati.map((x) => String(x.lead_id)));
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
        const testo = [p.descrizione, p.message, p.messaggio, p.richiesta]
          .map((x: unknown) => String(x || "").trim())
          .find((x: string) => x.length > 2 && !/^\d{4}-\d{2}-\d{2}T/.test(x)) || "";
        leads.push({
          id, fonte: "hubspot", nome: l.nome || l.email || "Senza nome", telefono: l.telefono || "",
          email: l.email || "", citta: l.citta || "", creato: l.createdate, testo,
          link: `https://app.hubspot.com/contacts/${HUBSPOT_PORTAL}/record/0-1/${id}`,
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
        testo: [l.messaggio, l.note, dettaglio].filter(Boolean).join(" — "), link: `${APP}/?view=lead`,
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
        else if (l.testo.trim().length < 15) l.tipo = "senza_richiesta";
        else {
          const d = await classifica(l.nome, l.testo);
          if (!d) continue; // resta senza tipo: si riprova al prossimo giro
          Object.assign(l, { tipo: d.tipo, motivo: String(d.motivo || ""), urgente: !!d.urgente, cittaAI: String(d.citta || "") });
          await sb("POST", "lead_classificato?on_conflict=id", [{
            id: l.id, tipo: d.tipo, motivo: String(d.motivo || "").slice(0, 300), urgente: !!d.urgente,
            citta: String(d.citta || "").slice(0, 80), impronta: impronta(l.testo), classificato_il: new Date().toISOString(),
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
    const proprietari = leads.filter((l) => l.tipo === "gestione")
      .sort((a, b) => Number(!!b.urgente) - Number(!!a.urgente) || Date.parse(b.creato) - Date.parse(a.creato));
    const agenzie = leads.filter((l) => l.tipo === "partnership");
    const conta = (t: string) => leads.filter((l) => l.tipo === t).length;
    const giorno = (s: string) => new Date(s).toLocaleDateString("it-IT", { day: "numeric", month: "short", timeZone: "Europe/Rome" });

    const blocchi: string[] = [];
    const oggi = new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Rome" });
    blocchi.push(`📋 <b>Lead del ${esc(oggi)}</b>\n` +
      (proprietari.length || valNuove.length
        ? `${proprietari.length} proprietar${proprietari.length === 1 ? "io" : "i"} da chiamare` + (valNuove.length ? ` · ${valNuove.length} valutazion${valNuove.length === 1 ? "e" : "i"} da acquisire` : "")
        : "Nessun proprietario nuovo da chiamare."));

    proprietari.forEach((l, i) => {
      const dove = l.cittaAI || l.citta;
      const estratto = l.testo.replace(/\s+/g, " ").trim().slice(0, 220);
      blocchi.push(
        `${l.urgente ? "🔴" : "🏠"} <b>${i + 1}. ${esc(l.nome)}</b>${dove ? " — " + esc(dove) : ""}\n` +
        (l.telefono ? `📞 ${esc(l.telefono)}\n` : "") +
        (l.email ? `✉️ ${esc(l.email)}\n` : "") +
        `💬 ${esc(l.motivo || "")}\n` +
        (estratto && estratto !== l.motivo ? `<i>"${esc(estratto)}${l.testo.length > 220 ? "…" : ""}"</i>\n` : "") +
        `${l.fonte === "sito" ? "🌐 dal sito" : "🔗"} · ${esc(giorno(l.creato))} · <a href="${l.link}">apri</a>`);
    });

    if (valNuove.length) {
      blocchi.push("📊 <b>Valutazioni da acquisire</b>\n" + valNuove.map((v) =>
        `• <b>${euro(v.margine_valente)}</b> margine — ${esc([v.comune, v.zona].filter(Boolean).join(" · "))}, ` +
        `${esc([v.tipologia, v.posti_letto ? v.posti_letto + " p.l." : null].filter(Boolean).join(", "))} · ${esc(v.modello)}` +
        (v.agente ? ` · ${esc(v.agente)}` : "")).join("\n"));
    }

    if (agenzie.length) {
      blocchi.push("🤝 <b>Agenzie / collaborazioni</b>\n" + agenzie.map((l) =>
        `• ${esc(l.nome)}${l.telefono ? " · " + esc(l.telefono) : ""} — ${esc(l.motivo || "")}`).join("\n"));
    }

    const resto = [
      ["ospiti", conta("ospite")], ["assistenza", conta("assistenza")],
      ["senza messaggio", conta("senza_richiesta")], ["altro/spam", conta("altro")],
    ].filter(([, n]) => Number(n) > 0).map(([t, n]) => `${n} ${t}`);
    if (resto.length) blocchi.push(`Scartati: ${resto.join(" · ")}`);
    if (problemi.length) blocchi.push("⚠️ " + esc(problemi.join(" | ")));

    /* 6) invio */
    const dest = (await sb("GET", "bot_utenti?select=chat_id&riceve_riepilogo_lead=eq.true") as { chat_id: number }[]);
    const pezzi = aPezzi(blocchi);
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
      proprietari: proprietari.length, valutazioni: valNuove.length, agenzie: agenzie.length,
      totale_lead: leads.length, problemi, anteprima: prova ? pezzi : undefined,
    }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message || e) }), { status: 500 });
  }
});
