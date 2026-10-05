-- Monitoraggio fatturazione (5 ottobre 2026) — solo master/soci
-- report_fatturazione: per mese, fatture emesse su Kross (fatture + ricevute − note di credito, IVA inclusa)
--   e prenotazioni concluse ancora senza fattura (mese di check-out)
-- lista_da_fatturare: le singole prenotazioni concluse senza fattura né ricevuta
-- Le fatture su Kross partono dal 23/02/2026: il periodo parte da febbraio 2026.

create or replace function public.report_fatturazione(p_da date default '2026-02-01')
returns table (mese text, fatture_n bigint, emesso_totale numeric, emesso_imponibile numeric,
               note_credito numeric, concluse_n bigint, da_fatturare_n bigint, da_fatturare_importo numeric)
language sql stable security definer set search_path to 'public' as $$
  with doc as (
    select to_char(data,'YYYY-MM') mese,
      count(*) filter (where tipo in ('F','R')) n,
      sum(case when tipo in ('F','R') then totale when tipo='NC' then -abs(totale) else 0 end) tot,
      sum(case when tipo in ('F','R') then imponibile when tipo='NC' then -abs(imponibile) else 0 end) imp,
      sum(case when tipo='NC' then abs(totale) else 0 end) nc
    from kross_documenti where data >= p_da group by 1
  ),
  fatt as (select distinct id_reservation from kross_documenti where tipo in ('F','R') and id_reservation is not null),
  pren as (
    select c.mese, count(*) concluse,
      count(*) filter (where f.id_reservation is null) n_da,
      sum(c.totale_ospite) filter (where f.id_reservation is null) imp_da
    from v_kross_contabilita c left join fatt f on f.id_reservation = c.id_reservation
    where c.partenza >= p_da and c.partenza < current_date
    group by 1
  )
  select coalesce(d.mese,p.mese), coalesce(d.n,0), coalesce(d.tot,0), coalesce(d.imp,0), coalesce(d.nc,0),
         coalesce(p.concluse,0), coalesce(p.n_da,0), coalesce(p.imp_da,0)
  from doc d full join pren p on p.mese = d.mese
  where public.vede_tutto()
  order by 1 desc;
$$;

create or replace function public.lista_da_fatturare(p_da date default '2026-02-01')
returns table (cod_reservation text, appartamento text, tipo_gestione text, ospite text, canale text,
               arrivo date, partenza date, totale_ospite numeric, provvigione_pm numeric)
language sql stable security definer set search_path to 'public' as $$
  select c.cod_reservation, c.nome_kross, c.tipo_gestione, c.ospite, c.canale, c.arrivo, c.partenza, c.totale_ospite, c.provvigione_pm
  from v_kross_contabilita c
  where public.vede_tutto()
    and c.partenza >= p_da and c.partenza < current_date
    and not exists (select 1 from kross_documenti d where d.id_reservation = c.id_reservation and d.tipo in ('F','R'))
  order by c.partenza desc;
$$;

revoke all on function public.report_fatturazione(date) from public, anon;
grant execute on function public.report_fatturazione(date) to authenticated;
revoke all on function public.lista_da_fatturare(date) from public, anon;
grant execute on function public.lista_da_fatturare(date) to authenticated;
