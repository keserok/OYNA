# OYNA — Güvenlik Sertleştirme Planı (Zero-Trust)

> Bu plan, **canlı Supabase projesi (`iikvzgyccvgcybzdfwlv`) + kod tabanı** üzerinde
> yapılan denetimden çıkmıştır. Her bulgu gerçek `pg_policies` / `pg_proc` satırı,
> gerçek fonksiyon gövdesi veya `file:line` ile kanıtlıdır. Genel tavsiye yoktur.
> Bulgular 4 paralel uzman ajan + adversaryal doğrulayıcı turundan geçmiştir.
>
> **Mevcut durum iyi:** RLS 70/70 tabloda açık, 206 policy, fonksiyonlarda `search_path`
> kilitli, `anon` EXECUTE büyük ölçüde kaldırılmış, GiST `EXCLUDE` ile çifte-rezervasyon
> DB seviyesinde engelli, skor için `propose/approve` çift-onay akışı mevcut. Plan bu
> temelin **kalan boşluklarını** kapatır — işlevselliği bozmadan.

## Lejant
- 🟢 **HAZIR** — repoda migration/konfig olarak yazıldı, gözden geçirip apply edin.
- 🟡 **STAGING** — hazır ama önce staging'de test edilmeli (akış-bağımlı).
- 🔵 **PANEL** — Supabase Dashboard / Vercel ayarı (kod değil).

---

## 🔴 EN KRİTİK 3 RİSK (OYNA'ya özel)

### 1) Ücretsiz slot işgali ile "rezervasyon-DoS" — rakip botların asıl silahı
Bir bot/sahte hesap, **ödeme yapmadan** her saha-saat slotunu rezerve edip sistemi
boş gösterip kilitleyebilir. Çünkü `create_pitch_booking` kaydı `paid_amount = 0,
payment_status = 'PENDING'` ile açıyor; `auto_approve_pending_bookings` cron'u ~35 dk
sonra **ödemeye bakmadan** `PENDING → CONFIRMED` yapıyor. Üstüne `pitch_slot_holds`
10 dk'lık kilidi **kullanıcı başına sınırsız** ve `USING(true)` ile **anon dahil herkese
görünür** (rakip tüm doluluk haritasını çeker). Kullanıcı başına kota/hız limiti **yok**.
→ *Bulgular: VEC2-01, BL-01, BL-02, DB-06, BL-08.*

### 2) Tek taraflı skor / maç manipülasyonu — 4 ayrı yazma yolu, yalnız 1'i çift-onaylı
Çift-onaylı `propose/approve` akışı sağlam, ama **3 yol onu tamamen bypass ediyor:**
- `player_update_match`: maça slot alan **herhangi bir oyuncu** `homeScore/awayScore`
  yazabiliyor ve maçı `CANCELLED` yapabiliyor (**KRİTİK** — DB-01/BL-03).
- `finalize_match(p_home,p_away)`: kaptan/kurucu çift-onay olmadan keyfi skor + `COMPLETED`.
- `submit_match_score(token)`: tek QR token ile çift-onay atlanıp `COMPLETED` (BL-04).
- `matches` UPDATE RLS politikası **kolon kısıtlamıyor** → kaptan `PATCH /matches {homeScore}`
  ile doğrudan yazabiliyor.
→ Lig/istatistik/ödül (reliability_score, takım W/L) bütünlüğü manipüle edilir.

### 3) Sınırsız veri kazıma + hiçbir katmanda rate-limit yok
`pitches`, `courts`, `pitch_tariffs`, `pitch_availability_exceptions`, `pitch_flash_deals`,
`matches` SELECT politikaları `USING(true)` ve `{public}` → **tek anon key ile tüm
tarifeler, müsaitlik ve maçlar (slots JSON'unda oyuncu adı/avatar/rating PII'si dahil)**
toplu çekilebilir. DB'de/edge'de/PostgREST'te **hiçbir rate-limit yok**; 8 Edge Function'ın
tamamı `verify_jwt=false`. → *Bulgular: VEC2-02, VEC2-03, DB-03, VEC2-08.*

---

## VEKTÖR 1 — BaaS & Veritabanı Güvenliği (Supabase RLS + SECURITY DEFINER)

### 1.1 🟡 Maç skoru bütünlüğü — tek-taraflı skor yazımını kapat (DB-01, BL-03, BL-04) — **KRİTİK**
**Dosya:** `supabase/migrations/20260708000100_faz8_match_score_integrity.sql`

