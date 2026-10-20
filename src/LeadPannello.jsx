/* Il pannello che si apre a destra quando clicchi un lead.

   L'elenco dice solo l'essenziale — chi, cosa vuole, quando — e tutto il resto
   sta qui. È la divisione che usano Trello e gli strumenti simili, e funziona
   per un motivo semplice: scorrere cento righe uguali è veloce, scorrere cento
   schede piene di roba non lo è.

   Dentro, in ordine: a che punto sei, chi se ne occupa, cosa ha scritto,
   come lo raggiungi. I dati tecnici di HubSpot restano chiusi in fondo. */

const AVANZAMENTO = [
  { k: "nuovo",      eti: "Nuovo",      col: "#8A8A8A" },
  { k: "contattato", eti: "Contattato", col: "#C09456" },
  { k: "in_corso",   eti: "In corso",   col: "#4A6FA5" },
  { k: "vinto",      eti: "Vinto",      col: "#5B8C5A" },
  { k: "perso",      eti: "Perso",      col: "#C5221F" },
];

const DOPPIONI = /^(descrizione|message|messaggio|richiesta|email|firstname|lastname|phone|mobilephone|hubspot_owner_id|createdate|lastmodifieddate|city|company)$/i;

const dataOra = (d) => {
  if (!d) return "";
  const x = new Date(d);
  if (isNaN(x)) return "";
  return x.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" }) +
         " · " + x.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
};

