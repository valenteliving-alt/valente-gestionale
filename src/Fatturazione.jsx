import { Fragment, useEffect, useMemo, useState, useCallback } from "react";
import Planner from "./Planner";

/* FATTURAZIONE E RENDICONTAZIONE — l'app per le fatture.

   Quattro schermate:
   · Planner       il calendario di Kross, con lo stato della fattura su ogni barra
   · Prenotazioni  l'elenco con ricerca; aprendo una riga si vede il calcolo e a chi andrebbe intestata
   · Criteri       le regole di fatturazione di ogni appartamento (commissione, base di calcolo,
                   sostituto d'imposta, chi fattura l'ospite…)
   · Impostazioni  stato della sincronizzazione con Kross, parametri generali, collegamento a Fatture in Cloud

   Fonti: viste v_planner, v_fat_prenotazione, v_fat_intestatario_calcolato e tabelle fat_regole,
   fat_config, fat_bozze. Tutto su Supabase, nulla viene emesso da qui: le bozze si approvano a mano. */

const SUPABASE_URL = "https://heabtbdmwbjlgujsisor.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhlYWJ0YmRtd2JqbGd1anNpc29yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMjA4NDgsImV4cCI6MjA5NTg5Njg0OH0.FRk1tARhQHylLjfhACorn6O_E7ommm47tBTfJHOVxAU";

const sessione = () => {
  try { return (JSON.parse(localStorage.getItem("vl_sessione") || "null") || {}).access_token || null; }
  catch { return null; }
};
const intest = (extra = {}) => ({ apikey: SUPABASE_KEY, Authorization: `Bearer ${sessione() || SUPABASE_KEY}`, ...extra });

async function leggi(tabella, query = "") {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabella}${query}`, { headers: intest() });
  const d = await r.json().catch(() => null);
  return Array.isArray(d) ? d : [];
}
/* PostgREST taglia a 1000 righe: si legge a pagine finché ce n'è. */
async function leggiTutto(tabella, query = "") {
  let tutte = [];
  for (let da = 0; da < 20000; da += 1000) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabella}${query}`, { headers: intest({ Range: `${da}-${da + 999}` }) });
    const d = await r.json().catch(() => null);
    if (!Array.isArray(d)) break;
    tutte = tutte.concat(d);
    if (d.length < 1000) break;
  }
  return tutte;
}
async function conta(tabella, filtro = "") {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabella}?select=*${filtro}`, { headers: intest({ Prefer: "count=exact", Range: "0-0" }) });
  const m = (r.headers.get("content-range") || "").split("/")[1];
  return m && m !== "*" ? Number(m) : null;
}
async function scrivi(tabella, filtro, corpo) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabella}?${filtro}`, {
    method: "PATCH", headers: intest({ "Content-Type": "application/json", Prefer: "return=minimal" }), body: JSON.stringify(corpo),
  });
  return r.ok;
}

