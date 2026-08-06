// netlify/functions/kross-sync-background.mjs
// Sincronizza Kross → Supabase usando le API v5 (niente scraping, niente 2FA).
//
// Scrive su: kross_appartamenti, kross_prenotazioni, kross_addebiti, kross_documenti.
// Funzione "background": Netlify le concede fino a 15 minuti, il tempo che serve
// per rispettare il limite di 8 chiamate al minuto senza correre.
// NON e schedulata direttamente: la schedulazione sta in kross-sync-cron,
// perche Netlify risponde 403 alle chiamate HTTP verso funzioni schedulate.
//
// Modalita:
//   /.netlify/functions/kross-sync-background            → incrementale (solo cio che e cambiato)
//   /.netlify/functions/kross-sync-background?full=1     → ricarica completa dal 2025
//   /.netlify/functions/kross-sync-background?dal=2026   → ricarica completa da un anno preciso
//
// Girando in background la risposta HTTP e sempre 202: l'esito finisce in
// kross_stato.ultimo_esito e nei log della funzione.

import * as K from "./lib/kross.mjs";

const ANNO_MINIMO = 2025;      // dei dati precedenti non ci interessa nulla
const PAGINA = 200;

const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
const iso = (v) => (v ? String(v).replace(" ", "T") : null);
const ANNULLATE = new Set(["CANC", "CANCEL", "NOSHOW"]);

// ─────────────────── mappatura prenotazione API → riga tabella ───────────────────
function mappaPrenotazione(r) {
  const rooms = r.rooms || [];
  const nomi = [...new Set(rooms.map((x) => x.name_room_type).filter(Boolean))];
  const idrt = (rooms.find((x) => x.id_room_type) || {}).id_room_type || null;
  return {
    id_reservation: r.id_reservation,
    cod_reservation: r.cod_reservation || null,
    stato: r.cod_reservation_status || null,
    annullata: ANNULLATE.has(r.cod_reservation_status),
    canale: r.cod_channel || null,
    ota_id: r.ota_id ? String(r.ota_id) : null,
    id_room_type: idrt,
    appartamento: nomi.join(" + ") || null,
    ospite: r.label || null,
    email: r.email || null,
    telefono: r.phone ? String(r.phone) : null,
    paese: r.cod_country || null,
    lingua: r.lang || null,
    data_prenotazione: iso(r.date_reservation),
    arrivo: r.arrival || null,
    partenza: r.departure || null,
    notti: num(r.nights),
    ospiti: rooms.reduce((a, x) => a + (Number(x.qt_guests) || 0), 0) || null,
    alloggio: num(r.accommodation_total_amount),
    pulizie: num(r.cleaning_fee_amount),
    tassa_soggiorno: num(r.city_tax_amount),
    extra: num(r.other_extra_total_amount),
    totale_addebiti: num(r.charge_total_amount),
    incassato: num(r.payment_total_amount),
    commissione_ota: num(r.ota_commissions_collected),
    // Questi tre arrivano solo con with_owner_pm_reporting: se Kross non li
    // espone restano null e il rendiconto continua a usare la vecchia fonte.
    proprietario: r.owner_name || r.proprietario || null,
    quota_proprietario: num(r.owner_amount ?? r.quota_proprietario),
    quota_pm: num(r.pm_amount ?? r.quota_pm),
    lead_source: r.lead_source || null,
    note: r.note || null,
    ultimo_agg: iso(r.last_update),
    sincronizzato_il: new Date().toISOString(),
  };
}

function mappaAddebiti(r) {
  return (r.charges || []).map((c) => ({
    id_reservation: r.id_reservation,
    data: c.date || null,
    tipo: c.cod_charge_type || null,
    descrizione: c.charge_text || null,
    importo: num(c.amount),
    quantita: num(c.qt),
    iva: num(c.vat),
  }));
}

const TIPI_DOC = { F: "Fattura", R: "Ricevuta", NC: "Nota di credito", ND: "Nota di debito", PF: "Proforma", N: "Non fiscale" };