`matches` üzerine **tek kapı** (BEFORE UPDATE trigger): skor değişiyorsa yalnız
(a) consensus/QR akışının işlem-içi bayrağı, ya da (b) kaptan/kurucu/admin geçer.
Cron'lar skoru *değiştirmediği* için (auto_finalize, `finalize_match`'i skorsuz çağırır →
`COALESCE` ile sabit) hiçbir sistem yolu kırılmaz.

```sql
-- ESKİ (eski durum): player_update_match — maça katılan HERHANGİ biri skoru yazıyor
UPDATE public.matches SET
  "homeScore" = CASE WHEN p_payload ? 'homeScore' THEN (p_payload->>'homeScore')::int ELSE "homeScore" END,
  "awayScore" = CASE WHEN p_payload ? 'awayScore' THEN (p_payload->>'awayScore')::int ELSE "awayScore" END
WHERE id = p_match_id;   -- yetki: yalnızca "katılımcı olmak"
```
```sql
-- OLMASI GEREKEN: matches'a skor-bütünlüğü trigger'ı (migration dosyasındaki tam sürüm)
CREATE OR REPLACE FUNCTION public.guard_match_score_integrity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NEW."homeScore" IS DISTINCT FROM OLD."homeScore"
     OR NEW."awayScore" IS DISTINCT FROM OLD."awayScore" THEN
    IF current_setting('oyna.authorized_score_write', true) = OLD.id::text THEN RETURN NEW; END IF;  -- consensus/QR
    IF v_uid IS NOT NULL AND (v_uid = OLD.captain_id OR v_uid = OLD."creatorId" OR public.is_platform_admin())
       THEN RETURN NEW; END IF;  -- kaptan/kurucu/admin
    RAISE EXCEPTION 'SCORE_FORBIDDEN: Skor yalnız kaptan/kurucu, admin ya da çift-onay akışından değiştirilebilir.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_guard_match_score BEFORE UPDATE ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.guard_match_score_integrity();
-- + _finalize_team_match_score ve submit_match_score'a set_config('oyna.authorized_score_write', <match_id>, true)
--   eklendi (migration'da gövdeler birebir korunarak). set_config istemciden çağrılamaz → bayrak taklit edilemez.
```
**Test (staging):** consensus onayı, QR ile skor, kaptan finalize, admin panel skor düzenleme
çalışmalı; normal oyuncunun `player_update_match` ile skor değiştirmesi `SCORE_FORBIDDEN` vermeli.

**Ek (P1 — iptal griefing):** `player_update_match` `status='CANCELLED'` geçişini de
yalnız kaptan/kurucu/admin'e kısıtlayın (trigger'a koymadık çünkü `QUORUM_NOT_MET` cron'u
status yazıyor; kapıyı fonksiyon içine ekleyin).

### 1.2 🟡 `finalize_match` keyfi skor (DB-02)
`finalize_match(p_home,p_away)` kaptan/kurucu'ya çift-onay olmadan skor yazdırıyor. 1.1
trigger'ı bunu **kaptan/kurucu** olarak geçirir (yani hâlâ çalışır) ama asıl hedef: skoru
**yalnız consensus** yazsın. Önerilen: `finalize_match` imzasından skor parametrelerini
kaldırıp yalnız ödül/finalize bıraktırın; skor `propose_match_score`'dan gelsin. (Frontend'in
`finalize_match`'e skor geçtiği yerleri önce `propose_match_score`'a yönlendirin.)

### 1.3 🟢 İç `_` helper'larının REST yüzeyini kapat (DB-04, VEC2-08)
**Dosya:** `supabase/migrations/20260708000200_faz8_revoke_internal_helper_execute.sql`

Advisor'ın işaretlediği 176 `authenticated`-executable DEFINER fonksiyondan, **RLS
policy'sinde geçmeyen** ve istemcinin çağırmadığı 10 iç helper'dan `authenticated/anon`
EXECUTE'u alır. `_is_team_member` (bir policy'de kullanılıyor) **bilerek hariç**.

