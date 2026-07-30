-- ============================================================================
-- IP-18 — Profil maç geçmişi: kullanıcı kapsamlı sorgu
-- ============================================================================
--
-- SORUN
--   `getMatchHistory(userId)` istemcide şunu yapıyordu:
--
--       select * from matches where status='COMPLETED' order by date desc limit 50
--
--   ...sonra katılımcı süzgecini TARAYICIDA uyguluyordu. `userId` hiçbir sorgu
--   filtresinde geçmiyordu. RLS de daraltmıyor (matches_select_auth yalnız
--   demo maçları eliyor). Yani platformda 50'den fazla tamamlanmış maç biriktiği
--   gün, kullanıcının kendi maçları o 50'lik pencerenin dışına düşüyor ve
--   profilde geçmiş SESSİZCE boşalıyor. Boşalınca galibiyet oranı da çöküyor
--   ve oyuncu kartı "çaylak" moduna düşüyor.
--
--   Ayrıca `select('*')` 50 maçın tam slots/awaySlots JSONB'sini indiriyordu.
--
-- ÇÖZÜM
--   Katılım zaten İLİŞKİSEL bir tabloda duruyor: `match_participants`
--   (match_id, user_id, role, status) — her katılım/slot alımı RPC'si oraya
--   yazıyor. JSONB içinde arama yapmaya gerek yok; indeksli bir JOIN yeterli.
--
--   Skor durumu da yeniden hesaplanmıyor: `matches.score_status` kolonu
--   (20260728113125) zaten ENTERED / NOT_ENTERED / PENDING diye türetiliyor ve
--   trigger ile sürdürülüyor. Arayüz bugüne kadar bu kolonu hiç okumuyordu ve
--   "skor boş mu" sorusunu ikinci bir yoldan (homeScore ?? 0) cevaplıyordu —
--   o yüzden skorsuz maçlar "0 - 0 BERABERLİK" görünüyordu.
--
-- NOT — sıralama
--   `matches.date` bir `text` kolonudur; düz metin sıralaması "18.05.2026"
--   gibi değerlerde yanlıştır. Bu yüzden `starts_at` (timestamptz) birincil
--   sıralama anahtarıdır; yoksa `joined_at`e düşülür.
-- ============================================================================

-- ─── Katılım tablosuna kapsam indeksi ───────────────────────────────────────
-- Sorgu "bu kullanıcının katıldığı maçlar" diye başlıyor; user_id öncelikli.
CREATE INDEX IF NOT EXISTS match_participants_user_match_idx
  ON public.match_participants (user_id, match_id);

-- ─── Profil maç geçmişi ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_match_history(p_limit int DEFAULT 50)
RETURNS TABLE (
  id           uuid,
  date         text,
  "time"       text,
  location     text,
  title        text,
  "homeScore"  int,
  "awayScore"  int,
  score_status text,
  is_away      boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    m.id,
    m.date,
    m."time",
    m.location,
    m.title,
    m."homeScore",
    m."awayScore",
    -- Eski satırlarda kolon boş olabilir: skor varsa girilmiş, yoksa girilmemiş.
    COALESCE(
      m.score_status,
      CASE WHEN m."homeScore" IS NOT NULL AND m."awayScore" IS NOT NULL
           THEN 'ENTERED' ELSE 'NOT_ENTERED' END
    ) AS score_status,
    (mp.role = 'away') AS is_away
  FROM public.match_participants mp
  JOIN public.matches m ON m.id = mp.match_id
  WHERE mp.user_id = (SELECT auth.uid())
    AND m.status = 'COMPLETED'
    AND m."isDemo" IS NOT TRUE
  ORDER BY COALESCE(m.starts_at, mp.joined_at) DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(p_limit, 200));
$$;

COMMENT ON FUNCTION public.get_my_match_history(int) IS
  'IP-18: Profil maç geçmişi. Katılım match_participants üzerinden SUNUCUDA süzülür (eski hâli platformun tamamını çekip tarayıcıda süzüyordu). Skor durumu matches.score_status''tan gelir; skorsuz maç 0-0 beraberlik SAYILMAZ.';

-- SECURITY DEFINER: yalnız çağıranın kendi satırlarını döndürür (auth.uid()
-- gövdede sabit). Anonim erişim yok.
REVOKE ALL ON FUNCTION public.get_my_match_history(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_match_history(int) TO authenticated;
