// Netlify Function: legge i documenti di un immobile e ne estrae i dati con Claude
const zlib = require("node:zlib");

function estraiTestoDocx(buf) {
  try {
    let eocd = -1;
    for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65536; i--) { if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; } }
    if (eocd < 0) return "";
    const cdOffset = buf.readUInt32LE(eocd + 16);
    const total = buf.readUInt16LE(eocd + 10);
    let p = cdOffset, target = null;
    for (let n = 0; n < total; n++) {
      if (buf.readUInt32LE(p) !== 0x02014b50) break;
      const compSize = buf.readUInt32LE(p + 20);
      const fnLen = buf.readUInt16LE(p + 28);
      const exLen = buf.readUInt16LE(p + 30);
      const cmLen = buf.readUInt16LE(p + 32);
      const localOff = buf.readUInt32LE(p + 42);
      const method = buf.readUInt16LE(p + 10);
      const name = buf.toString("utf8", p + 46, p + 46 + fnLen);
      if (name === "word/document.xml") target = { compSize, localOff, method };
      p += 46 + fnLen + exLen + cmLen;
    }
    if (!target) return "";
    const lo = target.localOff;
    if (buf.readUInt32LE(lo) !== 0x04034b50) return "";
    const lfn = buf.readUInt16LE(lo + 26);
    const lex = buf.readUInt16LE(lo + 28);
    const dataStart = lo + 30 + lfn + lex;
    const data = buf.subarray(dataStart, dataStart + target.compSize);
    const xml = target.method === 8 ? zlib.inflateRawSync(data).toString("utf8") : data.toString("utf8");
    return xml.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim().slice(0, 8000);
  } catch (e) { return ""; }
}

function resp(statusCode, obj) { return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) }; }

exports.handler = async (event) => {
  try {
    const KEY = process.env.ANTHROPIC_API_KEY;
    if (!KEY) return resp(500, { error: "Manca ANTHROPIC_API_KEY nelle variabili di Netlify." });
    const { files } = JSON.parse(event.body || "{}");
    if (!files || !files.length) return resp(400, { error: "Nessun documento ricevuto." });

    const content = [];
    for (const file of files.slice(0, 4)) {
      const mime = file.tipo || "";
      const nome = file.nome || "documento";
      const data = file.data;
      if (!data) continue;
      if (mime === "application/pdf" || /\.pdf$/i.test(nome)) {
        content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data } });
      } else if (mime.startsWith("image/")) {
        content.push({ type: "image", source: { type: "base64", media_type: mime, data } });
      } else if (mime.includes("word") || /\.docx$/i.test(nome)) {
        const testo = estraiTestoDocx(Buffer.from(data, "base64"));
        content.push({ type: "text", text: testo ? `Documento "${nome}":\n${testo}` : `Documento "${nome}" non leggibile.` });
      } else {
        try { content.push({ type: "text", text: `Documento "${nome}":\n` + Buffer.from(data, "base64").toString("utf8").slice(0, 8000) }); } catch (e) { /* skip */ }
      }
    }
    if (!content.length) return resp(400, { error: "Documenti non leggibili." });

    const prompt = `Sei un assistente che estrae i dati di un immobile per affitti brevi dai documenti allegati (mandato, visura catastale, registrazione CIN, contratto).
Restituisci SOLO un JSON valido con queste chiavi (usa null se il dato non e presente nei documenti, NON inventare niente):
{
 "indirizzo": "via e numero civico, senza citta e provincia" | null,
 "citta": "comune" | null,
 "cap": "cap" | null,
 "provincia": "sigla 2 lettere maiuscole" | null,
 "cin": "codice CIN esatto" | null,
 "cir": "codice CIR esatto" | null,
 "catasto_foglio": "foglio" | null,
 "catasto_mappale": "mappale o particella" | null,
 "catasto_sub": "subalterno" | null,
 "categoria_catastale": "es. A/2" | null,
 "commissione": "solo il numero della percentuale" | null,
 "posti_letto": "numero" | null,
 "camere": "numero" | null,
 "bagni": "numero" | null,
 "mq": "numero" | null
}
IMPORTANTISSIMO: i codici (CIN, CIR, foglio, mappale, sub, categoria) vanno copiati ESATTAMENTE come compaiono nel documento, carattere per carattere, senza modificarli. Se un dato non e presente, metti null. Rispondi SOLO con il JSON, nessun altro testo.`;
    content.push({ type: "text", text: prompt });

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 800, messages: [{ role: "user", content }] }),
    });
    const d = await res.json();
    if (d.error) return resp(502, { error: d.error.message || "Errore AI" });
    const txt = (d.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
    let fields;
    try { fields = JSON.parse(txt.replace(/```json|```/g, "").trim()); } catch (e) { return resp(502, { error: "Risposta AI non leggibile." }); }
    return resp(200, { fields });
  } catch (e) {
    return resp(500, { error: String(e && e.message ? e.message : e) });
  }
};
