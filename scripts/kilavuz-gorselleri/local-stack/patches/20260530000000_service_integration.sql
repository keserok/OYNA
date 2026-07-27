-- SÜRÜKLENME TELAFİSİ (yalnız yerel yığın için)
--
-- Depo migration'ı `goalkeepers.match_count` / `referees.match_count` (snake_case)
-- oluşturuyor; üretim veritabanında ise bu kolonlar `"matchCount"` (camelCase).
-- Sonraki 14 migration camelCase adı kullandığı için sıfırdan kurulan bir
-- veritabanı depoyla ayağa kalkmıyor. Üretimde kolon depo dışında yeniden
-- adlandırılmış olmalı.
--
-- Bu dosya SADECE yerel ekran görüntüsü kopyasını üretimle hizalar; üretime
-- uygulanacak bir düzeltme DEĞİLDİR (gerçek çözüm: depoya bir rename migration'ı
-- eklemek — ayrı bir karar).
-- Üretimle karşılaştırıldığında sürüklenen kolonlar (goalkeepers + referees):
--   match_count     → "matchCount"
--   preferred_zones → "preferredZones"
--   recent_awards   → "recentAwards"
--   is_elite        → "isElite"
DO $$
DECLARE
  t text;
  r record;
  renames text[][] := ARRAY[
    ARRAY['match_count',     'matchCount'],
    ARRAY['preferred_zones', 'preferredZones'],
    ARRAY['recent_awards',   'recentAwards'],
    ARRAY['is_elite',        'isElite']
  ];
BEGIN
  FOREACH t IN ARRAY ARRAY['goalkeepers', 'referees'] LOOP
    FOR r IN SELECT renames[i][1] AS src, renames[i][2] AS dst
             FROM generate_subscripts(renames, 1) AS i
    LOOP
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = t AND column_name = r.src
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = t AND column_name = r.dst
      ) THEN
        EXECUTE format('ALTER TABLE public.%I RENAME COLUMN %I TO %I', t, r.src, r.dst);
      END IF;
    END LOOP;
  END LOOP;
END $$;
