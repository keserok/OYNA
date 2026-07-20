# KALECİ AUDIT — ÖDEME/EMANET DEVİR DOSYASI

> **Hazırlayan:** Kaleci (kaleci) audit iş kolu · **Alıcı:** Ödeme/Escrow iş kolu
> **Tarih:** 2026-07-16 · **Kod donduruldu:** bu dosya hiçbir kod değiştirmez, yalnız analiz eder.

---

## Kapsam

Kaleci (goalkeeper/GK) audit'i sırasında bulunan bulguların **para/emanet (escrow) sistemine bağlı** olan alt kümesi bu dosyada toplanmıştır. Bu kalemlerin düzeltmesi `payment_intents`, `wallet_transactions`, komisyon, payout ve no-show teminat akışlarına dokunduğu için **ayrı bir ödeme iş kolunun** sahipliğindedir. Salt-operasyonel (UI görünürlüğü, buton render'ı, liste filtresi) düzeltmeler **başka bir iş kolunda** ayrıca ele alınmaktadır ve burada tekrar edilmez.

Her kalem için: (1) Kök neden, (2) Kanıt (dosya:satır + kod/SQL), (3) Etki (kullanıcıya yansıması + tetikleyici senaryo), (4) Önerilen çözüm (server-side ise migration/RPC taslağı). Satır numaraları gerçek dosyalara karşı doğrulanmıştır.

**Migration sürüm notu (kritik):** Aynı fonksiyonun birden fazla `CREATE OR REPLACE` tanımı vardır; **son çalışan** tanım dosya adı (timestamp) sırasına göre belirlenir. Analiz boyunca "en güncel tanım" ibaresi bu sıralamaya göredir.

| Fonksiyon | En güncel tanım (dosya:satır) |
|---|---|
| `_release_service_payout` | `20260723000000_gk_payment_escrow.sql:144` |
| `respond_service_request` | `20260723000000_gk_payment_escrow.sql:82` (3-arg) |
| `create_service_request` | `20260714000000_faz8a_provider_wallet_and_repair.sql:384` |
| `cancel_service_request` | `20260706000006_faz5_service_engine.sql:647` |
| `_provider_has_conflict` | `20260706000006_faz5_service_engine.sql:480` |
| `admin_review_provider_application` | `20260708000004_faz4_audit_completion.sql:82` |
| `find_providers_for_match` | `20260721000000_find_providers_v2.sql:5` |

---

## KB-1 — Kaptan-başlatan rezervasyonlar asla payout alamıyor (BLOKER)

### 1) Kök neden
En güncel `_release_service_payout`, payout serbest bırakma için **her** talepte (initiated_by ayrımı olmadan) `provider_confirmed AND captain_confirmed` şartını arıyor. Oysa bu iki bayrağı set eden RPC'ler (`provider_confirm_service`, `captain_confirm_service`) ve onları tetikleyen UI butonları **yalnız `initiated_by = 'PROVIDER'`** (sağlayıcı-başlatan başvuru) akışına bağlı. Kaptan-başlatan taleplerde (`create_service_request`, FCFS teklif kabulü `respond_match_service_offer`) `initiated_by` varsayılan `'CAPTAIN'` kalır → iki bayrak da hiç `true` olamaz → payout sonsuza dek serbest kalmaz.

Önceki (doğru) tasarım `20260716000004:276-305`'te iki-taraflı kapıyı **yalnız** `initiated_by = 'PROVIDER'` için uyguluyordu; kaptan-başlatan payout ise değerlendirme (rating) ile tek-taraflı serbest kalıyordu. `20260723000000` bu davranışı **herkes için iki-taraflı** yaparak kaptan-başlatan (asıl/çoğunluk) akışını kırdı.

### 2) Kanıt
En güncel gate — `supabase/migrations/20260723000000_gk_payment_escrow.sql:144-159`:
```sql
CREATE OR REPLACE FUNCTION public._release_service_payout(p_match_id uuid, p_provider_id uuid)
...
  IF NOT (COALESCE(v_req.provider_confirmed,false) AND COALESCE(v_req.captain_confirmed,false)) THEN RETURN; END IF;  -- L154 (initiated_by ayrımı YOK)
```
Bayrakları set eden RPC'ler — `supabase/migrations/20260716000004_provider_match_applications.sql`:
- `provider_confirm_service` L310-330 → `provider_confirmed = true` (L324)
- `captain_confirm_service` L333-359 → `captain_confirmed = true` (L353)

`initiated_by` varsayılanı `'CAPTAIN'` — `20260716000004:21`:
```sql
ADD COLUMN IF NOT EXISTS initiated_by text NOT NULL DEFAULT 'CAPTAIN',
```
- `create_service_request` (`20260714000000:431-433`) `initiated_by` kolonunu yazmaz → `'CAPTAIN'`.
- FCFS `respond_match_service_offer` (`20260716000002:187-191`) yorumu birebir: *"initiated_by default CAPTAIN"*.

