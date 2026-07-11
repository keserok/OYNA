-- [DB GEÇMİŞİNDEN KURTARILDI 2026-07-11] Bu migration canlı veritabanına uygulanmıştı ancak repoda dosyası yoktu; supabase_migrations.schema_migrations.statements kolonundan geri çıkarıldı.

-- Bildirim sahteciliği açığını kapat:
-- Eski politika WITH CHECK (true) ile herkesin herhangi bir user_id adına
-- bildirim eklemesine izin veriyordu. Artık authenticated kullanıcı yalnızca
-- kendi adına (sender_id = auth.uid()) bildirim üretebilir.
-- Sistem/sunucu tarafı bildirimleri service_role üzerinden devam eder.

drop policy if exists "notifications_insert_authenticated" on public.notifications;

create policy "notifications_insert_own_sender"
  on public.notifications
  for insert
  to authenticated
  with check (sender_id = (select auth.uid()));
