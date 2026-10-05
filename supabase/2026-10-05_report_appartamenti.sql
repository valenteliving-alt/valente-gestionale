-- Report appartamenti Kross + permessi (5 ottobre 2026)
-- Da incollare in Supabase > SQL Editor > New query > Run.
-- 1) chiude le tabelle grezze Kross: master/soci tutto, property manager i propri immobili, agenti nulla
-- 2) pernottamento comprensivo degli extra nella vista contabile
-- 3) funzione report_kross_appartamenti: numeri aggregati per appartamento e mese, filtrati per chi è collegato;
--    agli agenti non restituisce provvigione e margine Valente

create or replace function public.puo_vedere_kross(p_id_room_type int, p_come_agente boolean default false)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.vede_tutto() or exists (
    select 1 from public.kross_appartamenti k
    join public.proprieta p on p.id = k.proprieta_id
    where k.id_room_type = p_id_room_type
      and public.mio_nome() is not null
      and (
        lower(trim(p.gestore_interno)) = lower(trim(public.mio_nome()))
        or (p_come_agente and lower(trim(p.agente)) = lower(trim(public.mio_nome())))
      )
  );
$$;

drop policy if exists kp_lettura on public.kross_prenotazioni;
create policy kp_lettura on public.kross_prenotazioni for select to authenticated
  using (public.vede_tutto() or (not public.sono_agente() and public.puo_vedere_kross(id_room_type)));

drop policy if exists ka_lettura on public.kross_addebiti;
create policy ka_lettura on public.kross_addebiti for select to authenticated
  using (public.vede_tutto() or (not public.sono_agente() and exists (
    select 1 from public.kross_prenotazioni kp where kp.id_reservation = kross_addebiti.id_reservation)));

drop policy if exists kd_lettura on public.kross_documenti;
create policy kd_lettura on public.kross_documenti for select to authenticated
  using (public.vede_tutto());

drop policy if exists kross_app_lettura on public.kross_appartamenti;
create policy kross_app_lettura on public.kross_appartamenti for select to authenticated
  using (public.vede_tutto() or public.puo_vedere_kross(id_room_type, true));

create or replace view public.v_kross_contabilita with (security_invoker = on) as
 WITH b AS (
   SELECT p.*, k.nome_kross, k.citta AS citta_app, k.tipo_gestione, k.perc_pm, k.base_provvigione, k.cedolare_pct, k.proprieta_id,
     COALESCE(p.alloggio,0) + COALESCE(p.extra,0) AS v_alloggio,
     COALESCE(p.pulizie,0) AS v_pulizie,
     COALESCE(p.commissione_ota,0) AS v_comm
   FROM kross_prenotazioni p LEFT JOIN kross_appartamenti k ON k.id_room_type = p.id_room_type
   WHERE p.annullata = false
 ), c AS (
   SELECT b.*, b.v_alloggio + b.v_pulizie AS totale_ospite,
     b.v_alloggio + b.v_pulizie - b.v_comm AS netto_ota,
     CASE WHEN b.base_provvigione = 'netto_ota' THEN b.v_alloggio + b.v_pulizie - b.v_comm
          ELSE b.v_alloggio - b.v_comm END AS base_prov
   FROM b
 )
 SELECT id_reservation, cod_reservation, stato, canale, ota_id, id_room_type, nome_kross, citta_app, proprieta_id, tipo_gestione,
   ospite, arrivo, partenza, notti, ospiti,
   to_char(partenza::timestamptz, 'YYYY-MM') AS mese,
   round(totale_ospite,2) AS totale_ospite,
   round(v_comm,2) AS commissione_ota,
   round(CASE WHEN totale_ospite > 0 THEN 100*v_comm/totale_ospite END,1) AS perc_comm_ota,
   round(netto_ota,2) AS netto_ota,
   round(v_pulizie,2) AS pulizie,
   round(COALESCE(tassa_soggiorno,0),2) AS imposta_soggiorno,
   round(base_prov,2) AS base_provvigione,
   CASE WHEN tipo_gestione='sublocazione' THEN NULL ELSE round(base_prov*perc_pm/100,2) END AS provvigione_pm,
   CASE WHEN tipo_gestione='sublocazione' THEN NULL ELSE round(netto_ota - v_pulizie - base_prov*perc_pm/100,2) END AS proprietario_lordo,
   CASE WHEN tipo_gestione='sublocazione' THEN NULL ELSE round((netto_ota - v_pulizie - base_prov*perc_pm/100)*cedolare_pct/100,2) END AS cedolare,
   CASE WHEN tipo_gestione='sublocazione' THEN NULL ELSE round((netto_ota - v_pulizie - base_prov*perc_pm/100)*(1 - cedolare_pct/100),2) END AS proprietario_netto,
   CASE WHEN tipo_gestione='sublocazione' THEN round(netto_ota,2) ELSE round(v_comm + v_pulizie + base_prov*perc_pm/100,2) END AS trattenuto_gestione,
   incassato, ultimo_agg
 FROM c;

