import { useState, useEffect, useCallback, useMemo } from "react";

/* Team & Accessi — pannello del titolare.
   Da qui si gestiscono le persone, il loro ruolo di accesso e si vede
   a colpo d'occhio quali immobili vede ognuno. Visibile solo ai master. */

const COLORI = ["#6366F1", "#0891b2", "#e07b39", "#2d6a4f", "#8b5cf6", "#b8860b", "#c0392b", "#1d6fa4"];
const VUOTO = { nome: "", ruolo: "", email: "", telefono: "", colore: "#6366F1", attivo: true, ruolo_accesso: "manager", note: "" };

/* Le persone sono divise per che cosa fanno, non per ordine alfabetico:
   chi guida l'azienda, chi gestisce gli immobili, chi li porta. */
const GRUPPI = [
  { id: "direzione", titolo: "Direzione", nota: "Vedono e modificano tutto il portafoglio, contabilità compresa.", match: r => r === "master" || r === "socio" },
  { id: "manager", titolo: "Property manager", nota: "Vedono solo gli immobili di cui sono assegnatari, e possono modificarli.", match: r => r === "manager" || !r },
  { id: "agenti", titolo: "Agenti esterni", nota: "Vedono gli immobili che portano loro: caricano documenti e seguono l'avvio, senza toccare il resto.", match: r => r === "agente" },
];

async function fnTeam(payload) {
  const r = await fetch("/.netlify/functions/team", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) throw new Error(d.error || "Errore.");
  return d;
}

/* Codice che gli agenti usano per registrarsi: modificabile, così se si diffonde
   basta cambiarlo e i vecchi tentativi non funzionano più. */
function CodiceAgenti({ onErrore, onEsito }) {
  const [codice, setCodice] = useState("");
  const [bozza, setBozza] = useState("");
  const [modifica, setModifica] = useState(false);
  const [copiato, setCopiato] = useState(false);

  useEffect(() => {
    fnTeam({ action: "codice_agenti" }).then(d => { setCodice(d.codice || ""); setBozza(d.codice || ""); }).catch(() => {});
  }, []);

  const salva = async () => {
    try {
      const d = await fnTeam({ action: "codice_agenti", nuovo: bozza });
      setCodice(d.codice); setModifica(false);
      onEsito && onEsito("Codice aggiornato: da ora vale solo il nuovo.");
    } catch (e) { onErrore && onErrore(e.message); }
  };

  return (
    <div style={{ background: "var(--white)", border: "1px solid var(--gl)", borderRadius: 12, boxShadow: "var(--shadow)", padding: 16, marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--gold)", marginBottom: 8 }}>
        🔑 Codice registrazione agenti
      </div>
      {modifica ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={bozza} onChange={e => setBozza(e.target.value)} style={{ flex: "1 1 240px" }} />
          <button className="bp" onClick={salva}>Salva</button>
          <button className="bg" onClick={() => { setBozza(codice); setModifica(false); }}>Annulla</button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <code style={{ fontSize: 14, fontWeight: 700, background: "var(--cream)", border: "1px solid var(--gl)", borderRadius: 8, padding: "7px 14px", letterSpacing: ".02em" }}>{codice || "—"}</code>
          <button className="bg" onClick={async () => { try { await navigator.clipboard.writeText(codice); setCopiato(true); setTimeout(() => setCopiato(false), 2500); } catch { /* ignora */ } }}
            style={{ fontSize: 11, padding: "5px 10px" }}>{copiato ? "✓ Copiato" : "📋 Copia"}</button>
          <button className="bg" onClick={() => setModifica(true)} style={{ fontSize: 11, padding: "5px 10px" }}>✎ Cambia</button>
        </div>
      )}
      <p style={{ fontSize: 11, color: "var(--gray)", marginTop: 8, lineHeight: 1.6 }}>
        Gli agenti lo inseriscono su <strong>Registrati qui</strong> nella pagina di accesso. Il codice da solo non basta:
        ogni richiesta resta in attesa finché non la approvi tu. Se il codice gira troppo, cambialo — i vecchi accessi già approvati restano validi.
      </p>
    </div>
  );
}