`submit_service_rating` (`20260706000006:761-796`) → payout'u `_release_service_payout` ile tetikler (L790) ama **`captain_confirmed`'i set etmez**; en güncel gate iki bayrak istediği için no-op olur.

UI butonları da `PROVIDER`'a kilitli (operasyonel iş kolu düzeltiyor, ama para tarafını da etkilediği için kanıt):
- Sağlayıcı onay butonu: `views/ServiceDashboard.tsx:1195` → `req.initiatedBy === 'PROVIDER'`
- Kaptan onay butonu: `views/MatchJoin.tsx:927` → `r.initiatedBy === 'PROVIDER'`

Admin kaçış kapısı da kırık — `admin_release_service_payout` (`20260708000004:108-120`) aynı gated `_release_service_payout`'a delege eder (L116) → admin bile kaptan-başlatan sıkışmış payout'u **zorla serbest bırakamaz**.

### 3) Etki
- **Kullanıcıya yansıma:** Kaleci maçı oynar, `service_requests.status = CAPTURED`, `wallet_transactions` içinde `SERVICE_EARNING` kaydı `PENDING`'de takılı kalır; çekilebilir bakiyeye (`get_wallet_summary.earnings_balance`) hiç geçmez. Kaleci ücretini alamaz, payout talep edemez. Kaptan tarafında para blokede/tahsil edilmiş ama karşılığı ödenmemiş → mutabakat açığı.
- **Tetikleyici senaryo:** (a) Kaptan pazardan kaleci seçer → `create_service_request` → kabul → capture. (b) Kaptan "tümüne teklif" → kaleci FCFS kabul → `respond_match_service_offer` → capture. İkisi de `initiated_by='CAPTAIN'`. Maç sonrası hangi onay/rating verilirse verilsin payout serbest kalmaz.

### 4) Önerilen çözüm (server-side)
**UI düzeltmesi tek başına YETMEZ.** Operasyonel iş kolu sağlayıcı onay butonunu kaptan-başlatan talepler için render etse bile: (i) kaptan onay butonu da `PROVIDER`'a kilitli (`MatchJoin.tsx:927`), (ii) kaptanın doğal aksiyonu olan rating `captain_confirmed`'i set etmiyor. Yani iki bayrak birlikte hiç dolmuyor. Para tarafının da düzeltilmesi şart.

**Önerilen (Seçenek A — orijinal semantiği geri getir, en düşük riskli):** `_release_service_payout`'u `initiated_by`-duyarlı hale getir. Kaptan-başlatan → rating/attendance ile tek-taraflı serbest; sağlayıcı-başlatan → iki-taraflı.

```sql
-- migration: 20260724xxxxxx_release_payout_initiated_by_aware.sql
CREATE OR REPLACE FUNCTION public._release_service_payout(p_match_id uuid, p_provider_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_req public.service_requests;
BEGIN
  SELECT * INTO v_req FROM public.service_requests
   WHERE match_id = p_match_id AND provider_id = p_provider_id
     AND status = 'CAPTURED' AND payout_released = false
   ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;

  -- İki-taraflı kapı YALNIZ sağlayıcı-başlatan başvurular için.
  IF v_req.initiated_by = 'PROVIDER'
     AND NOT (COALESCE(v_req.provider_confirmed,false) AND COALESCE(v_req.captain_confirmed,false)) THEN
    RETURN;
  END IF;

  UPDATE public.wallet_transactions SET status = 'COMPLETED'
    WHERE reference_id = v_req.payment_intent_id AND balance_type = 'EARNINGS' AND status = 'PENDING';
  PERFORM public._sync_wallet_mirror(v_req.provider_id);
  UPDATE public.service_requests SET status='COMPLETED', completed_at=now(), payout_released=true WHERE id = v_req.id;
END; $$;
```
Bu değişiklikle kaptan-başlatan payout, mevcut `submit_service_rating` (değerlendirme = katılım kanıtı) ile tekrar serbest kalır. `admin_release_service_payout` da otomatik çalışır hale gelir (kaptan-başlatanda gate düşer).

**Seçenek B (herkes için iki-taraflı kalsın deniyorsa):** üç ek şart birlikte gerekir — (i) UI iki onay butonunu da kaptan-başlatan için render etmeli (op. iş kolu), (ii) `submit_service_rating` kaptan rating'ini `captain_confirmed = true` olarak da işaretlemeli, (iii) `admin_release_service_payout` gate'i **bypass eden** bir force-release yoluna kavuşmalı (aksi halde admin override ölü). Seçenek A daha az yüzey değiştirir; **A önerilir.**

---

## KB-2 — `matches.starts_at` NULL iken çifte-rezervasyon (YÜKSEK)

