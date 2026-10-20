-- TRATTATIVE — il percorso di un immobile prima che diventi una proprietà.
--
-- Perché serve: il Workflow Lancio parte da "mandato firmato". Fra il momento
-- in cui un agente propone un immobile e quel punto non c'era niente, e infatti
-- le trattative condivise con gli agenti non esistevano in nessun sistema.
--
-- Tre stati soli, scelti da Tommaso: proposta → in trattativa → chiusa.
-- Un funnel in sei fasi che nessuno aggiorna vale meno di uno in tre che resta
-- vero. L'esito (acquisita / persa) si registra solo alla chiusura.
--
-- Due lezioni dai dati esistenti, applicate qui:
--  1. chi porta la trattativa è una FOREIGN KEY su `collaboratori`, non testo
--     libero: nella tabella `valutazioni` il campo libero ha prodotto
--     "Desideria" e "Desideria Iovenitti" come persone diverse, e dieci agenti
--     sono diventati diciassette;
--  2. la valutazione è un PASSO dentro la trattativa, non la trattativa stessa.
--     Alcuni lead non ne avranno mai una.

create table if not exists trattative (
  id uuid primary key default gen_random_uuid(),
  creata_il timestamptz not null default now(),
  aggiornata_il timestamptz not null default now(),

  indirizzo text,
  comune text,
  provincia text,
  tipologia text,
  posti_letto int,
  modello text,                      -- gestione | sublocazione, se già deciso

  proprietario_nome text,
  proprietario_telefono text,
  proprietario_email text,

  portata_da_id uuid references collaboratori(id),
  condivisa_con_id uuid references collaboratori(id),
  quota_portata_da numeric,          -- % del compenso a chi l'ha portata
  quota_condivisa numeric,           -- % a chi la segue insieme

  stato text not null default 'proposta'
    check (stato in ('proposta','in_trattativa','chiusa')),
  esito text check (esito in ('acquisita','persa')),
  motivo_persa text,
  chiusa_il date,

  valutazione_id uuid references valutazioni(id),
  proprieta_id uuid references proprieta(id),

  note text,
  creata_da text
);

create index if not exists trattative_stato_idx on trattative(stato);
create index if not exists trattative_portata_idx on trattative(portata_da_id);

alter table trattative enable row level security;
drop policy if exists "trattative: team" on trattative;
create policy "trattative: team" on trattative
  for all to authenticated using (true) with check (true);

comment on table trattative is
  'Il percorso di un immobile prima che diventi una proprieta: proposta dall agente, trattativa, chiusura. Colma il buco fra "un agente mi propone un immobile" e il Workflow Lancio, che oggi parte a mandato gia firmato.';

-- La vista che legge il CRM: aggiunge i nomi di chi segue la trattativa, la
-- valutazione collegata e da quanti giorni non si muove. security_invoker:
-- eredita le policy della tabella, quindi la legge solo chi ha fatto accesso.
create or replace view v_trattative
with (security_invoker = true) as
select t.*,
       pa.nome portata_da,   pa.colore portata_colore,
       co.nome condivisa_con, co.colore condivisa_colore,
       pr.nome proprieta_nome,
       v.verdetto, v.punteggio, v.margine_valente, v.fatturato_annuo,
       (current_date - t.aggiornata_il::date) giorni_ferma
from trattative t
left join collaboratori pa on pa.id = t.portata_da_id
left join collaboratori co on co.id = t.condivisa_con_id
left join proprieta     pr on pr.id = t.proprieta_id
left join valutazioni   v  on v.id  = t.valutazione_id;

comment on view v_trattative is
  'Le trattative con i nomi di chi le segue, la valutazione collegata e da quanti giorni non si muovono.';
