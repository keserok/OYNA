-- FAZ 8 (oyuncu): Çoklu-slot satın alma + arkadaşa/koda atama veri modeli.
-- Additive, bozmayan. match_registrations'a sahiplik/atama alanları eklenir.
alter table public.match_registrations
  add column if not exists purchased_by uuid,
  add column if not exists occupant uuid,
  add column if not exists assignment_status text not null default 'SELF',
  add column if not exists invitee_id uuid,
  add column if not exists claim_code text;

do $$ begin
  alter table public.match_registrations
    add constraint match_reg_assignment_status_chk
    check (assignment_status in ('SELF','INVITED','LINK_PENDING','ACCEPTED'));
exception when duplicate_object then null; end $$;

update public.match_registrations
  set purchased_by = coalesce(purchased_by, user_id),
      occupant = coalesce(occupant, user_id)
  where purchased_by is null or occupant is null;

create unique index if not exists ux_match_reg_claim_code
  on public.match_registrations (claim_code) where claim_code is not null;
create index if not exists ix_match_reg_invitee
  on public.match_registrations (invitee_id) where invitee_id is not null;
create index if not exists ix_match_reg_purchased_by
  on public.match_registrations (purchased_by);
