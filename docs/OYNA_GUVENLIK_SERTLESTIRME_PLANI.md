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

## ✅ Onaylanan Ürün Kararları (Faz 8 — master prensiplerle hizalı)
1. **Skor (§3.4):** Takım skoru **ortak/consensus** girilir → kendi takım arayüzlerine işlenir, **herkese görünen oyuncu reytinglerine yansımaz**. **Hakem & saha sahibi** skoru → takım arayüzlerine yansır (bu RPC'ler yazılınca skor-bütünlüğü bayrağını set etmeli). Admin override geçerli. → Skor trigger'ı **onaylandı**.
2. **Eşikler admin-ayarlı:** Booking/hold/spam tavanları artık **`app_config` → admin panel "GÜVENLİK" kategorisi**'nden ayarlanır (sabit değil).
3. **Promo (§4.6 lansmanda YOK):** `redeem_promo` migration'ı **kapsam dışı → silindi**. Promo özelliği açılırsa yeniden eklenir.
4. **Auth (§3.1):** **Tek onboarding akışı korunur** (giriş/kayıt bölünmez); enumeration/bombing koruması **captcha + rate-limit** ile sağlanır. **Telefon/SMS girişi kaldırılır** (prensip gereği).
5. **Oyuncu reytingi:** Maç slot'undaki `rating` (yetenek puanı; gizli `reliability_score`'dan ayrı) **görünür kalır**; yalnız gerçekten özel alanların sızmadığı doğrulanır. → `matches` PII daraltması **uygulanmaz**.

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

### 1.4 ✅ `matches` slots `rating` görünürlüğü — KARAR: görünür kalır (DB-03)
**Ürün kararı (5):** Slot'taki `rating` bir **yetenek puanı**dır ve §7.1'in gizli tuttuğu
`reliability_score`'dan **ayrı** bir kolondur (canlı şemada teyit edildi). Oyuncu reytingi
**görünür kalsın** istendiği için `matches` SELECT **daraltılmaz** ve `rating` slot'tan
**çıkarılmaz**. Yalnızca gerçekten özel alanların (reliability_score, telefon, e-posta)
slot/`matches` üzerinden **sızmadığı** doğrulandı — sızmıyor (slot yalnız ad/avatar/rating/
pozisyon/koordinat içerir). → Bu maddede kod değişikliği **yok**.

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

### 3.2 🔵 Captcha + OTP bombing koruması (AUTH-03, AUTH-07) — KARAR: tek akış + captcha
**Ürün kararı (4):** §3.1 "tek onboarding akışı" korunur → giriş/kayıt **bölünmez**
(`shouldCreateUser` ayrımı YAPILMAZ). Enumeration/bombing koruması **captcha + rate-limit**
ile sağlanır (UX değişmez). **Telefon/SMS girişi kaldırılır** (§3.1) → telefon OTP fonksiyonları
(`loginWithPhone`/`sendPhoneOtp`/`verifyPhoneOtp`) temizlenmeli.
- Dashboard → Auth → **Bot & Abuse Protection: hCaptcha/Turnstile** aç + Rate Limits düşür
  (Email OTP ~3/saat/IP, OTP expiry ≤ 600 sn, OTP length 8).