export default function LeadPannello({
  lead, collaboratori, conversazione, cercando, problemi,
  campiUtili, campiRumore, mostraRumore, onMostraRumore,
  onChiudi, onStato, onAssegna, onArchivia, onRipristina, leggibile, esigenza, inline,
}) {
  if (!lead) return null;
  const l = lead;
  const stato = l.statoLavorazione || "nuovo";
  const guai = problemi || [];
  const contatti = [
    ["Email", l.email, l.email ? `mailto:${l.email}` : null],
    ["Telefono", l.telefono, l.telefono ? `tel:${String(l.telefono).replace(/\s/g, "")}` : null],
    ["Città", l.citta, null],
    ["Azienda", l.azienda, null],
  ].filter(([, v]) => v);

  const corpo = (
        <div style={{ padding: inline ? "16px 22px 20px 54px" : "22px 28px 32px" }}>
          {/* A che punto sei. In cima perché è la cosa che cambi più spesso. */}
          <Sezione titolo="A che punto">
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {AVANZAMENTO.map((a) => (
                <button key={a.k} onClick={() => onStato(l, a.k)}
                  style={{
                    padding: "5px 12px", borderRadius: 20, fontSize: 11.5, cursor: "pointer",
                    fontWeight: stato === a.k ? 600 : 400,
                    border: "1px solid " + (stato === a.k ? a.col : "var(--cd)"),
                    background: stato === a.k ? a.col : "transparent",
                    color: stato === a.k ? "#fff" : "var(--gray)",
                  }}>{a.eti}</button>
              ))}
            </div>
          </Sezione>

          <Sezione titolo="Assegna a">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {l.assegnatoA && (
                <span style={{
                  width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                  background: l.assegnatoColore || "#94A3B8", color: "#fff",
                  fontSize: 10, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center",
                }}>{String(l.assegnatoA)[0].toUpperCase()}</span>
              )}
              <select value={l.assegnatoAId || ""} onChange={(e) => onAssegna(l, e.target.value)}
                style={{
                  flex: 1, padding: "7px 10px", fontSize: 12.5, borderRadius: 7,
                  border: "1px solid var(--cd)", background: "var(--white)", cursor: "pointer",
                  color: l.assegnatoA ? "inherit" : "var(--gray)",
                }}>
                <option value="">scegli a chi passarlo…</option>
                {(collaboratori || []).filter((c) => c.attivo !== false).map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}{c.ruolo ? " · " + c.ruolo : ""}</option>
                ))}
              </select>
            </div>
            {l.assegnatoIl && (
              <div style={{ fontSize: 11, color: "var(--gray)", marginTop: 5 }}>passato il {dataOra(l.assegnatoIl)}</div>
            )}
          </Sezione>

          {/* Cosa ha scritto: è la ragione per cui hai aperto la scheda */}
          {l.messaggio && (
            <Sezione titolo="Cosa chiede" oro>
              <div style={{ fontSize: 14.5, lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word", maxWidth: "62ch" }}>{l.messaggio}</div>
            </Sezione>
          )}

          {contatti.length > 0 && (
            <Sezione titolo="Come lo raggiungi">
              {contatti.map(([k, v, href]) => (
                <div key={k} className="lead-riga lead-riga-pannello" style={{ fontSize: 13.5 }}>
                  <span className="lead-eti">{k}</span>
                  <span className="lead-val">
                    {href ? <a href={href} style={{ color: "var(--gold)", textDecoration: "none" }}>{v}</a> : v}
                  </span>
                </div>
              ))}
            </Sezione>
          )}

          {/* Lo scambio di messaggi */}
          {cercando && <div style={{ fontSize: 12, color: "var(--gray)", marginBottom: 14 }}>Cerco le email di questo contatto…</div>}
          {!cercando && conversazione && conversazione.length === 0 && (
            <div style={{ fontSize: 11.5, color: "var(--gray)", marginBottom: 14, padding: "9px 11px", background: "rgba(0,0,0,.03)", borderRadius: 7 }}>
              {guai.some((g) => g.permessoMancante)
                ? "Le email ci sono su HubSpot ma il token non ha il permesso di leggerle: va aggiunto lo scope sales-email-read all'app privata."
                : "Nessuna email o nota registrata su questo contatto."}
            </div>
          )}
          {conversazione && conversazione.length > 0 && (
            <Sezione titolo={`Conversazione (${conversazione.length})`}>
              {conversazione.map((m) => (
                <div key={m.id} style={{
                  marginBottom: 8, padding: "9px 11px", borderRadius: 8,
                  background: m.inArrivo ? "rgba(192,148,86,.09)" : "rgba(0,0,0,.03)",
                  borderLeft: "3px solid " + (m.inArrivo ? "var(--gold)" : "var(--cd)"),
                }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "baseline", fontSize: 10.5, color: "var(--gray)", marginBottom: 4 }}>
                    <strong style={{ color: m.inArrivo ? "var(--gold)" : "var(--gray)" }}>{m.inArrivo ? "← da lui" : "→ da noi"}</strong>
                    <span>{m.genere}</span>
                    {m.quando && <span>{dataOra(m.quando)}</span>}
                    {m.allegati && m.allegati.length > 0 && <span>📎 {m.allegati.length}</span>}
                  </div>
                  {m.oggetto && <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 3 }}>{m.oggetto}</div>}
                  {m.oscurata ? (
                    <div style={{ fontSize: 12, lineHeight: 1.5, color: "var(--red)" }}>
                      HubSpot non lascia leggere il testo di questa email: all'app privata manca il permesso <strong>sales-email-read</strong>.
                    </div>
                  ) : (
                    <div style={{ fontSize: 12.5, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.testo}</div>
                  )}
                </div>
              ))}
            </Sezione>
          )}

          {campiUtili && campiUtili.length > 0 && (
            <Sezione titolo="Altri dati">
              {/* Si tolgono i campi che sono gia scritti piu in alto: il
                  messaggio compariva due volte, l email anche, e "Contact
                  owner" mostrava solo un numero che non dice niente a nessuno. */}
              {campiUtili.filter((c) => !DOPPIONI.test(c.chiave)).map((c) => (
                <div key={c.chiave} className="lead-riga lead-riga-pannello" style={{ fontSize: 13 }}>
                  <span className="lead-eti">{c.etichetta}</span>
                  <span className="lead-val">{leggibile ? leggibile(c.valore) : c.valore}</span>
                </div>
              ))}
            </Sezione>
          )}

          {campiRumore && campiRumore.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <button onClick={onMostraRumore}
                style={{ fontSize: 11, color: "var(--gray)", background: "none", border: 0, padding: 0, cursor: "pointer", textDecoration: "underline" }}>
                {mostraRumore ? "Nascondi i dati tecnici" : `Mostra anche i dati tecnici (${campiRumore.length})`}
              </button>
              {mostraRumore && campiRumore.map((c) => (
                <div key={c.chiave} className="lead-riga" style={{ fontSize: 11, color: "var(--gray)" }}>
                  <span className="lead-eti">{c.etichetta}</span>
                  <span className="lead-val">{(leggibile ? leggibile(c.valore) : c.valore).slice(0, 160)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Inoltrare il lead a chi lo lavora.

              Niente invio automatico: il messaggio si apre gia scritto e lo
              mandi tu. E anche la cosa giusta — un lead passato di mano merita
              una riga tua, non un messaggio uguale a tutti gli altri.

              Serve soprattutto per chi sta FUORI da HubSpot, come Tommaso Ratti,
              che e un agente esterno di Living: quei lead oggi si ricopiano a
              mano ogni volta. */}
          <Sezione titolo="Inoltra a chi lo lavora">
            {(() => {
              const dest = (collaboratori || []).find((c) => String(c.id) === String(l.assegnatoAId));
              const testo = [
                `Lead: ${l.nome || "(senza nome)"}`,
                esigenza && esigenza !== "Non indicata" ? `Tipo: ${esigenza}` : null,
                l.citta ? `Citta: ${l.citta}` : null,
                l.telefono ? `Tel: ${l.telefono}` : null,
                l.email ? `Mail: ${l.email}` : null,
                l.creato ? `Arrivato il ${new Date(l.creato).toLocaleDateString("it-IT")}` : null,
                "",
                l.messaggio ? String(l.messaggio).slice(0, 900) : "(non ha lasciato un messaggio)",
              ].filter((x) => x !== null).join("\n");

              const tel = dest && dest.telefono ? String(dest.telefono).replace(/[^0-9+]/g, "") : "";
              const wa = "https://wa.me/" + (tel ? tel.replace(/^\+/, "") : "") + "?text=" + encodeURIComponent(testo);
              const mail = dest && dest.email
                ? `mailto:${dest.email}?subject=${encodeURIComponent("Lead: " + (l.nome || ""))}&body=${encodeURIComponent(testo)}`
                : null;

              if (!dest) return (
                <div style={{ fontSize: 11.5, color: "var(--gray)", lineHeight: 1.5 }}>
                  Scegli prima chi se ne occupa, qui sopra: poi da qui glielo mandi con il testo gia pronto.
                </div>
              );
              return (
                <>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <a className="bg" href={wa} target="_blank" rel="noreferrer"
                      style={{ textDecoration: "none", fontSize: 12, padding: "6px 13px" }}>
                      WhatsApp a {dest.nome.split(" ")[0]}
                    </a>
                    {mail && (
                      <a className="bg" href={mail}
                        style={{ textDecoration: "none", fontSize: 12, padding: "6px 13px" }}>Email</a>
                    )}
                    <button className="bg" style={{ fontSize: 12, padding: "6px 13px" }}
                      onClick={() => {
                        try { navigator.clipboard.writeText(testo); } catch (_) {}
                      }}>Copia il testo</button>
                  </div>
                  {!tel && (
                    <div style={{ fontSize: 11, color: "var(--gray)", marginTop: 7, lineHeight: 1.45 }}>
                      {dest.nome} non ha un numero in rubrica: WhatsApp si apre con il messaggio
                      pronto ma il contatto lo scegli tu. Mettendo il telefono in Team &amp; Accessi,
                      va dritto a lui.
                    </div>
                  )}
                </>
              );
            })()}
          </Sezione>

          <div style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid var(--cd)" }}>
            {l.archiviato
              ? <button className="bg" onClick={() => onRipristina(l)}>↩ Rimetti nell'elenco</button>
              : <button className="bg" onClick={() => onArchivia(l)} title="Sparisce dall'elenco, lo ritrovi negli archiviati">🗑 Elimina</button>}
          </div>
        </div>
  );

  /* Aperto dentro l elenco, sotto la riga del lead: niente pannello che copre
     la pagina. Si clicca la riga, si allarga, si legge tutto, si richiude. */
  if (inline) return (
    <div style={{ background: "#fbfaf6", borderBottom: "1px solid var(--cd)", cursor: "default" }}
      onClick={(e) => e.stopPropagation()}>
      {corpo}
    </div>
  );

  return (
    <>
      <div onClick={onChiudi} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 500 }} />
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: "min(660px, 100%)", zIndex: 501,
        background: "var(--white)", boxShadow: "-8px 0 30px rgba(0,0,0,.18)", overflowY: "auto",
      }}>
        {/* Intestazione fissa: il nome resta visibile mentre scorri */}
        <div style={{
          position: "sticky", top: 0, zIndex: 2, background: "var(--white)",
          borderBottom: "1px solid var(--cd)", padding: "18px 28px 14px",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.25 }}>{l.nome || "(senza nome)"}</h2>
              <div style={{ fontSize: 11.5, color: "var(--gray)", marginTop: 3, display: "flex", gap: 7, flexWrap: "wrap" }}>
                {l.creato && <span>{dataOra(l.creato)}</span>}
                {esigenza && esigenza !== "Non indicata" && (
                  <span style={{ color: esigenza === "Gestione" ? "#2e7d4f" : "inherit", fontWeight: esigenza === "Gestione" ? 600 : 400 }}>
                    {esigenza}
                  </span>
                )}
                {l.fonte === "sito" ? <span>dal sito</span> : l.proprietario && <span>su HubSpot: {l.proprietario}</span>}
              </div>
            </div>
            <button onClick={onChiudi} style={{ background: "none", border: 0, fontSize: 24, cursor: "pointer", color: "var(--gray)", lineHeight: 1, padding: 0 }}>×</button>
          </div>
        </div>

        {corpo}
      </div>
    </>
  );
}

function Sezione({ titolo, oro, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em",
        color: oro ? "var(--gold)" : "var(--gray)", marginBottom: 7,
      }}>{titolo}</div>
      <div style={oro ? { padding: "15px 18px", background: "rgba(192,148,86,.08)", borderLeft: "3px solid var(--gold)", borderRadius: 8 } : {}}>
        {children}
      </div>
    </div>
  );
}
