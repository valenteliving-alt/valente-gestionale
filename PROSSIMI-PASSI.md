# Ultimi passi — pubblicare la v20 (PWA + push)

Ho già integrato TUTTO nel tuo repo **valente-gestionale-main** (in Download) e verificato che il sito compila (`npm run build` OK). Restano solo i passi che girano sul tuo Mac/account.

## Cosa ho cambiato nel repo (solo aggiunte)
- `src/App.jsx` → aggiornato alla v20 (la tua v19 + PWA/push). Backup del vecchio: `App-repo-2giu-backup.jsx`.
- `public/` → creata, con `manifest.json`, `sw.js`, `icon-192.png`, `icon-512.png`.
- `netlify/functions/invia-notifica.js` → nuova function per inviare le notifiche.
- `package.json` → aggiunta dipendenza `web-push`.
- `index.html` → aggiunti i meta PWA nel `<head>`.

> Nota: la tua v19 era più avanti del sito pubblicato (il repo era fermo al 2 giugno). Pubblicando ora vai online con v19 **+** le push insieme.

## 1) Sblocca git (c'è un lock rimasto)
Nella cartella del repo:
```bash
cd ~/Downloads/valente-gestionale-main
rm -f .git/index.lock
```

## 2) Database — Supabase
SQL Editor → incolla il contenuto di `DA-CARICARE-SUL-SITO/supabase-tabella.sql` → Run.

## 3) Variabili d'ambiente — Netlify
Site settings → Environment variables (valori in `CHIAVI-VAPID.txt`):
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`  (Supabase → Project Settings → API → service_role)

## 4) Pubblica
```bash
cd ~/Downloads/valente-gestionale-main
git add -A
git commit -m "v20: PWA installabile + notifiche push"
git push
```
Netlify ricostruisce da solo da GitHub.

## 5) Prova
1. iPhone → Safari → apri il sito → Condividi → **Aggiungi a Home**.
2. Apri l'app dall'icona, fai login, premi **🔔 Attiva notifiche** → Consenti.
3. Test:
```bash
curl -X POST 'https://IL-TUO-SITO.netlify.app/.netlify/functions/invia-notifica' \
  -H 'Content-Type: application/json' \
  -d '{"title":"Valente Living","body":"Funziona!","url":"/"}'
```

Se non vuoi rischiare la pubblicazione diretta, prima di `git push` puoi vedere cosa cambia con `git diff --stat`.
