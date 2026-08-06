// netlify/functions/kross-sync-cron.mjs
// Netlify BLOCCA le chiamate HTTP dirette alle funzioni schedulate (403):
// per questo la schedulazione vive qui, in uno stub minuscolo, e il lavoro
// vero resta in kross-sync-background, che cosi rimane invocabile anche
// dal pulsante "Sincronizza da Kross" del CRM.

export const handler = async () => {
  const base = process.env.URL || "https://valentelivingcrm.netlify.app";
  try {
    await fetch(`${base}/.netlify/functions/kross-sync-background`, { method: "POST" });
  } catch (e) {
    console.log("[kross-sync-cron] avvio non riuscito:", String(e).slice(0, 200));
  }
  return { statusCode: 200 };
};
