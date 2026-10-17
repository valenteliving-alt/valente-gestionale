-- Il planner: ogni prenotazione Kross con i dati ospite, gli importi, le quote
-- e il documento fiscale collegato, se è stato emesso.
--
-- Serve a rispondere dal calendario a una domanda che su Kross sta in un'altra
-- schermata: questa prenotazione è stata fatturata? A settembre 2026 ne sono
-- rimaste scoperte 38 per 12.329 euro prima che qualcuno se ne accorgesse.
--
-- Vale anche come assicurazione: se l'anno prossimo si cambia gestionale, la
-- storia delle prenotazioni resta qui e questa vista continua a funzionare.
--
-- security_invoker = true: la vista eredita le policy di kross_prenotazioni,
-- quindi la legge solo chi ha fatto accesso al CRM. Senza questa opzione una
-- vista gira con i permessi di chi l'ha creata ed esporrebbe i dati degli
-- ospiti a chiunque abbia la chiave pubblica.

create or replace view v_planner
with (security_invoker = true) as
select
  r.id_reservation, r.cod_reservation, r.stato, coalesce(r.annullata,false) annullata,
  r.id_room_type, coalesce(a.nome_kross, r.appartamento) appartamento, a.citta, a.cin,
  r.ospite, r.email, r.telefono, r.paese, r.lingua, r.canale,
  r.arrivo, r.partenza, r.notti, r.ospiti,
  r.alloggio, r.pulizie, r.tassa_soggiorno, r.extra,
  r.totale_addebiti, r.incassato, r.commissione_ota,
  r.proprietario, r.quota_proprietario, r.quota_pm,
  d.numero doc_numero, d.data doc_data, d.tipo_esteso doc_tipo, d.totale doc_totale,
  (d.id_document is not null) fatturata
from kross_prenotazioni r
left join kross_appartamenti a on a.id_room_type = r.id_room_type
-- Una prenotazione può avere più documenti (fattura, poi nota di credito).
-- Si tiene quello che conta: prima la fattura, poi la ricevuta, poi il resto.
left join lateral (
  select * from kross_documenti k
  where k.id_reservation = r.id_reservation
  order by case k.tipo_esteso
             when 'Fattura'  then 1
             when 'Ricevuta' then 2
             else 3 end,
           k.data desc
  limit 1
) d on true;

comment on view v_planner is
  'Il planner: ogni prenotazione Kross con i dati ospite, gli importi, le quote e il documento fiscale collegato (se c e). security_invoker: eredita le policy di kross_prenotazioni, quindi la legge solo chi ha fatto accesso al CRM.';
