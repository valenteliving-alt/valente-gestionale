// Netlify Function: proxy sicuro per BNBCalc API
// La API key viene letta dalle environment variables di Netlify (non esposta lato client)
// Il browser della PWA chiama /.netlify/functions/bnbcalc → questa function chiama BNBCalc

exports.handler = async (event) => {
  // Solo POST consentito
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // CORS headers per la risposta
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  try {
    const { type, payload } = JSON.parse(event.body || '{}');

    // type: 'cohost' (gestione) o 'arb' (sublocazione)
    const endpoint = type === 'cohost'
      ? 'https://atlas.bnbcalc.com/v1/external/analysis/create/cohost'
      : 'https://atlas.bnbcalc.com/v1/external/analysis/create/arb';

    const apiKey = process.env.BNBCALC_API_KEY;

    // Senza chiave qui, giriamo la richiesta all'app valutazioni che ce l'ha già:
    // così l'analisi funziona subito, senza spostare a mano nessuna credenziale.
    // Appena BNBCALC_API_KEY viene impostata anche su questo sito, si passa dalla via diretta.
    if (!apiKey) {
      const origine = process.env.BNBCALC_PROXY_URL || 'https://valutazionivalente.netlify.app/.netlify/functions/bnbcalc';
      try {
        const r = await fetch(origine, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: event.body || '{}'
        });
        return { statusCode: r.status, headers: corsHeaders, body: await r.text() };
      } catch (e) {
        return {
          statusCode: 502,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'BNBCalc non raggiungibile: ' + (e.message || 'errore di rete') })
        };
      }
    }

    // Chiamata server-side a BNBCalc (nessun CORS perché è server-to-server)
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-bnbcalc-api-key': apiKey
      },
      body: JSON.stringify(payload)
    });

    const data = await response.text();
    return {
      statusCode: response.status,
      headers: corsHeaders,
      body: data
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message || 'Errore interno proxy' })
    };
  }
};