```sql
-- ESKİ: /rest/v1/rpc/_are_friends, /_match_participant_ids ... authenticated'a açık (PII/enumeration sızıntısı)
-- OLMASI GEREKEN:
REVOKE EXECUTE ON FUNCTION public._are_friends(uuid,uuid)                         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._match_participant_ids(uuid)                    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._is_blocked_between(uuid,uuid)                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._provider_has_conflict(uuid,timestamptz,uuid)   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._in_quiet_hours(uuid)                           FROM PUBLIC, anon, authenticated;
-- (+ _is_team_admin, _match_both_sides_present, _recompute_provider_rating, _release_service_payout, _sync_profile_communities)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM authenticated;
```
> **Kırılmazlık kanıtı:** Bu 10 fonksiyon `pg_policy` ifadelerinde geçmiyor ve kodda
> `supabase.rpc('_...')` ile çağrılmıyor (grep ile teyit). Yalnız diğer DEFINER
> fonksiyonların içinden owner bağlamında çağrıldıkları için çalışmaya devam ederler.

### 1.4 🟡 `matches` SELECT politikası public + slots PII sızıntısı (DB-03)
`matches_select_public` = `SELECT ... USING(true) TO {public}`; `slots` JSON'unda
oyuncu adı/avatar/rating var → anon herkesi okuyabiliyor.
```sql
-- ESKİ: CREATE POLICY matches_select_public ON public.matches FOR SELECT USING (true);  -- {public}
-- OLMASI GEREKEN: en az anon'u çıkar (uygulama girişli kullanır). Anon keşif gerekiyorsa
-- PII'siz bir VIEW/RPC üzerinden verin (slots'tan name/avatar maskelenmiş).
DROP POLICY matches_select_public ON public.matches;
CREATE POLICY matches_select_auth ON public.matches FOR SELECT TO authenticated USING (true);
```
> **Test:** Giriş yapmamış kullanıcının maç listesi görmesi gerekiyorsa bu kırar — önce
> anon akışını doğrulayın; gerekiyorsa maskeli view sağlayın.

### 1.5 🟢 Bedava-slot/hold DoS — kullanıcı-başı kota + hız + anon hold kapatma (DB-06, BL-01)
**Dosya:** `supabase/migrations/20260708000000_faz8_anti_abuse_guards.sql` *(EKLEMELİ, kırıcı değil)*
- `pitch_bookings` BEFORE INSERT: eşzamanlı ödenmemiş yaklaşan rezervasyon ≤ 5, 10 dk'da ≤ 8 deneme.
- `pitch_slot_holds` BEFORE INSERT: eşzamanlı aktif hold ≤ 3.
- `pitch_slot_holds` SELECT `USING(true)` → yalnız `authenticated`.
- `cleanup_expired_holds()` cron'u dakikada bir (zamanlanmamıştı).

### 1.6 🔵 `NULL`-uid bypass deseni kalanları (DB-07) ve eklentiler (DB-08)
`update_player_diamond`/`submit_match_score` gibi kalan fonksiyonlarda yetki kapısı
`auth.uid() IS NOT NULL AND ...` ise, **oturumsuz (anon) çağrıda kapı atlanır**. Hepsini
`auth.uid() IS DISTINCT FROM p_user_id` desenine çevirin (ekip bunu `process_match_payment`
vb. için zaten yapmış). `cube`/`earthdistance`/`btree_gist` eklentilerini `extensions`
şemasına taşıyın.

### 1.7 🔵 FORCE RLS — dikkat (DB-05)
Hiçbir tabloda `FORCE ROW LEVEL SECURITY` yok. **Körlemesine açmayın:** 176 DEFINER
fonksiyon owner (postgres) olarak çalışıp RLS'i kasıtlı bypass ediyor; FORCE açmak bunları
kırar. Gerçek koruma DEFINER fonksiyonların içindeki `auth.uid()` kontrolleridir (1.1/1.6).
FORCE'u yalnız DEFINER fonksiyon erişmeyen saf-kullanıcı tablolarında, staging testiyle açın.

---

## VEKTÖR 2 — API & Uç Nokta Koruması (rate-limit, scraping, reverse-engineering)

