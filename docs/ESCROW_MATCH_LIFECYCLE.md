# Escrow Maç Yaşam Döngüsü — Durum & YAPILACAKLAR (FIXME)

> ⚠️ **BU MODÜL SIMULATION'DA DB-TAMAMDIR AMA CANLI TEST EDİLMEDİ.**
> Supabase "branching" Pro plan gerektirdiği için dev-branch'te test edilemedi;
> in-repo teslim edildi. **Prod'a almadan önce staging / Pro dev-branch'te
> `payment_provider='SIMULATION'` ile uçtan uca test edin** (`/verify` skill'i
> canlı Supabase + Playwright ile bunu yapabilir).

## Model (onaylanan kararlar)
- **Kişi başı ücret** = `ceil(saha_toplam ÷ (perTeam×2) × 1.05)` — kurucu belirleyemez. (`useMatchCreate.ts`)
- **Kapora** = owner tarife kaporası (`pitch_tariffs.deposit_amount`), yoksa toplam ücretin **%20'si**.
- **Aktivasyon** = kaptan kaporayı **BLOKE** eder (karttan çekilmez). → maç `ACTIVE`, sağlayıcı talepleri gider.
- **Eşik** = toplam gereken oyuncu **− 2** (ör. 14 → 12) dolunca maç **LIVE** + kapora **CAPTURE** (karar 1A).
- **Dolmazsa/iptal** → kapora **VOID** (para yok, komisyon yok).
- **Kaptan iptali**: maça **≥24s** varsa iade (kapora çekildiyse **iyzico komisyonu kesilerek**); **<24s** iade yok (no-show) + `trust_score` düşer.
- **İyzico komisyonu yalnız CAPTURE anında** kesilir → çoğu maçta (blokaj/void) komisyon ödenmez.

## Yapıldı (bu değişiklik)
- **Migration** `supabase/migrations/20260716000001_escrow_match_lifecycle.sql`
  - `matches`: `deposit_intent_id, deposit_status, deposit_amount, min_players, deferred_providers`.
  - RPC'ler: `match_block_deposit`, `match_capture_deposit`, `match_void_deposit`,
    `match_check_threshold`, `match_cancel_by_captain`, `admin_match_deposit_action`.
- **Migration** `supabase/migrations/20260716000003_match_threshold_trigger.sql` ✔ **[TRIGGER-TODO]**
  - `matches` üzerinde `AFTER UPDATE OF slots, "awaySlots"` tetikleyicisi (`_trg_match_threshold`):
    kadro her değiştiğinde **sunucu tarafında** eşik kontrolü çalışır → kaporası BLOKE aktif maç
    eşiğe ulaşınca istemciden bağımsız **LIVE + capture** olur. Kolon-kapsamlı olduğu için
    özyineleme yok; sadece `deposit_status='BLOCKED'` maçları etkiler (escrow dışı maçlar
    dokunulmaz).
- **Servis** `services/matchLifecycleService.ts` — RPC sarmalayıcıları.
- **Frontend**
  - `useMatchCreate.ts`: her zaman `awaySlots` üretir (iki takım), yayında `blockMatchDeposit`
    çağırır, `deferredProviders` (kaleci/hakem) saklar; kişi başı %5'li otomatik ücret.
  - `MatchCreate.tsx`: "Kaleci & Hakem" seçim ekranı (aktivasyonda talep gider), kapora bilgisi.
  - `MatchJoin.tsx`: katılım/satın alma sonrası `checkMatchThreshold` (eşik → LIVE + capture).
    Not: sunucu tetikleyicisi eklendikten sonra bu istemci çağrısı **yedek/idempotent**tir
    (eşik zaten sunucuda yakalanır; çift çağrı zararsız — LIVE ise no-op).
- **Admin panel** (TAM YETKİ, `88b3ad2`): `MatchDetailDrawer`'da **Kapora** rozeti +
  `matchDepositActionAdmin` ile **CAPTURE / VOID / REFUND** butonları; `MatchListing.
  depositStatus/depositAmount/minPlayers` + `matchMapper` okuması.

## Ödeme mimarisi — istemci RPC vs. iyzico edge (mevcut kalıp)
Bu depoda yerleşik desen (bkz. `admin_refund_intent`, `20260707000005_faz7_refund_wiring.sql`):
- **İstemci → `SECURITY DEFINER` RPC**: DB durum geçişini yapar, **SIMULATION-güvenli**
  (gerçek para yok). Escrow RPC'lerimiz (`match_capture_deposit`/`match_void_deposit`/
  `admin_match_deposit_action`) tam olarak bu kalıbı izler.
