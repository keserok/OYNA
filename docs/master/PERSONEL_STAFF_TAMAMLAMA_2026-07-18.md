# PERSONEL SİSTEMİ (P-STAFF) — TAMAMLAMA KAYDI · 2026-07-18

Saha sahibi paneline **çok-kullanıcılı erişim**: Sahip > Müdür > Personel.
Karar (kullanıcı onayı): _Sahibin müdürden tek ekstra yetkisi yeni personel/müdür
ekleyip çıkarma; müdür bunun dışında sahiple aynı. "Adam ekleme fonksiyonu" iyi olsun._

## Yetki modeli (tek kaynak)

`pitch_access_level(pitch_id) → OWNER | MANAGER | STAFF | NULL` her yetkiyi türetir:
- `can_manage_pitch` = OWNER + MANAGER → yönetim (kort, tarife, gider, abonman, profil, finans özeti).
- `can_staff_pitch`  = OWNER + MANAGER + STAFF → kasa (rezervasyon, tahsilat, veresiye).
- `is_pitch_owner`   = yalnız OWNER → personel yönetimi + banka + para-çekme.

**Sahip-only (dokunulmadı):** `pitch_bank_accounts`, `owner_withdrawal_requests`,
`pitches` INSERT/DELETE, personel login-yazma. **Sahiplik ele-geçirme kilidi:**
`pitches.owner_id/is_demo` değişimi trigger'la yalnız sahibe/admine bırakıldı.

## Katmanlar

| Aşama | İçerik | Migration/Dosya |
|---|---|---|
| STAFF-1 | Şema (staff_role, account_status, invite_code+72s), yardımcı fn'ler, davet yaşam döngüsü RPC'leri | `20260727000001`, `…002` |
| STAFF-2a | RLS matrisi (müdür=sahip yönetim; personel salt-okuma) | `20260727000003` |
| STAFF-2b | RPC yetki devri + denetimli personel RPC'leri (recorded_by sunucuda) | `20260727000004` |
| STAFF-3 | Ekip UI (davet/kod/rol/kaldır), "Tesise Katıl", panel erişim + nav-gate | `OwnerTeamView`, `SettingsScreen`, `OwnerPanel`, `staffService`, `shared/staffModel` |

## Para-güvenliği

- Personelin **para/rezervasyon yazması** yalnız SECURITY DEFINER RPC'lerden geçer;
  `recorded_by`/`cancelled_by` **sunucuda damgalanır** (kimse başkası adına yazamaz).
- Ödeme izi silinemez: personel `booking_payments` UPDATE/DELETE yapamaz.
- `staff_record_payment` aşırı tahsilatı reddeder (fiyatlı rezervasyonda kalan bakiye).

## Davet akışı (uçtan uca)

1. Sahip → Ekip → "Personel/Müdür Ekle" → rol seç → **6 haneli kod** (72s).
2. Personel → Ayarlar → **Tesise Katıl** → kodu gir → ekibe katılır.
3. Personel → Ayarlar → **Tesis Paneli** → erişim seviyesine göre panel.

## Doğrulama (kanıt)

- **SQL impersonation:** STAFF-1 lifecycle 8/8; STAFF-2 matrisi 4 aktör × 11 yüzey — tam beklendiği gibi.
- **Kritik güvenlik düzeltmeleri (canlı testte yakalandı):**
  - NULL boolean yetki sızıntısı (`NULL='OWNER'` guard atlatması) → `COALESCE(...,false)`.
  - StrictMode bağlam sızıntısı (unmount-clear erken temizliyordu) → mount'ta bir-kez-yakala.
- **Canlı UI (390px mobil):** OWNER tüm sekmeler+menü; MANAGER Finans+yönetim ama banka/para-çekme gizli;
  STAFF yalnız Özet/Takvim/Ekip/Menü (Finans gizli) + salt-okuma ekip. Yatay taşma yok.
- **E2E:** Sahip UI'dan davet → kod (824866) → personel UI'dan kabul → panel açıldı → takvim yüklendi. ✓
- **Birim testleri:** `shared/staffModel` 13 test; toplam 347/347 geçer. tsc temiz, build başarılı.

## Sonraki adımlar (opsiyonel)

- **P-OFFLINE:** kasa çevrimdışı outbox (internet kesintisinde tahsilat sırası).
- Personel için "günün nakiti" hafif finans görünümü (şu an Finans sekmesi gizli).
