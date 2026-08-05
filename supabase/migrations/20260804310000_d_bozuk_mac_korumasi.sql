-- ═══════════════════════════════════════════════════════════════════════════
-- D PAKETİ — BOZUK MAÇ KORUMASI · CEO kararı, 4 Ağustos 2026
--
-- İKİ AYRI SORUN BULUNDU (ikincisi tarama sırasında ortaya çıktı):
--
-- D1a — SONSUZ TEKRAR: auto_process_matches, işleyemediği maçta yalnız
--   uyarı basıp geçiyor. Maç ACTIVE kaldığı için koşul hep doğru kalıyor ve
--   aynı bozuk maç 10 dakikada bir SONSUZA KADAR yeniden deneniyor.
--
-- D1b — TOPLU DURMA (daha ciddi): auto_finalize_matches'ta hata yakalama
--   HİÇ YOK. Tek bir maç hata verirse döngü orada kopuyor ve o turdaki
--   DİĞER BÜTÜN MAÇLAR hiç sonuçlandırılmıyor. Bir bozuk kayıt, sağlam
--   maçların parasının dağıtılmasını da durdurabilir.
--
-- ÇÖZÜM: Deneme sayacı + "elle bakılmalı" rafı.
--   • 3 başarısız denemeden sonra maç rafa alınır, otomatik iş onu atlar
--   • panelde listelenir, yönetici bakıp rafı temizleyebilir
--   • sağlık denetimi rafta maç varsa uyarır (P-0: bozulan korumayı kim söyleyecek?)
--
-- BOZMA RİSKİ — bilerek düşük tutuldu:
--   Yeni bilgi matches.status'a DEĞİL, AYRI SÜTUNLARA yazılıyor. Böylece
--   maç durumunu okuyan hiçbir ekran, hiçbir sorgu etkilenmiyor.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1) Ayrı sütunlar (status'a dokunulmuyor) ─────────────────────────────
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS supurucu_deneme      int         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supurucu_son_hata    text,
  ADD COLUMN IF NOT EXISTS supurucu_son_deneme  timestamptz,
  ADD COLUMN IF NOT EXISTS elle_bakilmali       boolean     NOT NULL DEFAULT false;

COMMENT ON COLUMN public.matches.elle_bakilmali IS
  'true = otomatik iş bu maçı 3 kez işleyemedi, artık denemiyor. Panelden bakılmalı.';

CREATE INDEX IF NOT EXISTS matches_elle_bakilmali_idx
  ON public.matches (elle_bakilmali) WHERE elle_bakilmali;

-- ─── 2) Başarısızlığı kaydeden yardımcı ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.supurucu_hata_kaydet(p_match_id uuid, p_hata text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_deneme int;
BEGIN
  UPDATE public.matches
     SET supurucu_deneme     = supurucu_deneme + 1,
         supurucu_son_hata   = left(COALESCE(p_hata, 'bilinmeyen hata'), 500),
         supurucu_son_deneme = now()
   WHERE id = p_match_id
  RETURNING supurucu_deneme INTO v_deneme;

  IF v_deneme >= 3 THEN
    UPDATE public.matches SET elle_bakilmali = true WHERE id = p_match_id;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Sayaç tutulamıyorsa bile ana iş durmasın.
  RAISE WARNING 'supurucu_hata_kaydet basarisiz (%): %', p_match_id, SQLERRM;
END; $$;

REVOKE ALL ON FUNCTION public.supurucu_hata_kaydet(uuid, text) FROM PUBLIC, anon, authenticated;

-- ─── 3) auto_process_matches — rafı atla + sayacı işlet ───────────────────
-- Gövde birebir aynı; iki değişiklik:
--   (a) sorguya "AND NOT elle_bakilmali" eklendi
--   (b) EXCEPTION bloğu artık sayacı da işletiyor
--   (c) başarılı işlemde sayaç sıfırlanıyor (geçici hata kalıcıya dönmesin)
CREATE OR REPLACE FUNCTION public.auto_process_matches()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE
  v_uyari_saat numeric := COALESCE(public.get_config_number('match_last_call_hours', 8), 8);
  v_karar_dk   numeric := COALESCE(public.get_config_number('match_decision_minutes', 90), 90);
  v_match RECORD; v_counts RECORD; v_uyarilan int := 0; v_islenen int := 0; v_rafa int := 0;
