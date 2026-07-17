// Agente notturno: ogni mattina esegue il briefing (che manda la push se c'è qualcosa da segnalare).
const SITE_URL = process.env.URL || "https://valentelivingcrm.netlify.app";

exports.handler = async () => {
  try {
    const r = await fetch(`${SITE_URL}/.netlify/functions/briefing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ push: true }),
    });
    const d = await r.json().catch(() => ({}));
    console.log("Briefing mattutino:", d.voci != null ? `${d.voci} voci` : "errore", d.error || "");
    return { statusCode: 200, body: JSON.stringify({ ok: r.ok, voci: d.voci }) };
  } catch (e) {
    console.error("Agente notturno fallito:", e.message);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
