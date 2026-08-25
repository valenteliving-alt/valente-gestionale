import { useEffect, useMemo, useState } from "react";

/* UTM Builder — costruisce i link tracciati per le campagne e tiene il registro
   di quelli già creati. La parte che conta non è generare la stringa (quella la
   fa chiunque): è avere UN posto solo dove si decide come si chiamano le cose.
   Se una volta scrivi "facebook" e una volta "FB", i numeri non tornano più e
   non te ne accorgi finché non provi a leggerli. */

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

/* Le destinazioni possibili. Aggiungerne una qui evita che qualcuno incolli
   un indirizzo sbagliato a mano. */
const DESTINAZIONI = [
  ["https://valenteitalianproperties.it/", "Home sito"],
  ["https://valenteitalianproperties.it/proprieta.html", "Elenco proprietà"],
  ["https://valenteitalianproperties.it/scheda.html", "Scheda immobile"],
  ["https://valutazionivalente.netlify.app/", "Valutatore immobili"],
];

/* Valori suggeriti: si sceglie da un elenco invece di scrivere a mano.
   È l'unico modo per non ritrovarsi "facebook", "Facebook" e "fb". */
const SORGENTI = ["facebook", "instagram", "google", "linkedin", "tiktok", "whatsapp", "newsletter", "volantino", "passaparola"];
const MEZZI = [
  ["cpc", "annuncio a pagamento"],
  ["social", "post organico"],
  ["email", "email o newsletter"],
  ["qr", "QR code su stampa"],
  ["referral", "link da un altro sito"],
  ["offline", "volantino, cartello, evento"],
];

/* I parametri UTM devono essere minuscoli e senza spazi: se li scrivi con le
   maiuscole, Google Analytics li conta come campagne diverse. */
const pulisci = (s) =>
  String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

