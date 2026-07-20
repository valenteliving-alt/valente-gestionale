import { useState, useEffect, useCallback, useMemo } from "react";

/* Team & Accessi — pannello del titolare.
   Da qui si gestiscono le persone, il loro ruolo di accesso e si vede
   a colpo d'occhio quali immobili vede ognuno. Visibile solo ai master. */

const COLORI = ["#6366F1", "#0891b2", "#e07b39", "#2d6a4f", "#8b5cf6", "#b8860b", "#c0392b", "#1d6fa4"];
const VUOTO = { nome: "", ruolo: "", email: "", telefono: "", colore: "#6366F1", attivo: true, ruolo_accesso: "manager", note: "" };

async function fnTeam(payload) {
  const r = await fetch("/.netlify/functions/team", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) throw new Error(d.error || "Errore.");
  return d;
}

export default function Team({ proprieta = [], sonoMaster }) {
  const [collaboratori, setCollaboratori] = useState([]);
  const [task, setTask] = useState([]);
  const [caricando, setCaricando] = useState(true);
  const [errore, setErrore] = useState("");
  const [form, setForm] = useState(null); // null | {…} in modifica/creazione
  const [salvando, setSalvando] = useState(false);

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
  const taskDi = useCallback((nome) => task.filter(t => t.assegnato_a === nome), [task]);

  const nuovo = () => setForm({ ...VUOTO, colore: COLORI[collaboratori.length % COLORI.length] });
  const modifica = (c) => setForm({ ...VUOTO, ...c });

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
      setForm(null);
    } catch (e) { setErrore(e.message); }
    setSalvando(false);
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

      {/* Come funzionano i permessi */}
      <div style={{ background: "#EEF2FF", border: "1px solid rgba(99,102,241,.25)", borderRadius: 12, padding: "12px 14px", marginBottom: 20, fontSize: 12, lineHeight: 1.6, color: "var(--black)" }}>
        <strong>Come funzionano i permessi.</strong><br />
        <strong>Titolare</strong> — vede e modifica tutto, contabilità compresa, ed è l'unico che gestisce questa pagina e gli accessi.<br />
        <strong>Socio</strong> — vede e modifica tutto come il titolare, contabilità inclusa, ma <em>non</em> può gestire accessi e permessi.<br />
        <strong>Property manager</strong> — vede solo gli immobili di cui è assegnatario, i proprietari collegati e i relativi documenti: può modificarli,
        ma non vede né gli immobili altrui né la contabilità.<br />
        Il filtro è applicato dal database, non dalla schermata: chi non ha i permessi non riceve proprio i dati.
      </div>

      {caricando ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--gray)", fontSize: 13 }}>Carico il team…</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))", gap: 12 }}>
          {collaboratori.map(c => {
            const suoi = immobiliDi(c.nome);
            const ts = taskDi(c.nome);
            const aperti = ts.filter(t => t.stato !== "fatto").length;
            const master = c.ruolo_accesso === "master";
            const socio = c.ruolo_accesso === "socio";
            const vedeTutto = master || socio;
            const senzaAccount = !c.user_id;
            const etichettaRuolo = master ? "Titolare" : socio ? "Socio" : "Property manager";
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
                <div style={{ fontSize: 11.5, marginBottom: 10, color: senzaAccount ? "#e07b39" : "#2d6a4f" }}>
                  {senzaAccount ? "⚠ Nessun account di accesso collegato" : `✓ Accede come ${c.email_accesso}`}
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

            <div style={{ background: "var(--white)", border: "1px solid var(--gl)", borderRadius: 10, padding: 12, marginTop: 14, fontSize: 11.5, color: "var(--gray)", lineHeight: 1.6 }}>
              <strong style={{ color: "var(--black)" }}>Per dargli l'accesso al CRM:</strong> crea il suo account dal pannello Supabase
              (<em>Authentication → Users → Add user → Send invitation</em>) usando la stessa email scritta qui sopra.
              Sceglierà lui la password. Poi collega l'account a questa persona e assegnale gli immobili dal Workflow.
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
