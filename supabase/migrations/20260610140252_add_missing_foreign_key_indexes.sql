-- [DB GEÇMİŞİNDEN KURTARILDI 2026-07-11] Bu migration canlı veritabanına uygulanmıştı ancak repoda dosyası yoktu; supabase_migrations.schema_migrations.statements kolonundan geri çıkarıldı.

-- DÜZELTME 6: İndekssiz foreign key kolonlarına fihrist ekle
-- (idx_fk_ önekiyle; geri alma scripti bu önekle topluca kaldırabilir)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass AS tbl,
           c.conname,
           (SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY x.ord)
              FROM unnest(c.conkey) WITH ORDINALITY AS x(attnum, ord)
              JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = x.attnum) AS cols
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE c.contype = 'f'
      AND n.nspname = 'public'
      AND NOT EXISTS (
        SELECT 1 FROM pg_index i
        WHERE i.indrelid = c.conrelid
          AND i.indkey[0] = c.conkey[1]
      )
  LOOP
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %s (%s)',
      'idx_fk_' || left(r.conname, 55),
      r.tbl,
      r.cols
    );
  END LOOP;
END $$;
