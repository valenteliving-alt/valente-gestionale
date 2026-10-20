import { useEffect, useMemo, useState, useCallback } from "react";

/* TRATTATIVE — il pezzo che mancava.

   Oggi il CRM conosce solo le proprietà che hanno già un mandato: il Workflow
   Lancio parte a cose fatte. Ma un immobile prima è un lead — un agente lo
   propone, si parla col proprietario, a volte si fa una valutazione, e solo
   alla fine (se va bene) diventa una proprietà.

   Tre stati soli, per scelta di Tommaso: proposta → in trattativa → chiusa.
   Meno passi da aggiornare significa più probabilità che vengano aggiornati
   davvero. Un funnel in sei fasi che nessuno tocca vale meno di uno in tre
   che resta vero.

   Due cose imparate dai dati e applicate qui:
   - chi porta la trattativa si sceglie da un elenco, non si scrive. Nelle
     valutazioni il campo libero ha prodotto "Desideria" e "Desideria
     Iovenitti" come se fossero due persone diverse;
   - la valutazione è un PASSO dentro la trattativa, non la trattativa. Alcuni
     lead non ne avranno mai una (quelli di Ratti arrivano per telefono). */

const SUPABASE_URL = "https://heabtbdmwbjlgujsisor.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhlYWJ0YmRtd2JqbGd1anNpc29yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMjA4NDgsImV4cCI6MjA5NTg5Njg0OH0.FRk1tARhQHylLjfhACorn6O_E7ommm47tBTfJHOVxAU";

