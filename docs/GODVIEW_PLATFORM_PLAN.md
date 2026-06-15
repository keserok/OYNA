# OYNA Godview — Platform Operasyon Paneli

Godview (OYNA OS), OYNA'nın **iç operasyon panelidir**. Veritabanı tek kaynak; tüm müdahaleler denetlenebilir.

**Standalone:** `admin.html` — mobil uygulamadan ayrı web platformu.

---

## Tüm Fazlar — Tamamlandı ✅

### Faz 1 — Platform Temeli
- `admin.html` + Supabase Auth
- `is_platform_admin()` birleşik yetki
- `services/adminService.ts`

### Faz 2 — Çekirdek Veri
- Profiles, settings, audit log hydration
- `AuditLogPage`

### Faz 3 — Operasyon RPC
- Tesis/çekim moderasyonu, ban, settings audit
- `admin_dashboard_stats`

### Faz 4 — Finans & Analitik ✅
- `FinancePage` — cüzdan ledger + booking_payments
- `DisputesPage` — match_disputes çözümü
- `admin_finance_stats`, `admin_fetch_wallet_ledger`
- `owner_billing_events` tablosu
- Komuta Merkezi realtime kuyruk (`admin_ops_queue`)

### Faz 5 — Topluluk, CMS & Pazarlama ✅
- `CommunitiesPage` → DB (communities + creation requests)
- `texts` CMS tablosu + `admin_update_texts`
- `CampaignsPage` — segment broadcast (`admin_broadcast_notification`)
- `PromoCodesPage` — promo_codes CRUD

### Faz 6 — Tam Kapasite ✅
- `ACLPage` — admin_team_members + `admin_set_platform_role`
- Ghost deep-link (`?ghost=userId`) consumer app'te
- KVKK silme — Komuta Merkezi + `admin_process_account_deletion`
- Edge function `admin-broadcast`
- Playwright E2E (`tests/admin.spec.ts`)

---

## Panel Modülleri

| Route | Sayfa | DB |
|-------|-------|-----|
| GENEL | Dashboard | stats RPC |
| CONTROL | Komuta Merkezi | ops queue |
| FINANCE | Finans | wallet + payments |
| DISPUTES | Skor ihtilafları | match_disputes |
| MODERATION | Tesis + çekim | audited RPC |
| TOPLULUKLAR | Topluluklar | communities |
| NOTIFICATIONS | Kampanyalar | broadcast RPC |
| PROMO_CODES | İndirim kodları | promo_codes |
| CONTENT | CMS metinler | texts |
| ACL | Ekip yetkileri | admin_team_members |
| AUDIT_LOG | Denetim | admin_audit_log |

---

## Çalıştırma

```bash
npm run dev:admin          # http://localhost:4000/admin.html
npm run test:admin         # Playwright smoke tests
supabase db push           # migrations
supabase functions deploy admin-broadcast
```

### Admin hesabı

```sql
UPDATE profiles SET role = 'ADMIN', is_admin = true WHERE email = 'admin@oyna.app';
```

### Deploy (production)

- Ana app: `oyna.app`
- Admin: `oyna.app/admin.html` veya `admin.oyna.app` (aynı build, farklı subdomain)
- Env: `VITE_APP_URL=https://oyna.app` (ghost deep-link için)

---

*Son güncelleme: 2026-06-18 — 6/6 faz tamamlandı.*
