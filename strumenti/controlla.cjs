/* Controllo prima di pubblicare. Due verifiche su ogni file .jsx di src/:
   1. la sintassi;
   2. i NOMI: ogni variabile usata deve esistere nel punto in cui e usata.
   La seconda serve perche il 20/10/2026 il CRM e rimasto su pagina bianca per
   una variabile che esisteva solo in un altro componente: la sintassi era
   perfetta, il controllo di sintassi non lo vedeva.
   Uso: node strumenti/controlla.cjs   (dalla cartella del progetto)
   Serve: npm i -D @babel/core @babel/preset-react @babel/parser @babel/traverse */
const fs = require("fs"), path = require("path");
const req = (m) => { try { return require(m); } catch { return require(path.join("/tmp/node_modules", m)); } };
const babel = req("@babel/core"), parser = req("@babel/parser"), traverse = req("@babel/traverse").default, react = req("@babel/preset-react");
const G = new Set("window document console fetch JSON Math Date Number String Array Object Promise Set Map setTimeout clearTimeout setInterval clearInterval localStorage sessionStorage navigator alert confirm prompt encodeURIComponent decodeURIComponent isNaN parseInt parseFloat Intl Boolean Error RegExp URL URLSearchParams FormData Blob File FileReader Notification atob btoa location history requestAnimationFrame cancelAnimationFrame structuredClone Infinity NaN undefined arguments globalThis self crypto TextEncoder TextDecoder AbortController Image performance queueMicrotask React process require module exports Uint8Array ArrayBuffer DataView Symbol Reflect Proxy WeakMap WeakSet matchMedia getComputedStyle screen innerWidth innerHeight scrollTo open print Event CustomEvent MutationObserver ResizeObserver IntersectionObserver HTMLElement Node Element XMLHttpRequest WebSocket caches indexedDB PushManager Response Request Headers EventSource BroadcastChannel postMessage close focus blur event top parent length origin".split(" "));
const dir = path.join(process.cwd(), "src"); let errori = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".jsx"))) {
  const code = fs.readFileSync(path.join(dir, f), "utf8");
  try { babel.transformSync(code, { presets: [react], filename: f }); }
  catch (e) { console.log(`✗ ${f}: SINTASSI — ${e.message.split("\n")[0]}`); errori++; continue; }
  const ast = parser.parse(code, { sourceType: "module", plugins: ["jsx"] }); const manc = new Map();
  traverse(ast, { ReferencedIdentifier(p) { const n = p.node.name; if (p.scope.hasBinding(n) || G.has(n)) return;
    if (p.isJSXIdentifier() && /^[a-z]/.test(n)) return; if (!manc.has(n)) manc.set(n, []); manc.get(n).push(p.node.loc.start.line); } });
  if (manc.size) { errori++; for (const [n, r] of manc) console.log(`✗ ${f}: "${n}" non esiste (righe ${r.slice(0, 5).join(", ")})`); }
  else console.log(`✓ ${f}`);
}
console.log(errori ? `\n${errori} problemi: NON pubblicare.` : "\nTutto a posto."); process.exit(errori ? 1 : 0);
