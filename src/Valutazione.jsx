import { useMemo, useState, useRef, useEffect, useCallback } from "react";

/* L'app di valutazione vive in public/valutazione.html ed è servita dallo stesso
   dominio del CRM: stesso login, stessa sessione, nessuna password in più.
   Qui la incorniciamo e le passiamo il nome di chi sta valutando. */

export default function Valutazione({ nomeAgente, prefill }) {
  const [pronta, setPronta] = useState(false);
  const [altezza, setAltezza] = useState(700);
  const frame = useRef(null);

  const src = useMemo(() => {
    const parti = [];
    if (nomeAgente) parti.push(`agente=${encodeURIComponent(nomeAgente)}`);
    if (prefill) parti.push(prefill);
    return `/valutazione.html${parti.length ? "?" + parti.join("&") : ""}`;
  }, [nomeAgente, prefill]);

  /* Il riquadro cresce con il contenuto: così c'è una sola barra di scorrimento,
     quella della pagina, invece di una dentro l'altra. */
  const misura = useCallback(() => {
    const f = frame.current;
    if (!f) return;
    try {
      const doc = f.contentDocument;
      if (!doc || !doc.body) return;
      const h = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight, 520);
      setAltezza(h + 24);
    } catch { /* pagina non accessibile: resta l'altezza di riserva */ }
  }, []);

  useEffect(() => {
    if (!pronta) return;
    misura();
    const t = setInterval(misura, 500);   // il wizard cambia passo e cambia altezza
    window.addEventListener("resize", misura);
    return () => { clearInterval(t); window.removeEventListener("resize", misura); };
  }, [pronta, misura]);

  return (
    <div className="fi">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 6 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700 }}>Valuta immobile</h1>
          <p style={{ fontSize: 12, color: "var(--gray)", marginTop: 4 }}>
            Punteggio, margine e verdetto di acquisizione. Le valutazioni restano salvate nell'archivio.
          </p>
        </div>
      </div>
      <div className="gl" style={{ marginBottom: 14 }} />

      <div style={{ minHeight: 520, position: "relative", background: "var(--white)", border: "1px solid var(--gl)", borderRadius: 12, overflow: "hidden", boxShadow: "var(--shadow)" }}>
        {!pronta && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "var(--gray)" }}>
            Apro il valutatore…
          </div>
        )}
        <iframe
          ref={frame}
          src={src}
          title="Valuta immobile"
          scrolling="no"
          onLoad={() => setPronta(true)}
          style={{ width: "100%", height: altezza, border: 0, display: "block", opacity: pronta ? 1 : 0, transition: "opacity .2s" }}
        />
      </div>
    </div>
  );
}