- **Gerçek iyzico kart işlemi → edge function** (`capture-payment` / `void-payment` /
  `refund-payment`): `x-payment-secret` (`PAYMENT_EDGE_SECRET`) ile **yalnız sistem/cron/admin
  bağlamından** çağrılır — **tarayıcıdan çağrılMAZ** (aksi halde secret sızar). Bu üç edge
  function iyzico ön-provizyon-kapatma / iptal / **kademeli iade** (T-saat'e göre) ile
  **zaten mevcut** ve SIMULATION destekli. `refund-payment` 24s kuralıyla uyumlu kademeli iade
  yapar. Bu yüzden istemciye edge sarmalayıcı **eklenmedi** (bilinçli — go-live işi).

## ⚠️ FIXME — canlıya almadan önce
1. **[IYZICO-TODO] (go-live wiring)** Edge function'lar hazır; kalan iş **RPC → edge** köprüsünü
   sistem bağlamında bağlamak: escrow durumu değiştiğinde (block/capture/void/refund) ilgili
   edge function'ı `PAYMENT_EDGE_SECRET` ile tetikle (cron/admin backend veya `pg_net`;
   `admin_refund_intent`'in "karta iade = go-live'da refund-payment edge" notuyla aynı yol).
   `payment_provider='SIMULATION'` iken hiçbir gerçek çağrı yapılmaz. **Staging'de uçtan uca
   test şart** (branching Pro gerektirdiği için burada test edilemedi).
2. **[PITCH-TODO]** `match_block_deposit` sahayı henüz `create_pitch_booking` ile rezerve
   ETMİYOR (owner takvimi). Kapora blokajıyla birlikte rezervasyon bağlanmalı; void'de iptal.
   (Riskli — `court_id` boru hattı gerekir ve burada test edilemez; bilinçli ertelendi.)
3. **Sağlayıcı seçimi (opsiyonel iyileştirme)**: create'de tür (kaleci/hakem) seçiliyor;
   aktivasyonda `find_providers_for_match` ile en uygun sağlayıcıya otomatik talep gider.
   İstenirse create'de **belirli sağlayıcı** seçtiren bir UI eklenebilir (match-less öneri
   RPC gerekir).

### Tamamlanan eski FIXME'ler
- ~~**[TRIGGER-TODO]**~~ ✔ `20260716000003_match_threshold_trigger.sql` ile sunucu tarafına taşındı.
- ~~**Admin UI butonları**~~ ✔ `MatchDetailDrawer` CAPTURE/VOID/REFUND + kapora rozeti (`88b3ad2`).

## Kaptan → çok sağlayıcı TEKLİF akışı (20260716000002)
- `match_service_offers` tablosu + `send_match_service_offers` (kaptan çok sağlayıcıya/tümüne
  teklif; escrow YOK) + `respond_match_service_offer` (sağlayıcı kabul→escrow bloke + FCFS
  ile diğerlerini kapat / red) + `get_my_match_service_offers` + `cancel_match_service_offers`.
- `match_block_deposit` artık `deferred_providers` = `[{type:'GK'|'REF', providerIds:[], all}]`
  için aktivasyonda `send_match_service_offers` çağırır (kapora sonrası teklif gider).
- Frontend: `ProviderOfferPicker` (create'te çoklu seçim + tümüne gönder + "Kaporayı
  Ödediğinde Teklif Gönder"), `serviceOfferService`, ServiceDashboard "Gelen Teklifler" (kabul/red).
- ⚠️ FIXME: escrow blokajı kabulde SIMULATION'da DB; gerçek iyzico ön-provizyon edge'de bağlanmalı.
  Legacy `service_offers` tablosu KULLANILMADI (ölü); yeni `match_service_offers` kullanılır.

## Nasıl test edilir (staging / SIMULATION)
1. `app_config.payment_provider = 'SIMULATION'` olduğundan emin ol (gerçek para çekilmez).
2. Migration'ı uygula: `npm run admin:deploy` (veya Supabase CLI).
3. Maç oluştur → yayınla → `payment_intents`'te `MATCH_DEPOSIT` satırı `BLOCKED` olmalı,
   maç `deposit_status='BLOCKED'`, `status='ACTIVE'`.
4. Slotları (toplam−2)'ye kadar doldur → maç `LIVE`, intent `CAPTURED`.
5. Eksik bırak/iptal et → intent `VOIDED`, maç `CANCELLED`.
