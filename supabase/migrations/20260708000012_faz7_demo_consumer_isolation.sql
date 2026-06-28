-- ============================================================================
-- FAZ 7 — Demo verisinin CANLI tüketici uygulamasından izolasyonu
-- ----------------------------------------------------------------------------
-- SORUN: pitches/matches/goalkeepers/referees/communities/tournaments tablolarının
-- herkese-açık SELECT politikası `USING (true)` idi. Demo seed'i bu kayıtları
-- `verification_status='approved', is_open=true, isDemo/is_demo=true` ile yaratıyor,
-- dolayısıyla "OYNA Demo Arena" gibi SAHTE tesis/kaleci/hakem GERÇEK kullanıcılara
-- uygulamada görünüyordu. (Lansman öncesi ciddi güven/itibar sorunu.)
--
-- ÇÖZÜM: SELECT politikasına demo filtresi eklenir:
--   (demo_kolonu IS NOT TRUE  OR  get_config_bool('demo_mode_enabled'))
--   * Gerçek kayıtlar (is_demo false/null) HER ZAMAN görünür — tüketici akışı etkilenmez.
--   * Demo kayıtları yalnız `demo_mode_enabled=true` iken görünür (test dönemi).
--   * Tek anahtarla geri alınabilir: app_config'te demo_mode_enabled=true yapılırsa
--     demo verisi anında yeniden görünür hale gelir.
--
-- GÜVENLİK NOTU: anon rolünün `is_platform_admin()` üzerinde EXECUTE izni YOK; bu yüzden
-- herkese-açık (public) politikada o fonksiyon KULLANILAMAZ (anonim taramayı kırardı).
-- `get_config_bool` anon'a açık → güvenli. Admin'lerin demoyu her durumda görmesi için
-- AYRI bir `authenticated`-only "admin bypass" politikası eklenir (OR'lanır).
--
-- Demo kolon adları (canlıda doğrulandı):
--   pitches/communities/tournaments → is_demo   |   matches/goalkeepers/referees → "isDemo"
-- ============================================================================

-- ─── pitches ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS pitches_select_public ON public.pitches;
CREATE POLICY pitches_select_public ON public.pitches
  FOR SELECT TO public
  USING (is_demo IS NOT TRUE OR public.get_config_bool('demo_mode_enabled'));
DROP POLICY IF EXISTS pitches_select_admin_demo ON public.pitches;
CREATE POLICY pitches_select_admin_demo ON public.pitches
  FOR SELECT TO authenticated USING (public.is_platform_admin());

-- ─── matches ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS matches_select_public ON public.matches;
CREATE POLICY matches_select_public ON public.matches
  FOR SELECT TO public
  USING ("isDemo" IS NOT TRUE OR public.get_config_bool('demo_mode_enabled'));
DROP POLICY IF EXISTS matches_select_admin_demo ON public.matches;
CREATE POLICY matches_select_admin_demo ON public.matches
  FOR SELECT TO authenticated USING (public.is_platform_admin());

-- ─── goalkeepers ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public read goalkeepers" ON public.goalkeepers;
CREATE POLICY "Public read goalkeepers" ON public.goalkeepers
  FOR SELECT TO public
  USING ("isDemo" IS NOT TRUE OR public.get_config_bool('demo_mode_enabled'));
DROP POLICY IF EXISTS goalkeepers_select_admin_demo ON public.goalkeepers;
CREATE POLICY goalkeepers_select_admin_demo ON public.goalkeepers
  FOR SELECT TO authenticated USING (public.is_platform_admin());

-- ─── referees ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public read referees" ON public.referees;
CREATE POLICY "Public read referees" ON public.referees
  FOR SELECT TO public
  USING ("isDemo" IS NOT TRUE OR public.get_config_bool('demo_mode_enabled'));
DROP POLICY IF EXISTS referees_select_admin_demo ON public.referees;
CREATE POLICY referees_select_admin_demo ON public.referees
  FOR SELECT TO authenticated USING (public.is_platform_admin());

-- ─── communities ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Communities viewable by authenticated" ON public.communities;
CREATE POLICY "Communities viewable by authenticated" ON public.communities
  FOR SELECT TO public
  USING (is_demo IS NOT TRUE OR public.get_config_bool('demo_mode_enabled'));
DROP POLICY IF EXISTS communities_select_admin_demo ON public.communities;
CREATE POLICY communities_select_admin_demo ON public.communities
  FOR SELECT TO authenticated USING (public.is_platform_admin());

-- ─── tournaments ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS tournaments_public_read ON public.tournaments;
CREATE POLICY tournaments_public_read ON public.tournaments
  FOR SELECT TO public
  USING (is_demo IS NOT TRUE OR public.get_config_bool('demo_mode_enabled'));
DROP POLICY IF EXISTS tournaments_select_admin_demo ON public.tournaments;
CREATE POLICY tournaments_select_admin_demo ON public.tournaments
  FOR SELECT TO authenticated USING (public.is_platform_admin());
