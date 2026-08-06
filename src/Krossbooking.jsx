import { useState, useEffect, useCallback, useMemo } from "react";

/* Krossbooking — dati contabili letti dalle API ufficiali di Kross v5.
   Non sostituisce la contabilità interna: serve a vedere cosa dice davvero il
   gestionale, con la cascata del rendiconto già calcolata, e ad accorgersi
   quando il CRM e Kross non raccontano la stessa storia.

   Le tabelle kross_* sono alimentate dalla funzione kross-sync-background,
   che parla con le API. Qui si legge e basta. */

const SUPABASE_URL = "https://heabtbdmwbjlgujsisor.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhlYWJ0YmRtd2JqbGd1anNpc29yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMjA4NDgsImV4cCI6MjA5NTg5Njg0OH0.FRk1tARhQHylLjfhACorn6O_E7ommm47tBTfJHOVxAU";

function tokenSessione() {
  try { return (JSON.parse(localStorage.getItem("vl_sessione") || "null") || {}).access_token || null; }
  catch { return null; }
}

async function leggi(tabella, query = "") {
  const token = tokenSessione() || SUPABASE_KEY;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabella}${query}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
  });
  const d = await r.json().catch(() => null);
  return Array.isArray(d) ? d : [];
}

const EUR = (n) => (n === null || n === undefined ? "—" : "€ " + Number(n).toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 0 }));
const EUR2 = (n) => (n === null || n === undefined ? "—" : "€ " + Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const PCT = (n) => (n === null || n === undefined ? "—" : Number(n).toFixed(1).replace(".", ",") + "%");
const meseEsteso = (m) => {
  if (!m) return "—";
  const [a, mm] = m.split("-");
  const nomi = ["", "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
  return `${nomi[parseInt(mm, 10)] || mm} ${a}`;
};

/* ─────────────────────────── pezzi di interfaccia ─────────────────────────── */

const Kpi = ({ l, v, n, tono }) => (
  <div style={{
    flex: "1 1 170px", minWidth: 150, padding: "14px 16px", borderRadius: 12,
    background: "var(--card, #141414)", border: "1px solid var(--bordo, #262626)",
  }}>
    <div style={{ fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--gray, #8a8a8a)" }}>{l}</div>
    <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: tono === "male" ? "#e0745c" : tono === "bene" ? "#7bb08a" : "inherit" }}>{v}</div>
    {n && <div style={{ fontSize: 11, color: "var(--gray, #8a8a8a)", marginTop: 2 }}>{n}</div>}
  </div>
);

const Tab = ({ intestazioni, righe, vuoto = "Nessun dato." }) => (
  righe.length === 0
    ? <div style={{ padding: 30, textAlign: "center", color: "var(--gray, #8a8a8a)", fontSize: 13 }}>{vuoto}</div>
    : (
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>{intestazioni.map((h, i) => (
              <th key={i} style={{
                textAlign: typeof h === "object" && h.num ? "right" : "left",
                padding: "8px 10px", fontSize: 10, letterSpacing: 1, textTransform: "uppercase",
                color: "var(--gray, #8a8a8a)", borderBottom: "1px solid var(--bordo, #262626)", whiteSpace: "nowrap",
              }}>{typeof h === "object" ? h.l : h}</th>
            ))}</tr>
          </thead>
          <tbody>{righe.map((r, i) => (
            <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,.05)" }}>
              {r.map((c, j) => (
                <td key={j} style={{
                  padding: "8px 10px",
                  textAlign: typeof intestazioni[j] === "object" && intestazioni[j].num ? "right" : "left",
                  whiteSpace: j === 0 ? "normal" : "nowrap",
                }}>{c}</td>
              ))}
            </tr>
          ))}</tbody>
        </table>
      </div>
    )
);

/* ─────────────────────────── componente ─────────────────────────── */

export default function Krossbooking() {
  const [tab, setTab] = useState("panoramica");
  const [stato, setStato] = useState(null);
  const [pren, setPren] = useState(null);
  const [distinte, setDistinte] = useState([]);
  const [docs, setDocs] = useState([]);
  const [ric, setRic] = useState([]);
  const [app, setApp] = useState([]);
  const [anno, setAnno] = useState(String(new Date().getFullYear()));
  const [msg, setMsg] = useState("");
  const [occupato, setOccupato] = useState(false);

  const carica = useCallback(async () => {
    const [s, p, d, dc, r, a] = await Promise.all([
      leggi("kross_stato", "?id=eq.1&select=ultimo_sync,ultimo_esito"),
      leggi("v_kross_contabilita", "?select=*&order=partenza.desc&limit=5000"),
      leggi("v_kross_distinte", "?select=*&order=mese.desc&limit=3000"),
      leggi("kross_documenti", "?select=*&order=data.desc&limit=2000"),
      leggi("v_kross_riconciliazione", "?select=*&order=mese.desc&limit=60"),
      leggi("kross_appartamenti", "?select=*&order=nome_kross.asc"),
    ]);
    setStato(s[0] || {});
    setPren(p); setDistinte(d); setDocs(dc); setRic(r); setApp(a);
  }, []);
  useEffect(() => { carica(); }, [carica]);

  const sincronizza = async () => {
    setOccupato(true);
    setMsg("Sincronizzazione avviata. Kross concede 8 chiamate al minuto, quindi ci vogliono alcuni minuti: puoi continuare a lavorare e ricaricare più tardi.");
    try {
      await fetch("/.netlify/functions/kross-sync-background", { method: "POST" });
    } catch (_) { /* è una funzione in background: risponde subito, lavora dopo */ }
    setOccupato(false);
  };

  const anni = useMemo(() => {
    const s = new Set((pren || []).map((x) => (x.partenza || "").slice(0, 4)).filter(Boolean));
    return [...s].sort().reverse();
  }, [pren]);

  const prenAnno = useMemo(() => (pren || []).filter((x) => (x.partenza || "").startsWith(anno)), [pren, anno]);
  const distinteAnno = useMemo(() => distinte.filter((x) => (x.mese || "").startsWith(anno)), [distinte, anno]);
  const docsAnno = useMemo(() => docs.filter((x) => (x.data || "").startsWith(anno)), [docs, anno]);

  const somma = (arr, campo) => arr.reduce((a, x) => a + (Number(x[campo]) || 0), 0);

  if (pren === null) return <div style={{ textAlign: "center", padding: 60, color: "var(--gray, #8a8a8a)" }}>Caricamento dati Kross…</div>;

  const vuoto = pren.length === 0;
  const TABS = [
    ["panoramica", "Panoramica"],
    ["distinte", "Distinte proprietari"],
    ["prenotazioni", "Prenotazioni"],
    ["documenti", "Fatture Kross"],
    ["verifica", "Verifica"],
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 8 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700 }}>Krossbooking</h1>
          <p style={{ fontSize: 12, color: "var(--gray, #8a8a8a)", marginTop: 4 }}>
            Contabilità letta dalle API ufficiali del gestionale — prenotazioni, cascata del rendiconto, fatture
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select value={anno} onChange={(e) => setAnno(e.target.value)} style={{ padding: "7px 10px" }}>
            {(anni.length ? anni : [anno]).map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <button className="bg" onClick={carica}>Ricarica</button>
          <button className="bp" onClick={sincronizza} disabled={occupato}>Sincronizza da Kross</button>
        </div>
      </div>
      <div className="gl" style={{ marginBottom: 16 }} />

      <div style={{ fontSize: 11, color: "var(--gray, #8a8a8a)", marginBottom: 14 }}>
        {stato && stato.ultimo_sync
          ? <>Ultima sincronizzazione: <b>{new Date(stato.ultimo_sync).toLocaleString("it-IT")}</b> — {stato.ultimo_esito}</>
          : <>Mai sincronizzato. Premi “Sincronizza da Kross” per la prima carica.</>}
      </div>

      {msg && <div style={{ marginBottom: 14, fontSize: 13, color: "var(--gold, #c9a227)" }}>{msg}</div>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
        {TABS.map(([id, l]) => (
          <button key={id} className={tab === id ? "bp" : "bg"} onClick={() => setTab(id)}>{l}</button>
        ))}
      </div>

      {vuoto && (
        <div style={{ padding: 30, borderRadius: 12, border: "1px dashed var(--bordo, #262626)", textAlign: "center", color: "var(--gray, #8a8a8a)", fontSize: 13 }}>
          Nessuna prenotazione ancora sincronizzata.<br />
          Serve che su Netlify siano configurate <code>KROSS_API_KEY</code>, <code>KROSS_API_USER</code> e <code>KROSS_API_PASSWORD</code>, poi premi “Sincronizza da Kross”.
        </div>
      )}

      {!vuoto && tab === "panoramica" && (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
            <Kpi l="Totale ospiti" v={EUR(somma(prenAnno, "totale_ospite"))} n={`${prenAnno.length} prenotazioni`} />
            <Kpi l="Commissioni OTA" v={EUR(somma(prenAnno, "commissione_ota"))}
                 n={PCT(somma(prenAnno, "totale_ospite") ? 100 * somma(prenAnno, "commissione_ota") / somma(prenAnno, "totale_ospite") : null) + " del totale"} />
            <Kpi l="Pulizie" v={EUR(somma(prenAnno, "pulizie"))} />
            <Kpi l="Imposta di soggiorno" v={EUR(somma(prenAnno, "imposta_soggiorno"))} n="maturata, da versare" />
            <Kpi l="Provvigioni PM" v={EUR(somma(prenAnno, "provvigione_pm"))} n="solo gestioni conto terzi" />
            <Kpi l="Ai proprietari (netto)" v={EUR(somma(prenAnno, "proprietario_netto"))} n="dopo cedolare 21%" />
          </div>

          <h3 style={{ fontSize: 15, marginBottom: 8 }}>Andamento per mese</h3>
          <Tab
            intestazioni={["Mese", { l: "Pren.", num: true }, { l: "Notti", num: true }, { l: "Totale ospiti", num: true },
                           { l: "Comm. OTA", num: true }, { l: "% comm.", num: true }, { l: "Pulizie", num: true },
                           { l: "Imposta sogg.", num: true }, { l: "Trattenuto", num: true }]}
            righe={[...new Set(prenAnno.map((x) => x.mese).filter(Boolean))].sort().reverse().map((m) => {
              const r = prenAnno.filter((x) => x.mese === m);
              const tot = somma(r, "totale_ospite"), com = somma(r, "commissione_ota");
              return [meseEsteso(m), r.length, somma(r, "notti"), EUR(tot), EUR(com),
                      PCT(tot ? 100 * com / tot : null), EUR(somma(r, "pulizie")),
                      EUR(somma(r, "imposta_soggiorno")), EUR(somma(r, "trattenuto_gestione"))];
            })}
          />

          <h3 style={{ fontSize: 15, margin: "24px 0 8px" }}>Per appartamento</h3>
          <Tab
            intestazioni={["Appartamento", "Gestione", { l: "Pren.", num: true }, { l: "Notti", num: true },
                           { l: "Totale ospiti", num: true }, { l: "Comm. OTA", num: true }, { l: "% comm.", num: true },
                           { l: "Al proprietario", num: true }]}
            righe={[...new Set(prenAnno.map((x) => x.nome_kross || "(non collegato)"))].map((n) => {
              const r = prenAnno.filter((x) => (x.nome_kross || "(non collegato)") === n);
              const tot = somma(r, "totale_ospite"), com = somma(r, "commissione_ota");
              return { n, r, tot, com };
            }).sort((a, b) => b.tot - a.tot).map(({ n, r, tot, com }) => [
              n, r[0]?.tipo_gestione || "—", r.length, somma(r, "notti"), EUR(tot), EUR(com),
              PCT(tot ? 100 * com / tot : null),
              r[0]?.tipo_gestione === "sublocazione" ? "—" : EUR(somma(r, "proprietario_netto")),
            ])}
          />
        </>
      )}

      {!vuoto && tab === "distinte" && (
        <>
          <p style={{ fontSize: 12, color: "var(--gray, #8a8a8a)", marginBottom: 14 }}>
            La cascata come la calcola il gestionale: totale ospite → meno commissione OTA → meno pulizie →
            meno provvigione PM → meno cedolare 21%. La percentuale di provvigione e la base di calcolo si
            impostano per appartamento nella tabella <code>kross_appartamenti</code>.
            Le sublocazioni non hanno rendiconto: il ricavo resta tutto a Valente Living.
          </p>
          <Tab
            intestazioni={["Appartamento", "Mese", { l: "Pren.", num: true }, { l: "Totale ospite", num: true },
                           { l: "Comm. OTA", num: true }, { l: "Pulizie", num: true }, { l: "Netto OTA", num: true },
                           { l: "Provv. PM", num: true }, { l: "Propr. lordo", num: true }, { l: "Cedolare", num: true },
                           { l: "Propr. netto", num: true }]}
            righe={distinteAnno
              .filter((d) => d.tipo_gestione !== "sublocazione")
              .sort((a, b) => (b.mese || "").localeCompare(a.mese || "") || (a.nome_kross || "").localeCompare(b.nome_kross || ""))
              .map((d) => [
                d.nome_kross || "(non collegato)", meseEsteso(d.mese), d.prenotazioni,
                EUR2(d.totale_ospite), EUR2(d.commissione_ota), EUR2(d.pulizie), EUR2(d.netto_ota),
                EUR2(d.provvigione_pm), EUR2(d.proprietario_lordo), EUR2(d.cedolare), EUR2(d.proprietario_netto),
              ])}
            vuoto="Nessuna distinta per l'anno selezionato."
          />
        </>
      )}

      {!vuoto && tab === "prenotazioni" && (
        <Tab
          intestazioni={["Appartamento", "Codice", "Ospite", "Canale", "Arrivo", "Partenza", { l: "Notti", num: true },
                         { l: "Totale", num: true }, { l: "Comm. OTA", num: true }, { l: "%", num: true },
                         { l: "Imposta", num: true }, "Stato"]}
          righe={prenAnno.slice(0, 800).map((p) => [
            p.nome_kross || "(non collegato)", p.cod_reservation || "—", p.ospite || "—", p.canale || "—",
            p.arrivo || "—", p.partenza || "—", p.notti,
            EUR2(p.totale_ospite), EUR2(p.commissione_ota), PCT(p.perc_comm_ota), EUR2(p.imposta_soggiorno), p.stato,
          ])}
        />
      )}

      {!vuoto && tab === "documenti" && (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
            <Kpi l="Documenti" v={docsAnno.length} n={`anno ${anno}`} />
            <Kpi l="Fatture" v={docsAnno.filter((d) => d.tipo === "F").length} />
            <Kpi l="Note di credito" v={docsAnno.filter((d) => d.tipo === "NC").length} />
            <Kpi l="Totale fatturato" v={EUR(docsAnno.filter((d) => d.tipo === "F").reduce((a, d) => a + (Number(d.totale) || 0), 0))} />
          </div>
          <Tab
            intestazioni={["Numero", "Data", "Tipo", "Cliente", "P.IVA / CF", { l: "Imponibile", num: true }, { l: "IVA", num: true }, { l: "Totale", num: true }]}
            righe={docsAnno.slice(0, 800).map((d) => [
              d.numero || "—", d.data || "—", d.tipo_esteso || d.tipo, d.cliente || "—",
              d.piva || d.codice_fiscale || "—", EUR2(d.imponibile), EUR2(d.iva), EUR2(d.totale),
            ])}
          />
        </>
      )}

      {!vuoto && tab === "verifica" && (
        <>
          <p style={{ fontSize: 12, color: "var(--gray, #8a8a8a)", marginBottom: 14 }}>
            Confronto fra quello che dicono le API di Kross e la tabella <code>prenotazioni</code> alimentata
            dallo scraper notturno. Una differenza vuol dire che una delle due fonti non è aggiornata:
            finché le due colonne non coincidono, lo scraper non va spento.
          </p>
          <Tab
            intestazioni={["Mese", { l: "Pren. API", num: true }, { l: "Pren. scraper", num: true }, { l: "Diff.", num: true },
                           { l: "Alloggio API", num: true }, { l: "Alloggio scraper", num: true }, { l: "Diff. €", num: true }]}
            righe={ric.filter((r) => (r.mese || "") >= "2025-01").map((r) => [
              meseEsteso(r.mese), r.pren_api, r.pren_scraper,
              <span style={{ color: r.diff_prenotazioni ? "#e0745c" : "inherit" }}>{r.diff_prenotazioni}</span>,
              EUR(r.alloggio_api), EUR(r.alloggio_scraper),
              <span style={{ color: Math.abs(Number(r.diff_alloggio) || 0) > 1 ? "#e0745c" : "inherit" }}>{EUR(r.diff_alloggio)}</span>,
            ])}
          />

          <h3 style={{ fontSize: 15, margin: "24px 0 8px" }}>Appartamenti non collegati a una proprietà del CRM</h3>
          <Tab
            intestazioni={["Appartamento", "Città", "Indirizzo", "Aggancio"]}
            righe={app.filter((a) => !a.proprieta_id || String(a.note_aggancio || "").includes("VERIFICARE"))
              .map((a) => [a.nome_kross, a.citta || "—", a.indirizzo || "—", a.note_aggancio || "nessuno"])}
            vuoto="Tutti gli appartamenti Kross sono collegati."
          />
        </>
      )}
    </div>
  );
}
