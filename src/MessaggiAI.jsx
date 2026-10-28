import { useState, useEffect, useMemo, useCallback, useRef } from "react";

/* Messaggi AI Ospiti — le chat degli ospiti di Kross, lette e inviate tramite le API ufficiali
   (funzione netlify/functions/kross-chat.mjs). Niente più robot col browser.
   • A sinistra l'elenco chat (da rispondere in evidenza), a destra la conversazione a fumetti.
   • Ospite a sinistra, noi a destra, ognuno col suo nome e l'ora.
   • La risposta suggerita dall'AI (chat_recenti.risposta_ai) si può usare, modificare e inviare.
   • Tab "Impostazioni AI": interruttore generale e AI/auto per appartamento (come prima). */

const SUPABASE_URL = "https://heabtbdmwbjlgujsisor.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhlYWJ0YmRtd2JqbGd1anNpc29yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMjA4NDgsImV4cCI6MjA5NTg5Njg0OH0.FRk1tARhQHylLjfhACorn6O_E7ommm47tBTfJHOVxAU";

function tokenSessione() {
  try { return (JSON.parse(localStorage.getItem("vl_sessione") || "null") || {}).access_token || ""; }
  catch { return ""; }
}
async function api(method, table, query, body, prefer) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query || ""}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${tokenSessione() || SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: prefer || "return=representation",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => null);
  return { ok: r.ok, data };
}
async function kross(azione, extra = {}) {
  const r = await fetch("/.netlify/functions/kross-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: tokenSessione(), azione, ...extra }),
  });
  const j = await r.json().catch(() => ({ ok: false, errore: "Risposta non valida" }));
  if (!j.ok) throw new Error(j.errore || "Errore");
  return j;
}

/* ---------- date ---------- */
// Kross manda "2026-10-28 10:55:30+01": va reso ISO perché Safari lo legga
function d(ts) {
  if (!ts) return null;
  let s = String(ts).replace(" ", "T");
  if (/[+-]\d{2}$/.test(s)) s += ":00";
  const x = new Date(s);
  return isNaN(x) ? null : x;
}
const stessoGiorno = (a, b) => a && b && a.toDateString() === b.toDateString();
function etichettaGiorno(x) {
  const oggi = new Date(); const ieri = new Date(Date.now() - 864e5);
  if (stessoGiorno(x, oggi)) return "Oggi";
  if (stessoGiorno(x, ieri)) return "Ieri";
  return x.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
}
const ora = (x) => x ? x.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "";
function quandoBreve(x) {
  if (!x) return "";
  if (stessoGiorno(x, new Date())) return ora(x);
  if (stessoGiorno(x, new Date(Date.now() - 864e5))) return "ieri";
  return x.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}
const giornoCorto = (s) => s ? new Date(s + "T12:00").toLocaleDateString("it-IT", { day: "numeric", month: "short" }) : "";

/* ---------- chi parla ---------- */
const NOSTRI = ["owner", "cohost"];
function colore(nome) {
  const n = (nome || "").toLowerCase();
  if (n.startsWith("tommaso")) return { bg: "#dcf3e6", bordo: "#a7dcbd", testo: "#14532d", nome: "#15803d" };
  if (n.includes("valente")) return { bg: "#e0ecff", bordo: "#b6cdf5", testo: "#1e3a8a", nome: "#1d4ed8" };
  return { bg: "#f1e8ff", bordo: "#d6c2f5", testo: "#4c1d95", nome: "#7c3aed" };
}
const iniziali = (n) => (n || "?").trim().split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
const CANALE = { AIRBNB: ["#ffe4e6", "#be123c", "Airbnb"], BOOKING: ["#dbeafe", "#1d4ed8", "Booking"], BE: ["#ecfccb", "#3f6212", "Sito"] };