### 2.1 🟢/🟡 Rate-limit altyapısı — Postgres token-bucket (VEC2-03)
DB'de tek tablo + tek DEFINER fonksiyon; tüm hassas RPC/edge çağrılarının başında kullanılır.
```sql
-- OLMASI GEREKEN (yeni):
CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  bucket_key text PRIMARY KEY, tokens numeric NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;  -- policy YOK → yalnız DEFINER fn erişir

CREATE OR REPLACE FUNCTION public.rl_consume(p_key text, p_capacity numeric, p_refill_per_sec numeric, p_cost numeric DEFAULT 1)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE v_tokens numeric; v_updated timestamptz; v_now timestamptz := clock_timestamp();
BEGIN
  INSERT INTO public.rate_limit_buckets(bucket_key,tokens,updated_at) VALUES (p_key,p_capacity,v_now)
    ON CONFLICT (bucket_key) DO NOTHING;
  SELECT tokens, updated_at INTO v_tokens, v_updated FROM public.rate_limit_buckets WHERE bucket_key=p_key FOR UPDATE;
  v_tokens := least(p_capacity, v_tokens + extract(epoch FROM (v_now - v_updated)) * p_refill_per_sec);
  IF v_tokens < p_cost THEN
    UPDATE public.rate_limit_buckets SET tokens=v_tokens, updated_at=v_now WHERE bucket_key=p_key;
    RETURN false;
  END IF;
  UPDATE public.rate_limit_buckets SET tokens=v_tokens - p_cost, updated_at=v_now WHERE bucket_key=p_key;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.rl_consume(text,numeric,numeric,numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rl_consume(text,numeric,numeric,numeric) TO service_role;
-- Kullanım (edge fn içinde service-role ile): rl_consume('booking:'||uid, 10, 10.0/3600, 1)
```

### 2.2 🔵 Scraping yüzeyini daralt (VEC2-02)
- **Dashboard → Settings → API → Max rows = 100** (tek istekte tüm tablo çekilemez).
- Rakip-hassas **tarife** verisini anon'dan çek:
```sql
-- ESKİ: CREATE POLICY "Tariffs are publicly viewable" ON public.pitch_tariffs FOR SELECT USING (true);  -- {public}
-- OLMASI GEREKEN:
DROP POLICY "Tariffs are publicly viewable" ON public.pitch_tariffs;
CREATE POLICY pitch_tariffs_select_auth ON public.pitch_tariffs FOR SELECT TO authenticated USING (true);
```
- `get_pitch_availability`'e aralık tavanı: `IF (p_date_to - p_date_from) > 14 THEN RAISE EXCEPTION 'RANGE_TOO_WIDE'; END IF;`
- **Vercel WAF / Cloudflare** ile bot koruması (edge önünde).

### 2.3 🟡 Edge Function sertleştirme — CORS `*` + fail-open secret (VEC2-04/05/06/07)
8 fonksiyon da `verify_jwt=false`. Bazıları secret ile korunuyor ama **secret SET değilse
kontrol atlanıyor (fail-open)** ve CORS `*`.
```ts
// admin-broadcast — ESKİ (fail-OPEN): if (adminSecret && headerSecret !== adminSecret) { 401 }
// OLMASI GEREKEN (fail-CLOSED):
const adminSecret = Deno.env.get('ADMIN_EDGE_SECRET');
if (!adminSecret) return new Response(JSON.stringify({error:'MISCONFIGURED'}), {status:503, headers:corsHeaders});
if (req.headers.get('x-admin-secret') !== adminSecret) return new Response(JSON.stringify({error:'Unauthorized'}), {status:401, headers:corsHeaders});

// send-push / send-email / create-payment / admin-create-user — CORS '*' fallback'ini kaldır:
const ALLOWED = Deno.env.get('ALLOWED_ORIGIN'); if (!ALLOWED) throw new Error('ALLOWED_ORIGIN missing');
// + her birine rl_consume ile per-IP/per-user limit (örn. email:20/saat, payintent:10/saat)
```
- `send-push` aynı fail-open: `WEBHOOK_SECRET` yoksa **fail-closed (503)** yap.
- `create-payment`: prod'da `PAYMENT_PROVIDER=IYZICO` (SIMULATION değil); `confirm-sim`
  dalını prod build'de derleme.

### 2.4 🔵 Reverse-engineering / sızıntı
- `service_role` anahtarının **asla** client bundle'a girmediğini doğrula (`grep -r SERVICE_ROLE src`).
- Prod build'de source-map kapalı; `/admin` rewrite'ı admin-auth arkasında.

---

## VEKTÖR 3 — Kimlik Doğrulama & Oturum Yönetimi

### 3.1 🔵 Oturum süresizliği + refresh rotasyonu (AUTH-05) — **canlıda 11/11 oturumun `not_after`'ı NULL**
Supabase Dashboard → Auth (veya Management API `PATCH /v1/projects/{ref}/config/auth`):
```jsonc
{
  "sessions_timebox": "720h",                  // mutlak: 30 gün
  "sessions_inactivity_timeout": "24h",        // hareketsizlik
  "refresh_token_rotation_enabled": true,      // doğrula (açık olmalı)
  "security_refresh_token_reuse_interval": 10, // çalıntı refresh token tespiti
  "jwt_exp": 1800                              // access token 3600 → 900-1800 sn
}
```