function mappaDocumento(d) {
  const cliente = [d.company, d.surname, d.name].filter(Boolean).join(" ").trim() || null;
  return {
    id_document: d.id_document,
    numero: d.number_document ? String(d.number_document) : null,
    data: d.date || null,
    tipo: d.cod_document || null,
    tipo_esteso: TIPI_DOC[d.cod_document] || d.cod_document || null,
    cliente,
    piva: d.vat || null,
    codice_fiscale: d.tax_code || null,
    citta: d.city || null,
    imponibile: num(d.total_amount),
    iva: num(d.total_vat),
    totale: num(d.total_amount_vat),
    id_reservation: d.id_reservation || null,
    sincronizzato_il: new Date().toISOString(),
  };
}

// ─────────────────── scarico prenotazioni ───────────────────
async function scaricaPrenotazioni(filtroBase, log) {
  const fuori = [];
  let off = 0;
  while (true) {
    const j = await K.chiamaConAttesa("/reservations/get-list", {
      ...filtroBase,
      cod_reservation_status_all: true,
      with_rooms: true,
      with_charges: true,
      with_owner_pm_reporting: true,
      limit: PAGINA,
      offset: off,
    });
    const d = j.data || [];
    fuori.push(...d);
    log(`  ${JSON.stringify(filtroBase)} offset ${off} → ${d.length}`);
    if (d.length < PAGINA) break;
    off += PAGINA;
  }
  return fuori;
}

async function salvaPrenotazioni(lista, log) {
  if (!lista.length) return 0;
  await K.upsert("kross_prenotazioni", lista.map(mappaPrenotazione), "id_reservation");

  // Gli addebiti si ricreano da zero per le prenotazioni toccate, cosi un
  // addebito cancellato in Kross sparisce anche qui invece di restare orfano.
  const ids = lista.map((r) => r.id_reservation);
  for (let i = 0; i < ids.length; i += 200) {
    const lotto = ids.slice(i, i + 200);
    await fetch(K.sbUrl("kross_addebiti", `?id_reservation=in.(${lotto.join(",")})`), {
      method: "DELETE", headers: K.sbHead({ Prefer: "return=minimal" }),
    });
  }
  const addebiti = lista.flatMap(mappaAddebiti);
  if (addebiti.length) {
    for (let i = 0; i < addebiti.length; i += 400) {
      const lotto = addebiti.slice(i, i + 400);
      const r = await fetch(K.sbUrl("kross_addebiti"), {
        method: "POST", headers: K.sbHead({ Prefer: "return=minimal" }), body: JSON.stringify(lotto),
      });
      if (!r.ok) throw new Error(`Scrittura kross_addebiti fallita: ${(await r.text()).slice(0, 250)}`);
    }
  }
  log(`  salvate ${lista.length} prenotazioni, ${addebiti.length} addebiti`);
  return lista.length;
}

// ─────────────────── anagrafica appartamenti ───────────────────
async function sincronizzaAppartamenti(log) {
  const rt = await K.chiamaConAttesa("/rooms/get-room-types", {
    with_additional_info: true, with_room_type_category: true,
  });
  const listings = await K.chiamaConAttesa("/otas/get-listings", {});
  const perTipo = {};
  (listings.data || []).forEach((l) => {
    if (!l.id_room_type) return;
    (l.channels || []).forEach((c) => {
      if (!c.id) return;
      perTipo[l.id_room_type] = perTipo[l.id_room_type] || new Set();
      perTipo[l.id_room_type].add(`${c.cod_channel}:${c.id}`);
    });
  });
  const righe = (rt.data || []).map((x) => ({
    id_room_type: x.id_room_type,
    nome_kross: x.name_room_type,
    citta: x.city || null,
    provincia: x.area || null,
    indirizzo: x.address || null,
    cap: x.post_code || null,
    lat: num(x.latitude),
    lng: num(x.longitude),
    max_ospiti: num(x.max_occupancy),
    camere: num(x.n_bedrooms),
    bagni: num(x.number_of_bathrooms),
    mq: num(x.size_sqm),
    cin: x.cin || null,
    cir: x.license_number || null,
    annunci_ota: perTipo[x.id_room_type] ? [...perTipo[x.id_room_type]].sort().join(", ") : null,
    check_in_da: x.check_in_from || null,
    check_out_entro: x.check_out_to || null,
    aggiornato_il: new Date().toISOString(),
  }));
  // NB: non tocchiamo proprieta_id / note_aggancio, che sono lavoro umano.
  await K.upsert("kross_appartamenti", righe, "id_room_type");
  log(`Anagrafica: ${righe.length} appartamenti`);
  return righe.length;
}