### 1) Kök neden
Çakışma kontrolü `_provider_has_conflict`, `p_starts_at IS NULL` ise koşulsuz `false` döner (çakışma yok sayılır) ve JOIN'i `m.starts_at IS NOT NULL` şartıyla sınırlar. Maçın `starts_at`'i yalnız `player_create_match` içinde, `date` metni katı ISO (`YYYY-MM-DD`) ve `time` `HH:MM` formatına uyduğunda türetilir; uymazsa `NULL` kalır. Ayrıca `create → respond` (kaptan-seçer) akışında **kabul anında** yeniden çakışma kontrolü yapılmaz; kontrol yalnız talep oluşturma anındadır. `starts_at` NULL olan iki maç için aynı kaleciye iki talep açılabilir, kaleci ikisini de kabul eder → çifte-rezervasyon.

### 2) Kanıt
`supabase/migrations/20260706000006_faz5_service_engine.sql:480-503`:
```sql
CREATE OR REPLACE FUNCTION public._provider_has_conflict(p_provider_id uuid, p_starts_at timestamptz, ...)
...
  IF p_starts_at IS NULL THEN RETURN false; END IF;               -- L490  (NULL → çakışma yok)
  RETURN EXISTS ( SELECT 1 FROM public.service_requests sr
    JOIN public.matches m ON m.id = sr.match_id
    WHERE sr.provider_id = p_provider_id
      AND sr.status IN ('PENDING','ACCEPTED','CAPTURED')
      ...
      AND m.starts_at IS NOT NULL                                  -- L498  (NULL karşı-maçlar dışlanır)
      AND m.starts_at BETWEEN p_starts_at - interval '2 hours' AND p_starts_at + interval '2 hours');
```
`starts_at` türetimi — `supabase/migrations/20260704000001_faz3_match_lifecycle.sql:330-332`:
```sql
v_starts_at := CASE
  WHEN v_date ~ '^\d{4}-\d{2}-\d{2}$' AND v_time ~ '^\d{1,2}:\d{2}'
  THEN (v_date::date + (v_time||':00')::time)::timestamptz ELSE NULL END;  -- format tutmazsa NULL
```
Accept anında re-check YOK — en güncel `respond_service_request` (`20260723000000:82-141`, ayrıca `20260714000000:454-496`) yalnız `status = 'PENDING'` kontrolü yapar, `_provider_has_conflict` çağrısı yoktur. (Karşılaştırma: `accept_provider_application` `20260716000004:183` ve FCFS `respond_match_service_offer` `20260716000002:167` kabul anında re-check YAPAR; create→respond akışı yapmaz.)

### 3) Etki
- **Kullanıcıya yansıma:** Aynı kaleci, çakışan (veya `starts_at` bilinmeyen) iki maça aynı anda atanır; maç günü birine gidemez → biri no-show → gereksiz teminat cezası + kaptan mağduriyeti.
- **Tetikleyici senaryo:** `date`/`time` alanı ISO olmayan bir kaynaktan (relatif etiket, admin/takım maçı yolu, boş saat) gelirse `starts_at = NULL`. İki farklı kaptan aynı kaleciye talep açar; `_provider_has_conflict` her ikisinde de `false` döner → iki `PENDING` → kaleci ikisini kabul eder.

### 4) Önerilen çözüm (server-side, iki katmanlı)
**(a) `starts_at`'i güvenilir doldur / backfill:** Tüm maç-oluşturma yollarında (`player_create_match`, takım maçı, admin) `starts_at`'i zorunlu türet; türetilemiyorsa maç oluşturmayı reddet ya da `date+time`'ı normalize et. Mevcut NULL'lar için backfill:
```sql
UPDATE public.matches SET starts_at = (date + (time||':00')::time)::timestamptz
WHERE starts_at IS NULL AND date IS NOT NULL
  AND to_char(date,'YYYY-MM-DD') ~ '^\d{4}-\d{2}-\d{2}$' AND time ~ '^\d{1,2}:\d{2}';
```
**(b) Kabul anında re-check** (asıl güvenlik kilidi — `starts_at` NULL kalsa bile çifte-kabulü kapat): `respond_service_request` içinde `p_accept` dalına, `capture`/`ACCEPTED` set etmeden önce:
```sql
IF public._provider_has_conflict(v_req.provider_id, (SELECT starts_at FROM public.matches WHERE id = v_req.match_id), v_req.match_id) THEN
  RAISE EXCEPTION 'PROVIDER_CONFLICT: Bu saatte kabul edilmiş başka bir maçın var.';
END IF;
```
**(c) `starts_at IS NULL` semantiğini sıkılaştır (opsiyonel ama önerilir):** `_provider_has_conflict`'te NULL girdide "çakışma yok" yerine, aynı kaleci için `starts_at`'i NULL olan başka aktif talep varsa **muhafazakâr çakışma** (true) döndürmek, zamanı bilinmeyen çift-atamayı da engeller.