const CSS = `
.mai{max-width:1200px}
.mai-grid{display:grid;grid-template-columns:340px 1fr;height:calc(100vh - 190px);min-height:520px;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;background:#fff}
.mai-lista{border-right:1px solid #e5e7eb;display:flex;flex-direction:column;min-height:0}
.mai-voci{overflow-y:auto;flex:1}
.mai-voce{display:flex;gap:10px;padding:11px 14px;border-bottom:1px solid #f3f4f6;cursor:pointer;align-items:flex-start}
.mai-voce:hover{background:#f9fafb}
.mai-voce.sel{background:#eef6ff}
.mai-av{flex:0 0 38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:#fff}
.mai-thread{display:flex;flex-direction:column;min-height:0;background:#f6f7f9}
.mai-msgs{flex:1;overflow-y:auto;padding:16px 18px}
.mai-bolla{max-width:72%;padding:8px 12px 6px;border-radius:14px;border:1px solid;font-size:14px;line-height:1.42;white-space:pre-wrap;word-wrap:break-word;box-shadow:0 1px 1px rgba(0,0,0,.04)}
.mai-riga{display:flex;margin:3px 0}
.mai-riga.noi{justify-content:flex-end}
.mai-sep{text-align:center;margin:14px 0 8px}
.mai-sep span{background:#e5e7eb;color:#4b5563;font-size:12px;font-weight:600;padding:3px 10px;border-radius:999px;text-transform:capitalize}
.mai-comp{border-top:1px solid #e5e7eb;background:#fff;padding:10px 12px}
.mai-back{display:none}
@media (max-width:820px){
  .mai-grid{grid-template-columns:1fr;height:calc(100vh - 170px)}
  .mai-grid.aperta .mai-lista{display:none}
  .mai-grid:not(.aperta) .mai-thread{display:none}
  .mai-back{display:inline-flex}
  .mai-bolla{max-width:86%}
}
`;

function Switch({ on, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ width: 44, height: 24, borderRadius: 999, border: "none", cursor: disabled ? "default" : "pointer",
        background: on ? "#16a34a" : "#cbd5e1", position: "relative", opacity: disabled ? .5 : 1, flexShrink: 0 }}>
      <span style={{ position: "absolute", top: 3, left: on ? 23 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left .15s" }} />
    </button>
  );
}
const btn = (bg, fg = "#fff") => ({ background: bg, color: fg, border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 600, cursor: "pointer", fontSize: 13 });
const chip = (bg, fg) => ({ background: bg, color: fg, borderRadius: 999, padding: "1px 8px", fontSize: 11, fontWeight: 700, display: "inline-block", whiteSpace: "nowrap" });