export default function Utm() {
  const [f, setF] = useState({
    nome: "", url_base: DESTINAZIONI[0][0],
    utm_source: "facebook", utm_medium: "cpc", utm_campaign: "", utm_content: "", utm_term: "",
  });
  const [salvati, setSalvati] = useState([]);
  const [risultati, setRisultati] = useState([]);
  const [copiato, setCopiato] = useState("");
  const [salvando, setSalvando] = useState(false);

  const carica = async () => {
    const a = await api("GET", "utm_link", "?select=*&attivo=is.true&order=creato_il.desc&limit=100");
    if (a.ok && Array.isArray(a.data)) setSalvati(a.data);
    const b = await api("GET", "v_utm_risultati", "?select=*&order=lead.desc");
    if (b.ok && Array.isArray(b.data)) setRisultati(b.data);
  };
  useEffect(() => { carica(); }, []);

  const urlFinale = useMemo(() => {
    if (!f.url_base || !f.utm_campaign) return "";
    const q = new URLSearchParams();
    q.set("utm_source", pulisci(f.utm_source));
    q.set("utm_medium", pulisci(f.utm_medium));
    q.set("utm_campaign", pulisci(f.utm_campaign));
    if (f.utm_content) q.set("utm_content", pulisci(f.utm_content));
    if (f.utm_term) q.set("utm_term", pulisci(f.utm_term));
    return f.url_base + (f.url_base.includes("?") ? "&" : "?") + q.toString();
  }, [f]);

  const copia = async (testo, chiave) => {
    try { await navigator.clipboard.writeText(testo); setCopiato(chiave); setTimeout(() => setCopiato(""), 1800); }
    catch { /* niente clipboard: resta selezionabile a mano */ }
  };

  const salva = async () => {
    if (!urlFinale || !f.nome.trim()) return;
    setSalvando(true);
    const r = await api("POST", "utm_link", "", [{
      nome: f.nome.trim(), url_base: f.url_base,
      utm_source: pulisci(f.utm_source), utm_medium: pulisci(f.utm_medium),
      utm_campaign: pulisci(f.utm_campaign),
      utm_content: pulisci(f.utm_content) || null, utm_term: pulisci(f.utm_term) || null,
      url_finale: urlFinale, creato_da: "CRM",
    }]);
    setSalvando(false);
    if (r.ok) { setF({ ...f, nome: "", utm_campaign: "", utm_content: "", utm_term: "" }); carica(); }
    else alert("Non sono riuscito a salvarlo. Riprova.");
  };

  const elimina = async (id) => {
    if (!window.confirm("Togliere questo link dal registro?\n\nI lead già arrivati restano: sparisce solo dall'elenco.")) return;
    await api("PATCH", "utm_link", `?id=eq.${id}`, { attivo: false });
    carica();
  };

  const campo = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--gl)", fontSize: 13.5, font: "inherit", boxSizing: "border-box", marginTop: 4 };
  const et = { fontSize: 11.5, fontWeight: 600, color: "var(--gray)" };

  return (
    <div className="fi">
      <h1 style={{ fontSize: 26, fontWeight: 700 }}>Link tracciati (UTM)</h1>
      <p style={{ fontSize: 12, color: "var(--gray)", marginTop: 4, maxWidth: 700, lineHeight: 1.5 }}>
        Crea i link per le campagne e tiene il registro di quelli già fatti. Sotto vedi
        quali stanno portando contatti davvero: è il motivo per cui vale la pena usare
        sempre questo invece di scrivere i link a mano.
      </p>
      <div className="gl" style={{ margin: "14px 0 22px" }} />

      {/* ── Costruttore ── */}
      <div style={{ background: "var(--white)", border: "1px solid var(--gl)", borderRadius: 12, padding: 18, boxShadow: "var(--shadow)" }}>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
          <div>
            <span style={et}>Come lo chiami tu *</span>
            <input style={campo} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="es. Facebook agosto proprietari Lucca" />
          </div>
          <div>
            <span style={et}>Dove porta *</span>
            <select style={campo} value={f.url_base} onChange={(e) => setF({ ...f, url_base: e.target.value })}>
              {DESTINAZIONI.map(([u, l]) => <option key={u} value={u}>{l}</option>)}
            </select>
          </div>
          <div>
            <span style={et}>Da dove arriva (source) *</span>
            <select style={campo} value={f.utm_source} onChange={(e) => setF({ ...f, utm_source: e.target.value })}>
              {SORGENTI.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <span style={et}>Come (medium) *</span>
            <select style={campo} value={f.utm_medium} onChange={(e) => setF({ ...f, utm_medium: e.target.value })}>
              {MEZZI.map(([v, l]) => <option key={v} value={v}>{v} — {l}</option>)}
            </select>
          </div>
          <div>
            <span style={et}>Campagna *</span>
            <input style={campo} value={f.utm_campaign} onChange={(e) => setF({ ...f, utm_campaign: e.target.value })} placeholder="es. proprietari_lucca_ago26" />
          </div>
          <div>
            <span style={et}>Variante (facoltativo)</span>
            <input style={campo} value={f.utm_content} onChange={(e) => setF({ ...f, utm_content: e.target.value })} placeholder="es. video_a, immagine_b" />
          </div>
        </div>

        {urlFinale && (
          <div style={{ marginTop: 16, padding: "12px 14px", background: "#f8fafc", border: "1px solid var(--cd)", borderRadius: 9 }}>
            <div style={{ fontSize: 11, color: "var(--gray)", marginBottom: 5 }}>Link pronto</div>
            <div style={{ fontSize: 12.5, wordBreak: "break-all", fontFamily: "ui-monospace, monospace", lineHeight: 1.5 }}>{urlFinale}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <button className="bp" onClick={() => copia(urlFinale, "nuovo")}>{copiato === "nuovo" ? "Copiato ✓" : "Copia link"}</button>
              <button className="bg" onClick={salva} disabled={!f.nome.trim() || salvando}>{salvando ? "Salvo…" : "Salva nel registro"}</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Cosa sta funzionando ── */}
      <h2 style={{ fontSize: 18, fontWeight: 700, marginTop: 30 }}>Cosa sta portando contatti</h2>
      <p style={{ fontSize: 12, color: "var(--gray)", marginTop: 3, marginBottom: 12 }}>
        Lead arrivati dal sito, divisi per campagna. Questi sono i contatti veri, non i clic.
      </p>
      {risultati.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--gray)" }}>Ancora nessun lead da campagne tracciate.</p>
      ) : (
        <div style={{ background: "var(--white)", border: "1px solid var(--gl)", borderRadius: 12, overflow: "hidden" }}>
          {risultati.map((r, i) => (
            <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", padding: "11px 14px", borderTop: i ? "1px solid var(--cd)" : 0, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontWeight: 650, fontSize: 13.5 }}>{r.campagna}</div>
                <div style={{ fontSize: 11.5, color: "var(--gray)", marginTop: 2 }}>
                  {[r.sorgente, r.mezzo !== "—" ? r.mezzo : null, r.pagina].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: "var(--gold)" }}>{r.lead}</div>
                <div style={{ fontSize: 10.5, color: "var(--gray)" }}>lead</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Registro ── */}
      <h2 style={{ fontSize: 18, fontWeight: 700, marginTop: 30 }}>Link già creati</h2>
      <p style={{ fontSize: 12, color: "var(--gray)", marginTop: 3, marginBottom: 12 }}>
        Prima di crearne uno nuovo, guarda qui: se la campagna esiste già, riusa quello.
      </p>
      {salvati.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--gray)" }}>Nessun link salvato per ora.</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {salvati.map(l => (
            <div key={l.id} style={{ background: "var(--white)", border: "1px solid var(--gl)", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                <strong style={{ fontSize: 14 }}>{l.nome}</strong>
                <span style={{ fontSize: 11, color: "var(--gray)" }}>{new Date(l.creato_il).toLocaleDateString("it-IT")}</span>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--gray)", marginTop: 3 }}>
                {l.utm_source} · {l.utm_medium} · {l.utm_campaign}{l.utm_content ? " · " + l.utm_content : ""}
              </div>
              <div style={{ fontSize: 11.5, wordBreak: "break-all", fontFamily: "ui-monospace, monospace", marginTop: 7, color: "#475569" }}>{l.url_finale}</div>
              <div style={{ display: "flex", gap: 12, marginTop: 9 }}>
                <button onClick={() => copia(l.url_finale, l.id)} style={{ fontSize: 11, color: "var(--gold)", fontWeight: 600, background: "none", border: 0, padding: 0, cursor: "pointer" }}>
                  {copiato === l.id ? "Copiato ✓" : "Copia"}
                </button>
                <button onClick={() => elimina(l.id)} style={{ fontSize: 11, color: "var(--gray)", background: "none", border: 0, padding: 0, cursor: "pointer" }}>Togli dal registro</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 24, fontSize: 11.5, color: "var(--gray)", lineHeight: 1.6, maxWidth: 720 }}>
        I parametri vengono messi tutti in minuscolo e senza spazi: scritti con le maiuscole
        verrebbero contati come campagne diverse, e i numeri smetterebbero di tornare senza
        che nessuno se ne accorga.
      </div>
    </div>
  );
}