create or replace function public.report_kross_appartamenti(p_da date default '2025-01-01', p_a date default (current_date + 365))
returns table (
  id_room_type int, appartamento text, citta text, tipo_gestione text, agente text, gestore text,
  mese text, prenotazioni bigint, notti bigint, notti_nel_mese bigint, giorni_mese int,
  totale_ospite numeric, commissione_ota numeric, pulizie numeric, imposta_soggiorno numeric, netto_ota numeric,
  provvigione_pm numeric, proprietario_lordo numeric, cedolare numeric, proprietario_netto numeric, trattenuto_gestione numeric,
  future bigint
) language sql stable security definer set search_path to 'public' as $$
  with ag as (select public.sono_agente() as si),
  vis as (
    select k.id_room_type, k.nome_kross, k.citta, k.tipo_gestione, p.agente, p.gestore_interno
    from kross_appartamenti k left join proprieta p on p.id = k.proprieta_id
    where public.vede_tutto() or public.puo_vedere_kross(k.id_room_type, true)
  ),
  occ as (
    select kp.id_room_type, to_char(g::date,'YYYY-MM') mese, count(*) n
    from kross_prenotazioni kp
    cross join lateral generate_series(kp.arrivo, kp.partenza - 1, interval '1 day') g
    where kp.annullata = false and kp.partenza > kp.arrivo
      and g::date between p_da and p_a
      and kp.id_room_type in (select id_room_type from vis)
    group by 1,2
  ),
  soldi as (
    select c.id_room_type, c.mese, count(*) pren, sum(c.notti) notti,
      sum(c.totale_ospite) tot, sum(c.commissione_ota) comm, sum(c.pulizie) pul, sum(c.imposta_soggiorno) imp,
      sum(c.netto_ota) netto, sum(c.provvigione_pm) prov, sum(c.proprietario_lordo) pl, sum(c.cedolare) ced,
      sum(c.proprietario_netto) pn, sum(c.trattenuto_gestione) tr,
      count(*) filter (where c.arrivo > current_date) fut
    from v_kross_contabilita c
    where c.partenza between p_da and p_a
      and c.id_room_type in (select id_room_type from vis)
    group by 1,2
  ),
  m as (
    select coalesce(s.id_room_type,o.id_room_type) id_room_type, coalesce(s.mese,o.mese) mese
    from soldi s full join occ o on o.id_room_type = s.id_room_type and o.mese = s.mese
  )
  select v.id_room_type, v.nome_kross, v.citta, v.tipo_gestione, v.agente, v.gestore_interno,
    m.mese,
    coalesce(s.pren,0), coalesce(s.notti,0)::bigint, coalesce(o.n,0),
    extract(day from (to_date(m.mese,'YYYY-MM') + interval '1 month - 1 day'))::int,
    coalesce(s.tot,0), coalesce(s.comm,0), coalesce(s.pul,0), coalesce(s.imp,0), coalesce(s.netto,0),
    case when (select si from ag) then null else s.prov end,
    s.pl, s.ced, s.pn,
    case when (select si from ag) then null else coalesce(s.tr,0) end,
    coalesce(s.fut,0)
  from m
  join vis v on v.id_room_type = m.id_room_type
  left join soldi s on s.id_room_type = m.id_room_type and s.mese = m.mese
  left join occ o on o.id_room_type = m.id_room_type and o.mese = m.mese
  order by m.mese desc, v.nome_kross;
$$;

revoke all on function public.report_kross_appartamenti(date,date) from public, anon;
grant execute on function public.report_kross_appartamenti(date,date) to authenticated;
revoke all on function public.puo_vedere_kross(int,boolean) from public, anon;
grant execute on function public.puo_vedere_kross(int,boolean) to authenticated;