const euro = (n) => (n == null || n === "" ? "—" : "€ " + Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const dataIt = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const oraIt = (t) => (t ? new Date(t).toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const MESI = ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
const meseEsteso = (m) => { if (!m) return "—"; const [a, mm] = m.split("-"); return `${MESI[parseInt(mm, 10) - 1] || mm} ${a}`; };

const CSS = `
.fat{font-family:'Inter',system-ui,sans-serif;color:#0F172A;--cd:#ECEEF3;--gl:#E2E8F0;--gray:#64748B;--gold:#6366F1;--white:#fff;--red:#E11D48}
.fat *{box-sizing:border-box}
.fat input,.fat select,.fat textarea{font:inherit;font-size:13px;background:#fff;border:1px solid var(--gl);color:#0F172A;padding:8px 11px;width:100%;outline:none;border-radius:9px}
.fat input:focus,.fat select:focus,.fat textarea:focus{border-color:var(--gold);box-shadow:0 0 0 3px rgba(99,102,241,.15)}
.fat input[type=checkbox]{width:auto}
.fat button{font:inherit;cursor:pointer;border-radius:9px}
.fat .bp{background:var(--gold);color:#fff;border:none;padding:9px 18px;font-size:12.5px;font-weight:600}
.fat .bp:disabled{opacity:.55;cursor:default}
.fat .bg{background:#fff;color:#475569;border:1px solid var(--gl);padding:7px 14px;font-size:12px;font-weight:500}
.fat .gl{height:1px;background:var(--gl)}
.fat .tag{display:inline-block;padding:2px 8px;font-size:10.5px;font-weight:600;background:var(--cd);color:var(--gray);border-radius:6px}
.fat .tag.ok{background:#E3F4EA;color:#1E7A46}.fat .tag.no{background:#FDE7E7;color:#B42318}.fat .tag.av{background:#FFF1D6;color:#9A5B00}
.fat table{width:100%;border-collapse:collapse;font-size:12.5px}
.fat th{text-align:left;font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:var(--gray);padding:8px 10px;border-bottom:1px solid var(--gl);white-space:nowrap}
.fat td{padding:9px 10px;border-bottom:1px solid var(--cd);vertical-align:top}
.fat tr.cl{cursor:pointer}.fat tr.cl:hover td{background:#F8F9FC}
.fat .num{text-align:right;white-space:nowrap}
.fat .box{background:#fff;border:1px solid var(--gl);border-radius:12px;padding:14px 16px}
.fat .lab{font-size:10px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--gray);margin-bottom:4px;display:block}
`;

const Riquadro = ({ t, v, n, allarme }) => (
  <div className="box" style={{ flex: "1 1 160px", minWidth: 150, borderColor: allarme ? "#F2B8B5" : undefined }}>
    <span className="lab">{t}</span>
    <div style={{ fontSize: 22, fontWeight: 700, color: allarme ? "#B42318" : undefined }}>{v}</div>
    {n && <div style={{ fontSize: 11, color: "var(--gray)", marginTop: 2 }}>{n}</div>}
  </div>
);

/* ───────────────────────────── Prenotazioni ───────────────────────────── */

function Prenotazioni() {
  const [righe, setRighe] = useState(null);
  const [cerca, setCerca] = useState("");
  const [mese, setMese] = useState("");
  const [soloAvvisi, setSoloAvvisi] = useState(false);
  const [aperta, setAperta] = useState(null);
  const [dett, setDett] = useState(null);
  const [limite, setLimite] = useState(100);

  useEffect(() => {
    leggiTutto("v_fat_prenotazione", "?select=*&order=arrivo.desc").then(setRighe);
  }, []);

  const mesi = useMemo(() => [...new Set((righe || []).map((r) => r.mese_rendiconto).filter(Boolean))].sort().reverse(), [righe]);

  const filtrate = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    return (righe || []).filter((r) => {
      if (mese && r.mese_rendiconto !== mese) return false;
      if (soloAvvisi && !(r.avvisi || []).length) return false;
      if (!q) return true;
      return [r.ospite, r.cod_reservation, r.nome_kross, r.nome_proprieta, r.email, r.canale, String(r.id_reservation)]
        .some((x) => String(x || "").toLowerCase().includes(q));
    });
  }, [righe, cerca, mese, soloAvvisi]);

  useEffect(() => { setLimite(100); }, [cerca, mese, soloAvvisi]);

  const apri = async (r) => {
    if (aperta === r.id_reservation) { setAperta(null); return; }
    setAperta(r.id_reservation); setDett(null);
    const [int, boz] = await Promise.all([
      leggi("v_fat_intestatario_calcolato", `?id_reservation=eq.${r.id_reservation}&select=*`),
      leggi("fat_bozze", `?id_reservation=eq.${r.id_reservation}&select=tipo,stato,totale,fic_numero`),
    ]);
    setDett({ int: int[0] || null, boz });
  };

  if (!righe) return <p style={{ color: "var(--gray)", fontSize: 13 }}>Carico le prenotazioni…</p>;

  const mostrate = filtrate.slice(0, limite);
  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <input value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca ospite, appartamento, numero prenotazione, email…" style={{ flex: "1 1 280px", maxWidth: 420 }} />
        <select value={mese} onChange={(e) => setMese(e.target.value)} style={{ width: 190 }}>
          <option value="">Tutti i mesi</option>
          {mesi.map((m) => <option key={m} value={m}>{meseEsteso(m)}</option>)}
        </select>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5 }}>
          <input type="checkbox" checked={soloAvvisi} onChange={(e) => setSoloAvvisi(e.target.checked)} /> Solo con avvisi
        </label>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--gray)" }}>{filtrate.length} prenotazioni</span>
      </div>
      <div className="box" style={{ padding: 0, overflowX: "auto" }}>
        <table>
          <thead><tr>
            <th>Soggiorno</th><th>Ospite</th><th>Appartamento</th><th>Canale</th>
            <th className="num">Totale ospite</th><th className="num">Provvigione</th><th className="num">Al proprietario</th><th>Avvisi</th>
          </tr></thead>
          <tbody>
            {mostrate.map((r) => (
              <Fragment key={r.id_reservation}>
                <tr className="cl" onClick={() => apri(r)}>
                  <td style={{ whiteSpace: "nowrap" }}>{dataIt(r.arrivo)} → {dataIt(r.partenza)}<div style={{ fontSize: 10.5, color: "var(--gray)" }}>{r.notti} notti · rendiconto {meseEsteso(r.mese_rendiconto)}</div></td>
                  <td>{r.ospite || "—"}<div style={{ fontSize: 10.5, color: "var(--gray)" }}>{r.cod_reservation}</div></td>
                  <td>{r.nome_proprieta || r.nome_kross}<div style={{ fontSize: 10.5, color: "var(--gray)" }}>{r.tipo_gestione}</div></td>
                  <td>{r.canale}</td>
                  <td className="num">{euro(r.totale_ospite)}</td>
                  <td className="num">{euro((Number(r.prov_netta) || 0) + (Number(r.prov_iva) || 0))}</td>
                  <td className="num">{euro(r.quota_proprietario_lorda)}</td>
                  <td>{(r.avvisi || []).length ? <span className="tag av">{r.avvisi.length}</span> : <span className="tag ok">ok</span>}</td>
                </tr>
                {aperta === r.id_reservation && (
                  <tr><td colSpan={8} style={{ background: "#FAFBFD" }}>
                    <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 12.5 }}>
                      <div style={{ minWidth: 260 }}>
                        <span className="lab">Come è calcolato</span>
                        <div>Alloggio: <b>{euro(r.alloggio)}</b> · Pulizie: <b>{euro(r.pulizie)}</b> · Tassa: <b>{euro(r.tassa)}</b></div>
                        <div>Commissione OTA: <b>{euro(r.ota)}</b> (+ IVA {euro(r.ota_iva)})</div>
                        <div>Base provvigione: <b>{euro(r.base_importo)}</b> ({String(r.base_calcolo || "").replace(/_/g, " ")})</div>
                        <div>Provvigione: <b>{euro(r.prov_netta)}</b> + IVA <b>{euro(r.prov_iva)}</b> ({r.comm_pct_netta != null ? Number(r.comm_pct_netta).toFixed(2) : "—"}% netto IVA)</div>
                        <div>Cedolare: <b>{euro(r.cedolare)}</b> · Netto proprietario: <b>{euro(r.netto_proprietario)}</b></div>
                      </div>
                      <div style={{ minWidth: 260, flex: 1 }}>
                        <span className="lab">A chi intestare la fattura</span>
                        {!dett ? "…" : dett.int ? (
                          <>
                            <div><b>{dett.int.denominazione || "—"}</b> <span className="tag">{dett.int.tipo}</span> <span className="tag">{dett.int.fonte}</span></div>
                            <div>P.IVA {dett.int.partita_iva || "—"} · CF {dett.int.codice_fiscale || "—"} · SDI {dett.int.codice_sdi || "—"} · PEC {dett.int.pec || "—"}</div>
                            <div>{[dett.int.indirizzo, dett.int.cap, dett.int.citta, dett.int.nazione].filter(Boolean).join(", ") || "indirizzo mancante"}</div>
                            {(dett.int.avvisi || []).map((a, i) => <div key={i} style={{ color: "#9A5B00" }}>⚠ {a}</div>)}
                          </>
                        ) : <div style={{ color: "var(--gray)" }}>Dati di fatturazione non ancora letti da Kross: parte dopo la prossima sincronizzazione.</div>}
                        {dett && dett.boz.length > 0 && <div style={{ marginTop: 6 }}>Bozze: {dett.boz.map((b, i) => <span key={i} className="tag" style={{ marginRight: 4 }}>{b.tipo} · {b.stato}</span>)}</div>}
                      </div>
                      {(r.avvisi || []).length > 0 && (
                        <div style={{ minWidth: 220 }}>
                          <span className="lab">Avvisi</span>
                          {r.avvisi.map((a, i) => <div key={i} style={{ color: "#9A5B00" }}>⚠ {a}</div>)}
                        </div>
                      )}
                    </div>
                  </td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        {filtrate.length === 0 && <div style={{ padding: 24, textAlign: "center", color: "var(--gray)", fontSize: 13 }}>Nessuna prenotazione con questi filtri.</div>}
      </div>
      {filtrate.length > limite && <div style={{ textAlign: "center", marginTop: 12 }}><button className="bg" onClick={() => setLimite(limite + 200)}>Mostra altre ({filtrate.length - limite})</button></div>}
    </div>
  );
}

/* ───────────────────────────── Criteri di fatturazione ───────────────────────────── */

const TRI = [["", "Da decidere"], ["true", "Sì"], ["false", "No"]];
const triVal = (v) => (v === null || v === undefined ? "" : String(v));
const triOut = (s) => (s === "" ? null : s === "true");

function Criteri() {
  const [regole, setRegole] = useState(null);
  const [nomi, setNomi] = useState({});
  const [cerca, setCerca] = useState("");
  const [aperto, setAperto] = useState(null);
  const [bozza, setBozza] = useState(null);
  const [msg, setMsg] = useState("");

  const carica = useCallback(async () => {
    const [r, a] = await Promise.all([
      leggi("fat_regole", "?select=*&order=id_room_type"),
      leggi("kross_appartamenti", "?select=id_room_type,nome_kross,citta"),
    ]);
    setRegole(r);
    setNomi(Object.fromEntries(a.map((x) => [x.id_room_type, `${x.nome_kross}${x.citta ? " · " + x.citta : ""}`])));
  }, []);
  useEffect(() => { carica(); }, [carica]);

  const conti = useMemo(() => {
    const r = regole || [];
    return {
      tot: r.length, conf: r.filter((x) => x.confermata).length, att: r.filter((x) => x.attiva_fatturazione).length,
      sost: r.filter((x) => x.sostituto_imposta === null).length, chi: r.filter((x) => x.chi_fattura_ospite === null).length,
    };
  }, [regole]);

  const elenco = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    return (regole || []).filter((r) => !q || String(nomi[r.id_room_type] || "").toLowerCase().includes(q))
      .sort((a, b) => String(nomi[a.id_room_type] || "").localeCompare(String(nomi[b.id_room_type] || ""), "it"));
  }, [regole, nomi, cerca]);

  const apri = (r) => { setMsg(""); if (aperto === r.id_room_type) { setAperto(null); setBozza(null); } else { setAperto(r.id_room_type); setBozza({ ...r }); } };
  const set = (k, v) => setBozza((b) => ({ ...b, [k]: v }));

  const salva = async () => {
    const b = bozza;
    const corpo = {
      modello: b.modello, commissione: b.commissione === "" ? null : Number(b.commissione), commissione_iva_inclusa: !!b.commissione_iva_inclusa,
      base_calcolo: b.base_calcolo, addebita_ota_al_proprietario: !!b.addebita_ota_al_proprietario,
      addebita_pulizie_al_proprietario: !!b.addebita_pulizie_al_proprietario, sostituto_imposta: b.sostituto_imposta,
      cedolare_pct: b.cedolare_pct === "" || b.cedolare_pct == null ? null : Number(b.cedolare_pct),
      chi_fattura_ospite: b.chi_fattura_ospite, iva_alloggio: b.iva_alloggio === "" || b.iva_alloggio == null ? null : Number(b.iva_alloggio),
      pulizie_iva_inclusa: !!b.pulizie_iva_inclusa, confermata: !!b.confermata, attiva_fatturazione: !!b.confermata && !!b.attiva_fatturazione,
      note: b.note || null, aggiornato_il: new Date().toISOString(),
    };
    const ok = await scrivi("fat_regole", `id_room_type=eq.${b.id_room_type}`, corpo);
    setMsg(ok ? "Salvato." : "Non sono riuscito a salvare: controlla di aver fatto l'accesso al CRM.");
    if (ok) await carica();
  };

  if (!regole) return <p style={{ color: "var(--gray)", fontSize: 13 }}>Carico le regole…</p>;

  const Campo = ({ l, children, w = 190 }) => <div style={{ flex: `1 1 ${w}px`, minWidth: w - 40 }}><span className="lab">{l}</span>{children}</div>;

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <Riquadro t="Appartamenti" v={conti.tot} n="con una regola" />
        <Riquadro t="Regole confermate" v={`${conti.conf}/${conti.tot}`} n="le altre non emettono nulla" allarme={conti.conf < conti.tot} />
        <Riquadro t="Fatturazione accesa" v={conti.att} n="appartamenti" />
        <Riquadro t="Sostituto d'imposta" v={conti.sost} n="da decidere" allarme={conti.sost > 0} />
        <Riquadro t="Chi fattura l'ospite" v={conti.chi} n="da decidere" allarme={conti.chi > 0} />
      </div>
      <input value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca appartamento…" style={{ maxWidth: 340, marginBottom: 12 }} />
      <div className="box" style={{ padding: 0, overflowX: "auto" }}>
        <table>
          <thead><tr><th>Appartamento</th><th>Modello</th><th className="num">Commissione</th><th>Base di calcolo</th><th>Sostituto</th><th>Chi fattura l'ospite</th><th>Stato</th></tr></thead>
          <tbody>
            {elenco.map((r) => (
              <Fragment key={r.id_room_type}>
                <tr className="cl" onClick={() => apri(r)}>
                  <td><b>{nomi[r.id_room_type] || `#${r.id_room_type}`}</b></td>
                  <td>{r.modello}</td>
                  <td className="num">{r.commissione != null ? `${r.commissione}%${r.commissione_iva_inclusa ? " (IVA incl.)" : ""}` : "—"}</td>
                  <td>{String(r.base_calcolo).replace(/_/g, " ")}</td>
                  <td>{r.sostituto_imposta === null ? <span className="tag av">da decidere</span> : r.sostituto_imposta ? "sì" : "no"}</td>
                  <td>{r.chi_fattura_ospite === null ? <span className="tag av">da decidere</span> : r.chi_fattura_ospite}</td>
                  <td>{r.attiva_fatturazione ? <span className="tag ok">accesa</span> : r.confermata ? <span className="tag">confermata</span> : <span className="tag no">non confermata</span>}</td>
                </tr>
                {aperto === r.id_room_type && bozza && (
                  <tr><td colSpan={7} style={{ background: "#FAFBFD" }}>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <Campo l="Modello"><select value={bozza.modello} onChange={(e) => set("modello", e.target.value)}><option value="gestione">Gestione per conto terzi</option><option value="sublocazione">Sublocazione</option></select></Campo>
                      <Campo l="Commissione %" w={140}><input type="number" step="0.01" value={bozza.commissione ?? ""} onChange={(e) => set("commissione", e.target.value)} /></Campo>
                      <Campo l="Commissione con IVA inclusa" w={170}><select value={String(!!bozza.commissione_iva_inclusa)} onChange={(e) => set("commissione_iva_inclusa", e.target.value === "true")}><option value="false">No, IVA a parte</option><option value="true">Sì, già con IVA</option></select></Campo>
                      <Campo l="Base di calcolo" w={230}><select value={bozza.base_calcolo} onChange={(e) => set("base_calcolo", e.target.value)}>
                        <option value="alloggio_meno_ota">Alloggio meno commissione OTA</option><option value="alloggio_lordo">Alloggio lordo</option><option value="lordo_ospite">Totale pagato dall'ospite</option></select></Campo>
                      <Campo l="Commissione OTA a carico del proprietario" w={200}><select value={String(!!bozza.addebita_ota_al_proprietario)} onChange={(e) => set("addebita_ota_al_proprietario", e.target.value === "true")}><option value="true">Sì</option><option value="false">No</option></select></Campo>
                      <Campo l="Pulizie a carico del proprietario" w={200}><select value={String(!!bozza.addebita_pulizie_al_proprietario)} onChange={(e) => set("addebita_pulizie_al_proprietario", e.target.value === "true")}><option value="true">Sì</option><option value="false">No</option></select></Campo>
                      <Campo l="Facciamo da sostituto d'imposta" w={200}><select value={triVal(bozza.sostituto_imposta)} onChange={(e) => set("sostituto_imposta", triOut(e.target.value))}>{TRI.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></Campo>
                      <Campo l="Cedolare %" w={120}><input type="number" step="0.01" value={bozza.cedolare_pct ?? ""} onChange={(e) => set("cedolare_pct", e.target.value)} /></Campo>
                      <Campo l="Chi fattura l'ospite" w={200}><select value={bozza.chi_fattura_ospite ?? ""} onChange={(e) => set("chi_fattura_ospite", e.target.value || null)}>
                        <option value="">Da decidere</option><option value="valente">Valente</option><option value="proprietario">Il proprietario</option><option value="non_emessa">Nessuna fattura</option></select></Campo>
                      <Campo l="IVA alloggio %" w={120}><input type="number" step="0.01" value={bozza.iva_alloggio ?? ""} onChange={(e) => set("iva_alloggio", e.target.value)} /></Campo>
                      <Campo l="Pulizie: importo con IVA inclusa" w={200}><select value={String(!!bozza.pulizie_iva_inclusa)} onChange={(e) => set("pulizie_iva_inclusa", e.target.value === "true")}><option value="true">Sì</option><option value="false">No, IVA da aggiungere</option></select></Campo>
                      <Campo l="Note" w={320}><textarea rows={2} value={bozza.note || ""} onChange={(e) => set("note", e.target.value)} /></Campo>
                    </div>
                    <div style={{ display: "flex", gap: 18, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
                      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5 }}><input type="checkbox" checked={!!bozza.confermata} onChange={(e) => set("confermata", e.target.checked)} /> Regola confermata da Tommaso</label>
                      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, opacity: bozza.confermata ? 1 : .5 }}><input type="checkbox" disabled={!bozza.confermata} checked={!!bozza.attiva_fatturazione && !!bozza.confermata} onChange={(e) => set("attiva_fatturazione", e.target.checked)} /> Accendi la fatturazione</label>
                      <button className="bp" onClick={salva}>Salva</button>
                      {msg && <span style={{ fontSize: 12.5, color: msg === "Salvato." ? "#1E7A46" : "#B42318" }}>{msg}</span>}
                    </div>
                  </td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ───────────────────────────── Impostazioni ───────────────────────────── */

const SPIEGA = {
  modalita: "prova = si preparano bozze ma non parte nulla verso Fatture in Cloud",
  iva_ordinaria: "IVA standard, %", iva_sublocazione: "IVA sulle sublocazioni, % (da confermare col commercialista)",
  pulizie_iva_inclusa: "le pulizie addebitate all'ospite sono già con IVA?", metodo_competenza: "il rendiconto si fa nel mese del check-in, sull'intera prenotazione",
  fic_sezionale: "sezionale di numerazione su Fatture in Cloud (lo decide il commercialista)", fic_company_id: "ID azienda su Fatture in Cloud (si compila al collegamento)",
};

function Impostazioni() {
  const [stato, setStato] = useState(null);
  const [conf, setConf] = useState(null);
  const [num, setNum] = useState(null);
  const [sync, setSync] = useState("");
  const [lavoro, setLavoro] = useState(false);

  const caricaStato = useCallback(async () => {
    const s = await leggi("kross_stato", "?select=ultimo_sync,ultimo_esito,token_scade&limit=1");
    setStato(s[0] || null);
    return s[0] || null;
  }, []);

  useEffect(() => {
    caricaStato();
    leggi("fat_config", "?select=*&order=chiave").then(setConf);
    Promise.all([
      conta("fat_kross_billing"),
      conta("fat_bozze", "&stato=eq.bozza"),
      conta("fat_bozze", "&stato=eq.emessa"),
      conta("v_fat_prenotazione", "&avvisi=neq.{}"),
    ]).then(([b, bo, em, av]) => setNum({ billing: b, bozze: bo, emesse: em, avvisi: av }));
  }, [caricaStato]);

  const sincronizza = async () => {
    setLavoro(true); setSync("Avviata. Di solito ci mette un paio di minuti…");
    const prima = stato?.ultimo_sync;
    try { await fetch("/.netlify/functions/kross-sync-background", { method: "POST" }); } catch { /* la funzione parte comunque in background */ }
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 6000));
      const s = await caricaStato();
      if (s && s.ultimo_sync !== prima) { setSync("Sincronizzazione completata."); setLavoro(false); return; }
    }
    setSync("Non vedo ancora la fine. Può essere solo lenta: ricarica fra un minuto.");
    setLavoro(false);
  };

  const salvaConf = async (c, v) => {
    const ok = await scrivi("fat_config", `chiave=eq.${encodeURIComponent(c)}`, { valore: v === "" ? null : v, aggiornato_il: new Date().toISOString() });
    if (ok) setConf((x) => x.map((r) => (r.chiave === c ? { ...r, valore: v === "" ? null : v } : r)));
    return ok;
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="box">
        <span className="lab">Sincronizzazione con Kross</span>
        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <button className="bp" onClick={sincronizza} disabled={lavoro}>{lavoro ? "In corso…" : "↻ Sincronizza adesso"}</button>
          <div style={{ fontSize: 12.5 }}>
            Ultima: <b>{oraIt(stato?.ultimo_sync)}</b>{stato?.ultimo_esito ? <> · {stato.ultimo_esito}</> : null}
            <div style={{ color: "var(--gray)", fontSize: 11.5 }}>In automatico una volta al giorno, la mattina presto. {sync}</div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Riquadro t="Dati di fatturazione letti" v={num?.billing ?? "…"} n="prenotazioni con dati da Kross" allarme={num && num.billing === 0} />
        <Riquadro t="Bozze da approvare" v={num?.bozze ?? "…"} />
        <Riquadro t="Fatture emesse" v={num?.emesse ?? "…"} />
        <Riquadro t="Prenotazioni con avvisi" v={num?.avvisi ?? "…"} n="vedi elenco Prenotazioni" allarme={num && num.avvisi > 0} />
      </div>

      <div className="box">
        <span className="lab">Parametri generali</span>
        {!conf ? "…" : conf.map((c) => <ParametroRiga key={c.chiave} c={c} salva={salvaConf} />)}
      </div>

      <div className="box">
        <span className="lab">Fatture in Cloud</span>
        <div style={{ fontSize: 12.5 }}>
          {conf?.find((c) => c.chiave === "fic_company_id")?.valore
            ? <>Collegato all'azienda <b>{conf.find((c) => c.chiave === "fic_company_id").valore}</b>. Si inseriscono solo bozze: l'invio allo SdI resta manuale.</>
            : <>Non ancora collegato. Servono il token di accesso (lo metto io nelle variabili d'ambiente di Netlify, non in chat) e il sezionale deciso dal commercialista.</>}
        </div>
      </div>
    </div>
  );
}

function ParametroRiga({ c, salva }) {
  const [v, setV] = useState(c.valore ?? "");
  const [ok, setOk] = useState(null);
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--cd)", flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 260px" }}><b style={{ fontSize: 12.5 }}>{c.chiave}</b><div style={{ fontSize: 11, color: "var(--gray)" }}>{SPIEGA[c.chiave] || c.nota || ""}</div></div>
      <input value={v} onChange={(e) => { setV(e.target.value); setOk(null); }} style={{ width: 200 }} />
      <button className="bg" disabled={v === (c.valore ?? "")} onClick={async () => setOk(await salva(c.chiave, v))}>Salva</button>
      {ok === true && <span style={{ fontSize: 12, color: "#1E7A46" }}>✓</span>}
      {ok === false && <span style={{ fontSize: 12, color: "#B42318" }}>errore</span>}
    </div>
  );
}