- `supabaseAuth.ts`: mevcut tek-akış çağrısına yalnız `captchaToken` eklenir (akış aynı kalır):
```ts
// OLMASI GEREKEN (tek akış korunur, sadece captcha eklenir):
export const sendEmailOtp = (email, captchaToken) =>
  supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true, captchaToken } });
// captchaToken provider (hCaptcha/Turnstile) site-key'i ile UI'dan üretilir.
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

### 4.3 ⛔ Promo indirimi (BL-07) — KARAR: KAPSAM DIŞI (silindi)
**Ürün kararı (3):** §4.6 "kupon/promosyon kodu **lansmanda YOK** (sonraya)". Bu nedenle
`redeem_promo` migration'ı **kaldırıldı** (`git rm`). Bugün kullanıcıya açık bir promo
kullanım yolu olmadığından aktif bir açık yok; özellik açılırsa **sunucu-taraflı atomik
`redeem_promo`** (kod doğrula → indirimi sunucuda hesapla → redemption'ı `UNIQUE(promo_id,
user_id)` ile atomik tüket; ödeme tutarı **her zaman** sunucudaki `final_amount`'tan) o
zaman eklenecek. İstemci fiyatına asla güvenilmez.

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

## VEKTÖR 5 — Admin Paneli (Ultra-Güvenlik)

> **Sağlam temel (doğrulandı):** Client'ta **service-role/secret YOK** (yalnız anon key +
> admin JWT); **tüm `admin_*` RPC'leri sunucu-taraflı** `is_platform_admin()`/`is_super_admin()`
> ile korunuyor ve anon'a kapalı; `admin_audit_log` + `log_admin_action()` mevcut;
> `admin-create-user` fail-closed. `/admin` statik bundle herkese açık olsa da yetkilendirme
> sunucuda olduğu için kabul edilebilir. **Canlı roster: 1 admin = 1 SUPER_ADMIN, 0 alt-rol,
> 0 MFA** → aşağıdaki düzeltmeler meşru admin için sıfır etki.

### 5.1 🟢 `admin_revoke_platform_role` → super-admin (A6)
**Dosya:** `supabase/migrations/20260708000700_faz8_admin_hardening.sql`. Grant `is_super_admin`
isterken revoke herhangi bir admin'e açıktı (asimetri → bir admin başkasının rolünü iptal
edebilir). Kapı `is_super_admin()`'e daraltıldı (gövde birebir; tek admin super → zero-impact).

### 5.2 🟢/🔵 MFA/2FA sunucu-taraflı zorunluluk (A1 — §8.6 "2FA")
**Sorun:** `is_platform_admin()` **aal2/MFA istemiyor**; aal1 admin JWT'si paneli baypas edip
RPC'leri doğrudan çağırabilir. **Şu an 0 MFA kayıtlı** → koda zorla bağlarsak admin kilitlenir.
- 🟢 `is_admin_aal2()` yardımcısı eklendi (kullanılmıyor → zero-impact).
- 🔵 **Sıra:** (1) Admin **TOTP kurar**; (2) Dashboard → Auth → **MFA enforcement** açılır;
  (3) kritik yazma RPC'lerinde `is_platform_admin()` → `is_admin_aal2()` yapılır. (3, admin-flow testi ister.)

### 5.3 🟢/🔵 Sunucu-taraflı alt-rol RBAC (A3 — FİNANS/OPERASYON)
**Sorun:** Alt-roller yalnız client-side (`adminPermissions.ts`); sunucuda her RPC `is_platform_admin()`
(boolean) → bir `FİNANS`/`OPERASYON` admini paneli baypas edip `admin_process_withdrawal` vb.
çağırabilir. **Şu an 0 alt-rol admini** → henüz istismar edilemez.
- 🟢 `has_admin_role(p_role)` yardımcısı eklendi (zero-impact).
- 🔵 **Alt-rol admini EKLEMEDEN ÖNCE** finansal/yıkıcı RPC'lere uygula:
  `IF NOT public.has_admin_role('FINANCE') THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;`

### 5.4 🟢 Ghost/impersonation fail-closed (A4 — §8.6)
**Dosya:** `App.tsx`. Eski: `?ghost=` parametresi audit hatası **yutuluyordu** (`catch {}`) →
admin olmayan biri de impersonation görünümü başlatabilirdi. Yeni: `logImpersonation` (sunucuda
`is_platform_admin` korumalı) **başarısızsa ghost başlatılmaz** + URL temizlenir (fail-closed).
Meşru admin için zero-impact. (🔵 İleride: impersonation bitişini de logla — time-bound.)

### 5.5 🔵 `admin-broadcast` redeploy + CORS secret (A2, A5)
`admin-broadcast` edge fn fail-OPEN'di → bu branch'te **fail-closed** yapıldı (admin secret VEYA
authenticated platform-admin JWT). Panel bu fn'i kullanmıyor (doğrudan RPC) → zero-impact.
Redeploy + `ADMIN_ALLOWED_ORIGIN` secret'i (CORS `*` yerine) ile tamamlanır.

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
| 8 | 4.2/4.4/4.5 spam/QR/GPS (promo kapsam dışı) | 🟡 STAGING | Orta |

### Repoya eklenen HAZIR dosyalar (apply-ready)
| Dosya | Madde | Tür |
|---|---|---|
| `supabase/migrations/20260708000000_faz8_anti_abuse_guards.sql` | 1.5 booking/hold kota+hız (app_config ayarlı), anon hold kapat | 🟢 |
| `supabase/migrations/20260708000100_faz8_match_score_integrity.sql` | 1.1 skor bütünlüğü trigger + bayrak | 🟡 |
| `supabase/migrations/20260708000200_faz8_revoke_internal_helper_execute.sql` | 1.3 iç helper EXECUTE revoke | 🟢 |
| `supabase/migrations/20260708000300_faz8_rate_limit_infra.sql` | 2.1 token-bucket (rl_consume) | 🟢 |
| `supabase/migrations/20260708000400_faz8_match_spam_guard.sql` | 4.2 maç spam trigger (app_config ayarlı) | 🟢 |
| `supabase/migrations/20260708000600_faz8_scraping_hardening.sql` | 2.2 tarife SELECT → authenticated | 🟡 |
| `supabase/migrations/20260708000700_faz8_admin_hardening.sql` | 5.1/5.2/5.3 admin: revoke→super, aal2 & RBAC yardımcıları | 🟢 |
| `supabase/functions/admin-broadcast/index.ts` | 2.3 fail-closed admin auth + CORS | 🟡 |
| `supabase/functions/create-payment/index.ts` | 2.3 CORS env'e bağlama | 🟢 |
| `App.tsx` | 5.4 ghost/impersonation fail-closed | 🟢 |
| `vercel.json` | 3.3 HSTS + CSP-Report-Only (+ Google Fonts) | 🟢 |

> **Önemli:** Migration'lar bilinçli olarak **canlı prod DB'ye uygulanmadı** (denetim
> READ-ONLY yürütüldü). `send-push` & `send-email` lokal sürümleri zaten fail-closed —
> yalnız yeniden deploy gerekir.

---

## 🚀 UYGULAMA RUNBOOK (adım adım)

> Tüm DB değişikliklerini **önce bir staging/branch DB'de** (`supabase db push` veya
> dev branch) uygulayıp aşağıdaki doğrulamaları geçtikten sonra prod'a alın.

### Adım 0 — Hazırlık
```bash
supabase link --project-ref iikvzgyccvgcybzdfwlv     # veya staging ref
git checkout claude/oyna-security-hardening-gkw0x9
supabase db diff      # bekleyen migration'ları gör
```

### Adım 1 — 🟢 Düşük riskli migration'lar (önce bunlar)
```bash
# Sadece eklemeli/kanıtlı olanlar: anti-abuse, helper-revoke, rate-limit, spam
supabase db push      # 000000, 000200, 000300, 000400 dahil bekleyenleri sırayla uygular
```
**Doğrulama (SQL):**
```sql
-- trigger'lar yerinde mi?
SELECT tgname FROM pg_trigger WHERE tgname IN
  ('trg_enforce_booking_abuse','trg_enforce_hold_abuse','trg_enforce_match_spam','trg_guard_match_score');
