import { useMemo, useState, useRef } from "react";

/* L'app di valutazione vive in public/valutazione.html ed è servita dallo stesso
   dominio del CRM: stesso login, stessa sessione, nessuna password in più.
   Qui la incorniciamo e le passiamo il nome di chi sta valutando. */

export default function Valutazione({ nomeAgente }) {
  const [pronta, setPronta] = useState(false);
  const frame = useRef(null);

  const src = useMemo(() => {
    const q = nomeAgente ? `?agente=${encodeURIComponent(nomeAgente)}` : "";
    return `/valutazione.html${q}`;
  }, [nomeAgente]);

  return (
    <div className="fi" style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 48px)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 6 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700 }}>Valuta immobile</h1>
          <p style={{ fontSize: 12, color: "var(--gray)", marginTop: 4 }}>
            Punteggio, margine e verdetto di acquisizione. Le valutazioni restano salvate nell'archivio.
          </p>
        </div>
        <a href={src} target="_blank" rel="noopener" className="bg" style={{ fontSize: 11, padding: "6px 12px", textDecoration: "none" }}>
          Apri a schermo intero ↗
        </a>
      </div>
      <div className="gl" style={{ marginBottom: 14 }} />

      <div style={{ flex: 1, minHeight: 520, position: "relative", background: "var(--white)", border: "1px solid var(--gl)", borderRadius: 12, overflow: "hidden", boxShadow: "var(--shadow)" }}>
        {!pronta && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "var(--gray)" }}>
            Apro il valutatore…
          </div>
        )}
        <iframe
          ref={frame}
          src={src}
          title="Valuta immobile"
          onLoad={() => setPronta(true)}
          style={{ width: "100%", height: "100%", border: 0, display: "block", opacity: pronta ? 1 : 0, transition: "opacity .2s" }}
        />
      </div>
    </div>
  );
}
