-- ==============================================================================
-- OW-A1 (V-1) — Saha puanı/yorum sayısı owner-yazımına kapatılır
-- ------------------------------------------------------------------------------
-- SORUN (canlı doğrulandı): "Owners can update their own pitches" RLS'i owner'a
-- kendi satırında UPDATE verir; protect_pitch_admin_flags / protect_pitch_identity
-- trigger'ları yalnız is_featured/flash/availability/map_label/kimlik alanlarını
-- kilitler — `rating`, `rating_count`, `google_rating`, `google_review_count`
-- HİÇBİR trigger'da yok. Sonuç: owner ham PostgREST PATCH ile kendi sahasına
-- rating=5, google_review_count=9999 yazıp vitrinde SAHTE 5★ + sahte yorum
-- gösterebilir (canlı test: owner 4.8→5.0, 0→9999 yazdı).
--
-- NEDEN is_admin() TRIGGER'INA EKLENMEZ: Meşru puan yazımı
-- (_recompute_pitch_rating, tr_pitch_rating_sync — SECURITY DEFINER) çoğu zaman
-- ADMIN OLMAYAN bir oyuncunun submit_pitch_rating'i sonucu tetiklenir; is_admin()
-- kapısı bunu kırardı.
--
-- NEDEN KOLON-REVOKE YETMEZ: Postgres'te tablo-düzeyi `GRANT UPDATE ON pitches`
-- varken kolon-düzeyi `REVOKE UPDATE(col)` etkisizdir (yetkiler BİRLEŞİR; canlı
-- test rating_blocked=f verdi). Belt-and-suspenders olarak REVOKE'lar da eklendi,
-- ama ASIL kapı aşağıdaki trigger'dır.
--
-- ÇÖZÜM (current_user'a göre): SECURITY DEFINER fonksiyon gövdesinde current_user
-- = tablo SAHİBİ (postgres); doğrudan PostgREST PATCH'inde current_user =
-- 'authenticated'/'anon'. Trigger yalnız doğrudan authenticated/anon yazımında
-- bu dört kolonun değişimini reddeder → sistem/definer yolları (puan hesabı,
-- admin_update_pitch) etkilenmez.
-- ==============================================================================

-- Belt-and-suspenders (tek başına yetersiz; ileride tablo grant'ı kolon-grant'a
-- çevrilirse bu kolonlar korunmuş kalır):
REVOKE UPDATE (rating, rating_count, google_rating, google_review_count)
  ON public.pitches FROM authenticated, anon;

-- ÖNEMLİ: SECURITY INVOKER (varsayılan) — DEFINER OLMAMALI. Trigger current_user'a
-- bakar; DEFINER olsaydı current_user daima fonksiyon sahibi olur, 'authenticated'
-- asla eşleşmez ve kapı çalışmazdı. INVOKER'da current_user = tetikleyen ifadenin
-- rolü: doğrudan PostgREST → 'authenticated'; SECURITY DEFINER fonksiyon gövdesi
-- → sahibi (postgres) → serbest.
CREATE OR REPLACE FUNCTION public.protect_pitch_rating_columns()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  -- Yalnız doğrudan istemci rolü (PostgREST) kısıtlanır; SECURITY DEFINER
  -- fonksiyonlar tablo sahibi olarak çalıştığından current_user farklıdır ve
  -- serbest geçer. Admin doğrudan yazarsa da (is_admin) izinlidir.
  IF current_user IN ('authenticated', 'anon') AND NOT public.is_admin() THEN
    IF NEW.rating              IS DISTINCT FROM OLD.rating
       OR NEW.rating_count        IS DISTINCT FROM OLD.rating_count
       OR NEW.google_rating       IS DISTINCT FROM OLD.google_rating
       OR NEW.google_review_count IS DISTINCT FROM OLD.google_review_count THEN
      RAISE EXCEPTION 'PITCH_RATING_WRITE_FORBIDDEN'
        USING HINT = 'Saha puanı ve yorum sayısı yalnız gerçek değerlendirmelerle (sistem) güncellenir; elle değiştirilemez.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_pitch_rating_columns ON public.pitches;
CREATE TRIGGER trg_protect_pitch_rating_columns
  BEFORE UPDATE ON public.pitches
  FOR EACH ROW EXECUTE FUNCTION public.protect_pitch_rating_columns();