-- helper'lardan authenticated EXECUTE kalktı mı? (false beklenir)
SELECT has_function_privilege('authenticated','public._are_friends(uuid,uuid)','EXECUTE');
-- rate-limit fonksiyonu çalışıyor mu? (true sonra koşulla false)
SELECT public.rl_consume('test', 1, 0, 1);
```

### Adım 2 — 🟡 Skor bütünlüğü (akış testi şart)
`...000100_faz8_match_score_integrity.sql` uygulandıktan sonra staging'de:
- ✅ Consensus: `propose_match_score` + tüm katılımcı `approve_match_score` → skor yazılmalı.
- ✅ QR: `submit_match_score(token,…)` → skor yazılmalı.
- ✅ Kaptan: `finalize_match(id, h, a)` → skor yazılmalı.
- ✅ Admin panel skor düzenleme → çalışmalı.
- ❌ Normal oyuncu `player_update_match` ile skor değiştirme → `SCORE_FORBIDDEN`.
- ✅ Oyuncunun kadro/sohbet düzenlemesi (skor sabit) → çalışmalı (trigger tetiklenmez).

### Adım 3 — 🟡 Scraping (anon akışı testi şart)
`...000600_faz8_scraping_hardening.sql`: **giriş yapmamış** kullanıcının fiyat görmesi
gerekip gerekmediğini doğrula. Gerekiyorsa uygulamadan önce maskeli RPC sağla.

### Adım 4 — 🔵 Supabase Dashboard ayarları (kod değil)
- **Auth → Sessions:** `sessions_timebox=720h`, `sessions_inactivity_timeout=24h`,
  `refresh_token_rotation` açık, `reuse_interval=10`, JWT expiry `1800` sn (md 3.1).
- **Auth → Bot & Abuse:** hCaptcha/Turnstile aç; SMS/Email OTP rate-limit düşür;
  OTP length 8, expiry ≤ 600 sn (md 3.2).
- **Auth → Password:** Leaked password protection (HaveIBeenPwned) **aç** (DB-09/AUTH-04).
- **Settings → API:** `Max rows = 100` (md 2.2).
- **Admin MFA (md 5.2):** (1) Mevcut SUPER_ADMIN **TOTP kurar**; (2) Auth → **MFA enforcement** aç;
  (3) ardından kritik admin yazma RPC'lerinde `is_platform_admin()` → `is_admin_aal2()` (staging testi).
  Sıralamaya UY — adım 1 olmadan enforcement açılırsa tek admin kilitlenir.
- **Admin alt-rol (md 5.3):** FİNANS/OPERASYON admini **eklemeden önce** kritik RPC'lere
  `has_admin_role('<ROL>')` gate'i ekle.

### Adım 5 — 🔵 Edge secrets + redeploy
```bash
# Fail-closed/CORS için gerekli secret'ler:
supabase secrets set ADMIN_EDGE_SECRET=<uzun-rastgele>
supabase secrets set ADMIN_ALLOWED_ORIGIN=https://admin.oyna.app
supabase secrets set ALLOWED_ORIGIN=https://app.oyna.app
supabase secrets set WEBHOOK_SECRET=<uzun-rastgele>       # send-push DB Webhook header'ına aynısı
supabase secrets set EMAIL_EDGE_SECRET=<uzun-rastgele>
supabase secrets set PAYMENT_PROVIDER=IYZICO              # SIMULATION'ı prod'da KULLANMA