---

## KD-1 — `goalkeepers."matchCount"` hiç artmıyor (ORTA)

### 1) Kök neden
Capture/release (tahsil→payout) yaşam döngüsünün hiçbir noktasında `goalkeepers."matchCount"` artırılmaz. Kolon yalnız onboarding'de `0` olarak seed edilir ve yalnız admin manuel düzenleme RPC'siyle (elle) değişebilir. `find_providers_for_match` sıralamayı `match_count DESC` ile yaptığı için gerçek/aktif kaleciler (0 sayaçla) listenin en sonuna düşer; "çaylak" (rookie) tespiti de bozulur.

### 2) Kanıt
Artış YOK — `matchCount`'a yazan **tek** yer manuel admin düzenlemesidir (`supabase/migrations/20260627000001_admin_user_provider_update.sql:54` ve `:85`):
```sql
"matchCount" = COALESCE((p_payload->>'match_count')::int, "matchCount"),
```
`capture_service_request` (`20260706000006:680-726`) maça kaleciyi yazar (`gk_id`, L709) ve kazancı `PENDING` işler ama `matchCount` artırmaz. `_release_service_payout` (en güncel `20260723000000:144-159`) de artırmaz.

Onboarding seed = 0 — ör. `supabase/migrations/20260607000000_auth_and_roles.sql:200-201`:
```sql
INSERT INTO public.goalkeepers (id, "authUid", name, bio, fee, rating, "matchCount", ...)
VALUES (p_user_id, p_user_id, ..., 250, 4.5, 0, 'Dengeli', ...)   -- matchCount = 0
```
(Aynı desen `20260617000001:159-160`, `20260620000001:115-116`'da.)

Sıralama `match_count DESC` — `supabase/migrations/20260721000000_find_providers_v2.sql:20` ve `:28`:
```sql
SELECT jsonb_agg(row_to_json(t) ORDER BY t.rating DESC, t.match_count DESC, t.fee ASC) ...
```

### 3) Etki
- **Kullanıcıya yansıma:** Gerçekten çok maç yapmış kaleciler pazarda hep `matchCount=0` görünür ve ikincil sıralama kriterinde en sona düşer; "tecrübe/rozet" göstergeleri yanlış; çaylak tespitine dayanan her mantık (ör. güven skoru, öne çıkarma) hatalı çalışır.
- **Tetikleyici senaryo:** Her tamamlanan hizmet; sayaç hiç ilerlemediği için etki kümülatiftir.

### 4) Önerilen çözüm (server-side)
Sayacı **payout serbest bırakma** anında (hizmetin gerçekten tamamlandığı, iki-taraflı/rating kapısının geçtiği tek nokta) artır. `_release_service_payout` içinde `status='COMPLETED'` set edilirken:
```sql
-- _release_service_payout içinde, COMPLETED update'inden hemen sonra:
IF v_req.provider_type = 'GK' THEN
  UPDATE public.goalkeepers SET "matchCount" = COALESCE("matchCount",0) + 1 WHERE id = v_req.provider_id;
ELSE
  UPDATE public.referees   SET "matchCount" = COALESCE("matchCount",0) + 1 WHERE id = v_req.provider_id;
END IF;
```
Payout serbest bırakma idempotent'tir (`payout_released=false` filtresi + tek `COMPLETED` geçişi) olduğundan sayaç mükerrer artmaz. **Not:** Bu değişiklik KB-1 düzeltmesiyle aynı fonksiyona dokunur — iki yamanın **tek migration'da** birleştirilmesi önerilir (çakışma önlemi). Alternatif: capture anında artırmak, ama o durumda iptal/no-show'da geri alma gerekir; **release anında artırmak tercih edilir.**

---

## KB-4 — Kaleci kabul sonrası iptal/geri çekilemiyor (YÜKSEK)

### 1) Kök neden
Kabul edilmiş/tahsil edilmiş (`ACCEPTED`/`CAPTURED`) bir rezervasyonu kalecinin (sağlayıcının) kendi iradesiyle bırakabileceği hiçbir RPC yok. `cancel_service_request` yalnız talep edene (kaptan) açık ve `CAPTURED`'ı reddediyor; `withdraw_provider_application` yalnız `APPLIED` durumunu geri çekiyor. Dolayısıyla katılamayacak bir kaleci için tek çıkış, kaptanın no-show bildirmesini beklemek → kaleci teminat cezası yer. Erken/dürüst iptal yolu olmadığından bu **para-bağlı** (iade + orantılı ceza kuralları gerekir).

### 2) Kanıt
`cancel_service_request` — `supabase/migrations/20260706000006_faz5_service_engine.sql:647-674`:
```sql
IF v_req.requested_by IS DISTINCT FROM v_uid AND NOT public.is_platform_admin() THEN
  RAISE EXCEPTION 'FORBIDDEN';                                     -- L658-660 (yalnız kaptan)
END IF;
IF v_req.status IN ('CAPTURED','COMPLETED') THEN
  RAISE EXCEPTION 'INVALID_STATE: Tahsil edilmiş talep iptal edilemez (iade gerekir).';  -- L661-663
END IF;
```
`withdraw_provider_application` — `supabase/migrations/20260716000004_provider_match_applications.sql:254-271`:
```sql
IF v_req.status <> 'APPLIED' THEN RAISE EXCEPTION 'INVALID_STATE: Yalnız bekleyen başvuru geri çekilebilir.'; END IF;  -- L265
```
Tek çıkış no-show cezası — `captain_report_no_show` (`20260723000000:162-224`) yalnız `CAPTURED` için çalışır ve cezayı kalecinin teminatından tahsil eder (L193-208).

### 3) Etki
- **Kullanıcıya yansıma:** Meşru mazereti olan kaleci rezervasyonu bırakamaz; ceza (maçın slot ücreti) kesilene kadar bekler; kaptan son dakikaya kadar yeni kaleci arayamaz (slot dolu görünür) → hem kaleci hem kaptan mağdur.
- **Tetikleyici senaryo:** Kaleci `ACCEPTED`/`CAPTURED` sonrası maça gelemeyeceğini fark eder; uygulamada "vazgeç/bırak" aksiyonu yoktur.

### 4) Önerilen çözüm (server-side — yeni RPC + iade/ceza kuralı)
Sağlayıcı-iptal RPC'si; maça kalan süreye göre kademeli ceza (grace vs. son-dakika), kaptana tam iade, slotu boşaltma:
```sql
-- migration: 20260724xxxxxx_provider_cancel_service.sql
CREATE OR REPLACE FUNCTION public.provider_cancel_service(p_request_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_uid uuid := auth.uid(); v_req public.service_requests; v_match RECORD;
  v_hours numeric; v_penalty numeric := 0; v_grace numeric; v_charged boolean := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT * INTO v_req FROM public.service_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_req.provider_id IS DISTINCT FROM v_uid THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_req.status NOT IN ('ACCEPTED','CAPTURED') THEN
    RAISE EXCEPTION 'INVALID_STATE: Yalnız kabul edilmiş/tahsil edilmiş rezervasyon bırakılabilir.'; END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = v_req.match_id;
  v_hours := CASE WHEN v_match.starts_at IS NULL THEN 999
                  ELSE EXTRACT(EPOCH FROM (v_match.starts_at - now()))/3600 END;
  v_grace := public.get_config_number('gk_provider_cancel_grace_hours', 24);

  -- 1) Bekleyen kazancı iptal et (hizmet verilmeyecek)
  UPDATE public.wallet_transactions SET status='CANCELLED'
    WHERE reference_id = v_req.payment_intent_id AND balance_type='EARNINGS' AND status='PENDING';
  PERFORM public._sync_wallet_mirror(v_req.provider_id);

  -- 2) Kaptana tam iade + blokajı serbest bırak
  PERFORM public._refund_service_captain(v_req);
  IF v_req.payment_intent_id IS NOT NULL THEN
    UPDATE public.payment_intents SET status='VOIDED', voided_at=now(), void_reason='PROVIDER_CANCELLED'
      WHERE id = v_req.payment_intent_id AND status IN ('PENDING','BLOCKED','CAPTURED');
  END IF;

  -- 3) Kademeli ceza: grace içinde erken iptal cezasız; son-dakika iptalinde ceza (config oranı)
  IF v_hours < v_grace THEN
    v_penalty := ROUND(COALESCE(v_match.price,0) * public.get_config_number('gk_provider_cancel_penalty_rate', 0.5));
    IF v_penalty > 0 THEN
      BEGIN
        PERFORM public.wallet_spend_balance(v_req.provider_id, v_penalty, 'MATCH', v_req.match_id, v_req.match_id,
          'Kaleci geç iptal cezası');
        -- (tazminat kaptana veya platforma — iş kararı) 
        v_charged := true;
      EXCEPTION WHEN OTHERS THEN v_charged := false; END;
    END IF;
  END IF;

  -- 4) Slotu boşalt + talebi kapat
  IF v_req.provider_type='GK' THEN UPDATE public.matches SET gk_id=NULL WHERE id=v_req.match_id;
  ELSE UPDATE public.matches SET "refereeId"=NULL WHERE id=v_req.match_id; END IF;
  UPDATE public.service_requests SET status='CANCELLED', cancelled_at=now() WHERE id=p_request_id;

  -- 5) Kaptana bildirim (yeni sağlayıcı seçebilsin)
  INSERT INTO public.notifications (user_id, title, body, type_key, match_id, deep_link)
  VALUES (v_req.requested_by, 'Sağlayıcı rezervasyonu bıraktı',
          'Kaleci/hakem maça gelemeyeceğini bildirdi; ücretin iade edildi. Yeni bir sağlayıcı seçebilirsin.',
          'service_provider_cancelled', v_req.match_id, 'oyna://match/'||v_req.match_id);

  RETURN jsonb_build_object('request_id', p_request_id, 'status','CANCELLED',
    'penalty', v_penalty, 'penalty_charged', v_charged);
END; $$;
REVOKE ALL ON FUNCTION public.provider_cancel_service(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provider_cancel_service(uuid, text) TO authenticated;
```
Config anahtarları (`app_config`): `gk_provider_cancel_grace_hours` (varsayılan 24), `gk_provider_cancel_penalty_rate` (varsayılan 0.5). Ceza tazminatının kaptana mı platforma mı gideceği iş kararıdır; taslakta yalnız kaleci teminatından düşülür.

---

## KB-6 — Süresi geçmiş ama süpürülmemiş PENDING hâlâ kabul edilebilir (ORTA)

### 1) Kök neden
`respond_service_request` yalnız `status = 'PENDING'` kontrolü yapar, `expires_at`'i hiç kontrol etmez. Süresi dolan talepleri `EXPIRED`'a çeken süpürücü `expire_service_requests()` pg_cron ile **5 dakikada bir** çalışır. Bu 5 dakikalık pencerede: talep `expires_at`'i geçmiş ama hâlâ `PENDING` durumda → kaleci kabul edebilir. Kabul, capture ve kazanç yazımını tetikler → süresi dolmuş sayılması gereken bir talep para akışına girer.

### 2) Kanıt
En güncel `respond_service_request` — `supabase/migrations/20260723000000_gk_payment_escrow.sql:88-91`:
```sql
SELECT * INTO v_req FROM public.service_requests WHERE id = p_request_id FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
IF v_req.provider_id IS DISTINCT FROM v_uid AND NOT public.is_platform_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
IF v_req.status <> 'PENDING' THEN RAISE EXCEPTION 'INVALID_STATE: Talep % durumunda.', v_req.status; END IF;  -- expires_at YOK
```
Süpürücü ve 5-dk cron — `supabase/migrations/20260714000000_faz8a_provider_wallet_and_repair.sql:504-518` ve `:556`:
```sql
WHERE sr.status = 'PENDING' AND sr.expires_at IS NOT NULL AND sr.expires_at < now()   -- L515
...
PERFORM cron.schedule('expire_service_requests', '*/5 * * * *', 'SELECT public.expire_service_requests()');  -- L556
```

### 3) Etki
- **Kullanıcıya yansıma:** Kaptanın "yanıt süresi doldu, blokaj iade edildi" beklentisiyle başka sağlayıcıya yöneldiği bir anda, eski (süresi geçmiş) talep hâlâ kabul edilip para tahsil edilebilir → çift atama / beklenmedik tahsilat.
- **Tetikleyici senaryo:** `expires_at` geçtikten sonra, cron'un bir sonraki `*/5` tetiklemesinden **önce** kalecinin "Kabul" basması.

### 4) Önerilen çözüm (server-side)
`respond_service_request`'in `p_accept = true` dalına, statü kontrolünden sonra `expires_at` muhafızı ekle (ve süresi geçmişse aynı anda `EXPIRED`'a çekmek en temizi):
```sql
IF v_req.expires_at IS NOT NULL AND v_req.expires_at < now() THEN
  UPDATE public.service_requests SET status='EXPIRED', cancelled_at=now() WHERE id = p_request_id;
  IF v_req.payment_intent_id IS NOT NULL THEN
    UPDATE public.payment_intents SET status='VOIDED', voided_at=now(), void_reason='SERVICE_EXPIRED'
      WHERE id = v_req.payment_intent_id AND status IN ('PENDING','BLOCKED');
  END IF;
  RAISE EXCEPTION 'EXPIRED: Talebin yanıt süresi doldu.';
END IF;
```
(Aynı muhafızı FCFS `respond_match_service_offer`'a da eklemek tutarlılık için önerilir; orada `match_service_offers.expires_at` kontrol edilmeli — şu an `get_my_match_service_offers` listede filtreliyor ama `respond` tarafı filtrelemez.)

---

## KC-5 — Mükerrer service_request + mükerrer bloke payment_intent (DÜŞÜK — büyük ölçüde mevcut korumada)

### 1) Kök neden (ve düzeltme — premise kısmen zaten karşılanmış)
İddia: `create_service_request` aynı `(match_id, provider_id)` için mevcut `PENDING` talebe karşı guard içermez; kaptan KİRALA'ya iki kez basınca çift `PENDING` + çift `payment_intent` oluşur. **Gerçek kodda bu senaryo büyük ölçüde kapalıdır:**
- Kısmi benzersiz indeks `uq_service_requests_active_per_match` `(match_id, provider_type)` üzerinde `status IN ('PENDING','ACCEPTED','CAPTURED')` iken tekilliği zorlar → aynı maç+tür için ikinci aktif talep INSERT'i `23505 unique_violation` atar.
- En güncel `create_service_request` (v3) aynı sağlayıcı için **advisory xact lock** alır → eşzamanlı çift-tıklama serialize edilir.
- `payment_intents` INSERT'i, `service_requests` INSERT'inden **önce** ama **aynı transaction** içindedir; ikinci çağrının `service_requests` INSERT'i unique-violation atınca transaction tümüyle geri alınır → **orphan/çift payment_intent oluşmaz.**
- Frontend'de de ön-guard var (`MatchJoin.tsx:963` `getActiveRequestForType`).

Kalan gerçek eksik: guard, kullanıcıya **ham `23505` hatası** olarak yansır (dostane "zaten talep var" yerine); ve idempotent yanıt yoktur.

### 2) Kanıt
Kısmi benzersiz indeks — `supabase/migrations/20260706000006_faz5_service_engine.sql:127-129` (sonradan DROP edilmemiştir):
```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_service_requests_active_per_match
  ON public.service_requests(match_id, provider_type)
  WHERE status IN ('PENDING','ACCEPTED','CAPTURED');
```
En güncel `create_service_request` v3 — `supabase/migrations/20260714000000_faz8a_provider_wallet_and_repair.sql`:
```sql
PERFORM pg_advisory_xact_lock(hashtext('svc_provider:' || p_provider_id::text));  -- L393 (serialize)
...
INSERT INTO public.payment_intents (...) RETURNING * INTO v_intent;                -- L411-414 (intent önce)
...
INSERT INTO public.service_requests (...) RETURNING * INTO v_req;                  -- L431-434 (unique index burada patlar → tx rollback)
```
Frontend ön-guard — `views/MatchJoin.tsx:963`.

### 3) Etki
- **Kullanıcıya yansıma:** Çift-tıklamada **veri bozulması yok** (çift PENDING/çift intent oluşmaz); ancak ikinci istek kullanıcıya ham DB hatası (`duplicate key value violates unique constraint`) olarak dönebilir → kötü UX ve "hata mı oluştu?" belirsizliği.
- **Tetikleyici senaryo:** Advisory lock kapsamı dışı, farklı bir düzeltme sonrası indeksin gevşetilmesi veya `provider_type` yerine `provider_id` bazlı bir gereksinim gelirse çiftlenme yeniden mümkün olur — bu yüzden guard'ı açık ve niyetli hale getirmek değerlidir.

### 4) Önerilen çözüm (server-side — sağlamlaştırma + dostane hata)
`create_service_request` başında, intent oluşturmadan **önce** açık idempotent kontrol; ve ham unique-violation'ı yakalayıp anlamlı mesaja çevir:
```sql
-- fee/conflict kontrolünden sonra, INSERT payment_intents'ten ÖNCE:
IF EXISTS (SELECT 1 FROM public.service_requests
           WHERE match_id = p_match_id AND provider_type = p_provider_type
             AND status IN ('PENDING','ACCEPTED','CAPTURED')) THEN
  RAISE EXCEPTION 'DUPLICATE_ACTIVE_REQUEST: Bu maç için zaten aktif bir % talebi var.', p_provider_type
    USING ERRCODE = 'unique_violation';
END IF;
```
Bu, intent INSERT'ini gereksiz yere denemekten kaçınır (tx rollback maliyeti + sıra numarası tüketimi yok) ve istemciye `parseRpcError` ile ayrıştırılabilir dostane bir kod verir. **Öncelik düşüktür**; veri bütünlüğü bugün korunuyor, iyileştirme UX/dayanıklılık odaklıdır.

---

## KA-M2 — Onay bildirimi karşılıksız (ORTA)

### 1) Kök neden
`admin_review_provider_application` (en güncel tanım) onay/red kararında yalnız `log_admin_action` yazar; sağlayıcıya (kaleci/hakem) hiçbir in-app/push bildirimi göndermez. Bildirim yalnız **tesis (pitch) sahibi** akışında trigger'lıdır; sağlayıcı doğrulama kararı (`profiles.verification_status` → approved/rejected) için bildirim yoktur. Bu ödeme-bağlıdır çünkü onay, sağlayıcının hizmet verip **kazanç/payout** akışına girebilmesinin kapısıdır; kullanıcı onaylandığını fark etmezse hizmet vermeye başlamaz.

### 2) Kanıt
En güncel `admin_review_provider_application` — `supabase/migrations/20260708000004_faz4_audit_completion.sql:82-105`:
```sql
UPDATE public.profiles SET role = v_app.role, ..., verification_status = 'approved', ... WHERE id = v_app.user_id;  -- L94-97 (approve)
...
PERFORM public.log_admin_action(CASE WHEN p_approve THEN 'PROVIDER_APP_APPROVE' ELSE 'PROVIDER_APP_REJECT' END, ...);  -- L102 (yalnız audit)
RETURN v_app;                                                                                                          -- L104 (notifications INSERT YOK)
```
(Not: `20260710000006_admin_rbac_wrappers.sql:49` yalnızca bu RPC'yi MODERATOR rolüne haritalayan bir config satırıdır — fonksiyon gövdesini değiştirmez; canlı gövde 0004'tekidir.)

Mevcut bildirim trigger'ı yalnız tesis tarafı — `supabase/migrations/20260710223038_admin_pitch_verification_request_notify.sql:18-19,46` (`pitches.verification_status='pending'` → adminlere). Sağlayıcı `profiles` doğrulaması için karşılık gelen bir trigger yoktur.

### 3) Etki
- **Kullanıcıya yansıma:** Başvurusu onaylanan kaleci/hakem bunu öğrenemez (bildirim gelmez); "müsaitlik aç / hizmet ver" adımına geçmez → arz düşer, ilk kazancına gecikmeli ulaşır. Reddedilen başvurucu da geri bildirim/gerekçe almaz.
- **Tetikleyici senaryo:** Admin `admin_review_provider_application(app_id, true/false)` çağırır; başvurucunun bildirim kutusunda hiçbir şey belirmez.

### 4) Önerilen çözüm (server-side)
RPC gövdesine, karar sonrası bir `notifications` INSERT ekle (approve/reject ayrı metin). Fonksiyona dokunmadan aynı işi yapmak istenirse `profiles` üzerinde `verification_status` değişimini dinleyen bir trigger de kurulabilir; en dar ve kesin çözüm RPC içi INSERT'tir:
```sql
-- admin_review_provider_application içinde, RETURN v_app'ten önce:
INSERT INTO public.notifications (user_id, title, body, type_key, deep_link, action_required)
VALUES (
  v_app.user_id,
  CASE WHEN p_approve THEN 'Başvurun onaylandı 🎉' ELSE 'Başvurun onaylanmadı' END,
  CASE WHEN p_approve
       THEN 'Sağlayıcı başvurun onaylandı. Müsaitliğini açıp hizmet vermeye başlayabilirsin.'
       ELSE 'Başvurun onaylanmadı.' || COALESCE(' Gerekçe: ' || p_notes, '') END,
  CASE WHEN p_approve THEN 'provider_application_approved' ELSE 'provider_application_rejected' END,
  'oyna://provider/dashboard',
  p_approve  -- onayda aksiyon gerektir (müsaitlik aç)
);
```
Trigger tercih edilirse desen olarak `20260710223038_admin_pitch_verification_request_notify.sql` birebir örnek alınabilir (orada `AFTER INSERT OR UPDATE OF verification_status ON public.pitches`; buradaki karşılığı `... ON public.profiles`, `NEW.verification_status IN ('approved','rejected')` ve `OLD.verification_status IS DISTINCT FROM NEW.verification_status`).

---

## Öncelik Sıralı Özet

| # | Kalem | Şiddet | Tek satır düzeltme |
|---|-------|--------|--------------------|
| 1 | **KB-1** Kaptan-başlatan payout hiç serbest kalmıyor | **BLOKER** | `_release_service_payout`'u `initiated_by`-duyarlı yap (CAPTAIN → rating ile tek-taraflı); UI düzeltmesi tek başına yetmez, admin override da bugün ölü. |
| 2 | **KB-2** `starts_at` NULL iken çifte-rezervasyon | Yüksek | `starts_at`'i güvenilir doldur/backfill **ve** `respond_service_request` kabul anında `_provider_has_conflict` re-check et. |
| 3 | **KB-4** Kaleci kabul sonrası bırakamıyor | Yüksek | Yeni `provider_cancel_service` RPC: kaptana tam iade + slot boşalt + kademeli (grace/son-dakika) ceza. |
| 4 | **KD-1** `matchCount` hiç artmıyor | Orta | `_release_service_payout` içinde COMPLETED'te GK/REF `matchCount += 1` (KB-1 ile aynı migration'da birleştir). |
| 5 | **KB-6** Süresi geçmiş PENDING kabul edilebiliyor (5-dk cron boşluğu) | Orta | `respond_service_request` kabul dalına `expires_at < now()` muhafızı ekle (ve talebi anında EXPIRED yap). |
| 6 | **KA-M2** Onay/red bildirimi yok | Orta | `admin_review_provider_application`'a sağlayıcıya `notifications` INSERT ekle (approve/reject). |
| 7 | **KC-5** Mükerrer talep/intent | Düşük | Veri bütünlüğü zaten `uq_service_requests_active_per_match` + advisory lock ile korunuyor; yalnız açık idempotent guard + dostane hata mesajı ekle. |