BEGIN
  FOR v_match IN
    SELECT mm.id, mm.title, mm."creatorId", mm.captain_id
    FROM public.matches mm
    WHERE mm.status = 'ACTIVE' AND mm.starts_at IS NOT NULL
      AND NOT mm.elle_bakilmali
      AND mm.starts_at >  now() + make_interval(mins => v_karar_dk::int)
      AND mm.starts_at <= now() + make_interval(mins => (v_uyari_saat * 60)::int)
      AND NOT EXISTS (SELECT 1 FROM public.notifications n
                      WHERE n.match_id = mm.id AND n.type_key = 'match_last_call')
  LOOP
    SELECT * INTO v_counts FROM public._match_player_counts(v_match.id);
    CONTINUE WHEN v_counts.filled_slots >= v_counts.min_players;
    PERFORM public._notify_deposit(
      COALESCE(v_match."creatorId", v_match.captain_id), v_match.id, 'match_last_call',
      jsonb_build_object(
        'match_title', COALESCE(v_match.title, 'Maçın'),
        'filled', v_counts.filled_slots::text,
        'total',  v_counts.total_slots::text,
        'needed', GREATEST(v_counts.min_players - v_counts.filled_slots, 0)::text,
        'minutes', v_karar_dk::int::text));
    v_uyarilan := v_uyarilan + 1;
  END LOOP;

  FOR v_match IN
    SELECT id FROM public.matches
    WHERE status = 'ACTIVE' AND starts_at IS NOT NULL
      AND NOT elle_bakilmali
      AND starts_at <= now() + make_interval(mins => v_karar_dk::int)
  LOOP
    BEGIN
      PERFORM public.process_match_at_deadline(v_match.id);
      v_islenen := v_islenen + 1;
      -- Başarılı: geçmiş geçici hatalar kalıcı sayılmasın.
      UPDATE public.matches SET supurucu_deneme = 0, supurucu_son_hata = NULL
       WHERE id = v_match.id AND supurucu_deneme > 0;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Maç kararı verilemedi (%): %', v_match.id, SQLERRM;
      PERFORM public.supurucu_hata_kaydet(v_match.id, SQLERRM);
      v_rafa := v_rafa + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('son_cagri', v_uyarilan, 'karar_verilen', v_islenen,
    'hata_alan', v_rafa, 'uyari_saat', v_uyari_saat, 'karar_dakika', v_karar_dk);
END; $function$;

-- ─── 4) auto_finalize_matches — TOPLU DURMAYI ÖNLE ────────────────────────
-- Eskiden hiç hata yakalama yoktu: bir maç patlarsa sonrakilerin hiçbiri
-- sonuçlandırılamıyordu. Artık her maç kendi başına korunuyor.
CREATE OR REPLACE FUNCTION public.auto_finalize_matches()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE
  v_match     RECORD;
  v_finalized int := 0;
  v_hatali    int := 0;
BEGIN
  FOR v_match IN
    SELECT id FROM public.matches
    WHERE confirmed_at IS NOT NULL
      AND cancel_reason IS NULL
      AND is_successful IS NOT TRUE
      AND NOT elle_bakilmali
      AND starts_at IS NOT NULL
      AND starts_at < now() - interval '3 hours'
      AND status IN ('CONFIRMED','LIVE','COMPLETED')
  LOOP
    BEGIN
      PERFORM public.finalize_match(v_match.id);
      v_finalized := v_finalized + 1;
      UPDATE public.matches SET supurucu_deneme = 0, supurucu_son_hata = NULL
       WHERE id = v_match.id AND supurucu_deneme > 0;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Maç sonuçlandırılamadı (%): %', v_match.id, SQLERRM;
      PERFORM public.supurucu_hata_kaydet(v_match.id, SQLERRM);
      v_hatali := v_hatali + 1;
    END;
  END LOOP;
  RETURN jsonb_build_object('finalized', v_finalized, 'hata_alan', v_hatali);
