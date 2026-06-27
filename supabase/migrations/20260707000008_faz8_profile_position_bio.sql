-- FAZ 8 (oyuncu): sade profil + 'Profili Düzenle' için mevki ve bio alanları.
alter table public.profiles
  add column if not exists position text,
  add column if not exists bio text;
