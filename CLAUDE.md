# Valente Living — istruzioni permanenti

Questo file viene letto in automatico all'inizio di ogni sessione aperta in questa
cartella. È il modo in cui Claude si ricorda chi siamo e cosa stavamo facendo.

**Copia identica in tutte le cartelle di lavoro.** Se ne modifichi una, allineale.

---

## PRIMA COSA DA FARE, SEMPRE

Prima di rispondere a qualsiasi cosa, leggi la memoria di lavoro con lo strumento
Supabase (`execute_sql`, progetto `heabtbdmwbjlgujsisor`):

```sql
select ambito, titolo, contenuto, fonte, certezza
from memoria_azienda
where attivo
order by
  case certezza when 'da verificare' then 0 else 1 end,
  ambito, aggiornato_il desc;
```

Non annunciarlo e non riassumerla: leggila e rispondi con quel contesto già in testa.

Se una voce ha `certezza = 'da verificare'`, trattala come ipotesi, mai come fatto.

**Se Supabase non è disponibile, dillo subito e chiaramente:** "non riesco a leggere la
memoria, quindi parto senza contesto". Meglio che Tommaso lo sappia subito, piuttosto
che scoprirlo da una risposta sbagliata.

## ULTIMA COSA DA FARE, SEMPRE

Se la sessione ha prodotto qualcosa che varrà anche domani, scrivilo in memoria.
**Le conclusioni, non la conversazione.**

Vale la pena salvare: una decisione e il suo motivo · una regola aziendale o fiscale ·
un dato verificato che prima non si sapeva · un problema trovato e non risolto ·
una cosa che si è rotta e come si è aggiustata.

Non salvare: cronache della sessione, elenchi di file toccati, cose già scritte altrove.

```sql
insert into memoria_azienda (ambito, titolo, contenuto, fonte, certezza)
values ('<ambito>', '<titolo breve>', '<il fatto, in chiaro>', '<da dove viene>', 'confermato');
```

Ambiti: `identita`, `fiscale`, `tecnica`, `operativa`, `metodo`, `decisioni`.

Se una voce non è più vera **aggiornala, non aggiungerne una nuova accanto**: due verità
in contraddizione sono peggio di nessuna.

```sql
update memoria_azienda
set contenuto = '<nuovo testo>', certezza = 'confermato', aggiornato_il = now()
where titolo = '<titolo esatto>';
```

---

## LE CARTELLE — leggi bene, qui si sbaglia

| Cartella | Cos'è |
|---|---|
| **`~/Downloads/crm-kross`** | **IL CRM VIVO.** Qui si lavora sul gestionale. |
| `~/Downloads/valente-gestionale-main` | vecchia copia, cronologia git ferma. Non usarla per il CRM. |
| `~/Downloads/valente-gestionale-AGGIORNATO` | altra copia vecchia |
| `~/Downloads/chatai-valente` | app di messaggistica separata |
| `~/Desktop/Valente - Siti/valutazionivalente` | app di valutazione immobili |

Se stai per modificare il CRM e non sei in `crm-kross`, **fermati e chiedi**.

---

## Chi è l'interlocutore

Tommaso Baroncelli, titolare di Valente Living SRL. Non è tecnico. Parla italiano e
vuole risposte diritte e brevi. Preferisce sapere che una cosa è rotta piuttosto che
sentirsi dire che va tutto bene.

## L'azienda in due righe

SRL in regime ordinario, affitti brevi. 45 immobili (33 in gestione per conto terzi,
12 in sublocazione), 41 proprietari, ~1.160 prenotazioni l'anno su 15+ località in 6
regioni. Squadra: 8 agenti, 2 property manager, 1 socio, il titolare.
Gruppo: **Valente SRL** (P.IVA 02054100470) subloca a **Valente Living SRL** (02123860476).

## I pezzi del sistema

| Cosa | Dove |
|---|---|
| CRM | valentelivingcrm.netlify.app · GitHub `valenteliving-alt/valente-gestionale` |
| Database | Supabase `heabtbdmwbjlgujsisor` |
| Gestionale | Krossbooking `valenteitalianproperties` — **ha le API v5**, attive da 6/8/2026 |
| Robot chat | server Hetzner `116.202.9.195`, systemd `robot-ospiti` |
| Cervello AI | `netlify/functions/cervello.js`, Claude Haiku |

Deploy CRM: file su GitHub, Netlify ricostruisce da solo.

---

## Come si lavora qui

**Prima si verifica, poi si afferma.** I dati stanno nel database e sono interrogabili:
guardali invece di supporre. Una risposta sbagliata qui diventa lavoro manuale di
rimessa a posto, o un problema con la Questura o con l'Agenzia delle Entrate.

**Automatizzare la produzione, mai il controllo.** Ogni automazione ha un custode umano.
Prima si standardizza un processo, poi lo si automatizza.

**Niente consulenza fiscale.** Su IVA, fatturazione e adempimenti si riportano i fatti e
si prepara la domanda precisa per il commercialista. Non si decide al posto suo.

**Le azioni irreversibili le decide Tommaso.** Invii alla Questura, trasmissioni allo
SdI, messaggi delicati agli ospiti, cancellazioni. Si prepara tutto e si chiede.

**Mai digitare credenziali**, e mai farsele incollare in chat: si mettono direttamente
nelle variabili d'ambiente.

---

## Dove sta il resto della conoscenza

- `memoria_azienda` (Supabase) — decisioni, regole, questioni aperte. **La fonte viva.**
- `procedure_operative` (Supabase) — il manuale operativo, sezione Manuale nel CRM
- `knowledge_base` (Supabase) — procedure e fiscalità
- `schede_immobili` (Supabase) — dati di accesso. Il campo `verificata` distingue quelle
  ufficiali da quelle ricostruite: le seconde non si usano per dare codici agli ospiti.
- Documenti nel repo: `PIANO-INDIPENDENZA.md`, `PIANO-FATTURAZIONE-CRM.md`,
  `VALENTE-CLAUDE-ARCHITETTURA.md`
