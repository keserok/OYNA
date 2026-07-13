-- DEMO SEED — Sade oyuncu bilgi kartı vitrini (yalnız demo oyuncular d0e51a00-%).
-- Migration DEĞİLDİR: üretimde çalıştırılmaz; yalnız demo/showcase verisini besler.
-- Kart alanları (yaş/ayak/fair play/birlikte-maç) gerçek kolonlardan gelir; bu script
-- yalnız demo profillerine gerçekçi-çeşitli değerler yazar. Canlıda veri kullanıcının
-- kendi profilinden gelir (get_friend_player_card mekanizması aynen çalışır).

-- 1) Yaş (birthdate) + ayak (preferred_foot) + fair play (reliability_score) — çeşitli.
--    Mevcut GERÇEK birthdate/foot değerleri korunur (coalesce); fair play çeşitlendirilir.
update public.profiles p set
  birthdate = coalesce(p.birthdate, make_date(
     1989 + (abs(hashtext(p.id::text||'yr')) % 19),
     1 + (abs(hashtext(p.id::text||'mo')) % 12),
     1 + (abs(hashtext(p.id::text||'dy')) % 28))),
  reliability_score = 79 + (abs(hashtext(p.id::text||'rel')) % 22)
where p.id::text like 'd0e51a00-%';

-- Ayak: garantili çeşitlilik (her 3. oyuncu SOL).
with ranked as (
  select id, row_number() over (order by id) rn
  from public.profiles where id::text like 'd0e51a00-%'
)
update public.profiles p set preferred_foot = case when r.rn % 3 = 0 then 'SOL' else 'SAG' end
from ranked r where r.id = p.id;

-- 2) matches_together backfill — tamamlanmış demo maçlarına örtüşen kadrolar
--    (Emre=01 ile lobi-arkadaşlarının çeşitli birlikte-maç sayıları oluşur).
insert into public.match_participants (match_id, user_id, role, status)
select x.match_id, x.uid, x.role, 'confirmed'
from (
  select mp.match_id,
    ('d0e51a00-0000-4000-8000-'||lpad(u::text,12,'0'))::uuid as uid,
    case when u % 2 = 1 then 'home' else 'away' end as role
  from (values
    ('d0e51e00-0000-4000-8000-000000000101'::uuid, array[1,2,3,4,5,6,7,8,9,10,11,12,13,14]),
    ('d0e51e00-0000-4000-8000-000000000102'::uuid, array[1,2,3,5,7,9,11,13]),
    ('d0e51e00-0000-4000-8000-000000000103'::uuid, array[1,2,4,6,8,10,12,14])
  ) as mp(match_id, players)
  cross join lateral unnest(mp.players) as u
) x
where not exists (
  select 1 from public.match_participants e
  where e.match_id = x.match_id and e.user_id = x.uid
);