# Hardened sürümleri deploy et (send-push/send-email zaten fail-closed):
supabase functions deploy admin-broadcast
supabase functions deploy create-payment
supabase functions deploy send-push
supabase functions deploy send-email
```
> Database Webhook (`notifications` INSERT → send-push) header'ı `Authorization: Bearer <WEBHOOK_SECRET>` olmalı.

### Adım 6 — Frontend (sonraki PR'da)
- `supabaseAuth.ts`: OTP çağrılarına `captchaToken`; sign-in/sign-up ayrımı (md 3.2).
- Eşik ayarları: admin panel "GÜVENLİK" kategorisi (`app_config`) ile booking/hold/spam tavanları.
- Rate-limit: hassas edge çağrılarına `rl_consume(...)` ekle (md 2.1/2.3 örnekleri).

### Geri Alma (rollback)
- Trigger'lar: `DROP TRIGGER trg_<ad> ON public.<tablo>;`
- Skor trigger'ı: `DROP TRIGGER trg_guard_match_score ON public.matches;` (consensus/QR
  fonksiyonları `set_config` satırıyla çalışmaya devam eder, zararsızdır).
- Helper revoke: `GRANT EXECUTE ON FUNCTION public._<ad>(...) TO authenticated;`
- Tarife policy: eski `"Tariffs are publicly viewable" FOR SELECT USING(true)` geri eklenebilir.
- Edge: önceki sürümü `supabase functions deploy` ile geri al.

### Henüz kod yazılmamış (sonraki PR — product kararı gerektirir)
- 1.2 `finalize_match` skor parametrelerini kaldırma (frontend koordinasyonu).
- 1.4 `matches` SELECT anon daraltma / maskeli view.
- 4.4 `submit_match_score` dual-confirm + `claimCode` `gen_random_uuid()`.
- 4.5 Sunucu-taraflı GPS/check-in doğrulama.
- 3.5 `trusted_devices` cihaz bağlama + admin MFA zorunluluğu.