END;
$function$;

-- ─── 5) Panel: elle bakılacaklar ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_elle_bakilacaklar()
RETURNS TABLE (match_id uuid, baslik text, basliyor timestamptz, durum text,
               deneme int, son_hata text, son_deneme timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Yetkisiz.'; END IF;
  RETURN QUERY
  SELECT m.id, m.title, m.starts_at, m.status,
         m.supurucu_deneme, m.supurucu_son_hata, m.supurucu_son_deneme
  FROM public.matches m
  WHERE m.elle_bakilmali
  ORDER BY m.supurucu_son_deneme DESC NULLS LAST;
END; $$;

-- Rafı temizle → otomatik iş bu maçı yeniden dener.
CREATE OR REPLACE FUNCTION public.admin_raftan_indir(p_match_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Yetkisiz.'; END IF;
  UPDATE public.matches
     SET elle_bakilmali = false, supurucu_deneme = 0, supurucu_son_hata = NULL
   WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Maç bulunamadı.'; END IF;
  PERFORM public.log_admin_action('SUPURUCU_RAFTAN_INDIR', 'match', p_match_id, NULL, NULL, NULL);
END; $$;

REVOKE ALL ON FUNCTION public.admin_elle_bakilacaklar()      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_raftan_indir(uuid)       FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_elle_bakilacaklar()   TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_raftan_indir(uuid)    TO authenticated;

-- ─── DOĞRULAMA ────────────────────────────────────────────────────────────
DO $$
DECLARE v_test uuid; v_deneme int; v_rafta boolean;
BEGIN
  -- Sütunlar var mı
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='matches'
                    AND column_name='elle_bakilmali') THEN
    RAISE EXCEPTION 'DOGRULAMA: elle_bakilmali sutunu olusmadi.';
  END IF;

  -- Sayaç gerçekten 3'te rafa alıyor mu? Var olan bir maçta dene, sonra geri al.
  SELECT id INTO v_test FROM public.matches LIMIT 1;
  IF v_test IS NOT NULL THEN
    PERFORM public.supurucu_hata_kaydet(v_test, 'DOGRULAMA testi 1');
    PERFORM public.supurucu_hata_kaydet(v_test, 'DOGRULAMA testi 2');
    SELECT supurucu_deneme, elle_bakilmali INTO v_deneme, v_rafta
      FROM public.matches WHERE id = v_test;
    IF v_rafta THEN
      UPDATE public.matches SET elle_bakilmali=false, supurucu_deneme=0, supurucu_son_hata=NULL WHERE id=v_test;
      RAISE EXCEPTION 'DOGRULAMA: 2 denemede rafa alindi — esik yanlis.';
    END IF;
    PERFORM public.supurucu_hata_kaydet(v_test, 'DOGRULAMA testi 3');
    SELECT elle_bakilmali INTO v_rafta FROM public.matches WHERE id = v_test;
    -- temizlik ÖNCE, sonra karar
    UPDATE public.matches SET elle_bakilmali=false, supurucu_deneme=0, supurucu_son_hata=NULL, supurucu_son_deneme=NULL WHERE id=v_test;
    IF NOT v_rafta THEN
      RAISE EXCEPTION 'DOGRULAMA: 3 denemede rafa ALINMADI — koruma calismyor.';
    END IF;
  END IF;

  RAISE NOTICE 'D paketi: bozuk mac korumasi dogrulandi.';
END $$;