// ─────────────────── documenti ───────────────────
async function sincronizzaDocumenti(dal, al, log) {
  const j = await K.chiamaConAttesa("/documents/get-list", { date_from: dal, date_to: al, limit: 1000 });
  const righe = (j.data || []).map(mappaDocumento).filter((d) => d.id_document);
  if (righe.length) await K.upsert("kross_documenti", righe, "id_document");
  log(`Documenti ${dal} → ${al}: ${righe.length}`);
  return righe.length;
}

// ─────────────────── handler ───────────────────
export const handler = async (event) => {
  const righeLog = [];
  const log = (m) => { righeLog.push(m); console.log("[kross-sync]", m); };
  const qs = (event && event.queryStringParameters) || {};
  const completo = qs.full === "1" || !!qs.dal;
  const annoDa = Math.max(ANNO_MINIMO, parseInt(qs.dal || ANNO_MINIMO, 10) || ANNO_MINIMO);

  try {
    if (!K.SERVICE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY non configurata");
    if (!process.env.KROSS_API_KEY) throw new Error("Credenziali API Kross non configurate su Netlify");

    let totale = 0;
    await sincronizzaAppartamenti(log);

    if (completo) {
      const annoA = new Date().getFullYear() + 1;
      for (let a = annoDa; a <= annoA; a++) {
        const lista = await scaricaPrenotazioni(
          { check_out_date_from: `${a}-01-01`, check_out_date_to: `${a}-12-31` }, log);
        totale += await salvaPrenotazioni(lista, log);
      }
      for (let a = annoDa; a <= new Date().getFullYear(); a++) {
        await sincronizzaDocumenti(`${a}-01-01`, `${a}-12-31`, log);
      }
    } else {
      // Incrementale: riparto dall'ultima modifica vista, con un giorno di
      // margine per non perdere nulla ai bordi.
      const r = await fetch(K.sbUrl("kross_prenotazioni", "?select=ultimo_agg&order=ultimo_agg.desc.nullslast&limit=1"), { headers: K.sbHead() });
      const d = await r.json().catch(() => []);
      const ultimo = Array.isArray(d) && d[0] && d[0].ultimo_agg
        ? new Date(new Date(d[0].ultimo_agg).getTime() - 864e5)
        : new Date(Date.now() - 7 * 864e5);
      const da = ultimo.toISOString().slice(0, 19).replace("T", " ");
      log(`Incrementale da ${da}`);
      const lista = await scaricaPrenotazioni({ last_update_from: da }, log);
      totale += await salvaPrenotazioni(lista.filter((x) => (x.departure || "9999") >= `${ANNO_MINIMO}-01-01`), log);

      const oggi = new Date();
      const dal = new Date(oggi.getTime() - 45 * 864e5).toISOString().slice(0, 10);
      await sincronizzaDocumenti(dal, oggi.toISOString().slice(0, 10), log);
    }

    const esito = `${completo ? "Ricarica completa" : "Incrementale"}: ${totale} prenotazioni.`;
    await K.statoScrivi({ ultimo_sync: new Date().toISOString(), ultimo_esito: esito });
    log(esito);
    return { statusCode: 200, body: JSON.stringify({ ok: true, esito, log: righeLog }) };
  } catch (e) {
    const msg = String(e.message || e).slice(0, 400);
    await K.statoScrivi({ ultimo_sync: new Date().toISOString(), ultimo_esito: `ERRORE — ${msg}` }).catch(() => {});
    log("ERRORE " + msg);
    return { statusCode: 500, body: JSON.stringify({ ok: false, errore: msg, log: righeLog }) };
  }
};
