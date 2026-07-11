-- FAZ 8 (oyuncu): Maç Raporu — oyuncunun maça özel kişisel notu.
-- MatchDiaryDetail + PostMatchReport birleşti; not artık gerçek ve kalıcı.
-- Her kullanıcı yalnızca kendi notunu görür/yazar (RLS).
create table if not exists public.match_notes (
  match_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  note text not null default '',
  updated_at timestamptz not null default now(),
  primary key (match_id, user_id)
);

alter table public.match_notes enable row level security;

do $$ begin
  create policy "match_notes_select_own" on public.match_notes
    for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "match_notes_insert_own" on public.match_notes
    for insert with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "match_notes_update_own" on public.match_notes
    for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "match_notes_delete_own" on public.match_notes
    for delete using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
