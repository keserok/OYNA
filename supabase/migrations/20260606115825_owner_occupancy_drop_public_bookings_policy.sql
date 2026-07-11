-- [DB GEÇMİŞİNDEN KURTARILDI 2026-07-11] Bu migration canlı veritabanına uygulanmıştı ancak repoda dosyası yoktu; supabase_migrations.schema_migrations.statements kolonundan geri çıkarıldı.

-- Görünürlük ayrımı düzeltmesi: pitch_bookings'in public SELECT politikası hem noktalı
-- hem noktasız isimle DROP edilir (canlıdaki isim noktasız olduğu için ilk DROP eşleşmemişti).
DROP POLICY IF EXISTS "Public pitch bookings are viewable by everyone" ON public.pitch_bookings;
DROP POLICY IF EXISTS "Public pitch bookings are viewable by everyone." ON public.pitch_bookings;
