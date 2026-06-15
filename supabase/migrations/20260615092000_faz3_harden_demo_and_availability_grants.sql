-- Faz 3 sertleştirme — canlıya uygulandı: faz3_harden_demo_and_availability_grants
-- Demo fonksiyonlarını anon erişiminden çıkar; get_pitch_availability'yi authenticated'a kısıtla.
REVOKE ALL ON FUNCTION public.seed_owner_demo() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_owner_demo() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_owner_demo_pitch_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_pitch_availability(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pitch_availability(uuid, date, date) TO authenticated;