/* ───────────────────────────── Pagina ───────────────────────────── */

const TABS = [["planner", "🗓️ Planner"], ["prenotazioni", "📋 Prenotazioni"], ["criteri", "⚖️ Criteri di fatturazione"], ["impostazioni", "⚙️ Impostazioni"]];

export default function Fatturazione() {
  const [tab, setTab] = useState("planner");
  const loggato = !!sessione();
  return (
    <div className="fat">
      <style>{CSS}</style>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-.02em" }}>Fatturazione</h1>
        <p style={{ fontSize: 12, color: "var(--gray)", marginTop: 4 }}>Prenotazioni da Kross, regole per appartamento, bozze per Fatture in Cloud. Modalità prova: non parte nessuna fattura.</p>
      </div>
      {!loggato && <div className="box" style={{ marginBottom: 14, borderColor: "#F2B8B5" }}>Non risulti collegato. Apri il CRM, accedi, poi torna qui.</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {TABS.map(([k, t]) => <button key={k} className={tab === k ? "bp" : "bg"} onClick={() => setTab(k)}>{t}</button>)}
      </div>
      {tab === "planner" && <Planner />}
      {tab === "prenotazioni" && <Prenotazioni />}
      {tab === "criteri" && <Criteri />}
      {tab === "impostazioni" && <Impostazioni />}
    </div>
  );
}