### 3.2 🟡 Captcha + OTP/SMS bombing koruması (AUTH-03, AUTH-07)
- Dashboard → Auth → **Bot & Abuse Protection: hCaptcha/Turnstile** + Rate Limits düşür
  (SMS/Email OTP 3/saat/IP, OTP expiry ≤ 600 sn, OTP length 8).
- `supabaseAuth.ts`: tüm OTP çağrılarına `captchaToken` geçir; **sign-in/sign-up'ı ayır**:
```ts
// ESKİ: signInWithOtp({ email, options: { shouldCreateUser: true } })  // captcha yok, enumeration
// OLMASI GEREKEN:
export const sendEmailOtpSignIn = (email, captchaToken) =>
  supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false, captchaToken } }); // giriş
export const sendEmailOtpSignUp = (email, captchaToken) =>
  supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true, captchaToken } });  // kayıt
// hata mesajlarını eşitle (hesap var/yok sızmasın)
```

### 3.3 🟢/🔵 localStorage token hırsızlığı + CSP (AUTH-02)
Oturum tokeni `localStorage`'da (XSS ile çalınabilir) ve CSP header'ı yoktu.
**Dosya:** `vercel.json` — `Strict-Transport-Security` + `Content-Security-Policy-Report-Only`
eklendi (önce gözlemle, temizse enforce'a çevir). Native'de tokeni `@capacitor/preferences`
güvenli deposuna taşımayı değerlendirin.

### 3.4 ✅ Doğrulanmış POZİTİF (AUTH-06)
Rol/admin yetkisi **JWT `user_metadata`'dan DEĞİL**, `is_platform_admin()` ile DB
`profiles`'tan türetiliyor → `user_metadata` kullanıcı-yazılabilir olsa da **privilege
escalation yok**. Bu doğru tasarım; koruyun.

### 3.5 🟡 Cihaz bağlama (AUTH-08)
Hassas işlemler (ödeme/admin) için tarayıcı-fingerprint **değil**, cihazda üretilen
rastgele `device_id` (`@capacitor/preferences` + `trusted_devices` tablosu); ilk kullanımda
e-posta/SMS onayı. MFA şu an 0 kullanıcıda — admin rolleri için MFA'yı zorunlu kılın.

---

## VEKTÖR 4 — İş Mantığı İstismarı (Anti-Fraud)

### 4.1 🟢 Ödemeden bağımsız rezervasyon (BL-02) + hold-bypass (BL-08)
- 1.5'teki kota/hız trigger'ı + `auto_approve` yerine **ödeme yakalanınca CONFIRMED**
  modeline geçiş (PSP canlıya alınınca): ödenmemiş PENDING'i N dk sonra **CONFIRMED yapma,
  iptal et** (slotu serbest bırak).
- `create_pitch_booking`'e başkasının aktif hold'unu reddet:
```sql
-- INSERT'ten önce:
IF EXISTS (SELECT 1 FROM public.pitch_slot_holds h
  WHERE h.pitch_id=p_pitch_id AND h.court_id=p_court_id AND h.booking_date=p_booking_date
    AND h.start_time=p_start_time AND h.expires_at>now() AND h.held_by IS DISTINCT FROM auth.uid())
THEN RAISE EXCEPTION 'SLOT_HELD: Bu saat başka kullanıcı tarafından geçici tutulmuş.'; END IF;
```

### 4.2 🟡 Maç spam'i (BL-05)
`player_create_match`'e is_banned kontrolünden sonra kota ekle:
```sql
IF (SELECT count(*) FROM public.matches WHERE "creatorId"=v_uid AND created_at>now()-interval '1 hour') >= 5
  THEN RAISE EXCEPTION 'RATE_LIMIT: Saatte en fazla 5 maç.'; END IF;
IF (SELECT count(*) FROM public.matches WHERE "creatorId"=v_uid AND created_at>now()-interval '24 hours') >= 20
  THEN RAISE EXCEPTION 'RATE_LIMIT: Günde en fazla 20 maç.'; END IF;
CREATE INDEX IF NOT EXISTS idx_matches_creator_created ON public.matches("creatorId", created_at);
```

### 4.3 🟡 Promo indiriminin sunucu tarafında uygulanmaması (BL-07)
Şu an indirim **istemci fiyatına** güveniliyor; sunucuda atomik tüketen RPC yok.
```sql
-- OLMASI GEREKEN: redeem_promo — kodu doğrula, indirimi hesapla, redemption'ı atomik tüket
CREATE OR REPLACE FUNCTION public.redeem_promo(p_code text, p_base_amount numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_uid uuid := auth.uid(); c public.promo_codes; v_used int; v_disc numeric; v_final numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT * INTO c FROM public.promo_codes WHERE code=upper(trim(p_code)) AND is_active
    AND (valid_until IS NULL OR valid_until>now()) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_PROMO'; END IF;
  IF c.max_redemptions IS NOT NULL THEN
    SELECT count(*) INTO v_used FROM public.promo_redemptions WHERE promo_id=c.id;
    IF v_used >= c.max_redemptions THEN RAISE EXCEPTION 'PROMO_EXHAUSTED'; END IF;
  END IF;
  INSERT INTO public.promo_redemptions (promo_id, user_id) VALUES (c.id, v_uid);  -- UNIQUE(promo_id,user_id) tek-kullanım
  v_disc := CASE WHEN c.discount_type='PERCENT' THEN round(p_base_amount*c.discount_value/100,2)
                 ELSE least(c.discount_value, p_base_amount) END;
  v_final := greatest(0, p_base_amount - v_disc);
  RETURN jsonb_build_object('discount', v_disc, 'final_amount', v_final);
END; $$;
-- NOT: kolon adlarını (discount_type/discount_value/max_redemptions/valid_until) kendi şemanızla doğrulayın.
```
> Ödeme tutarı **her zaman** sunucudaki `final_amount`'tan alınmalı, istemciden gelen fiyata güvenilmemeli.

### 4.4 🟡 QR token skoru / claimCode (BL-04, BL-06)
- `submit_match_score`: tek token ile `COMPLETED` yerine **onay-bekleyen öneri** üretsin
  (dual-confirm); 1.1 trigger'ı şimdilik mevcut davranışı korur, bu P1 iyileştirme.
- Davet `claimCode`'ları `matches.slots` içinde herkese görünür ve tahmin edilebilir md5 —
  `gen_random_uuid()` tabanlı, listeden gizli (yalnız davetliye dönen) hale getirin.

### 4.5 🔵 Sahte GPS / check-in
Check-in/ödül **istemci GPS'ine** güvenmemeli. Konumu sunucuda saha koordinatına mesafe
ile doğrulayın (PostGIS/`earthdistance`); "checked_in" bayrağını istemciden kabul etmeyin,
saha personeli QR'ı veya sunucu-taraflı mesafe kontrolü tetiklesin.

---

## Uygulama Sırası (önerilen)

| Sıra | Madde | Tür | Risk |
|---|---|---|---|
| 1 | 1.5 anti-abuse (booking/hold kota+hız, anon hold kapat) | 🟢 HAZIR | Düşük (eklemeli) |
| 2 | 1.3 iç helper EXECUTE revoke | 🟢 HAZIR | Düşük (kanıtlı) |
| 3 | 3.3 vercel HSTS+CSP-Report-Only | 🟢 HAZIR | Yok (report-only) |
| 4 | 3.1 + 3.2 oturum timeout + captcha | 🔵 PANEL | Düşük |
| 5 | 1.1 skor bütünlüğü trigger | 🟡 STAGING | Orta (akış testi) |
| 6 | 2.1 rate-limit altyapısı + 2.3 edge fail-closed | 🟡 STAGING | Orta |
| 7 | 2.2 + 1.4 scraping/PII daraltma | 🟡 STAGING | Orta (anon akışı) |
| 8 | 4.2/4.3/4.4/4.5 spam/promo/QR/GPS | 🟡 STAGING | Orta |

### Bu commit'le repoya eklenen HAZIR dosyalar
- `supabase/migrations/20260708000000_faz8_anti_abuse_guards.sql`
- `supabase/migrations/20260708000100_faz8_match_score_integrity.sql`
- `supabase/migrations/20260708000200_faz8_revoke_internal_helper_execute.sql`
- `vercel.json` (HSTS + CSP-Report-Only)

> **Önemli:** Migration'lar bilinçli olarak **canlı prod DB'ye uygulanmadı** (denetim
> READ-ONLY yürütüldü). Önce staging/branch DB'de `supabase db push` ile test edip,
> yukarıdaki test notlarını doğrulayıp prod'a alın.
