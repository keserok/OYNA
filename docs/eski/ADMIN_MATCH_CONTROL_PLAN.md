# OYNA OS — Admin Maç Kontrol Master Planı

> **Hedef:** Admin panelden maç yaşam döngüsünün tam yönetimi (oluştur, düzenle, iptal, durum, kadro, hakem, denetim).

## Mevcut Sorunlar

1. `MatchesTab` — legacy kart listesi, arama/filtre/sayfalama yok
2. `addMatch` — `ml-${Date.now()}` ID (UUID değil), her kayıtta slotları sıfırlıyor
3. Doğrudan `matches` tablosu yazımı — audit log yok, RLS `role=ADMIN` vs `is_platform_admin` uyumsuzluğu
4. `MatchModal` (lobi kontrol) — kod var ama route'a bağlı değil
5. İhtilaflar sayfası ile maç detayı arasında bağlantı yok

## Uygulama (bu PR)

| # | Bileşen | Durum |
|---|---------|--------|
| 1 | Migration `20260624000001_admin_match_control.sql` | ✅ |
| 2 | RPC: fetch, create, update, cancel, status, slot kick/assign, referee | ✅ |
| 3 | RLS → `is_platform_admin()` | ✅ |
| 4 | `adminService` + `matchMapper` | ✅ |
| 5 | `MatchesPage` — DataTable, arama, filtre, sayfalama | ✅ |
| 6 | `MatchFormModal` — oluştur/düzenle | ✅ |
| 7 | `MatchDetailDrawer` — lobi kontrol masası | ✅ |
| 8 | `DisputesPage` → maç detayı linki | ✅ |

## Deploy

```bash
npm run admin:deploy   # veya SQL Editor'da migration dosyasını çalıştırın
npm run admin:verify
```

## Sonraki adımlar (opsiyonel)

- Server-side pagination 500+ maç
- Per-match push bildirimi RPC
- E2E: maç oluştur → iptal → audit log assert