function tok() {
  try { return (JSON.parse(localStorage.getItem("vl_sessione") || "null") || {}).access_token || SUPABASE_KEY; }
  catch { return SUPABASE_KEY; }
}
async function api(metodo, tabella, query = "", corpo) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabella}${query}`, {
    method: metodo,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${tok()}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  return { ok: r.ok, data: await r.json().catch(() => null) };
}

const STATI = [
  { k: "proposta",      eti: "Proposta",      col: "#8A8A8A", desc: "segnalata da un agente, non ancora lavorata" },
  { k: "in_trattativa", eti: "In trattativa", col: "#C09456", desc: "ci stiamo parlando" },
  { k: "chiusa",        eti: "Chiusa",        col: "#5B8C5A", desc: "vinta o persa" },
];
const statoDi = (k) => STATI.find((s) => s.k === k) || STATI[0];

const euro = (n) => (n == null || n === "" ? "—" : "€" + Math.round(Number(n)).toLocaleString("it-IT"));
const dataIt = (d) => (d ? new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const VUOTA = {
  indirizzo: "", comune: "", provincia: "", tipologia: "", posti_letto: "", modello: "",
  proprietario_nome: "", proprietario_telefono: "", proprietario_email: "",
  portata_da_id: "", condivisa_con_id: "", quota_portata_da: "", quota_condivisa: "",
  stato: "proposta", note: "",
};

export default function Trattative({ nomeAgente }) {
  const [righe, setRighe] = useState([]);
  const [colleghi, setColleghi] = useState([]);
  const [caricando, setCaricando] = useState(true);
  const [errore, setErrore] = useState("");
  const [filtro, setFiltro] = useState("aperte");
  const [modulo, setModulo] = useState(null);      // la trattativa in modifica, o VUOTA
  const [salvando, setSalvando] = useState(false);

  const carica = useCallback(async () => {
    setCaricando(true); setErrore("");
    const [t, c] = await Promise.all([
      api("GET", "v_trattative", "?select=*&order=aggiornata_il.desc&limit=500"),
      api("GET", "collaboratori", "?select=id,nome,ruolo,colore,attivo&order=nome.asc"),
    ]);
    if (!t.ok || !Array.isArray(t.data)) setErrore("Non riesco a leggere le trattative. Controlla di aver fatto l'accesso al CRM.");
    else setRighe(t.data);
    if (c.ok && Array.isArray(c.data)) setColleghi(c.data.filter((x) => x.attivo !== false));
    setCaricando(false);
  }, []);
  useEffect(() => { carica(); }, [carica]);

  const viste = useMemo(() => {
    if (filtro === "tutte") return righe;
    if (filtro === "chiuse") return righe.filter((r) => r.stato === "chiusa");
    return righe.filter((r) => r.stato !== "chiusa");
  }, [righe, filtro]);

  const conti = useMemo(() => {
    const aperte = righe.filter((r) => r.stato !== "chiusa");
    const vinte = righe.filter((r) => r.esito === "acquisita");
    const perse = righe.filter((r) => r.esito === "persa");
    const decise = vinte.length + perse.length;
    return {
      aperte: aperte.length,
      ferme: aperte.filter((r) => Number(r.giorni_ferma) > 21).length,
      vinte: vinte.length,
      perse: perse.length,
      /* Il tasso si mostra solo quando ci sono abbastanza trattative decise:
         "100% di successo" su due casi non è un dato, è un caso. */
      tasso: decise >= 5 ? Math.round((vinte.length / decise) * 100) : null,
      decise,
    };
  }, [righe]);

  const salva = async () => {
    const m = modulo;
    if (!String(m.comune || "").trim() && !String(m.indirizzo || "").trim()) {
      alert("Serve almeno il comune o l'indirizzo, altrimenti non si capisce di che immobile si parla.");
      return;
    }
    setSalvando(true);
    const corpo = {
      indirizzo: m.indirizzo || null, comune: m.comune || null, provincia: m.provincia || null,
      tipologia: m.tipologia || null, posti_letto: m.posti_letto ? Number(m.posti_letto) : null,
      modello: m.modello || null,
      proprietario_nome: m.proprietario_nome || null,
      proprietario_telefono: m.proprietario_telefono || null,
      proprietario_email: m.proprietario_email || null,
      portata_da_id: m.portata_da_id || null,
      condivisa_con_id: m.condivisa_con_id || null,
      quota_portata_da: m.quota_portata_da === "" ? null : Number(m.quota_portata_da),
      quota_condivisa: m.quota_condivisa === "" ? null : Number(m.quota_condivisa),
      stato: m.stato, note: m.note || null,
      aggiornata_il: new Date().toISOString(),
    };
    const r = m.id
      ? await api("PATCH", "trattative", `?id=eq.${m.id}`, corpo)
      : await api("POST", "trattative", "", [{ ...corpo, creata_da: nomeAgente || null }]);
    setSalvando(false);
    if (!r.ok) { alert("Salvataggio non riuscito."); return; }
    setModulo(null); carica();
  };

  /* Cambiare stato dall'elenco, senza aprire la scheda: è il gesto che si fa
     più spesso e se costa tre clic non lo fa nessuno. */
  const cambiaStato = async (t, stato) => {
    const patch = { stato, aggiornata_il: new Date().toISOString() };
    if (stato !== "chiusa") { patch.esito = null; patch.motivo_persa = null; patch.chiusa_il = null; }
    setRighe((p) => p.map((x) => (x.id === t.id ? { ...x, ...patch } : x)));   // risposta immediata
    const { ok } = await api("PATCH", "trattative", `?id=eq.${t.id}`, patch);
    if (!ok) { alert("Non sono riuscito a cambiare lo stato."); carica(); }
  };

  const chiudi = async (t, esito) => {
    let motivo = null;
    if (esito === "persa") {
      motivo = window.prompt("Perché è andata persa? (una riga — serve per capire cosa si ripete)");
      if (motivo === null) return;
    }
    const patch = { stato: "chiusa", esito, motivo_persa: motivo || null, chiusa_il: new Date().toISOString().slice(0, 10), aggiornata_il: new Date().toISOString() };
    setRighe((p) => p.map((x) => (x.id === t.id ? { ...x, ...patch } : x)));
    const { ok } = await api("PATCH", "trattative", `?id=eq.${t.id}`, patch);
    if (!ok) { alert("Non sono riuscito a chiudere la trattativa."); carica(); }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700 }}>Trattative</h1>
          <p style={{ fontSize: 12, color: "var(--gray)", marginTop: 4 }}>
            Gli immobili proposti, prima che diventino proprietà
          </p>
        </div>
        <button className="bp" onClick={() => setModulo({ ...VUOTA })}>+ Nuova trattativa</button>
      </div>

      <div className="gl" style={{ marginBottom: 16 }} />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <Riquadro titolo="Aperte" valore={conti.aperte} nota="proposte e in corso" />
        <Riquadro titolo="Ferme da oltre 3 settimane" valore={conti.ferme}
          nota={conti.ferme ? "nessuno le tocca da un po'" : "tutto in movimento"} allarme={conti.ferme > 0} />
        <Riquadro titolo="Acquisite" valore={conti.vinte} nota="diventate proprietà" />
        <Riquadro titolo="Tasso di successo"
          valore={conti.tasso == null ? "—" : conti.tasso + "%"}
          nota={conti.tasso == null ? `servono almeno 5 chiuse (ora ${conti.decise})` : `su ${conti.decise} chiuse`} />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {[["aperte", "Aperte"], ["chiuse", "Chiuse"], ["tutte", "Tutte"]].map(([k, eti]) => (
          <button key={k} onClick={() => setFiltro(k)}
            style={{
              padding: "6px 14px", borderRadius: 20, fontSize: 12.5, cursor: "pointer",
              border: "1px solid " + (filtro === k ? "var(--gold)" : "var(--cd)"),
              background: filtro === k ? "var(--gold)" : "var(--white)",
              color: filtro === k ? "#fff" : "var(--gray)", fontWeight: filtro === k ? 600 : 400,
            }}>{eti}</button>
        ))}
        <button className="bg" style={{ marginLeft: "auto" }} onClick={carica} disabled={caricando}>{caricando ? "…" : "↻"}</button>
      </div>

      {errore ? (
        <div style={{ padding: 20, background: "var(--white)", border: "1px solid var(--gl)", borderRadius: 12, fontSize: 13, color: "var(--red)" }}>{errore}</div>
      ) : caricando ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--gray)" }}>Carico…</div>
      ) : !viste.length ? (
        <div style={{ textAlign: "center", padding: 50, color: "var(--gray)", fontSize: 13, lineHeight: 1.6 }}>
          Nessuna trattativa {filtro === "aperte" ? "aperta" : filtro === "chiuse" ? "chiusa" : ""}.<br />
          <span style={{ fontSize: 12 }}>La prossima volta che un agente ti propone un immobile, mettilo qui: anche solo comune e nome del proprietario.</span>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {viste.map((t) => <Scheda key={t.id} t={t} onApri={() => setModulo({ ...t })} onStato={cambiaStato} onChiudi={chiudi} />)}
        </div>
      )}

      {modulo && (
        <Modulo m={modulo} setM={setModulo} colleghi={colleghi} salvando={salvando}
          onSalva={salva} onAnnulla={() => setModulo(null)} />
      )}
    </div>
  );
}

function Riquadro({ titolo, valore, nota, allarme }) {
  return (
    <div style={{
      flex: "1 1 150px", padding: "11px 14px", borderRadius: 10,
      background: allarme ? "rgba(217,48,37,.07)" : "var(--white)",
      border: "1px solid " + (allarme ? "rgba(217,48,37,.3)" : "var(--cd)"),
    }}>
      <div style={{ fontSize: 10.5, color: "var(--gray)", textTransform: "uppercase", letterSpacing: ".04em" }}>{titolo}</div>
      <div style={{ fontSize: 21, fontWeight: 700, color: allarme ? "#C5221F" : "inherit", lineHeight: 1.25 }}>{valore}</div>
      <div style={{ fontSize: 11, color: "var(--gray)" }}>{nota}</div>
    </div>
  );
}

function Scheda({ t, onApri, onStato, onChiudi }) {
  const s = statoDi(t.stato);
  const ferma = t.stato !== "chiusa" && Number(t.giorni_ferma) > 21;
  const titolo = [t.indirizzo, t.comune].filter(Boolean).join(", ") || "(immobile senza indirizzo)";
  return (
    <div className="card" style={{ cursor: "default", borderLeft: `3px solid ${t.esito === "persa" ? "#C5221F" : s.col}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600 }}>{titolo}</h3>
          <div style={{ fontSize: 12, color: "var(--gray)", marginTop: 3 }}>
            {[t.tipologia, t.posti_letto ? t.posti_letto + " posti letto" : null, t.modello].filter(Boolean).join(" · ") || "dettagli da raccogliere"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          {ferma && <span className="tag" style={{ background: "rgba(217,48,37,.12)", color: "#C5221F" }}>ferma da {t.giorni_ferma} giorni</span>}
          {t.esito && <span className="tag" style={{ background: t.esito === "acquisita" ? "#5B8C5A" : "#C5221F", color: "#fff" }}>{t.esito}</span>}
          <button onClick={onApri} className="bg" style={{ fontSize: 11.5, padding: "4px 11px" }}>Apri</button>
        </div>
      </div>

      {t.proprietario_nome && (
        <div style={{ fontSize: 12, marginTop: 8 }}>
          <strong style={{ fontWeight: 600 }}>{t.proprietario_nome}</strong>
          {t.proprietario_telefono && <span style={{ color: "var(--gray)" }}> · {t.proprietario_telefono}</span>}
        </div>
      )}

      {/* Chi la segue e come si divide. È il motivo per cui questa sezione
          esiste: senza, a fine trattativa non si ricorda più chi ha portato cosa. */}
      {(t.portata_da || t.condivisa_con) && (
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center", marginTop: 8, fontSize: 11.5, color: "var(--gray)" }}>
          {t.portata_da && <Persona nome={t.portata_da} colore={t.portata_colore} quota={t.quota_portata_da} eti="portata da" />}
          {t.condivisa_con && <Persona nome={t.condivisa_con} colore={t.condivisa_colore} quota={t.quota_condivisa} eti="con" />}
        </div>
      )}

      {t.verdetto && (
        <div style={{ fontSize: 11.5, color: "var(--gray)", marginTop: 7 }}>
          Valutata: <strong style={{ color: "inherit" }}>{t.verdetto}</strong>
          {t.punteggio != null && ` · ${t.punteggio}/100`}
          {t.margine_valente != null && ` · margine ${euro(t.margine_valente)}`}
        </div>
      )}

      {t.motivo_persa && <div style={{ fontSize: 11.5, color: "#C5221F", marginTop: 7, fontStyle: "italic" }}>Persa: {t.motivo_persa}</div>}
      {t.note && <div style={{ fontSize: 12, marginTop: 7, color: "var(--gray)", whiteSpace: "pre-wrap" }}>{t.note}</div>}

      {/* I tre stati in linea: un clic per spostarla avanti */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 11, paddingTop: 10, borderTop: "1px solid rgba(0,0,0,.05)" }}>
        {STATI.map((x) => (
          <button key={x.k} onClick={() => x.k === "chiusa" ? null : onStato(t, x.k)}
            disabled={x.k === "chiusa"}
            title={x.k === "chiusa" ? "Usa Acquisita o Persa" : x.desc}
            style={{
              padding: "4px 11px", fontSize: 11.5, borderRadius: 20, fontWeight: t.stato === x.k ? 600 : 400,
              border: "1px solid " + (t.stato === x.k ? x.col : "var(--cd)"),
              background: t.stato === x.k ? x.col : "transparent",
              color: t.stato === x.k ? "#fff" : "var(--gray)",
              cursor: x.k === "chiusa" ? "default" : "pointer", opacity: x.k === "chiusa" && t.stato !== "chiusa" ? .45 : 1,
            }}>{x.eti}</button>
        ))}
        {t.stato !== "chiusa" && (
          <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button onClick={() => onChiudi(t, "acquisita")} className="bg" style={{ fontSize: 11.5, padding: "4px 11px", color: "#3D6B3C", borderColor: "#5B8C5A" }}>✓ Acquisita</button>
            <button onClick={() => onChiudi(t, "persa")} className="bg" style={{ fontSize: 11.5, padding: "4px 11px", color: "#C5221F", borderColor: "rgba(217,48,37,.4)" }}>Persa</button>
          </span>
        )}
      </div>
    </div>
  );
}

