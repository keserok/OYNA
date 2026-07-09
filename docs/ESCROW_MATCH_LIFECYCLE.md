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
- **Servis** `services/matchLifecycleService.ts` — RPC sarmalayıcıları.
- **Frontend**
  - `useMatchCreate.ts`: her zaman `awaySlots` üretir (iki takım), yayında `blockMatchDeposit`
    çağırır, `deferredProviders` (kaleci/hakem) saklar; kişi başı %5'li otomatik ücret.
  - `MatchCreate.tsx`: "Kaleci & Hakem" seçim ekranı (aktivasyonda talep gider), kapora bilgisi.
  - `MatchJoin.tsx`: katılım/satın alma sonrası `checkMatchThreshold` (eşik → LIVE + capture).
- **Admin görünürlüğü**: `MatchListing.depositStatus/depositAmount/minPlayers` + `matchMapper` okuması.

## ⚠️ FIXME — canlıya almadan önce
1. **[IYZICO-TODO]** Gerçek iyzico entegrasyonu `supabase/functions/create-payment` edge
   function'ında: `action:'block'` (ön provizyon), `'capture'` (provizyon kapatma),
   `'void'` (iptal), `'refund'` (komisyon hariç iade). Şu an RPC'ler intent status'ünü
   DB'de doğrudan değiştiriyor (SIMULATION). Migration içinde `[IYZICO-TODO]` ile işaretli.
2. **[TRIGGER-TODO]** Eşik kontrolü şu an istemciden (`checkMatchThreshold`) çağrılıyor;
   sunucu otoritesi için `matches` üzerinde AFTER UPDATE tetikleyicisine taşınmalı.
3. **[PITCH-TODO]** `match_block_deposit` sahayı henüz `create_pitch_booking` ile rezerve
   ETMİYOR (owner takvimi). Kapora blokajıyla birlikte rezervasyon bağlanmalı; void'de iptal.
4. **Sağlayıcı seçimi**: create'de tür (kaleci/hakem) seçiliyor; aktivasyonda
   `find_providers_for_match` ile en uygun sağlayıcıya otomatik talep gider. İstenirse
   create'de **belirli sağlayıcı** seçtiren bir UI eklenebilir (match-less öneri RPC gerekir).
5. **Admin UI**: `admin_match_deposit_action` (CAPTURE/VOID/REFUND) RPC'si TAM YETKİ ile
   hazır; `admin-panel` MatchDetailDrawer'a bu üç butonu + `depositStatus` rozetini eklemek
   kalıyor (backend erişim tam, yalnız görsel buton eksik).

## Nasıl test edilir (staging / SIMULATION)
1. `app_config.payment_provider = 'SIMULATION'` olduğundan emin ol (gerçek para çekilmez).
2. Migration'ı uygula: `npm run admin:deploy` (veya Supabase CLI).
3. Maç oluştur → yayınla → `payment_intents`'te `MATCH_DEPOSIT` satırı `BLOCKED` olmalı,
   maç `deposit_status='BLOCKED'`, `status='ACTIVE'`.
4. Slotları (toplam−2)'ye kadar doldur → maç `LIVE`, intent `CAPTURED`.
5. Eksik bırak/iptal et → intent `VOIDED`, maç `CANCELLED`.
