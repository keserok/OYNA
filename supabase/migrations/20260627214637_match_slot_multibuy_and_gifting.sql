-- Çoklu-slot satın alma + arkadaşa/koda atama veri modeli (additive, bozmayan)
alter table public.match_registrations
  add column if not exists purchased_by uuid,
  add column if not exists occupant uuid,
  add column if not exists assignment_status text not null default 'SELF',
  add column if not exists invitee_id uuid,
  add column if not exists claim_code text;

-- assignment_status için değer kısıtı (zaten varsa atla)
do $$ begin
  alter table public.match_registrations
    add constraint match_reg_assignment_status_chk
    check (assignment_status in ('SELF','INVITED','LINK_PENDING','ACCEPTED'));
exception when duplicate_object then null; end $$;

-- Mevcut kayıtları tutarlı hale getir: ödeyen = slotta görünen = user_id
update public.match_registrations
  set purchased_by = coalesce(purchased_by, user_id),
      occupant = coalesce(occupant, user_id)
  where purchased_by is null or occupant is null;

-- Devralma kodu benzersiz (yalnız dolu olanlar), atama sorguları için indeksler
create unique index if not exists ux_match_reg_claim_code
  on public.match_registrations (claim_code) where claim_code is not null;
create index if not exists ix_match_reg_invitee
  on public.match_registrations (invitee_id) where invitee_id is not null;
create index if not exists ix_match_reg_purchased_by
  on public.match_registrations (purchased_by);