function Persona({ nome, colore, quota, eti }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{ opacity: .8 }}>{eti}</span>
      <span style={{
        width: 18, height: 18, borderRadius: "50%", background: colore || "#94A3B8", color: "#fff",
        fontSize: 9, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}>{String(nome)[0].toUpperCase()}</span>
      <strong style={{ color: "inherit", fontWeight: 600 }}>{nome}</strong>
      {quota != null && quota !== "" && <span>({quota}%)</span>}
    </span>
  );
}

function Modulo({ m, setM, colleghi, salvando, onSalva, onAnnulla }) {
  const c = (k) => (e) => setM({ ...m, [k]: e.target.value });
  const stile = { width: "100%", padding: "8px 10px", border: "1px solid var(--cd)", borderRadius: 7, fontSize: 13 };
  return (
    <>
      <div onClick={onAnnulla} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 500 }} />
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: "min(460px, 100%)", zIndex: 501,
        background: "var(--white)", boxShadow: "-8px 0 30px rgba(0,0,0,.18)", overflowY: "auto", padding: 22,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>{m.id ? "Modifica trattativa" : "Nuova trattativa"}</h2>
          <button onClick={onAnnulla} style={{ background: "none", border: 0, fontSize: 22, cursor: "pointer", color: "var(--gray)" }}>×</button>
        </div>

        <Gruppo titolo="L'immobile" nota="Basta comune o indirizzo: il resto si sa dopo.">
          <input style={stile} placeholder="Indirizzo" value={m.indirizzo || ""} onChange={c("indirizzo")} />
          <div style={{ display: "flex", gap: 8 }}>
            <input style={{ ...stile, flex: 2 }} placeholder="Comune" value={m.comune || ""} onChange={c("comune")} />
            <input style={{ ...stile, flex: 1 }} placeholder="Prov." value={m.provincia || ""} onChange={c("provincia")} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input style={{ ...stile, flex: 2 }} placeholder="Tipologia (bilocale, villa…)" value={m.tipologia || ""} onChange={c("tipologia")} />
            <input style={{ ...stile, flex: 1 }} type="number" placeholder="Posti" value={m.posti_letto || ""} onChange={c("posti_letto")} />
          </div>
          <select style={stile} value={m.modello || ""} onChange={c("modello")}>
            <option value="">modello non ancora deciso</option>
            <option value="gestione">gestione</option>
            <option value="sublocazione">sublocazione</option>
          </select>
        </Gruppo>

        <Gruppo titolo="Il proprietario">
          <input style={stile} placeholder="Nome" value={m.proprietario_nome || ""} onChange={c("proprietario_nome")} />
          <input style={stile} placeholder="Telefono" value={m.proprietario_telefono || ""} onChange={c("proprietario_telefono")} />
          <input style={stile} placeholder="Email" value={m.proprietario_email || ""} onChange={c("proprietario_email")} />
        </Gruppo>

        <Gruppo titolo="Chi la segue" nota="I nomi vengono dall'elenco dei collaboratori: scritti a mano diventano doppioni.">
          <div style={{ display: "flex", gap: 8 }}>
            <select style={{ ...stile, flex: 2 }} value={m.portata_da_id || ""} onChange={c("portata_da_id")}>
              <option value="">portata da…</option>
              {colleghi.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
            </select>
            <input style={{ ...stile, flex: 1 }} type="number" placeholder="%" value={m.quota_portata_da ?? ""} onChange={c("quota_portata_da")} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <select style={{ ...stile, flex: 2 }} value={m.condivisa_con_id || ""} onChange={c("condivisa_con_id")}>
              <option value="">condivisa con… (facoltativo)</option>
              {colleghi.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
            </select>
            <input style={{ ...stile, flex: 1 }} type="number" placeholder="%" value={m.quota_condivisa ?? ""} onChange={c("quota_condivisa")} />
          </div>
        </Gruppo>

        <Gruppo titolo="Stato">
          <select style={stile} value={m.stato} onChange={c("stato")}>
            {STATI.map((s) => <option key={s.k} value={s.k}>{s.eti} — {s.desc}</option>)}
          </select>
          <textarea style={{ ...stile, minHeight: 90, resize: "vertical", fontFamily: "inherit" }}
            placeholder="Note: cosa vi siete detti, cosa aspetta, chi deve richiamare chi" value={m.note || ""} onChange={c("note")} />
        </Gruppo>

        <div style={{ display: "flex", gap: 9, marginTop: 18 }}>
          <button className="bp" onClick={onSalva} disabled={salvando}>{salvando ? "Salvo…" : "Salva"}</button>
          <button className="bg" onClick={onAnnulla} disabled={salvando}>Annulla</button>
        </div>

        {m.id && m.creata_il && (
          <div style={{ fontSize: 11, color: "var(--gray)", marginTop: 14 }}>
            Aperta il {dataIt(m.creata_il)}{m.creata_da ? ` da ${m.creata_da}` : ""}
          </div>
        )}
      </div>
    </>
  );
}

function Gruppo({ titolo, nota, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--gold)", marginBottom: 6 }}>{titolo}</div>
      {nota && <div style={{ fontSize: 11, color: "var(--gray)", marginBottom: 7, lineHeight: 1.4 }}>{nota}</div>}
      <div style={{ display: "grid", gap: 8 }}>{children}</div>
    </div>
  );
}
