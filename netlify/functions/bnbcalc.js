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
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'API key non configurata. Controlla le environment variables di Netlify.' })
      };
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