export default function Team({ proprieta = [], sonoMaster, onDataChanged }) {
  const [collaboratori, setCollaboratori] = useState([]);
  const [task, setTask] = useState([]);
  const [caricando, setCaricando] = useState(true);
  const [errore, setErrore] = useState("");
  const [form, setForm] = useState(null); // null | {…} in modifica/creazione
  const [salvando, setSalvando] = useState(false);
  const [invito, setInvito] = useState(null);   // { id, nome, email } persona da invitare
  const [inviando, setInviando] = useState(false);
  const [esito, setEsito] = useState("");
  const [linkInvito, setLinkInvito] = useState(null); // { link, nome, messaggio }
  const [copiato, setCopiato] = useState(false);

  const carica = useCallback(async () => {
    setCaricando(true); setErrore("");
    try {
      const [c, t] = await Promise.all([fnTeam({ action: "list_collaboratori" }), fnTeam({ action: "list_task" })]);
      setCollaboratori(c.collaboratori || []);
      setTask(t.task || []);
    } catch (e) { setErrore(e.message); }
    setCaricando(false);
  }, []);
  useEffect(() => { carica(); }, [carica]);

  const immobiliDi = useCallback((nome) => proprieta.filter(p => p.gestore_interno === nome), [proprieta]);
  const immobiliAgente = useCallback((nome) => proprieta.filter(p => p.agente === nome), [proprieta]);

  const inAttesa = useMemo(() => collaboratori.filter(c => c.stato_approvazione === "in_attesa"), [collaboratori]);

  const approva = async (c, ok = true) => {
    setErrore(""); setEsito("");
    try {
      const d = await fnTeam({ action: "approva", id: c.id, approva: ok });
      setCollaboratori(cs => cs.map(x => x.id === d.collaboratore.id ? d.collaboratore : x));
      setEsito(ok ? `${c.nome} approvato: ora manca solo assegnargli gli immobili.` : `${c.nome} sospeso: non vede più nulla.`);
    } catch (e) { setErrore(e.message); }
  };
  const taskDi = useCallback((nome) => task.filter(t => t.assegnato_a === nome), [task]);

  const [immobiliScelti, setImmobiliScelti] = useState([]);
  const [cercaImm, setCercaImm] = useState("");

  const nuovo = () => { setForm({ ...VUOTO, colore: COLORI[collaboratori.length % COLORI.length] }); setImmobiliScelti([]); setCercaImm(""); };
  const modifica = (c) => {
    setForm({ ...VUOTO, ...c });
    // L'agente è collegato tramite il campo "agente", il property manager tramite "gestore_interno"
    setImmobiliScelti(
      c.ruolo_accesso === "agente"
        ? proprieta.filter(p => p.agente === c.nome).map(p => p.id)
        : proprieta.filter(p => p.gestore_interno === c.nome).map(p => p.id)
    );
    setCercaImm("");
  };

  const immobiliFiltrati = useMemo(() => {
    const q = cercaImm.trim().toLowerCase();
    return [...proprieta]
      .sort((a, b) => String(a.citta || "").localeCompare(String(b.citta || "")) || String(a.nome).localeCompare(String(b.nome)))
      .filter(p => !q || [p.nome, p.citta, p.provincia].filter(Boolean).join(" ").toLowerCase().includes(q));
  }, [proprieta, cercaImm]);

  const salva = async () => {
    if (!form.nome.trim()) { setErrore("Il nome è obbligatorio."); return; }
    setSalvando(true); setErrore("");
    try {
      const payload = { action: "save_collaboratore", ...form };
      const d = await fnTeam(payload);
      setCollaboratori(cs => {
        const altri = cs.filter(x => x.id !== d.collaboratore.id);
        return [...altri, d.collaboratore].sort((a, b) => a.nome.localeCompare(b.nome));
      });
      // Salva anche quali immobili gli competono (solo per chi non vede già tutto)
      const ra = d.collaboratore.ruolo_accesso;
      if (ra === "manager" || ra === "agente") {
        const r = await fnTeam({
          action: ra === "agente" ? "assegna_immobili_agente" : "assegna_immobili",
          nome: d.collaboratore.nome, immobili: immobiliScelti,
        });
        setEsito(`${d.collaboratore.nome}: ${r.assegnati} immobil${r.assegnati === 1 ? "e" : "i"} assegnat${r.assegnati === 1 ? "o" : "i"}${r.liberati ? `, ${r.liberati} tolt${r.liberati === 1 ? "o" : "i"}` : ""}.`);
        onDataChanged && onDataChanged();
      }
      setForm(null);
    } catch (e) { setErrore(e.message); }
    setSalvando(false);
  };

  // Manda l'invito e collega l'account: la password la sceglie l'invitato
  const invia = async () => {
    if (!invito || !invito.email.trim()) { setErrore("Serve l'email della persona."); return; }
    setInviando(true); setErrore(""); setEsito("");
    try {
      const d = await fnTeam({ action: "invita", id: invito.id, email: invito.email.trim() });
      setCollaboratori(cs => cs.map(x => x.id === d.collaboratore.id ? d.collaboratore : x));
      setEsito(d.messaggio);
      setInvito(null);
    } catch (e) {
      // Il servizio email di Supabase ha limiti stretti: ripiego sul link da copiare
      if (/rate limit|429|email/i.test(e.message)) {
        setErrore("");
        await generaLink(invito.id, invito.email.trim(), invito.nome);
      } else setErrore(e.message);
    }
    setInviando(false);
  };

  // Link da mandare a mano: nessuna email, nessun limite
  const generaLink = async (id, email, nome) => {
    setErrore(""); setEsito(""); setCopiato(false);
    try {
      const d = await fnTeam({ action: "genera_link", id, email });
      setLinkInvito({ link: d.link, nome, messaggio: d.messaggio });
      setInvito(null);
      carica();
    } catch (e) { setErrore(e.message); }
  };

  const copiaLink = async () => {
    try { await navigator.clipboard.writeText(linkInvito.link); setCopiato(true); setTimeout(() => setCopiato(false), 3000); }
    catch { setErrore("Copia non riuscita: seleziona il link a mano."); }
  };

  const reinvita = async (c) => {
    setErrore(""); setEsito("");
    try { const d = await fnTeam({ action: "reinvita", email: c.email_accesso }); setEsito(d.messaggio); }
    catch (e) { setErrore(e.message); }
  };

  const revoca = async (c) => {
    if (!window.confirm(`Revocare l'accesso a ${c.nome}? Non potrà più entrare nel CRM, ma resta in anagrafica.`)) return;
    setErrore(""); setEsito("");
    try {
      const d = await fnTeam({ action: "revoca", id: c.id });
      setCollaboratori(cs => cs.map(x => x.id === d.collaboratore.id ? d.collaboratore : x));
      setEsito(`Accesso revocato a ${c.nome}.`);
    } catch (e) { setErrore(e.message); }
  };

  const elimina = async (c) => {
    if (!window.confirm(`Eliminare ${c.nome} dal team? Gli immobili che gestisce resteranno senza assegnatario.`)) return;
    try { await fnTeam({ action: "delete_collaboratore", id: c.id }); setCollaboratori(cs => cs.filter(x => x.id !== c.id)); }
    catch (e) { setErrore(e.message); }
  };

  const nonAssegnati = useMemo(() => {
    const nomi = collaboratori.map(c => c.nome);
    return proprieta.filter(p => !p.gestore_interno || !nomi.includes(p.gestore_interno));
  }, [proprieta, collaboratori]);

  if (!sonoMaster) {
    return (
      <div className="fi" style={{ padding: 40, textAlign: "center", color: "var(--gray)" }}>
        <div style={{ fontSize: 30, marginBottom: 10 }}>🔒</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--black)", marginBottom: 4 }}>Sezione riservata</div>
        <div style={{ fontSize: 12 }}>La gestione degli accessi è visibile solo al titolare.</div>
      </div>
    );
  }

  return (
    <div className="fi">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 6 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700 }}>Team &amp; Accessi</h1>
          <p style={{ fontSize: 12, color: "var(--gray)", marginTop: 4 }}>
            Chi lavora con te, cosa può vedere e a cosa sta lavorando.
          </p>
        </div>
        <button className="bp" onClick={nuovo}>+ Nuova persona</button>
      </div>
      <div className="gl" style={{ marginBottom: 20 }} />

      {errore && <div style={{ fontSize: 12, color: "var(--red)", marginBottom: 12 }}>{errore}</div>}
      {esito && (
        <div style={{ fontSize: 12.5, color: "#2d6a4f", background: "rgba(45,106,79,.08)", border: "1px solid rgba(45,106,79,.25)", borderRadius: 10, padding: "10px 14px", marginBottom: 12 }}>
          ✓ {esito}
        </div>
      )}

      {/* Come funzionano i permessi */}
      <div style={{ background: "#EEF2FF", border: "1px solid rgba(99,102,241,.25)", borderRadius: 12, padding: "12px 14px", marginBottom: 20, fontSize: 12, lineHeight: 1.6, color: "var(--black)" }}>
        <strong>Come funzionano i permessi.</strong><br />
        <strong>Titolare</strong> — vede e modifica tutto, contabilità compresa, ed è l'unico che gestisce questa pagina e gli accessi.<br />
        <strong>Socio</strong> — vede e modifica tutto come il titolare, contabilità inclusa, ma <em>non</em> può gestire accessi e permessi.<br />
        <strong>Property manager</strong> — vede solo gli immobili di cui è assegnatario, i proprietari collegati e i relativi documenti: può modificarli,
        ma non vede né gli immobili altrui né la contabilità.<br />
        <strong>Agente esterno</strong> — vede solo gli immobili che gli hai collegato e il loro stato burocratico, e può <em>caricare</em> documenti.
        Non vede i dati dei proprietari, né i documenti caricati da voi.<br />
        Il filtro è applicato dal database, non dalla schermata: chi non ha i permessi non riceve proprio i dati.
      </div>

      {/* Codice di registrazione per gli agenti */}
      <CodiceAgenti onErrore={setErrore} onEsito={setEsito} />

      {/* Agenti in attesa di approvazione */}
      {inAttesa.length > 0 && (
        <div style={{ background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#92400E", marginBottom: 10 }}>
            ⏳ {inAttesa.length} richiest{inAttesa.length === 1 ? "a" : "e"} di accesso in attesa
          </div>
          {inAttesa.map(c => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--white)", border: "1px solid var(--gl)", borderRadius: 10, padding: "10px 12px", marginBottom: 6, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{c.nome}</div>
                <div style={{ fontSize: 11, color: "var(--gray)" }}>{c.email_accesso} · {c.ruolo || "Agente"}</div>
              </div>
              <button className="bg" onClick={() => { modifica(c); }} style={{ fontSize: 11, padding: "5px 10px" }}>Vedi</button>
              <button className="bp" onClick={() => approva(c, true)} style={{ fontSize: 11, padding: "5px 12px" }}>✓ Approva</button>
            </div>
          ))}
          <p style={{ fontSize: 11, color: "#92400E", marginTop: 4 }}>
            Finché non li approvi non vedono nulla. Dopo l'approvazione ricordati di assegnargli gli immobili.
          </p>
        </div>
      )}

      {caricando ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--gray)", fontSize: 13 }}>Carico il team…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          {GRUPPI.map(g => {
          const lista = collaboratori.filter(c => g.match(c.ruolo_accesso));
          if (!lista.length) return null;
          return (
          <div key={g.id}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
              <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--gold)" }}>{g.titolo}</h2>
              <span style={{ fontSize: 11, color: "var(--gray)" }}>{lista.length}</span>
            </div>
            <p style={{ fontSize: 11.5, color: "var(--gray)", marginBottom: 12 }}>{g.nota}</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))", gap: 12 }}>
          {lista.map(c => {
            const master = c.ruolo_accesso === "master";
            const socio = c.ruolo_accesso === "socio";
            const agente = c.ruolo_accesso === "agente";
            // L'agente è collegato agli immobili tramite il campo "agente", non "gestore_interno"
            const suoi = agente ? immobiliAgente(c.nome) : immobiliDi(c.nome);
            const ts = taskDi(c.nome);
            const aperti = ts.filter(t => t.stato !== "fatto").length;
            const vedeTutto = master || socio;
            const senzaAccount = !c.user_id;
            const etichettaRuolo = master ? "Titolare" : socio ? "Socio" : agente ? "Agente esterno" : "Property manager";
            return (
              <div key={c.id} style={{ background: "var(--white)", border: "1px solid var(--gl)", borderRadius: 12, boxShadow: "var(--shadow)", padding: 16, opacity: c.attivo === false ? .55 : 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: "50%", background: c.colore || "#94A3B8", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, flexShrink: 0 }}>
                    {c.nome[0]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{c.nome}</div>
                    <div style={{ fontSize: 11, color: "var(--gray)" }}>{c.ruolo || "—"}</div>
                  </div>
                  <span className="tag" style={{ background: vedeTutto ? "#EEF2FF" : "var(--cd)", color: vedeTutto ? "#4F46E5" : "var(--gray)", borderColor: "transparent" }}>
                    {etichettaRuolo}
                  </span>
                </div>

                {/* Stato dell'accesso */}
                <div style={{ marginBottom: 10 }}>
                  {senzaAccount ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11.5, color: "#e07b39" }}>⚠ Nessun accesso</span>
                      <button className="bp" onClick={() => { setInvito({ id: c.id, nome: c.nome, email: c.email || "" }); setEsito(""); setErrore(""); }}
                        style={{ fontSize: 11, padding: "5px 12px" }}>✉ Invita nel CRM</button>
                      {c.email && <button className="bg" onClick={() => generaLink(c.id, c.email, c.nome)} style={{ fontSize: 10.5, padding: "4px 9px" }} title="Genera un link da mandare tu su WhatsApp">🔗 Link</button>}
                    </div>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11.5, color: "#2d6a4f" }}>✓ {c.email_accesso}</span>
                      <button className="bg" onClick={() => reinvita(c)} style={{ fontSize: 10.5, padding: "3px 8px" }} title="Rimanda l'email di invito/reset">↻ Rimanda</button>
                      <button className="bg" onClick={() => generaLink(c.id, c.email_accesso, c.nome)} style={{ fontSize: 10.5, padding: "3px 8px" }} title="Genera un link da mandare tu, senza email">🔗 Link</button>
                      <button className="bg" onClick={() => revoca(c)} style={{ fontSize: 10.5, padding: "3px 8px", color: "var(--red)" }} title="Toglie l'accesso, la persona resta in anagrafica">Revoca</button>
                    </div>
                  )}
                </div>

                {/* Cosa vede */}
                <div style={{ borderTop: "1px solid var(--cd)", paddingTop: 10, marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--gray)", marginBottom: 6 }}>
                    {vedeTutto ? `Vede tutti gli immobili${socio ? " · non gestisce accessi" : ""}` : `Vede ${suoi.length} immobil${suoi.length === 1 ? "e" : "i"}`}
                  </div>
                  {!vedeTutto && (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {suoi.slice(0, 6).map(p => (
                        <span key={p.id} className="tag" style={{ background: "var(--cream)", color: "var(--black)" }}>{p.nome}</span>
                      ))}
                      {suoi.length > 6 && <span className="tag">+{suoi.length - 6}</span>}
                      {suoi.length === 0 && <span style={{ fontSize: 11, color: "var(--gray)" }}>Nessun immobile assegnato</span>}
                    </div>
                  )}
                </div>

                {/* Task */}
                <div style={{ fontSize: 11.5, color: "var(--gray)" }}>
                  ☑︎ {ts.length} task{aperti > 0 && <span style={{ color: "var(--red)", fontWeight: 700 }}> · {aperti} aperti</span>}
                </div>

                <div style={{ display: "flex", gap: 6, marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--cd)" }}>
                  <button className="bg" onClick={() => modifica(c)} style={{ fontSize: 11, padding: "5px 10px" }}>✎ Modifica</button>
                  <div style={{ flex: 1 }} />
                  <button className="bd" onClick={() => elimina(c)} style={{ fontSize: 11, padding: "5px 10px" }}>Elimina</button>
                </div>
              </div>
            );
          })}
            </div>
          </div>
          );
          })}
        </div>
      )}

      {/* Immobili senza assegnatario: nessuno li vede tranne il titolare */}
      {nonAssegnati.length > 0 && (
        <div style={{ background: "var(--white)", border: "1px solid rgba(224,123,57,.35)", borderRadius: 12, boxShadow: "var(--shadow)", padding: 16, marginTop: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#e07b39", marginBottom: 6 }}>
            ⚠ {nonAssegnati.length} immobil{nonAssegnati.length === 1 ? "e" : "i"} senza assegnatario
          </div>
          <div style={{ fontSize: 11.5, color: "var(--gray)", marginBottom: 8 }}>
            Nessun property manager li vede: compaiono solo a te. Assegnali dalla scheda immobile o dal Workflow.
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {nonAssegnati.map(p => <span key={p.id} className="tag">{p.nome}</span>)}
          </div>
        </div>
      )}

      {/* Link d'invito da mandare a mano */}
      {linkInvito && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={e => e.target === e.currentTarget && setLinkInvito(null)}>
          <div style={{ background: "var(--cream)", width: "100%", maxWidth: 560, borderRadius: 16, boxShadow: "0 24px 70px rgba(0,0,0,.28)", padding: 28 }} className="fi">
            <h2 style={{ fontSize: 18, marginBottom: 6 }}>Link per {linkInvito.nome}</h2>
            <p style={{ fontSize: 12.5, color: "var(--gray)", marginBottom: 16, lineHeight: 1.6 }}>
              {linkInvito.messaggio} Cliccandolo sceglierà <strong>da sé</strong> la sua password.
            </p>
            <div style={{ background: "var(--white)", border: "1px solid var(--gl)", borderRadius: 10, padding: 12, fontSize: 11, fontFamily: "monospace", wordBreak: "break-all", maxHeight: 120, overflowY: "auto", color: "var(--black)" }}>
              {linkInvito.link}
            </div>
            <div style={{ background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 10, padding: "10px 12px", marginTop: 12, fontSize: 11.5, color: "#92400E", lineHeight: 1.6 }}>
              ⚠️ Trattalo come una password: chi ha questo link entra nel CRM. Mandalo solo alla persona giusta e su un canale privato. <strong>Scade dopo 24 ore.</strong>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
              <button className="bg" onClick={() => setLinkInvito(null)}>Chiudi</button>
              <button className="bp" onClick={copiaLink}>{copiato ? "✓ Copiato" : "📋 Copia link"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Invito al CRM */}
      {invito && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={e => e.target === e.currentTarget && setInvito(null)}>
          <div style={{ background: "var(--cream)", width: "100%", maxWidth: 440, borderRadius: 16, boxShadow: "0 24px 70px rgba(0,0,0,.28)", padding: 28 }} className="fi">
            <h2 style={{ fontSize: 18, marginBottom: 6 }}>Invita {invito.nome} nel CRM</h2>
            <p style={{ fontSize: 12.5, color: "var(--gray)", marginBottom: 16, lineHeight: 1.6 }}>
              Riceverà un'email con un link per <strong>scegliere la sua password</strong>. Nessuno, nemmeno tu, la conoscerà.
            </p>
            <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--gray)" }}>Email</label>
            <input autoFocus type="email" value={invito.email}
              onChange={e => setInvito(v => ({ ...v, email: e.target.value }))}
              onKeyDown={e => e.key === "Enter" && invia()}
              placeholder="nome@esempio.it" style={{ marginTop: 4 }} />
            <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
              <button className="bg" onClick={() => setInvito(null)}>Annulla</button>
              <button className="bp" onClick={invia} disabled={inviando}>{inviando ? "Invio…" : "✉ Manda l'invito"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Form persona */}
      {form && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={e => e.target === e.currentTarget && setForm(null)}>
          <div style={{ background: "var(--cream)", width: "100%", maxWidth: 520, borderRadius: 16, boxShadow: "0 24px 70px rgba(0,0,0,.28)", padding: 28 }} className="fi">
            <h2 style={{ fontSize: 18, marginBottom: 16 }}>{form.id ? `Modifica ${form.nome}` : "Nuova persona"}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--gray)" }}>Nome</label>
                <input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="es. Gianni" style={{ marginTop: 4 }} />
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--gray)" }}>Ruolo</label>
                <input value={form.ruolo || ""} onChange={e => setForm(f => ({ ...f, ruolo: e.target.value }))} placeholder="es. Property manager Napoli" style={{ marginTop: 4 }} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--gray)" }}>Livello di accesso</label>
                <select value={form.ruolo_accesso || "manager"} onChange={e => setForm(f => ({ ...f, ruolo_accesso: e.target.value }))} style={{ marginTop: 4 }}>
                  <option value="agente">Agente esterno — solo i suoi immobili, può caricare documenti</option>
                  <option value="manager">Property manager — solo i suoi immobili</option>
                  <option value="socio">Socio — vede tutto, non gestisce accessi</option>
                  <option value="master">Titolare — vede tutto e gestisce accessi</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--gray)" }}>Email</label>
                <input value={form.email || ""} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={{ marginTop: 4 }} />
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--gray)" }}>Telefono</label>
                <input value={form.telefono || ""} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} style={{ marginTop: 4 }} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--gray)" }}>Colore</label>
                <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                  {COLORI.map(col => (
                    <button key={col} onClick={() => setForm(f => ({ ...f, colore: col }))}
                      style={{ width: 26, height: 26, borderRadius: "50%", background: col, border: form.colore === col ? "2.5px solid var(--black)" : "1px solid var(--gl)" }} />
                  ))}
                </div>
              </div>
              <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={form.attivo !== false} onChange={e => setForm(f => ({ ...f, attivo: e.target.checked }))} id="att" style={{ width: 15, height: 15 }} />
                <label htmlFor="att" style={{ fontSize: 12 }}>Attivo (se lo togli, non compare più tra gli assegnatari)</label>
              </div>
            </div>

            {/* Quali immobili gestisce e vede — solo per i property manager */}
            {["manager", "agente"].includes(form.ruolo_accesso || "manager") ? (
              <div style={{ marginTop: 18 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                  <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--gray)" }}>
                    Immobili che gestisce e vede
                  </label>
                  <span className="tag" style={{ background: "#EEF2FF", color: "#4F46E5", borderColor: "transparent" }}>{immobiliScelti.length} selezionati</span>
                  <div style={{ flex: 1 }} />
                  <button type="button" onClick={() => setImmobiliScelti(immobiliFiltrati.map(p => p.id))} style={{ fontSize: 10.5, padding: "3px 8px", background: "transparent", border: "1px solid var(--gl)", color: "var(--gray)" }}>Tutti i mostrati</button>
                  <button type="button" onClick={() => setImmobiliScelti([])} style={{ fontSize: 10.5, padding: "3px 8px", background: "transparent", border: "1px solid var(--gl)", color: "var(--gray)" }}>Nessuno</button>
                </div>
                <input value={cercaImm} onChange={e => setCercaImm(e.target.value)} placeholder="Filtra per nome o città… (es. Napoli)" style={{ marginBottom: 8 }} />
                <div style={{ maxHeight: 220, overflowY: "auto", background: "var(--white)", border: "1px solid var(--gl)", borderRadius: 10, padding: 6 }}>
                  {immobiliFiltrati.map(p => {
                    const sel = immobiliScelti.includes(p.id);
                    const altrui = p.gestore_interno && p.gestore_interno !== form.nome;
                    return (
                      <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 8px", borderRadius: 8, cursor: "pointer", background: sel ? "#EEF2FF" : "transparent" }}>
                        <input type="checkbox" checked={sel} style={{ width: 15, height: 15, flexShrink: 0 }}
                          onChange={e => setImmobiliScelti(v => e.target.checked ? [...v, p.id] : v.filter(x => x !== p.id))} />
                        <span style={{ flex: 1, minWidth: 0, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {p.nome} <span style={{ color: "var(--gray)" }}>· {p.citta}</span>
                        </span>
                        {altrui && <span className="tag" style={{ fontSize: 9 }}>ora: {p.gestore_interno}</span>}
                      </label>
                    );
                  })}
                  {immobiliFiltrati.length === 0 && <div style={{ padding: 12, fontSize: 12, color: "var(--gray)" }}>Nessun immobile trovato.</div>}
                </div>
                <p style={{ fontSize: 11, color: "var(--gray)", marginTop: 8, lineHeight: 1.6 }}>
                  Vedrà <strong>solo</strong> questi immobili, i loro proprietari e documenti. Spuntando un immobile già di un altro, glielo togli.
                </p>
              </div>
            ) : (
              <div style={{ background: "#EEF2FF", border: "1px solid rgba(99,102,241,.25)", borderRadius: 10, padding: 12, marginTop: 18, fontSize: 11.5, color: "var(--black)", lineHeight: 1.6 }}>
                Con questo livello vede <strong>tutti</strong> gli immobili: non serve selezionarli.
              </div>
            )}

            <div style={{ background: "var(--white)", border: "1px solid var(--gl)", borderRadius: 10, padding: 12, marginTop: 14, fontSize: 11.5, color: "var(--gray)", lineHeight: 1.6 }}>
              <strong style={{ color: "var(--black)" }}>Per l'accesso</strong>: usa <em>✉ Invita nel CRM</em> o <em>🔗 Link</em> sulla sua scheda — sceglierà <strong>da sé</strong> la password.
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
              <button className="bg" onClick={() => setForm(null)}>Annulla</button>
              <button className="bp" onClick={salva} disabled={salvando}>{salvando ? "Salvo…" : "Salva"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