export default function MessaggiAI() {
  const [tab, setTab] = useState("chat");
  const [chats, setChats] = useState([]);
  const [suggerite, setSuggerite] = useState({});   // id_thread -> risposta_ai
  const [sel, setSel] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [caricaMsg, setCaricaMsg] = useState(false);
  const [filtro, setFiltro] = useState("da");       // da | tutte
  const [q, setQ] = useState("");
  const [testo, setTesto] = useState("");
  const [invio, setInvio] = useState(false);
  const [err, setErr] = useState("");
  const [trad, setTrad] = useState({});
  const fondo = useRef(null);

  const caricaLista = useCallback(async () => {
    try {
      const [j, s] = await Promise.all([
        kross("lista", { giorni: 14 }),
        api("GET", "chat_recenti", "?select=id_thread,risposta_ai,ultimo_ruolo&ultimo_ruolo=eq.ospite&risposta_ai=not.is.null&order=ultimo_ts.desc&limit=60"),
      ]);
      setChats(j.chat || []);
      const m = {}; (s.data || []).forEach((r) => { if (r.risposta_ai) m[String(r.id_thread)] = r.risposta_ai; });
      setSuggerite(m);
      setErr("");
    } catch (e) { setErr(e.message); }
  }, []);

  const caricaThread = useCallback(async (id, forza) => {
    if (!id) return;
    try {
      const j = await kross("thread", { id_thread: id, forza: !!forza });
      setMsgs(j.messaggi || []);
    } catch (e) { setErr(e.message); }
  }, []);

  useEffect(() => { caricaLista(); const t = setInterval(caricaLista, 45000); return () => clearInterval(t); }, [caricaLista]);
  useEffect(() => {
    if (!sel) return;
    setCaricaMsg(true); setMsgs([]); setTesto("");
    caricaThread(sel).finally(() => setCaricaMsg(false));
    const t = setInterval(() => caricaThread(sel), 20000);
    return () => clearInterval(t);
  }, [sel, caricaThread]);
  useEffect(() => { fondo.current && fondo.current.scrollIntoView({ block: "end" }); }, [msgs]);

  const daRispondere = (c) => c.ospite && c.ultimo_da && c.ultimo_da === c.ospite;
  const nDa = chats.filter(daRispondere).length;
  const visibili = useMemo(() => chats
    .filter((c) => filtro === "tutte" || daRispondere(c))
    .filter((c) => !q || `${c.ospite} ${c.tipologia} ${c.annuncio} ${c.ultimo_testo}`.toLowerCase().includes(q.toLowerCase())),
  [chats, filtro, q]);
  const chat = chats.find((c) => c.id_thread === sel);
  const suggerita = sel && suggerite[sel] && chat && daRispondere(chat) ? suggerite[sel] : "";

  async function invia() {
    const t = testo.trim();
    if (!t || !sel) return;
    if (!window.confirm(`Inviare questo messaggio a ${chat?.ospite || "l'ospite"}?\n\n${t}`)) return;
    setInvio(true);
    try {
      await kross("invia", { id_thread: sel, testo: t });
      setTesto("");
      await caricaThread(sel, true);
      caricaLista();
    } catch (e) { alert("Non inviato: " + e.message); }
    setInvio(false);
  }

  return (
    <div className="mai">
      <style>{CSS}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 21 }}>💬 Chat ospiti</h2>
        <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
          <button onClick={() => setTab("chat")} style={btn(tab === "chat" ? "#111827" : "#e5e7eb", tab === "chat" ? "#fff" : "#374151")}>Chat</button>
          <button onClick={() => setTab("impostazioni")} style={btn(tab === "impostazioni" ? "#111827" : "#e5e7eb", tab === "impostazioni" ? "#fff" : "#374151")}>⚙️ Impostazioni AI</button>
        </div>
      </div>
      {err && <div style={{ background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca", borderRadius: 10, padding: "8px 12px", marginBottom: 10, fontSize: 13 }}>{err}</div>}

      {tab === "impostazioni" ? <Impostazioni /> : (
        <div className={"mai-grid" + (sel ? " aperta" : "")}>
          {/* ELENCO */}
          <div className="mai-lista">
            <div style={{ padding: 10, borderBottom: "1px solid #e5e7eb" }}>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca ospite o appartamento…"
                style={{ width: "100%", boxSizing: "border-box", border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 10px", fontSize: 14 }} />
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <button onClick={() => setFiltro("da")} style={{ ...btn(filtro === "da" ? "#f59e0b" : "#f3f4f6", filtro === "da" ? "#fff" : "#374151"), padding: "5px 10px", fontSize: 12 }}>Da rispondere · {nDa}</button>
                <button onClick={() => setFiltro("tutte")} style={{ ...btn(filtro === "tutte" ? "#111827" : "#f3f4f6", filtro === "tutte" ? "#fff" : "#374151"), padding: "5px 10px", fontSize: 12 }}>Tutte · {chats.length}</button>
              </div>
            </div>
            <div className="mai-voci">
              {visibili.length === 0 && <div style={{ padding: 20, color: "#6b7280", fontSize: 14, textAlign: "center" }}>{chats.length ? "Nessuna chat da rispondere 👍" : "Caricamento…"}</div>}
              {visibili.map((c) => {
                const att = daRispondere(c);
                const [cb, cf, cn] = CANALE[c.canale] || ["#f3f4f6", "#374151", c.canale];
                return (
                  <div key={c.id_thread} className={"mai-voce" + (c.id_thread === sel ? " sel" : "")} onClick={() => setSel(c.id_thread)}>
                    <div className="mai-av" style={{ background: att ? "#f59e0b" : "#9ca3af" }}>{iniziali(c.ospite)}</div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                        <b style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.ospite || "Ospite"}</b>
                        <span style={{ marginLeft: "auto", fontSize: 11, color: att ? "#b45309" : "#9ca3af", fontWeight: att ? 700 : 400, whiteSpace: "nowrap" }}>{quandoBreve(d(c.ultimo_ts))}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "#4b5563", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>🏠 {c.tipologia || c.annuncio}</div>
                      <div style={{ fontSize: 12.5, color: att ? "#111827" : "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>
                        {!att && c.ultimo_da ? <span style={{ color: "#9ca3af" }}>{c.ultimo_da}: </span> : null}{c.ultimo_testo}
                      </div>
                      <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                        <span style={chip(cb, cf)}>{cn}</span>
                        {c.arrivo && <span style={chip("#f3f4f6", "#4b5563")}>{giornoCorto(c.arrivo)} → {giornoCorto(c.partenza)}</span>}
                        {suggerite[c.id_thread] && att && <span style={chip("#ede9fe", "#6d28d9")}>🤖 bozza</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* CONVERSAZIONE */}
          <div className="mai-thread">
            {!chat ? (
              <div style={{ margin: "auto", color: "#9ca3af", textAlign: "center", fontSize: 14 }}>Scegli una chat a sinistra</div>
            ) : (<>
              <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "10px 14px", display: "flex", gap: 10, alignItems: "center" }}>
                <button className="mai-back" onClick={() => setSel(null)} style={{ ...btn("#f3f4f6", "#111827"), padding: "6px 10px" }}>←</button>
                <div className="mai-av" style={{ background: "#64748b" }}>{iniziali(chat.ospite)}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{chat.ospite} {chat.provenienza && <span style={{ fontWeight: 400, fontSize: 12, color: "#6b7280" }}>· {chat.provenienza}</span>}</div>
                  <div style={{ fontSize: 12.5, color: "#4b5563", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    🏠 {chat.tipologia || chat.annuncio} {chat.arrivo && <>· 📅 {giornoCorto(chat.arrivo)} → {giornoCorto(chat.partenza)}</>}
                  </div>
                </div>
              </div>

              <div className="mai-msgs">
                {caricaMsg && <div style={{ textAlign: "center", color: "#9ca3af", fontSize: 13 }}>Caricamento…</div>}
                {msgs.map((m, i) => {
                  const x = d(m.ts); const prima = i > 0 ? d(msgs[i - 1].ts) : null;
                  const noi = NOSTRI.includes(m.ruolo);
                  const stessoAutore = i > 0 && msgs[i - 1].nome === m.nome && stessoGiorno(x, prima) && (x - prima) < 10 * 60e3;
                  const col = noi ? colore(m.nome) : { bg: "#ffffff", bordo: "#e5e7eb", testo: "#111827", nome: "#b45309" };
                  const haTrad = !noi && m.traduzione && m.traduzione.trim() !== m.testo.trim();
                  return (
                    <div key={m.id}>
                      {x && !stessoGiorno(x, prima) && <div className="mai-sep"><span>{etichettaGiorno(x)}</span></div>}
                      <div className={"mai-riga" + (noi ? " noi" : "")} style={{ marginTop: stessoAutore ? 2 : 10 }}>
                        <div className="mai-bolla" style={{ background: col.bg, borderColor: col.bordo, color: col.testo,
                          borderTopLeftRadius: !noi ? 4 : 14, borderTopRightRadius: noi ? 4 : 14 }}>
                          {!stessoAutore && (
                            <div style={{ fontSize: 12, fontWeight: 700, color: col.nome, marginBottom: 2 }}>
                              {m.nome || (noi ? "Noi" : "Ospite")}{m.ai && <span style={{ ...chip("#ede9fe", "#6d28d9"), marginLeft: 6 }}>🤖 AI</span>}
                            </div>
                          )}
                          {m.testo}
                          {haTrad && (
                            <div style={{ marginTop: 4 }}>
                              <button onClick={() => setTrad((s) => ({ ...s, [m.id]: !s[m.id] }))}
                                style={{ background: "none", border: "none", padding: 0, color: "#2563eb", fontSize: 12, cursor: "pointer" }}>
                                {trad[m.id] ? "nascondi traduzione" : "🇮🇹 traduci"}
                              </button>
                              {trad[m.id] && <div style={{ marginTop: 4, paddingTop: 4, borderTop: "1px dashed #d1d5db", color: "#374151", fontSize: 13.5 }}>{m.traduzione}</div>}
                            </div>
                          )}
                          <div style={{ textAlign: "right", fontSize: 11, color: "#6b7280", marginTop: 2 }}>{ora(x)}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={fondo} />
              </div>

              <div className="mai-comp">
                {suggerita && testo !== suggerita && (
                  <div style={{ background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 10, padding: "8px 10px", marginBottom: 8, fontSize: 13 }}>
                    <div style={{ fontWeight: 700, color: "#6d28d9", marginBottom: 3 }}>🤖 Risposta suggerita</div>
                    <div style={{ whiteSpace: "pre-wrap", color: "#374151", maxHeight: 110, overflowY: "auto" }}>{suggerita}</div>
                    <button onClick={() => setTesto(suggerita)} style={{ ...btn("#7c3aed"), padding: "5px 10px", fontSize: 12, marginTop: 6 }}>Usa questa</button>
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                  <textarea value={testo} onChange={(e) => setTesto(e.target.value)} placeholder={`Scrivi a ${chat.ospite}… (parte firmato Tommaso)`}
                    rows={Math.min(8, Math.max(2, testo.split("\n").length))}
                    style={{ flex: 1, border: "1px solid #d1d5db", borderRadius: 10, padding: "9px 11px", fontSize: 14, fontFamily: "inherit", resize: "none", boxSizing: "border-box" }} />
                  <button onClick={invia} disabled={invio || !testo.trim()} style={{ ...btn(testo.trim() ? "#16a34a" : "#9ca3af"), padding: "10px 16px" }}>
                    {invio ? "Invio…" : "Invia"}
                  </button>
                </div>
              </div>
            </>)}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- impostazioni AI (interruttori, invariati) ---------- */
function Impostazioni() {
  const [config, setConfig] = useState({ ai_globale_attiva: false });
  const [apts, setApts] = useState([]);
  const [q, setQ] = useState("");
  useEffect(() => {
    (async () => {
      const [cfg, t] = await Promise.all([
        api("GET", "ai_config", "?id=eq.1&select=*"),
        api("GET", "ai_appartamenti", "?select=*&order=appartamento.asc"),
      ]);
      if (cfg.ok && cfg.data && cfg.data[0]) setConfig(cfg.data[0]);
      setApts((t.data || []).map((x) => ({ appartamento: x.appartamento, nome: x.nome, citta: x.citta, indirizzo: x.indirizzo, attiva: !!x.attiva, auto_invio: !!x.auto_invio })));
    })();
  }, []);
  async function salvaConfig(patch) {
    setConfig((c) => ({ ...c, ...patch }));
    await api("PATCH", "ai_config", "?id=eq.1", { ...patch, aggiornata_il: new Date().toISOString() });
  }
  async function salvaApt(nome, patch) {
    setApts((a) => a.map((x) => x.appartamento === nome ? { ...x, ...patch } : x));
    await api("POST", "ai_appartamenti", "?on_conflict=appartamento", [{ appartamento: nome, ...patch, aggiornata_il: new Date().toISOString() }], "resolution=merge-duplicates,return=minimal");
  }
  const spento = !config.ai_globale_attiva;
  const lista = apts.filter((a) => `${a.nome} ${a.appartamento} ${a.citta}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ border: "1px solid", borderColor: spento ? "#fca5a5" : "#86efac", background: spento ? "#fef2f2" : "#f0fdf4", borderRadius: 12, padding: 14, marginBottom: 12, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700 }}>Interruttore generale AI</div>
          <div style={{ fontSize: 13, color: "#6b7280" }}>{spento ? "🔴 Spenta: nessuna bozza e nessun invio automatico." : "🟢 Accesa: propone le risposte; con ⚡ auto invia da sola quelle di routine."}</div>
        </div>
        <Switch on={config.ai_globale_attiva} onClick={() => salvaConfig({ ai_globale_attiva: !config.ai_globale_attiva })} />
      </div>
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 14, background: "#fff" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca appartamento…" style={{ width: "100%", boxSizing: "border-box", border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 10px", fontSize: 14, marginBottom: 8 }} />
        {lista.map((a) => (
          <div key={a.appartamento} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: "1px solid #f3f4f6" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{a.nome || a.appartamento}</div>
              <div style={{ fontSize: 12, color: "#9ca3af" }}>{[a.citta, a.indirizzo].filter(Boolean).join(" · ")}</div>
            </div>
            <div style={{ textAlign: "center", fontSize: 11, fontWeight: 600, color: "#6b7280" }}>AI<br /><Switch on={a.attiva} onClick={() => salvaApt(a.appartamento, { attiva: !a.attiva })} /></div>
            <div style={{ textAlign: "center", fontSize: 11, fontWeight: 600, color: "#6b7280" }}>⚡ auto<br /><Switch on={a.auto_invio} disabled={!a.attiva} onClick={() => salvaApt(a.appartamento, { auto_invio: !a.auto_invio })} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}
