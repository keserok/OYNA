-- ============================================================================
-- ŞİFRE SIFIRLAMA KODLARI — "şifremi unuttum" akışı (6 haneli e-posta kodu)
-- ----------------------------------------------------------------------------
-- Uygulama girişine e-posta+şifre eklendi. Şifre sıfırlama, Supabase'in
-- native recovery'si yerine tam-kontrollü bir akışla yapılır:
--   1) password-reset-request edge fn → 6 haneli kod üretir, HASH'ini burada
--      saklar, kodu mevcut Resend `send-email` fonksiyonuyla e-postaya yollar.
--   2) password-reset-confirm edge fn → kodu doğrular, service-role ile yeni
--      şifreyi yazar (auth.admin.updateUserById).
--
-- GÜVENLİK:
--   • Yalnızca kodun SHA-256 hash'i saklanır (düz kod asla DB'de durmaz).
--   • RLS AÇIK ve POLİTİKA YOK → anon/authenticated istemciler bu tabloyu
--     okuyamaz/yazamaz; yalnız service-role (edge fn) erişir.
--   • Kısa ömür (edge fn'de 10 dk), tek kullanım (used), deneme sayacı (attempts).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.password_reset_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL,
  code_hash   text NOT NULL,
  expires_at  timestamptz NOT NULL,
  used        boolean NOT NULL DEFAULT false,
  attempts    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prc_email_created
  ON public.password_reset_codes (lower(email), created_at DESC);

-- RLS açık, politika yok → sadece service-role (edge fn) erişebilir.
ALTER TABLE public.password_reset_codes ENABLE ROW LEVEL SECURITY;

-- Süresi geçmiş kodları temizlemek için yardımcı (edge fn ya da cron çağırabilir).
CREATE OR REPLACE FUNCTION public.purge_expired_reset_codes()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  DELETE FROM public.password_reset_codes
  WHERE expires_at < now() - interval '1 day';
$$;

REVOKE ALL ON FUNCTION public.purge_expired_reset_codes() FROM PUBLIC, anon, authenticated;
